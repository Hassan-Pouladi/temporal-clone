// Runs every (boundary, type) cell for one Temporal source inside one fresh realm (R0.10).

import { runCell, type Boundary } from './cell.js';
import { classify } from './classify.js';
import { buildMessage } from './samples.js';
import { isTemporalNamespace, type TemporalNamespaceLike } from './temporal-like.js';
import {
  TEMPORAL_TYPE_NAMES,
  compareCells,
  type BoundaryId,
  type Cell,
  type ResultCell,
  type SourceId,
  type SourceInfo,
  type SourceReport,
  type TemporalTypeName,
} from './types.js';

export type LoadedSource =
  | {
      readonly id: SourceId;
      readonly info: SourceInfo;
      readonly kind: 'available';
      readonly temporal: TemporalNamespaceLike;
    }
  | {
      readonly id: SourceId;
      readonly info: SourceInfo;
      readonly kind: 'unavailable';
      readonly reason: string;
    }
  | {
      readonly id: SourceId;
      readonly info: SourceInfo;
      readonly kind: 'failed';
      readonly error: unknown;
    };

/** S1: whatever the engine provides as `globalThis.Temporal`, captured before any polyfill. */
export function nativeSource(native: unknown): LoadedSource {
  if (native === undefined) {
    return {
      id: 'S1',
      info: { available: false },
      kind: 'unavailable',
      reason: 'globalThis.Temporal is undefined',
    };
  }
  if (!isTemporalNamespace(native)) {
    return {
      id: 'S1',
      info: { available: false },
      kind: 'failed',
      error: new TypeError('globalThis.Temporal exists but is not a Temporal namespace'),
    };
  }
  return { id: 'S1', info: { available: true }, kind: 'available', temporal: native };
}

/** S2 to S4. For S2, `resolvedToNative` is the identity check against the captured native (R0.10). */
export function polyfillSource(
  id: 'S2' | 'S3' | 'S4',
  temporal: unknown,
  version: string,
  native: unknown,
): LoadedSource {
  const resolved =
    id === 'S2' ? { resolvedToNative: native !== undefined && temporal === native } : {};
  if (!isTemporalNamespace(temporal)) {
    return {
      id,
      info: { available: false, version, ...resolved },
      kind: 'failed',
      error: new TypeError(`${id} did not export a Temporal namespace`),
    };
  }
  return { id, info: { available: true, version, ...resolved }, kind: 'available', temporal };
}

/** A source whose module failed to load: every cell is a harness error. */
export function failedSource(id: SourceId, error: unknown): LoadedSource {
  return { id, info: { available: false }, kind: 'failed', error };
}

export interface RunSourceOptions {
  readonly types?: readonly TemporalTypeName[];
  readonly timeoutMs?: number;
}

export async function runSource(
  source: LoadedSource,
  boundaries: readonly (readonly [BoundaryId, Boundary])[],
  options: RunSourceOptions = {},
): Promise<SourceReport> {
  const types = options.types ?? TEMPORAL_TYPE_NAMES;
  const cells: ResultCell[] = [];
  for (const [boundaryId, boundary] of boundaries) {
    for (const type of types) {
      const cell = await runOne(source, boundary, type, options.timeoutMs);
      cells.push({ source: source.id, boundary: boundaryId, type, ...cell });
    }
  }
  return { source: source.id, info: source.info, cells: cells.sort(compareCells) };
}

async function runOne(
  source: LoadedSource,
  boundary: Boundary,
  type: TemporalTypeName,
  timeoutMs: number | undefined,
): Promise<Cell> {
  // `expected` is only consulted for `received` observations, which cannot occur here.
  const placeholder = { type, str: '' };
  switch (source.kind) {
    case 'unavailable':
      return classify({ kind: 'unavailable', reason: source.reason }, placeholder);
    case 'failed':
      return classify({ kind: 'harness-error', error: source.error }, placeholder);
    case 'available':
      break;
  }
  try {
    const message = buildMessage(source.temporal, type);
    return await runCell(boundary, message, timeoutMs);
  } catch (error) {
    return classify({ kind: 'harness-error', error }, placeholder);
  }
}
