// Synthetic engine results that behave exactly as HY1 to HY6 predict.

import {
  BROWSER_BOUNDARIES,
  ENGINES,
  NODE_BOUNDARIES,
  NODE_ENGINES,
  SOURCE_IDS,
  TEMPORAL_TYPE_NAMES,
  compareCells,
  type Engine,
  type EngineResult,
  type ResultCell,
  type SourceId,
} from '../../../../conformance/types.js';

const NATIVE: readonly Engine[] = ['chromium', 'firefox', 'node26'];

function cellFor(engine: Engine, source: SourceId, boundary: ResultCell['boundary']) {
  const native = NATIVE.includes(engine);
  if (source === 'S1' && !native) {
    return {
      outcome: 'unavailable',
      detail: { reason: 'globalThis.Temporal is undefined' },
    } as const;
  }
  if (source === 'S1' || (source === 'S2' && native)) {
    const errorName = boundary === 'B8' ? 'Error' : 'DataCloneError';
    return { outcome: 'throws', detail: { errorName, message: 'could not be cloned.' } } as const;
  }
  return {
    outcome: 'silent-loss',
    detail: { receivedTag: '[object Object]', ownKeyCount: 0, shape: '{}' },
  } as const;
}

export function conformingEngine(engine: Engine): EngineResult {
  const native = NATIVE.includes(engine);
  const boundaries = NODE_ENGINES.some((n) => n === engine) ? NODE_BOUNDARIES : BROWSER_BOUNDARIES;
  const cells: ResultCell[] = SOURCE_IDS.flatMap((source) =>
    boundaries.flatMap((boundary) =>
      TEMPORAL_TYPE_NAMES.map((type) => ({
        source,
        boundary,
        type,
        ...cellFor(engine, source, boundary),
      })),
    ),
  ).sort(compareCells);
  return {
    engine,
    engineVersion: `${engine}-1.0`,
    runAt: '2026-09-23T00:00:00.000Z',
    sources: {
      S1: { available: native },
      S2: { available: true, version: '1.0.5', resolvedToNative: native },
      S3: { available: true, version: '1.0.5' },
      S4: { available: true, version: '0.5.1' },
    },
    cells,
  };
}

export function conformingResults(): Partial<Record<Engine, EngineResult>> {
  return Object.fromEntries(ENGINES.map((engine) => [engine, conformingEngine(engine)]));
}

/** Returns a copy of `result` with the matching cell replaced. */
export function withCell(
  result: EngineResult,
  source: SourceId,
  boundary: ResultCell['boundary'],
  type: ResultCell['type'],
  replacement: Pick<ResultCell, 'outcome' | 'detail'>,
): EngineResult {
  const index = result.cells.findIndex(
    (cell) => cell.source === source && cell.boundary === boundary && cell.type === type,
  );
  if (index === -1) throw new Error(`fixture has no cell ${source} ${boundary} ${type}`);
  const cells = [...result.cells];
  cells[index] =
    replacement.detail === undefined
      ? { source, boundary, type, outcome: replacement.outcome }
      : { source, boundary, type, outcome: replacement.outcome, detail: replacement.detail };
  return { ...result, cells };
}
