// Minimal structural view of a Temporal implementation. The harness never trusts the static
// type of whatever it loaded: every namespace passes `isTemporalNamespace`, and every call on a
// value goes through `Reflect` so a hostile or broken value cannot crash a cell.

import { TEMPORAL_TYPE_NAMES, type TemporalTypeName } from './types.js';

export interface TemporalClassLike {
  from(item: string): unknown;
}

export type TemporalNamespaceLike = Readonly<Record<TemporalTypeName, TemporalClassLike>>;

export function isTemporalNamespace(value: unknown): value is TemporalNamespaceLike {
  if (typeof value !== 'object' || value === null) return false;
  return TEMPORAL_TYPE_NAMES.every((name) => {
    const cls: unknown = Reflect.get(value, name);
    if (typeof cls !== 'function') return false;
    const from: unknown = Reflect.get(cls, 'from');
    return typeof from === 'function';
  });
}

/**
 * R0.12: the string form used for `expected.str` and for comparison on receipt.
 * PlainYearMonth and PlainMonthDay need `calendarName: 'always'` to include the ISO reference field.
 * Throws if `value` has no callable `toString` or it does not return a string.
 */
export function temporalString(value: unknown, type: TemporalTypeName): string {
  if (typeof value !== 'object' || value === null) throw new TypeError('not an object');
  const toString: unknown = Reflect.get(value, 'toString');
  if (typeof toString !== 'function') throw new TypeError('toString is not callable');
  const args =
    type === 'PlainYearMonth' || type === 'PlainMonthDay' ? [{ calendarName: 'always' }] : [];
  const result: unknown = Reflect.apply(toString, value, args);
  if (typeof result !== 'string') throw new TypeError('toString did not return a string');
  return result;
}
