import { Temporal } from 'temporal-polyfill/implementation';
import { describe, expect, it } from 'vitest';

import {
  observed,
  receivedIfOurs,
  receivedSync,
  runCell,
  type Boundary,
} from '../../../conformance/cell.js';
import { buildMessage } from '../../../conformance/samples.js';
import { isTemporalNamespace } from '../../../conformance/temporal-like.js';
import type { Message } from '../../../conformance/types.js';

if (!isTemporalNamespace(Temporal)) throw new Error('fixture is not a Temporal namespace');
const message: Message = buildMessage(Temporal, 'PlainDate');

describe('runCell (R0.15)', () => {
  it('classifies what the boundary settles', async () => {
    const boundary: Boundary = (msg, ctx) => {
      ctx.settle(receivedSync(structuredClone(msg), msg.expected));
    };
    expect(await runCell(boundary, message)).toEqual({
      outcome: 'silent-loss',
      detail: { receivedTag: '[object Object]', ownKeyCount: 0, shape: '{}' },
    });
  });

  it('passes a remote cell through unchanged', async () => {
    const boundary: Boundary = (_msg, ctx) => {
      ctx.settle({ kind: 'remote-cell', cell: { outcome: 'ok' } });
    };
    expect(await runCell(boundary, message)).toEqual({ outcome: 'ok' });
  });

  it('keeps the first settle', async () => {
    const boundary: Boundary = (_msg, ctx) => {
      ctx.settle(observed({ kind: 'timeout' }));
      ctx.settle({ kind: 'remote-cell', cell: { outcome: 'ok' } });
    };
    expect(await runCell(boundary, message)).toEqual({ outcome: 'timeout' });
  });

  it('times out when nothing arrives', async () => {
    const boundary: Boundary = () => undefined;
    expect(await runCell(boundary, message, 20)).toEqual({ outcome: 'timeout' });
  });

  it('times out when setup never finishes, and still runs cleanup registered so far', async () => {
    let cleaned = false;
    const boundary: Boundary = (_msg, ctx) => {
      ctx.onCleanup(() => {
        cleaned = true;
      });
      return new Promise(() => undefined);
    };
    expect(await runCell(boundary, message, 20)).toEqual({ outcome: 'timeout' });
    expect(cleaned).toBe(true);
  });

  it('runs cleanup registered after the cell finished immediately', async () => {
    let lateCleaned = false;
    let finishSetup: () => void = () => undefined;
    const boundary: Boundary = async (_msg, ctx) => {
      await new Promise<void>((resolve) => {
        finishSetup = resolve;
      });
      ctx.onCleanup(() => {
        lateCleaned = true;
      });
    };
    expect(await runCell(boundary, message, 20)).toEqual({ outcome: 'timeout' });
    finishSetup();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(lateCleaned).toBe(true);
  });

  it('turns a throwing boundary into harness-error', async () => {
    const boundary: Boundary = () => {
      throw new RangeError('setup failed');
    };
    const cell = await runCell(boundary, message);
    expect(cell.outcome).toBe('harness-error');
    expect(cell.detail).toMatchObject({ errorName: 'RangeError', message: 'setup failed' });
  });

  it('turns a rejecting boundary into harness-error', async () => {
    const boundary: Boundary = () => Promise.reject(new TypeError('async setup failed'));
    const cell = await runCell(boundary, message);
    expect(cell.detail).toMatchObject({ errorName: 'TypeError', message: 'async setup failed' });
  });

  it('runs cleanups in reverse order after settling', async () => {
    const order: string[] = [];
    const boundary: Boundary = (_msg, ctx) => {
      ctx.onCleanup(() => order.push('first'));
      ctx.onCleanup(() => order.push('second'));
      ctx.settle({ kind: 'remote-cell', cell: { outcome: 'ok' } });
    };
    await runCell(boundary, message);
    expect(order).toEqual(['second', 'first']);
  });

  it('reports a failing cleanup as harness-error and still runs the others', async () => {
    let otherRan = false;
    const boundary: Boundary = (_msg, ctx) => {
      ctx.onCleanup(() => {
        otherRan = true;
      });
      ctx.onCleanup(() => {
        throw new Error('port would not close');
      });
      ctx.settle({ kind: 'remote-cell', cell: { outcome: 'ok' } });
    };
    const cell = await runCell(boundary, message);
    expect(cell.outcome).toBe('harness-error');
    expect(cell.detail).toMatchObject({ message: 'port would not close' });
    expect(otherRan).toBe(true);
  });

  it('bounds a hanging cleanup', async () => {
    const boundary: Boundary = (_msg, ctx) => {
      ctx.onCleanup(() => new Promise(() => undefined));
      ctx.settle({ kind: 'remote-cell', cell: { outcome: 'ok' } });
    };
    const cell = await runCell(boundary, message, 20);
    expect(cell.outcome).toBe('harness-error');
    expect(cell.detail).toMatchObject({ message: 'cleanup did not finish within 20 ms' });
  });
});

describe('receivedIfOurs / receivedSync', () => {
  it('accepts this cell’s wrapper', () => {
    expect(receivedIfOurs({ value: 1, expected: message.expected }, message.expected)).toEqual(
      observed({ kind: 'received', value: 1 }),
    );
  });

  it('ignores a straggler from another cell', () => {
    const other = { value: 1, expected: { type: 'PlainTime', str: '01:30:00' } };
    expect(receivedIfOurs(other, message.expected)).toBeUndefined();
  });

  it('ignores data that is not a wrapper', () => {
    expect(receivedIfOurs({}, message.expected)).toBeUndefined();
    expect(receivedIfOurs(null, message.expected)).toBeUndefined();
  });

  it('receivedSync reports a lost wrapper as a harness error', () => {
    const result = receivedSync({}, message.expected);
    expect(result.kind === 'observation' && result.observation.kind).toBe('harness-error');
  });
});
