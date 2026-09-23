// `npm run conformance:check`: compares conformance/results/*.json with conformance/baseline.json
// and exits 1 with a readable diff on any difference (R0.18). It never writes the baseline.
//
// On a difference it also writes, for the canary workflow:
//   conformance/results/tmp/diff.md              the diff, used as the issue body
//   conformance/results/tmp/changed-engines.txt  comma-separated engine names, used in the title

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { diffAgainstBaseline, formatDifferences, readBaseline } from '../compare.js';
import { BASELINE_FILE, RESULTS_TMP_DIR, readAllResults } from '../harness/node/results-io.js';

if (!existsSync(BASELINE_FILE)) {
  process.stderr.write(
    `${BASELINE_FILE} does not exist. Create it deliberately with npm run conformance:baseline.\n`,
  );
  process.exit(1);
}

const baseline = readBaseline(JSON.parse(await readFile(BASELINE_FILE, 'utf8')), BASELINE_FILE);
const differences = diffAgainstBaseline(baseline, await readAllResults());

if (differences.length === 0) {
  process.stdout.write('conformance:check: results match conformance/baseline.json\n');
} else {
  const report = formatDifferences(differences);
  const engines = [...new Set(differences.map((d) => d.engine))];
  await mkdir(RESULTS_TMP_DIR, { recursive: true });
  await writeFile(path.join(RESULTS_TMP_DIR, 'diff.md'), report, 'utf8');
  await writeFile(path.join(RESULTS_TMP_DIR, 'changed-engines.txt'), engines.join(', '), 'utf8');
  process.stderr.write(report);
  process.exitCode = 1;
}
