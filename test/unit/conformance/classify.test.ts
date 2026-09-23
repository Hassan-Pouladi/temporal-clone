import { Temporal } from 'temporal-polyfill/implementation';
import { describe, expect, it } from 'vitest';

import { classify } from '../../../conformance/classify.js';
import type { Expected } from '../../../conformance/types.js';

const plainDate: Expected = { type: 'PlainDate', str: '2026-10-31' };

describe('classify (R0.13, R0.14)', () => {
  describe('received', () => {
    it('is ok for a Temporal value of the expected type and string form', () => {
      const value = Temporal.PlainDate.from('2026-10-31');
      expect(classify({ kind: 'received', value }, plainDate)).toEqual({ outcome: 'ok' });
    });

    it('uses calendarName: always for PlainYearMonth and PlainMonthDay', () => {
      const ym = Temporal.PlainYearMonth.from('2026-10');
      const md = Temporal.PlainMonthDay.from('10-31');
      expect(
        classify(
          { kind: 'received', value: ym },
          { type: 'PlainYearMonth', str: '2026-10-01[u-ca=iso8601]' },
        ),
      ).toEqual({ outcome: 'ok' });
      expect(
        classify(
          { kind: 'received', value: md },
          { type: 'PlainMonthDay', str: '1972-10-31[u-ca=iso8601]' },
        ),
      ).toEqual({ outcome: 'ok' });
    });

    it('is silent-loss for an empty plain object', () => {
      expect(classify({ kind: 'received', value: {} }, plainDate)).toEqual({
        outcome: 'silent-loss',
        detail: { receivedTag: '[object Object]', ownKeyCount: 0, shape: '{}' },
      });
    });

    it('is silent-loss for a Temporal value of the wrong type', () => {
      const value = Temporal.PlainDateTime.from('2026-10-31T00:00');
      expect(classify({ kind: 'received', value }, plainDate)).toEqual({
        outcome: 'silent-loss',
        detail: {
          receivedTag: '[object Temporal.PlainDateTime]',
          // Polyfill internals decide this; the classifier just reports it.
          ownKeyCount: Reflect.ownKeys(value).length,
          shape: '"2026-10-31T00:00:00"',
        },
      });
    });

    it('is silent-loss for a Temporal value of the right type but a different string form', () => {
      const value = Temporal.PlainDate.from('2026-11-01');
      expect(classify({ kind: 'received', value }, plainDate).outcome).toBe('silent-loss');
    });

    it('is silent-loss, not a crash, when toString throws', () => {
      const value = {
        [Symbol.toStringTag]: 'Temporal.PlainDate',
        toString(): string {
          throw new Error('boom');
        },
      };
      expect(classify({ kind: 'received', value }, plainDate)).toEqual({
        outcome: 'silent-loss',
        detail: { receivedTag: '[object Temporal.PlainDate]', ownKeyCount: 2, shape: '{}' },
      });
    });

    it('is silent-loss when toString returns a non-string', () => {
      const value = { [Symbol.toStringTag]: 'Temporal.PlainDate', toString: () => 42 };
      expect(classify({ kind: 'received', value }, plainDate).outcome).toBe('silent-loss');
    });

    it('describes primitives', () => {
      expect(classify({ kind: 'received', value: undefined }, plainDate)).toEqual({
        outcome: 'silent-loss',
        detail: { receivedTag: '[object Undefined]', ownKeyCount: 0, shape: 'undefined' },
      });
      expect(classify({ kind: 'received', value: '2026-10-31' }, plainDate)).toEqual({
        outcome: 'silent-loss',
        detail: { receivedTag: '[object String]', ownKeyCount: 0, shape: '"2026-10-31"' },
      });
    });

    it('truncates shape to 200 characters', () => {
      const cell = classify({ kind: 'received', value: { k: 'x'.repeat(500) } }, plainDate);
      expect(cell.detail?.['shape']).toHaveLength(200);
    });

    it('reports unserializable shapes instead of throwing', () => {
      const cyclic: Record<string, unknown> = {};
      cyclic['self'] = cyclic;
      expect(classify({ kind: 'received', value: cyclic }, plainDate)).toEqual({
        outcome: 'silent-loss',
        detail: {
          receivedTag: '[object Object]',
          ownKeyCount: 1,
          shape: '<unserializable: TypeError>',
        },
      });
    });

    it('survives a revoked proxy', () => {
      const { proxy, revoke } = Proxy.revocable({}, {});
      revoke();
      expect(classify({ kind: 'received', value: proxy }, plainDate)).toEqual({
        outcome: 'silent-loss',
        detail: {
          receivedTag: '<tag threw: TypeError>',
          ownKeyCount: -1,
          shape: '<unserializable: TypeError>',
        },
      });
    });
  });

  it('send-threw becomes throws with errorName and message', () => {
    const error = new Error('could not be cloned');
    error.name = 'DataCloneError';
    expect(classify({ kind: 'send-threw', error }, plainDate)).toEqual({
      outcome: 'throws',
      detail: { errorName: 'DataCloneError', message: 'could not be cloned' },
    });
  });

  it('truncates error messages to 200 characters', () => {
    const cell = classify({ kind: 'send-threw', error: new TypeError('m'.repeat(300)) }, plainDate);
    expect(cell.detail).toEqual({ errorName: 'TypeError', message: 'm'.repeat(200) });
  });

  it('describes thrown non-errors', () => {
    expect(classify({ kind: 'send-threw', error: 'nope' }, plainDate)).toEqual({
      outcome: 'throws',
      detail: { errorName: 'string', message: 'nope' },
    });
    expect(classify({ kind: 'send-threw', error: {} }, plainDate)).toEqual({
      outcome: 'throws',
      detail: { errorName: 'unknown', message: '' },
    });
  });

  it('async-error keeps errorName and message', () => {
    expect(
      classify(
        { kind: 'async-error', error: { name: 'messageerror', message: 'deserialization failed' } },
        plainDate,
      ),
    ).toEqual({
      outcome: 'async-error',
      detail: { errorName: 'messageerror', message: 'deserialization failed' },
    });
  });

  it('timeout has no detail', () => {
    expect(classify({ kind: 'timeout' }, plainDate)).toEqual({ outcome: 'timeout' });
  });

  it('unavailable keeps the reason', () => {
    expect(classify({ kind: 'unavailable', reason: 'no globalThis.Temporal' }, plainDate)).toEqual({
      outcome: 'unavailable',
      detail: { reason: 'no globalThis.Temporal' },
    });
  });

  it('harness-error keeps errorName, message and the first 1000 characters of stack', () => {
    const error = new RangeError('bad');
    error.stack = 's'.repeat(1500);
    expect(classify({ kind: 'harness-error', error }, plainDate)).toEqual({
      outcome: 'harness-error',
      detail: { errorName: 'RangeError', message: 'bad', stack: 's'.repeat(1000) },
    });
  });
});
