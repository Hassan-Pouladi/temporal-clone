import { Temporal as polyfill } from 'temporal-polyfill/implementation';
import { describe, expect, it } from 'vitest';

import { receivedSync, type Boundary } from '../../../conformance/cell.js';
import {
  failedSource,
  nativeSource,
  polyfillSource,
  runSource,
} from '../../../conformance/source.js';
import { TEMPORAL_TYPE_NAMES } from '../../../conformance/types.js';
import {
  readWorkerReply,
  replyTo,
  replyToMessageError,
} from '../../../conformance/worker-protocol.js';

const cloneBoundary: Boundary = (msg, ctx) => {
  ctx.settle(receivedSync(structuredClone(msg), msg.expected));
};
const identityBoundary: Boundary = (msg, ctx) => {
  ctx.settle(receivedSync(msg, msg.expected));
};

describe('source loading (R0.10)', () => {
  it('S1 is unavailable without a native namespace', () => {
    expect(nativeSource(undefined)).toMatchObject({
      id: 'S1',
      info: { available: false },
      kind: 'unavailable',
    });
  });

  it('S1 rejects something that is not a Temporal namespace', () => {
    expect(nativeSource({}).kind).toBe('failed');
  });

  it('S2 records resolvedToNative by identity', () => {
    expect(polyfillSource('S2', polyfill, '1.0.5', polyfill).info).toEqual({
      available: true,
      version: '1.0.5',
      resolvedToNative: true,
    });
    expect(polyfillSource('S2', polyfill, '1.0.5', undefined).info).toEqual({
      available: true,
      version: '1.0.5',
      resolvedToNative: false,
    });
  });

  it('S3 and S4 carry no resolvedToNative', () => {
    expect(polyfillSource('S3', polyfill, '1.0.5', undefined).info).toEqual({
      available: true,
      version: '1.0.5',
    });
  });
});

describe('runSource', () => {
  it('runs every type for every boundary, sorted', async () => {
    const report = await runSource(polyfillSource('S3', polyfill, '1.0.5', undefined), [
      ['B2', identityBoundary],
      ['B1', cloneBoundary],
    ]);
    expect(report.cells).toHaveLength(2 * TEMPORAL_TYPE_NAMES.length);
    expect(report.cells.map((c) => `${c.boundary}/${c.type}`).slice(0, 2)).toEqual([
      'B1/Instant',
      'B1/ZonedDateTime',
    ]);
    expect(report.cells.filter((c) => c.boundary === 'B1').map((c) => c.outcome)).toEqual(
      TEMPORAL_TYPE_NAMES.map(() => 'silent-loss'),
    );
    expect(report.cells.filter((c) => c.boundary === 'B2').map((c) => c.outcome)).toEqual(
      TEMPORAL_TYPE_NAMES.map(() => 'ok'),
    );
  });

  it('marks every cell of an unavailable source', async () => {
    const report = await runSource(nativeSource(undefined), [['B1', cloneBoundary]]);
    expect(new Set(report.cells.map((c) => c.outcome))).toEqual(new Set(['unavailable']));
    expect(report.cells[0]?.detail).toEqual({ reason: 'globalThis.Temporal is undefined' });
  });

  it('marks every cell of a failed source as harness-error', async () => {
    const report = await runSource(failedSource('S4', new Error('import failed')), [
      ['B1', cloneBoundary],
    ]);
    expect(new Set(report.cells.map((c) => c.outcome))).toEqual(new Set(['harness-error']));
  });

  it('isolates a failing sample: other cells still run', async () => {
    // Spread would drop the namespace's non-enumerable classes, so copy them by name.
    const broken = {
      ...Object.fromEntries(TEMPORAL_TYPE_NAMES.map((name) => [name, polyfill[name]])),
      // A constructor-shaped stand-in whose `from` always throws.
      Duration: Object.assign(() => undefined, {
        from: (): never => {
          throw new RangeError('no durations here');
        },
      }),
    };
    const report = await runSource(polyfillSource('S3', broken, 'x', undefined), [
      ['B1', cloneBoundary],
    ]);
    const duration = report.cells.find((c) => c.type === 'Duration');
    expect(duration?.outcome).toBe('harness-error');
    expect(report.cells.filter((c) => c.outcome === 'silent-loss')).toHaveLength(7);
  });
});

describe('worker protocol (B3)', () => {
  const expected = { type: 'PlainDate', str: '2026-10-31' } as const;

  it('classifies inside the worker and is read back on the main side', () => {
    const reply = replyTo(structuredClone({ value: {}, expected }));
    expect(readWorkerReply(structuredClone(reply), expected)).toEqual({
      kind: 'remote-cell',
      cell: {
        outcome: 'silent-loss',
        detail: { receivedTag: '[object Object]', ownKeyCount: 0, shape: '{}' },
      },
    });
  });

  it('ignores a reply for another cell', () => {
    const reply = replyTo({ value: {}, expected: { type: 'PlainTime', str: 'x' } });
    expect(readWorkerReply(reply, expected)).toBeUndefined();
  });

  it('maps messageerror to async-error and garbage to harness-error', () => {
    expect(readWorkerReply(replyToMessageError(), expected)).toMatchObject({
      kind: 'observation',
      observation: { kind: 'async-error' },
    });
    expect(readWorkerReply(replyTo('garbage'), expected)).toMatchObject({
      kind: 'observation',
      observation: { kind: 'harness-error' },
    });
  });

  it('throws on a malformed reply', () => {
    expect(() => readWorkerReply({ kind: 'nope' }, expected)).toThrow(/unknown kind/);
    expect(() => readWorkerReply(42, expected)).toThrow(/not an object/);
  });
});
