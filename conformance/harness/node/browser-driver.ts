// Drives one harness page from Node through Playwright. Shared by the conformance browser runner
// and the Playwright smoke test (R0.24).

import type { Page } from '@playwright/test';

import { readSourceReport } from '../../result-schema.js';
import { failedReport } from '../../source.js';
import {
  BROWSER_BOUNDARIES,
  CELL_TIMEOUT_MS,
  TEMPORAL_TYPE_NAMES,
  type BoundaryId,
  type SourceId,
  type SourceReport,
  type TemporalTypeName,
} from '../../types.js';

export const HARNESS_PATH = '/harness/browser/index.html';
const LOAD_TIMEOUT_MS = 30_000;

export interface DriveOptions {
  readonly types?: readonly TemporalTypeName[];
  readonly boundaries?: readonly BoundaryId[];
}

/**
 * Loads the harness page for `source` into `page` (which must be fresh: one realm per source)
 * and runs its cells. Never throws: a page that fails as a whole yields harness-error cells.
 */
export async function driveSource(
  page: Page,
  baseUrl: string,
  source: SourceId,
  options: DriveOptions = {},
): Promise<SourceReport> {
  const boundaries = options.boundaries ?? BROWSER_BOUNDARIES;
  const types = options.types ?? TEMPORAL_TYPE_NAMES;
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(`${error.name}: ${error.message}`);
  });
  try {
    await page.goto(new URL(`${HARNESS_PATH}?source=${source}`, baseUrl).href);
    await page.waitForFunction(() => Reflect.has(globalThis, '__conformance'), undefined, {
      timeout: LOAD_TIMEOUT_MS,
    });
    // Worst case per cell: the cell timeout plus one bounded cleanup per resource.
    const budget = boundaries.length * types.length * CELL_TIMEOUT_MS * 3 + LOAD_TIMEOUT_MS;
    const raw = await withTimeout(
      page.evaluate(
        async (runOptions) => {
          const api: unknown = Reflect.get(globalThis, '__conformance');
          if (typeof api !== 'object' || api === null) throw new Error('harness not loaded');
          const run: unknown = Reflect.get(api, 'run');
          if (typeof run !== 'function') throw new Error('harness has no run()');
          const report: unknown = await Reflect.apply(run, api, [runOptions]);
          return report;
        },
        { types: [...types], boundaries: [...boundaries] },
      ),
      budget,
    );
    const report = readSourceReport(raw, `${source} report`);
    if (report.source !== source) {
      throw new Error(`expected ${source}, page reported ${report.source}`);
    }
    return report;
  } catch (error) {
    const detail = pageErrors.length > 0 ? ` (page errors: ${pageErrors.join('; ')})` : '';
    const message = error instanceof Error ? error.message : String(error);
    return failedReport(source, new Error(`${message}${detail}`), boundaries, types);
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`page did not finish within ${String(ms)} ms`));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
