// `npm run conformance`, browser part: runs the matrix in Playwright's chromium, firefox and webkit
// (or the engines named on the command line) and writes conformance/results/<engine>.json.

import { chromium, firefox, webkit, type BrowserType } from '@playwright/test';

import { buildEngineResult } from '../../result-schema.js';
import { BROWSER_ENGINES, SOURCE_IDS, type BrowserEngine, type SourceReport } from '../../types.js';
import { driveSource } from './browser-driver.js';
import { CONFORMANCE_DIR, writeEngineResult } from './results-io.js';
import { startServer } from './server-process.js';

const BROWSER_TYPES: Readonly<Record<BrowserEngine, BrowserType>> = { chromium, firefox, webkit };

function requestedEngines(args: readonly string[]): BrowserEngine[] {
  if (args.length === 0) return [...BROWSER_ENGINES];
  return args.map((arg) => {
    const engine = BROWSER_ENGINES.find((candidate) => candidate === arg);
    if (engine === undefined) {
      throw new Error(`unknown browser ${arg}; expected one of ${BROWSER_ENGINES.join(', ')}`);
    }
    return engine;
  });
}

const engines = requestedEngines(process.argv.slice(2));
const server = await startServer(CONFORMANCE_DIR);
const { baseUrl } = server;

try {
  for (const engine of engines) {
    const browser = await BROWSER_TYPES[engine].launch();
    try {
      const reports: SourceReport[] = [];
      for (const id of SOURCE_IDS) {
        // A fresh context and page per source: a polyfill never shares a realm with another.
        const context = await browser.newContext();
        try {
          const report = await driveSource(await context.newPage(), baseUrl, id);
          const counts = new Map<string, number>();
          for (const cell of report.cells) {
            counts.set(cell.outcome, (counts.get(cell.outcome) ?? 0) + 1);
          }
          process.stderr.write(
            `${engine} ${id}: ${[...counts].map(([o, n]) => `${o} x${String(n)}`).join(', ')}\n`,
          );
          reports.push(report);
        } finally {
          await context.close();
        }
      }
      const file = await writeEngineResult(
        buildEngineResult(engine, browser.version(), new Date().toISOString(), reports),
      );
      process.stderr.write(`wrote ${file}\n`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.stop();
}
