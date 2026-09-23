// B3: the worker loads no Temporal implementation (R0.12). It classifies what it received and
// posts back only the classification, which is plain data and always clones.

import { classify } from './classify.js';
import { observed, type BoundaryResult } from './cell.js';
import { readCell } from './result-schema.js';
import { readExpected, readMessage, sameExpected } from './samples.js';
import type { Cell, Expected } from './types.js';

export type WorkerReply =
  | { readonly kind: 'cell'; readonly expected: Expected; readonly cell: Cell }
  | { readonly kind: 'messageerror' }
  | { readonly kind: 'unreadable' };

/** Runs inside the worker for every `message` event. */
export function replyTo(data: unknown): WorkerReply {
  const message = readMessage(data);
  if (message === undefined) return { kind: 'unreadable' };
  const cell = classify({ kind: 'received', value: message.value }, message.expected);
  return { kind: 'cell', expected: message.expected, cell };
}

/** Runs inside the worker for a `messageerror` event. */
export function replyToMessageError(): WorkerReply {
  return { kind: 'messageerror' };
}

/**
 * Runs on the main side. Returns `undefined` for a reply that belongs to another cell.
 * Throws if the reply is malformed.
 */
export function readWorkerReply(data: unknown, expected: Expected): BoundaryResult | undefined {
  if (typeof data !== 'object' || data === null) throw new Error('worker reply is not an object');
  const kind: unknown = Reflect.get(data, 'kind');
  switch (kind) {
    case 'cell': {
      const replyExpected = readExpected(Reflect.get(data, 'expected'));
      if (replyExpected === undefined) throw new Error('worker reply has no expected');
      if (!sameExpected(replyExpected, expected)) return undefined;
      return { kind: 'remote-cell', cell: readCell(Reflect.get(data, 'cell'), 'worker reply') };
    }
    case 'messageerror':
      return observed({
        kind: 'async-error',
        error: { name: 'messageerror', message: 'the worker received a messageerror event' },
      });
    case 'unreadable':
      return observed({
        kind: 'harness-error',
        error: new Error('the worker received something that is not the message wrapper'),
      });
    default:
      throw new Error('worker reply has an unknown kind');
  }
}
