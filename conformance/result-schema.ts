// Runtime validation for data that crosses a process, page or file boundary. Nothing read from a
// worker, a browser page or a JSON file is trusted by its static type.

import {
  BOUNDARY_IDS,
  ENGINES,
  OUTCOMES,
  SOURCE_IDS,
  compareCells,
  isTemporalTypeName,
  type BoundaryId,
  type Cell,
  type Detail,
  type Engine,
  type EngineResult,
  type Outcome,
  type ResultCell,
  type SourceId,
  type SourceInfo,
  type SourceReport,
} from './types.js';

export class SchemaError extends Error {
  constructor(where: string, what: string) {
    super(`${where}: ${what}`);
    this.name = 'SchemaError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function readDetail(value: unknown, where: string): Detail {
  if (!isRecord(value)) throw new SchemaError(where, 'detail must be an object');
  const detail: Record<string, string | number> = {};
  for (const [key, field] of Object.entries(value)) {
    if (typeof field !== 'string' && typeof field !== 'number') {
      throw new SchemaError(where, `detail.${key} must be a string or number`);
    }
    detail[key] = field;
  }
  return detail;
}

export function readCell(value: unknown, where = 'cell'): Cell {
  if (!isRecord(value)) throw new SchemaError(where, 'must be an object');
  const outcome = value['outcome'];
  if (!isOneOf<Outcome>(OUTCOMES, outcome)) throw new SchemaError(where, 'unknown outcome');
  if (value['detail'] === undefined) return { outcome };
  return { outcome, detail: readDetail(value['detail'], where) };
}

export function readResultCell(value: unknown, where = 'cell'): ResultCell {
  const cell = readCell(value, where);
  if (!isRecord(value)) throw new SchemaError(where, 'must be an object');
  const source = value['source'];
  const boundary = value['boundary'];
  const type = value['type'];
  if (!isOneOf<SourceId>(SOURCE_IDS, source)) throw new SchemaError(where, 'unknown source');
  if (!isOneOf<BoundaryId>(BOUNDARY_IDS, boundary))
    throw new SchemaError(where, 'unknown boundary');
  if (!isTemporalTypeName(type)) throw new SchemaError(where, 'unknown type');
  return { source, boundary, type, ...cell };
}

export function readSourceInfo(value: unknown, where: string): SourceInfo {
  if (!isRecord(value)) throw new SchemaError(where, 'must be an object');
  const available = value['available'];
  const version = value['version'];
  const resolvedToNative = value['resolvedToNative'];
  if (typeof available !== 'boolean') throw new SchemaError(where, 'available must be boolean');
  if (version !== undefined && typeof version !== 'string') {
    throw new SchemaError(where, 'version must be a string');
  }
  if (resolvedToNative !== undefined && typeof resolvedToNative !== 'boolean') {
    throw new SchemaError(where, 'resolvedToNative must be boolean');
  }
  return {
    available,
    ...(version === undefined ? {} : { version }),
    ...(resolvedToNative === undefined ? {} : { resolvedToNative }),
  };
}

export function readSourceReport(value: unknown, where = 'source report'): SourceReport {
  if (!isRecord(value)) throw new SchemaError(where, 'must be an object');
  const source = value['source'];
  const cells = value['cells'];
  if (!isOneOf<SourceId>(SOURCE_IDS, source)) throw new SchemaError(where, 'unknown source');
  if (!Array.isArray(cells)) throw new SchemaError(where, 'cells must be an array');
  return {
    source,
    info: readSourceInfo(value['info'], `${where}.info`),
    cells: cells.map((cell: unknown, i) => readResultCell(cell, `${where}.cells[${String(i)}]`)),
  };
}

export function readEngineResult(value: unknown, where = 'engine result'): EngineResult {
  if (!isRecord(value)) throw new SchemaError(where, 'must be an object');
  const engine = value['engine'];
  const engineVersion = value['engineVersion'];
  const runAt = value['runAt'];
  const sources = value['sources'];
  const cells = value['cells'];
  if (!isOneOf<Engine>(ENGINES, engine)) throw new SchemaError(where, 'unknown engine');
  if (typeof engineVersion !== 'string') throw new SchemaError(where, 'engineVersion missing');
  if (typeof runAt !== 'string') throw new SchemaError(where, 'runAt missing');
  if (!isRecord(sources)) throw new SchemaError(where, 'sources must be an object');
  if (!Array.isArray(cells)) throw new SchemaError(where, 'cells must be an array');
  const readInfo = (id: SourceId): SourceInfo =>
    readSourceInfo(sources[id], `${where}.sources.${id}`);
  return {
    engine,
    engineVersion,
    runAt,
    sources: { S1: readInfo('S1'), S2: readInfo('S2'), S3: readInfo('S3'), S4: readInfo('S4') },
    cells: cells.map((cell: unknown, i) => readResultCell(cell, `${where}.cells[${String(i)}]`)),
  };
}

/** R0.16: assembles an engine's result from one report per source, cells sorted. */
export function buildEngineResult(
  engine: Engine,
  engineVersion: string,
  runAt: string,
  reports: readonly SourceReport[],
): EngineResult {
  const find = (id: SourceId): SourceReport => {
    const report = reports.find((r) => r.source === id);
    if (report === undefined) throw new SchemaError(engine, `no report for ${id}`);
    return report;
  };
  const bySource = { S1: find('S1'), S2: find('S2'), S3: find('S3'), S4: find('S4') };
  return {
    engine,
    engineVersion,
    runAt,
    sources: {
      S1: bySource.S1.info,
      S2: bySource.S2.info,
      S3: bySource.S3.info,
      S4: bySource.S4.info,
    },
    cells: SOURCE_IDS.flatMap((id) => bySource[id].cells).sort(compareCells),
  };
}

/** Stable JSON for committed files: two-space indent, trailing newline. */
export function toJsonFile(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
