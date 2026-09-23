// Child process entry: runs every Node cell for one source, then reports over IPC.
// One process per source (R0.10), so a polyfill never contaminates another source.

import {
  failedSource,
  nativeSource,
  polyfillSource,
  runSource,
  type LoadedSource,
} from '../../source.js';
import { SOURCE_IDS, type SourceId } from '../../types.js';
import { NODE_BOUNDARY_IMPLEMENTATIONS } from './boundaries.js';

// Captured before any polyfill is evaluated: the polyfills are loaded by dynamic import below.
const native: unknown = Reflect.get(globalThis, 'Temporal');

async function load(id: SourceId): Promise<LoadedSource> {
  try {
    switch (id) {
      case 'S1':
        return nativeSource(native);
      case 'S2': {
        const { Temporal } = await import('temporal-polyfill');
        return polyfillSource('S2', Temporal, __TEMPORAL_POLYFILL_VERSION__, native);
      }
      case 'S3': {
        const { Temporal } = await import('temporal-polyfill/implementation');
        return polyfillSource('S3', Temporal, __TEMPORAL_POLYFILL_VERSION__, native);
      }
      case 'S4': {
        const { Temporal } = await import('@js-temporal/polyfill');
        return polyfillSource('S4', Temporal, __JS_TEMPORAL_POLYFILL_VERSION__, native);
      }
    }
  } catch (error) {
    return failedSource(id, error);
  }
}

const id = SOURCE_IDS.find((known) => known === process.argv[2]);
if (id === undefined) {
  throw new Error(
    `usage: source-main.js <${SOURCE_IDS.join('|')}>, got ${String(process.argv[2])}`,
  );
}
const send = process.send?.bind(process);
if (send === undefined) throw new Error('source-main.js must be started with an IPC channel');

const report = await runSource(await load(id), NODE_BOUNDARY_IMPLEMENTATIONS);
send(report, () => {
  // A worker or port that outlived its cell must not keep this process alive.
  process.exit(0);
});
