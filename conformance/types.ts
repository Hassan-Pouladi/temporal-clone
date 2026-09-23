// Shared vocabulary of the conformance matrix (PHASE-0 R0.9 to R0.16).
// Pure types and constants: imported by the Node runner, the browser pages and the workers.

export const TEMPORAL_TYPE_NAMES = [
  'Instant',
  'ZonedDateTime',
  'PlainDate',
  'PlainTime',
  'PlainDateTime',
  'PlainYearMonth',
  'PlainMonthDay',
  'Duration',
] as const;
export type TemporalTypeName = (typeof TEMPORAL_TYPE_NAMES)[number];

export const SOURCE_IDS = ['S1', 'S2', 'S3', 'S4'] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export const BOUNDARY_IDS = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8'] as const;
export type BoundaryId = (typeof BOUNDARY_IDS)[number];

export const NODE_ENGINES = ['node22', 'node24', 'node26'] as const;
export const BROWSER_ENGINES = ['chromium', 'firefox', 'webkit'] as const;
export const ENGINES = [...NODE_ENGINES, ...BROWSER_ENGINES] as const;
export type NodeEngine = (typeof NODE_ENGINES)[number];
export type BrowserEngine = (typeof BROWSER_ENGINES)[number];
export type Engine = (typeof ENGINES)[number];

export const NODE_BOUNDARIES: readonly BoundaryId[] = ['B1', 'B2', 'B3', 'B4', 'B8'];
export const BROWSER_BOUNDARIES: readonly BoundaryId[] = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'];

export const OUTCOMES = [
  'ok',
  'throws',
  'silent-loss',
  'async-error',
  'timeout',
  'unavailable',
  'harness-error',
] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** R0.15: every cell is bounded by this many milliseconds. */
export const CELL_TIMEOUT_MS = 5000;

export interface Expected {
  readonly type: TemporalTypeName;
  readonly str: string;
}

/** R0.12: the wrapper sent across every boundary. */
export interface Message {
  readonly value: unknown;
  readonly expected: Expected;
}

/** R0.14: what the harness saw, before classification. */
export type Observation =
  | { readonly kind: 'received'; readonly value: unknown }
  | { readonly kind: 'send-threw'; readonly error: unknown }
  | { readonly kind: 'async-error'; readonly error: unknown }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'unavailable'; readonly reason: string }
  | { readonly kind: 'harness-error'; readonly error: unknown };

export type Detail = Readonly<Record<string, string | number>>;

/** R0.13: the classified outcome of one observation. */
export interface Cell {
  readonly outcome: Outcome;
  readonly detail?: Detail;
}

/** R0.16: one cell of an engine's result file. */
export interface ResultCell extends Cell {
  readonly source: SourceId;
  readonly boundary: BoundaryId;
  readonly type: TemporalTypeName;
}

export interface SourceInfo {
  readonly available: boolean;
  readonly version?: string;
  readonly resolvedToNative?: boolean;
}

export interface EngineResult {
  readonly engine: Engine;
  readonly engineVersion: string;
  readonly runAt: string;
  readonly sources: Readonly<Record<SourceId, SourceInfo>>;
  readonly cells: readonly ResultCell[];
}

/** What one fresh realm (page or process) reports for its source. */
export interface SourceReport {
  readonly source: SourceId;
  readonly info: SourceInfo;
  readonly cells: readonly ResultCell[];
}

export function isTemporalTypeName(value: unknown): value is TemporalTypeName {
  return typeof value === 'string' && (TEMPORAL_TYPE_NAMES as readonly string[]).includes(value);
}

/** R0.16: cells sorted by source, boundary, then type in TemporalTypeName order. */
export function compareCells(a: ResultCell, b: ResultCell): number {
  return (
    SOURCE_IDS.indexOf(a.source) - SOURCE_IDS.indexOf(b.source) ||
    BOUNDARY_IDS.indexOf(a.boundary) - BOUNDARY_IDS.indexOf(b.boundary) ||
    TEMPORAL_TYPE_NAMES.indexOf(a.type) - TEMPORAL_TYPE_NAMES.indexOf(b.type)
  );
}
