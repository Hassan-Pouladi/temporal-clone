// Exposes the harness to the Node-side driver as `globalThis.__conformance`.

import { runSource, type LoadedSource } from '../../source.js';
import {
  BOUNDARY_IDS,
  TEMPORAL_TYPE_NAMES,
  isTemporalTypeName,
  type BoundaryId,
  type SourceReport,
  type TemporalTypeName,
} from '../../types.js';
import { BROWSER_BOUNDARY_IMPLEMENTATIONS } from './boundaries.js';

export interface PageRunOptions {
  readonly types?: readonly TemporalTypeName[];
  readonly boundaries?: readonly BoundaryId[];
}

function readOptions(value: unknown): PageRunOptions {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null) throw new TypeError('options must be an object');
  const types: unknown = Reflect.get(value, 'types');
  const boundaries: unknown = Reflect.get(value, 'boundaries');
  const options: { types?: TemporalTypeName[]; boundaries?: BoundaryId[] } = {};
  if (types !== undefined) {
    if (!Array.isArray(types) || !types.every(isTemporalTypeName)) {
      throw new TypeError('options.types must list Temporal type names');
    }
    options.types = types;
  }
  if (boundaries !== undefined) {
    const known: readonly string[] = BOUNDARY_IDS;
    if (!Array.isArray(boundaries) || !boundaries.every((b) => known.includes(String(b)))) {
      throw new TypeError('options.boundaries must list boundary ids');
    }
    options.boundaries = BOUNDARY_IDS.filter((b) => boundaries.includes(b));
  }
  return options;
}

export function exposeHarness(load: () => LoadedSource): void {
  const api = {
    run: async (rawOptions?: unknown): Promise<SourceReport> => {
      const options = readOptions(rawOptions);
      const wanted = options.boundaries;
      const boundaries = BROWSER_BOUNDARY_IMPLEMENTATIONS.filter(
        ([id]) => wanted === undefined || wanted.includes(id),
      );
      return runSource(load(), boundaries, { types: options.types ?? TEMPORAL_TYPE_NAMES });
    },
  };
  Object.defineProperty(globalThis, '__conformance', {
    value: api,
    configurable: true,
    enumerable: false,
    writable: false,
  });
}
