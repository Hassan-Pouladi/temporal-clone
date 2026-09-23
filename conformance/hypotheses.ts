// R0.19: automatic evaluation of HY1 to HY6. Pure.

import { cellCode } from './cell-code.js';
import { ENGINES, type Engine, type EngineResult, type ResultCell } from './types.js';

export const HYPOTHESIS_IDS = ['HY1', 'HY2', 'HY3', 'HY4', 'HY5', 'HY6'] as const;
export type HypothesisId = (typeof HYPOTHESIS_IDS)[number];

export const HYPOTHESES: Readonly<Record<HypothesisId, string>> = {
  HY1: 'S1 is available in chromium, firefox and node26, and unavailable in webkit, node22 and node24',
  HY2: 'wherever S1 is available, S2 resolvedToNative is true; elsewhere false',
  HY3: 'every S1 cell, and every S2 cell where S2 resolved to native, is throws with errorName DataCloneError (B8: any error name, D-003)',
  HY4: 'every S3 and S4 cell, and every S2 cell where S2 did not resolve to native, is silent-loss with shape {}',
  HY5: 'no cell anywhere is ok',
  HY6: 'no cell is timeout, async-error or harness-error',
};

const NATIVE_ENGINES: readonly Engine[] = ['chromium', 'firefox', 'node26'];

export interface HypothesisResult {
  readonly id: HypothesisId;
  readonly statement: string;
  readonly pass: boolean;
  /** Human-readable offending engines or cells; empty when the hypothesis passes. */
  readonly offending: readonly string[];
}

function describe(engine: Engine, cell: ResultCell): string {
  return `${engine} ${cell.source} ${cell.boundary} ${cell.type}: ${cellCode(cell)}`;
}

/** Cells that must reflect native Temporal (HY3) versus polyfill objects (HY4). */
function expectsNative(result: EngineResult, cell: ResultCell): boolean {
  if (cell.source === 'S1') return true;
  if (cell.source === 'S2') return result.sources.S2.resolvedToNative === true;
  return false;
}

export function evaluateHypotheses(
  results: Partial<Record<Engine, EngineResult>>,
): HypothesisResult[] {
  const missing = ENGINES.filter((engine) => results[engine] === undefined).map(
    (engine) => `${engine}: no result file`,
  );
  const present = ENGINES.flatMap((engine) => {
    const result = results[engine];
    return result === undefined ? [] : [[engine, result] as const];
  });
  const offending: Record<HypothesisId, string[]> = {
    HY1: [],
    HY2: [],
    HY3: [],
    HY4: [],
    HY5: [],
    HY6: [],
  };

  for (const [engine, result] of present) {
    const s1 = result.sources.S1.available;
    const wantS1 = NATIVE_ENGINES.includes(engine);
    if (s1 !== wantS1) offending.HY1.push(`${engine}: S1 available is ${String(s1)}`);
    const resolved = result.sources.S2.resolvedToNative;
    if (resolved !== s1) {
      offending.HY2.push(
        `${engine}: S2 resolvedToNative is ${String(resolved)}, S1 available is ${String(s1)}`,
      );
    }

    for (const cell of result.cells) {
      const native = expectsNative(result, cell);
      if (native && (cell.source !== 'S1' || s1)) {
        const nameOk = cell.boundary === 'B8' || cell.detail?.['errorName'] === 'DataCloneError';
        if (cell.outcome !== 'throws' || !nameOk) offending.HY3.push(describe(engine, cell));
      }
      if (!native) {
        if (cell.outcome !== 'silent-loss' || cell.detail?.['shape'] !== '{}') {
          offending.HY4.push(describe(engine, cell));
        }
      }
      if (cell.outcome === 'ok') offending.HY5.push(describe(engine, cell));
      if (
        cell.outcome === 'timeout' ||
        cell.outcome === 'async-error' ||
        cell.outcome === 'harness-error'
      ) {
        offending.HY6.push(describe(engine, cell));
      }
    }
  }

  // Every hypothesis is about all six engines: a missing result file fails all of them.
  return HYPOTHESIS_IDS.map((id) => {
    const list = [...missing, ...offending[id]];
    return { id, statement: HYPOTHESES[id], pass: list.length === 0, offending: list };
  });
}
