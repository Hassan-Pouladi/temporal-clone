// `npm run conformance:report`: regenerates conformance/MATRIX.md from all result files (R0.17).

import { writeFile } from 'node:fs/promises';

import { MATRIX_FILE, readAllResults } from '../harness/node/results-io.js';
import { evaluateHypotheses } from '../hypotheses.js';
import { renderMatrix } from '../matrix.js';

const results = await readAllResults();
const hypotheses = evaluateHypotheses(results);
await writeFile(MATRIX_FILE, renderMatrix(results, hypotheses), 'utf8');

for (const h of hypotheses) {
  process.stdout.write(
    `${h.id} ${h.pass ? 'PASS' : 'FAIL'}${h.pass ? '' : ` (${String(h.offending.length)} offending)`}\n`,
  );
}
process.stdout.write(`wrote ${MATRIX_FILE}\n`);
