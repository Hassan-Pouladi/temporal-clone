// `npm run conformance`, Node part: runs the matrix on the current Node and writes
// conformance/results/node<major>.json.

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildEngineResult, readSourceReport } from '../../result-schema.js';
import { failedReport } from '../../source.js';
import {
  CELL_TIMEOUT_MS,
  NODE_BOUNDARIES,
  NODE_ENGINES,
  SOURCE_IDS,
  TEMPORAL_TYPE_NAMES,
  type NodeEngine,
  type SourceId,
  type SourceReport,
} from '../../types.js';
import { writeEngineResult } from './results-io.js';

// Worst case per cell: the cell timeout plus one bounded cleanup per resource.
const SOURCE_TIMEOUT_MS = NODE_BOUNDARIES.length * TEMPORAL_TYPE_NAMES.length * CELL_TIMEOUT_MS * 3;
const SOURCE_MAIN = fileURLToPath(new URL('./source-main.js', import.meta.url));

function currentEngine(): NodeEngine {
  const engine = `node${process.versions.node.split('.')[0] ?? ''}`;
  const known = NODE_ENGINES.find((candidate) => candidate === engine);
  if (known === undefined) {
    throw new Error(`Node ${process.version} is not a matrix engine (${NODE_ENGINES.join(', ')})`);
  }
  return known;
}

function runSourceProcess(id: SourceId): Promise<SourceReport> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (report: SourceReport): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(report);
    };
    const child = fork(SOURCE_MAIN, [id], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const timer = setTimeout(() => {
      child.kill();
      finish(
        failedReport(
          id,
          new Error(`source process did not finish in ${String(SOURCE_TIMEOUT_MS)} ms`),
          NODE_BOUNDARIES,
        ),
      );
    }, SOURCE_TIMEOUT_MS);
    child.on('message', (data: unknown) => {
      try {
        const report = readSourceReport(data, `${id} report`);
        if (report.source !== id)
          throw new Error(`expected a report for ${id}, got ${report.source}`);
        finish(report);
      } catch (error) {
        finish(failedReport(id, error, NODE_BOUNDARIES));
      }
    });
    child.on('error', (error) => {
      finish(failedReport(id, error, NODE_BOUNDARIES));
    });
    child.on('exit', (code, signal) => {
      finish(
        failedReport(
          id,
          new Error(
            `source process exited (code ${String(code)}, signal ${String(signal)}) without a report`,
          ),
          NODE_BOUNDARIES,
        ),
      );
    });
  });
}

const engine = currentEngine();
const reports: SourceReport[] = [];
for (const id of SOURCE_IDS) {
  const report = await runSourceProcess(id);
  const counts = new Map<string, number>();
  for (const cell of report.cells) counts.set(cell.outcome, (counts.get(cell.outcome) ?? 0) + 1);
  process.stderr.write(
    `${engine} ${id}: ${[...counts].map(([outcome, n]) => `${outcome} x${String(n)}`).join(', ')}\n`,
  );
  reports.push(report);
}
const file = await writeEngineResult(
  buildEngineResult(engine, process.version, new Date().toISOString(), reports),
);
process.stderr.write(`wrote ${file}\n`);
