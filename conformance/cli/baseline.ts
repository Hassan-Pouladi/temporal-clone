// `npm run conformance:baseline`: writes conformance/baseline.json from the six committed result
// files. Deliberately a separate, local-only command (D-005): it refuses to run in CI, so the
// weekly canary can never rewrite the baseline.

import { writeFile } from 'node:fs/promises';

import { buildBaseline } from '../compare.js';
import { BASELINE_FILE, readAllResults } from '../harness/node/results-io.js';
import { toJsonFile } from '../result-schema.js';

if (process.env['CI'] !== undefined) {
  process.stderr.write('conformance:baseline refuses to run in CI (the CI variable is set).\n');
  process.exit(1);
}

await writeFile(BASELINE_FILE, toJsonFile(buildBaseline(await readAllResults())), 'utf8');
process.stdout.write(`wrote ${BASELINE_FILE}\n`);
