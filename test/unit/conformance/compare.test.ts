import { describe, expect, it } from 'vitest';

import {
  buildBaseline,
  diffAgainstBaseline,
  formatDifferences,
  readBaseline,
} from '../../../conformance/compare.js';
import { conformingResults, withCell } from './fixtures/engines.js';

function jsonCopy(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe('conformance:check comparison (R0.18)', () => {
  it('passes for an unchanged copy of the results', () => {
    const results = conformingResults();
    const baseline = readBaseline(jsonCopy(buildBaseline(results)));
    expect(diffAgainstBaseline(baseline, conformingResults())).toEqual([]);
  });

  it('ignores runAt, versions and non-normalized detail', () => {
    const baseline = buildBaseline(conformingResults());
    const results = conformingResults();
    const chromium = results.chromium;
    if (chromium === undefined) throw new Error('fixture');
    results.chromium = {
      ...withCell(chromium, 'S1', 'B1', 'Instant', {
        outcome: 'throws',
        detail: { errorName: 'DataCloneError', message: 'a different message' },
      }),
      runAt: '2030-01-01T00:00:00.000Z',
      engineVersion: '999.0',
      sources: { ...chromium.sources, S3: { available: true, version: '9.9.9' } },
    };
    expect(diffAgainstBaseline(baseline, results)).toEqual([]);
  });

  it('fails on one flipped cell and names the cell', () => {
    const baseline = buildBaseline(conformingResults());
    const results = conformingResults();
    const chromium = results.chromium;
    if (chromium === undefined) throw new Error('fixture');
    results.chromium = withCell(chromium, 'S1', 'B6', 'PlainDate', { outcome: 'ok' });
    const differences = diffAgainstBaseline(baseline, results);
    expect(differences).toEqual([
      {
        engine: 'chromium',
        description: 'chromium S1 B6 PlainDate: expected THROW(DataCloneError), got OK',
      },
    ]);
    expect(formatDifferences(differences)).toContain(
      '- chromium S1 B6 PlainDate: expected THROW(DataCloneError), got OK',
    );
  });

  it('detects a changed shape', () => {
    const baseline = buildBaseline(conformingResults());
    const results = conformingResults();
    const node22 = results.node22;
    if (node22 === undefined) throw new Error('fixture');
    results.node22 = withCell(node22, 'S4', 'B8', 'Duration', {
      outcome: 'silent-loss',
      detail: { receivedTag: '[object Object]', ownKeyCount: 1, shape: '{"x":1}' },
    });
    expect(diffAgainstBaseline(baseline, results).map((d) => d.description)).toEqual([
      'node22 S4 B8 Duration: expected LOSS({}), got LOSS({"x":1})',
    ]);
  });

  it('detects source availability changes (a browser shipping Temporal)', () => {
    const baseline = buildBaseline(conformingResults());
    const results = conformingResults();
    const webkit = results.webkit;
    if (webkit === undefined) throw new Error('fixture');
    results.webkit = {
      ...webkit,
      sources: {
        ...webkit.sources,
        S1: { available: true },
        S2: { available: true, version: '1.0.5', resolvedToNative: true },
      },
    };
    expect(diffAgainstBaseline(baseline, results).map((d) => d.description)).toEqual([
      'webkit S1 available: expected false, got true',
      'webkit S2 resolvedToNative: expected false, got true',
    ]);
  });

  it('detects a missing result file, a missing cell and an unexpected cell', () => {
    const baseline = buildBaseline(conformingResults());
    const results = conformingResults();
    delete results.firefox;
    const node24 = results.node24;
    if (node24 === undefined) throw new Error('fixture');
    const [first, ...rest] = node24.cells;
    if (first === undefined) throw new Error('fixture');
    results.node24 = { ...node24, cells: [...rest, { ...first, boundary: 'B5' }] };
    expect(diffAgainstBaseline(baseline, results).map((d) => d.description)).toEqual([
      'node24 S1 B1 Instant: expected N/A, cell missing',
      'node24 S1 B5 Instant: unexpected cell N/A',
      'firefox: result file is missing',
    ]);
  });

  it('refuses to build a baseline without all six engines', () => {
    const results = conformingResults();
    delete results.webkit;
    expect(() => buildBaseline(results)).toThrow(/without webkit/);
  });

  it('normalizes detail to errorName and shape only', () => {
    const baseline = buildBaseline(conformingResults());
    const cells = baseline.engines.node26.cells;
    expect(cells.find((c) => c.source === 'S1' && c.boundary === 'B8')?.detail).toEqual({
      errorName: 'Error',
    });
    expect(cells.find((c) => c.source === 'S3')?.detail).toEqual({ shape: '{}' });
    expect(baseline.engines.node22.cells.find((c) => c.source === 'S1')).not.toHaveProperty(
      'detail',
    );
    expect(JSON.stringify(baseline)).not.toMatch(/runAt|engineVersion|version/);
  });

  it('rejects a malformed baseline', () => {
    expect(() => readBaseline({})).toThrow(/engines/);
    expect(() => readBaseline({ engines: {} })).toThrow(/node22: missing/);
  });
});
