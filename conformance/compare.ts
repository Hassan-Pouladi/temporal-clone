// R0.18: normalized baseline and the comparison behind `npm run conformance:check`. Pure.

import { cellCode } from './cell-code.js';
import { SchemaError, readResultCell, readSourceInfo } from './result-schema.js';
import {
  ENGINES,
  SOURCE_IDS,
  compareCells,
  mapEngines,
  mapSources,
  type Detail,
  type Engine,
  type EngineResult,
  type ResultCell,
  type SourceId,
} from './types.js';

export interface NormalizedSource {
  readonly available: boolean;
  readonly resolvedToNative?: boolean;
}

export interface NormalizedEngine {
  readonly sources: Readonly<Record<SourceId, NormalizedSource>>;
  readonly cells: readonly ResultCell[];
}

export interface Baseline {
  readonly engines: Readonly<Record<Engine, NormalizedEngine>>;
}

export interface Difference {
  readonly engine: Engine;
  readonly description: string;
}

/** Keeps only what is expected to be stable: no runAt, no versions, detail reduced to errorName / shape. */
export function normalizeEngine(result: EngineResult): NormalizedEngine {
  const source = (id: SourceId): NormalizedSource => {
    const info = result.sources[id];
    return info.resolvedToNative === undefined
      ? { available: info.available }
      : { available: info.available, resolvedToNative: info.resolvedToNative };
  };
  return {
    sources: mapSources(source),
    cells: [...result.cells].sort(compareCells).map(normalizeCell),
  };
}

function normalizeCell(cell: ResultCell): ResultCell {
  const { source, boundary, type, outcome } = cell;
  const kept: Record<string, string | number> = {};
  for (const key of ['errorName', 'shape']) {
    const value = cell.detail?.[key];
    if (value !== undefined) kept[key] = value;
  }
  const detail: Detail = kept;
  return Object.keys(detail).length === 0
    ? { source, boundary, type, outcome }
    : { source, boundary, type, outcome, detail };
}

/** Throws unless all six engines are present: a partial baseline would hide missing engines. */
export function buildBaseline(results: Partial<Record<Engine, EngineResult>>): Baseline {
  const missing = ENGINES.filter((engine) => results[engine] === undefined);
  if (missing.length > 0) throw new Error(`cannot build a baseline without ${missing.join(', ')}`);
  return {
    engines: mapEngines((engine) => {
      const result = results[engine];
      if (result === undefined) throw new Error(`missing ${engine}`);
      return normalizeEngine(result);
    }),
  };
}

export function readBaseline(json: unknown, where = 'baseline'): Baseline {
  if (typeof json !== 'object' || json === null) throw new SchemaError(where, 'must be an object');
  const engines: unknown = Reflect.get(json, 'engines');
  if (typeof engines !== 'object' || engines === null) {
    throw new SchemaError(where, 'engines must be an object');
  }
  const read = (engine: Engine): NormalizedEngine => {
    const at = `${where}.engines.${engine}`;
    const entry: unknown = Reflect.get(engines, engine);
    if (typeof entry !== 'object' || entry === null) throw new SchemaError(at, 'missing');
    const sources: unknown = Reflect.get(entry, 'sources');
    const cells: unknown = Reflect.get(entry, 'cells');
    if (typeof sources !== 'object' || sources === null) throw new SchemaError(at, 'no sources');
    if (!Array.isArray(cells)) throw new SchemaError(at, 'cells must be an array');
    const readSource = (id: SourceId): NormalizedSource =>
      readSourceInfo(Reflect.get(sources, id), `${at}.sources.${id}`);
    return {
      sources: mapSources(readSource),
      cells: cells.map((cell: unknown, i) => readResultCell(cell, `${at}.cells[${String(i)}]`)),
    };
  };
  return { engines: mapEngines(read) };
}

function cellKey(cell: ResultCell): string {
  return `${cell.source} ${cell.boundary} ${cell.type}`;
}

export function diffAgainstBaseline(
  baseline: Baseline,
  results: Partial<Record<Engine, EngineResult>>,
): Difference[] {
  const differences: Difference[] = [];
  for (const engine of ENGINES) {
    const result = results[engine];
    if (result === undefined) {
      differences.push({ engine, description: `${engine}: result file is missing` });
      continue;
    }
    const expected = baseline.engines[engine];
    const actual = normalizeEngine(result);
    for (const id of SOURCE_IDS) {
      for (const field of ['available', 'resolvedToNative'] as const) {
        const want = expected.sources[id][field];
        const got = actual.sources[id][field];
        if (want !== got) {
          differences.push({
            engine,
            description: `${engine} ${id} ${field}: expected ${String(want)}, got ${String(got)}`,
          });
        }
      }
    }
    const expectedCells = new Map(expected.cells.map((cell) => [cellKey(cell), cellCode(cell)]));
    const actualCells = new Map(actual.cells.map((cell) => [cellKey(cell), cellCode(cell)]));
    for (const [key, want] of expectedCells) {
      const got = actualCells.get(key);
      if (got === undefined) {
        differences.push({
          engine,
          description: `${engine} ${key}: expected ${want}, cell missing`,
        });
      } else if (got !== want) {
        differences.push({ engine, description: `${engine} ${key}: expected ${want}, got ${got}` });
      }
    }
    for (const [key, got] of actualCells) {
      if (!expectedCells.has(key)) {
        differences.push({ engine, description: `${engine} ${key}: unexpected cell ${got}` });
      }
    }
  }
  return differences;
}

export function formatDifferences(differences: readonly Difference[]): string {
  const engines = [...new Set(differences.map((d) => d.engine))];
  return [
    `Conformance differs from conformance/baseline.json in ${engines.join(', ')}:`,
    '',
    ...differences.map((d) => `- ${d.description}`),
    '',
  ].join('\n');
}
