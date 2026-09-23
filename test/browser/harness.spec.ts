// R0.24: harness smoke test. The full matrix runs under `npm run conformance`, not here.

import { expect, test } from '@playwright/test';

import { driveSource } from '../../conformance/harness/node/browser-driver.js';
import { BROWSER_BOUNDARIES } from '../../conformance/types.js';

test('the harness page loads, the bundled classifier runs, and one S3 PlainDate cell per boundary completes', async ({
  page,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error('playwright.config.ts must set baseURL');
  const report = await driveSource(page, baseURL, 'S3', { types: ['PlainDate'] });

  expect(report.source).toBe('S3');
  expect(report.info.available).toBe(true);
  expect(report.cells.map((cell) => `${cell.boundary} ${cell.type}`)).toEqual(
    BROWSER_BOUNDARIES.map((boundary) => `${boundary} PlainDate`),
  );
  for (const cell of report.cells) {
    expect(cell.outcome, `${cell.boundary}: ${JSON.stringify(cell.detail)}`).not.toBe(
      'harness-error',
    );
    expect(cell.outcome, cell.boundary).not.toBe('timeout');
  }
});
