// R0.11 sample values and R0.12 message wrapper.

import { temporalString, type TemporalNamespaceLike } from './temporal-like.js';
import { isTemporalTypeName, type Expected, type Message, type TemporalTypeName } from './types.js';

export const SAMPLE_INPUTS: Readonly<Record<TemporalTypeName, string>> = {
  Instant: '2026-10-31T01:30:00.123456789Z',
  ZonedDateTime: '2026-11-01T01:30:00-05:00[America/Toronto]',
  PlainDate: '2026-10-31',
  PlainTime: '01:30:00.000000001',
  PlainDateTime: '2026-10-31T01:30:00.000000001',
  PlainYearMonth: '2026-10',
  PlainMonthDay: '10-31',
  Duration: 'P1Y2M3W4DT5H6M7.008009010S',
};

/** Builds `{ value: sample, expected: { type, str } }` with the source's own namespace. */
export function buildMessage(temporal: TemporalNamespaceLike, type: TemporalTypeName): Message {
  const value = temporal[type].from(SAMPLE_INPUTS[type]);
  return { value, expected: { type, str: temporalString(value, type) } };
}

/** Reads a wrapper that came back from a boundary. `undefined` if it is not one. */
export function readMessage(data: unknown): Message | undefined {
  if (typeof data !== 'object' || data === null || !('value' in data)) return undefined;
  const expected = readExpected(Reflect.get(data, 'expected'));
  if (expected === undefined) return undefined;
  const value: unknown = Reflect.get(data, 'value');
  return { value, expected };
}

export function readExpected(data: unknown): Expected | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const type: unknown = Reflect.get(data, 'type');
  const str: unknown = Reflect.get(data, 'str');
  if (!isTemporalTypeName(type) || typeof str !== 'string') return undefined;
  return { type, str };
}

export function sameExpected(a: Expected, b: Expected): boolean {
  return a.type === b.type && a.str === b.str;
}
