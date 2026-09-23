// `npm run build:conformance`: bundles the harness into conformance/dist/ with esbuild (R0.10).
// Node bundles keep npm packages external, so the Node runners import them directly.
// Browser bundles are self-contained: one per source, plus the B3 worker.

import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const here = (/** @type {string} */ relative) => fileURLToPath(new URL(relative, import.meta.url));

/** @param {string} name */
function installedVersion(name) {
  /** @type {unknown} */
  const pkg = JSON.parse(readFileSync(here(`../node_modules/${name}/package.json`), 'utf8'));
  const version =
    typeof pkg === 'object' && pkg !== null && 'version' in pkg ? pkg.version : undefined;
  if (typeof version !== 'string') throw new Error(`cannot read the version of ${name}`);
  return version;
}

const define = {
  __TEMPORAL_POLYFILL_VERSION__: JSON.stringify(installedVersion('temporal-polyfill')),
  __JS_TEMPORAL_POLYFILL_VERSION__: JSON.stringify(installedVersion('@js-temporal/polyfill')),
};

rmSync(here('./dist'), { recursive: true, force: true });

await build({
  entryPoints: {
    'run-node': here('./harness/node/run-node.ts'),
    'run-browsers': here('./harness/node/run-browsers.ts'),
    'source-main': here('./harness/node/source-main.ts'),
    worker: here('./harness/node/worker.ts'),
    report: here('./cli/report.ts'),
    check: here('./cli/check.ts'),
    baseline: here('./cli/baseline.ts'),
  },
  outdir: here('./dist/node'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  define,
  logLevel: 'warning',
});

await build({
  entryPoints: {
    S1: here('./harness/browser/entries/S1.ts'),
    S2: here('./harness/browser/entries/S2.ts'),
    S3: here('./harness/browser/entries/S3.ts'),
    S4: here('./harness/browser/entries/S4.ts'),
    worker: here('./harness/browser/worker.ts'),
  },
  outdir: here('./dist/browser'),
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  define,
  logLevel: 'warning',
});
