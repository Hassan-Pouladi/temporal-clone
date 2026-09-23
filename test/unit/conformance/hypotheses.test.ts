import { describe, expect, it } from 'vitest';

import { evaluateHypotheses, type HypothesisId } from '../../../conformance/hypotheses.js';
import type { Engine, EngineResult } from '../../../conformance/types.js';
import { conformingResults, withCell } from './fixtures/engines.js';

function verdicts(results: Partial<Record<Engine, EngineResult>>): Record<HypothesisId, boolean> {
  return Object.fromEntries(evaluateHypotheses(results).map((h) => [h.id, h.pass])) as Record<
    HypothesisId,
    boolean
  >;
}

function offending(results: Partial<Record<Engine, EngineResult>>, id: HypothesisId): string[] {
  return [...(evaluateHypotheses(results).find((h) => h.id === id)?.offending ?? [])];
}

function engine(results: Partial<Record<Engine, EngineResult>>, name: Engine): EngineResult {
  const result = results[name];
  if (result === undefined) throw new Error(`fixture has no ${name}`);
  return result;
}

describe('hypotheses (R0.19)', () => {
  it('all pass for results that behave as predicted', () => {
    expect(verdicts(conformingResults())).toEqual({
      HY1: true,
      HY2: true,
      HY3: true,
      HY4: true,
      HY5: true,
      HY6: true,
    });
  });

  it('HY1 and HY2 fail when WebKit ships Temporal', () => {
    const results = conformingResults();
    const webkit = engine(results, 'webkit');
    results.webkit = {
      ...webkit,
      sources: {
        ...webkit.sources,
        S1: { available: true },
        S2: { available: true, version: '1.0.5', resolvedToNative: true },
      },
    };
    expect(offending(results, 'HY1')).toEqual(['webkit: S1 available is true']);
    // S2 resolved to native consistently with S1, so HY2 holds. S1 and S2 cells are now
    // expected to throw (HY3), and the unchanged fixture cells do not.
    expect(verdicts(results).HY2).toBe(true);
    expect(verdicts(results).HY3).toBe(false);
    expect(offending(results, 'HY3')).toContain('webkit S1 B1 Instant: N/A');
    expect(offending(results, 'HY3')).toContain('webkit S2 B1 Instant: LOSS({})');
  });

  it('HY2 fails when S2 disagrees with S1', () => {
    const results = conformingResults();
    const node24 = engine(results, 'node24');
    results.node24 = {
      ...node24,
      sources: { ...node24.sources, S2: { available: true, resolvedToNative: true } },
    };
    expect(offending(results, 'HY2')).toEqual([
      'node24: S2 resolvedToNative is true, S1 available is false',
    ]);
  });

  it('HY3 accepts any error name for B8 only (D-003)', () => {
    const results = conformingResults();
    results.node26 = withCell(engine(results, 'node26'), 'S1', 'B1', 'Instant', {
      outcome: 'throws',
      detail: { errorName: 'Error', message: 'x' },
    });
    expect(offending(results, 'HY3')).toEqual(['node26 S1 B1 Instant: THROW(Error)']);
  });

  it('HY4 fails for a non-empty shape', () => {
    const results = conformingResults();
    results.firefox = withCell(engine(results, 'firefox'), 'S4', 'B6', 'Duration', {
      outcome: 'silent-loss',
      detail: { receivedTag: '[object Object]', ownKeyCount: 1, shape: '{"a":1}' },
    });
    expect(offending(results, 'HY4')).toEqual(['firefox S4 B6 Duration: LOSS({"a":1})']);
  });

  it('HY5 fails for an ok cell, which also breaks HY3', () => {
    const results = conformingResults();
    results.chromium = withCell(engine(results, 'chromium'), 'S1', 'B7', 'PlainDate', {
      outcome: 'ok',
    });
    expect(offending(results, 'HY5')).toEqual(['chromium S1 B7 PlainDate: OK']);
    expect(verdicts(results).HY3).toBe(false);
  });

  it('HY6 fails for timeout, async-error and harness-error', () => {
    const results = conformingResults();
    let webkit = engine(results, 'webkit');
    webkit = withCell(webkit, 'S3', 'B1', 'Instant', { outcome: 'timeout' });
    webkit = withCell(webkit, 'S3', 'B2', 'Instant', {
      outcome: 'async-error',
      detail: { errorName: 'messageerror', message: '' },
    });
    webkit = withCell(webkit, 'S3', 'B3', 'Instant', {
      outcome: 'harness-error',
      detail: { errorName: 'Error', message: '', stack: '' },
    });
    results.webkit = webkit;
    expect(offending(results, 'HY6')).toEqual([
      'webkit S3 B1 Instant: TIMEOUT',
      'webkit S3 B2 Instant: ASYNC(messageerror)',
      'webkit S3 B3 Instant: HARNESS',
    ]);
  });

  it('every hypothesis fails while a result file is missing', () => {
    const results = conformingResults();
    delete results.node22;
    for (const h of evaluateHypotheses(results)) {
      expect(h.pass).toBe(false);
      expect(h.offending).toContain('node22: no result file');
    }
  });
});
