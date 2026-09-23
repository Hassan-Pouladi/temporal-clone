// R0.15: run one cell, time-bounded, with cleanup, and never let a failure escape.

import { classify } from './classify.js';
import { readMessage, sameExpected } from './samples.js';
import {
  CELL_TIMEOUT_MS,
  type Cell,
  type Expected,
  type Message,
  type Observation,
} from './types.js';

/** B3 is classified inside the worker; every other boundary yields an observation. */
export type BoundaryResult =
  | { readonly kind: 'observation'; readonly observation: Observation }
  | { readonly kind: 'remote-cell'; readonly cell: Cell };

export type CleanupFn = () => unknown;

export interface CellContext {
  /** Reports the result. The first call wins; later calls are ignored. */
  settle(result: BoundaryResult): void;
  /**
   * Registers cleanup as soon as a resource exists, so it runs even if setup never finishes.
   * Cleanups run in reverse registration order once the cell has settled.
   */
  onCleanup(fn: CleanupFn): void;
}

/**
 * Sets up listeners, sends `message`, and settles through `context`. A boundary MUST catch the
 * send itself and settle `send-threw`; anything else it throws becomes `harness-error`.
 */
export type Boundary = (message: Message, context: CellContext) => void | Promise<void>;

export function observed(observation: Observation): BoundaryResult {
  return { kind: 'observation', observation };
}

/**
 * Turns data that arrived through a boundary into an observation, or `undefined` when it is not
 * this cell's wrapper (a straggler from an earlier, timed-out cell).
 */
export function receivedIfOurs(data: unknown, expected: Expected): BoundaryResult | undefined {
  const message = readMessage(data);
  if (message === undefined || !sameExpected(message.expected, expected)) return undefined;
  return observed({ kind: 'received', value: message.value });
}

/** For synchronous boundaries, where the result can only be this cell's wrapper. */
export function receivedSync(data: unknown, expected: Expected): BoundaryResult {
  return (
    receivedIfOurs(data, expected) ??
    observed({
      kind: 'harness-error',
      error: new Error('the message wrapper did not survive the boundary'),
    })
  );
}

export async function runCell(
  boundary: Boundary,
  message: Message,
  timeoutMs: number = CELL_TIMEOUT_MS,
): Promise<Cell> {
  const cleanups: CleanupFn[] = [];
  let finished = false;
  let resolveResult: (result: BoundaryResult) => void = () => undefined;
  const settled = new Promise<BoundaryResult>((resolve) => {
    resolveResult = resolve;
  });
  const context: CellContext = {
    settle: (result) => {
      resolveResult(result);
    },
    onCleanup: (fn) => {
      if (!finished) {
        cleanups.push(fn);
        return;
      }
      // Setup outlived the cell (it timed out). Release the resource now; the cell is already
      // reported as `timeout`, so there is nothing left to attribute a cleanup failure to.
      void runBounded(fn, timeoutMs).catch(() => undefined);
    },
  };

  const timer = setTimeout(() => {
    context.settle(observed({ kind: 'timeout' }));
  }, timeoutMs);
  void (async () => {
    try {
      await boundary(message, context);
    } catch (error) {
      context.settle(observed({ kind: 'harness-error', error }));
    }
  })();

  let result = await settled;
  clearTimeout(timer);
  finished = true;
  for (const fn of cleanups.reverse()) {
    try {
      await runBounded(fn, timeoutMs);
    } catch (error) {
      // A leaked worker, port or database could contaminate later cells: surface it.
      if (!(result.kind === 'observation' && result.observation.kind === 'harness-error')) {
        result = observed({ kind: 'harness-error', error });
      }
    }
  }
  return result.kind === 'remote-cell'
    ? result.cell
    : classify(result.observation, message.expected);
}

async function runBounded(fn: CleanupFn, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(fn),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`cleanup did not finish within ${String(timeoutMs)} ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
