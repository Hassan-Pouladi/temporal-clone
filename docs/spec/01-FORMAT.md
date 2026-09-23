# 01: Wire format v1 and walker semantics (normative)

Status: normative. Frozen when the owner approves Phase 1. After that, no change to any encoded output is permitted (see section 11).

Everything in this document is a requirement unless marked "Informative".

## 1. Scope

This document defines:

- how Temporal values are detected (section 3),
- the tagged record that replaces a Temporal value (section 4),
- the escape record that protects colliding user objects (section 5),
- how `encode` and `decode` walk an arbitrary value graph (section 6),
- the path syntax used in errors and diagnostics (section 7),
- errors (section 8), `indexKey` (section 9), passthrough (section 10), versioning (section 11), golden vectors (section 12) and JSON compatibility (section 13).

## 2. Constants

```ts
export const TAG_KEY = '$temporal';
export const FORMAT_VERSION = 1;
```

`TemporalTypeName` is exactly this union, in this order everywhere it is enumerated:

```ts
type TemporalTypeName =
  | 'Instant' | 'ZonedDateTime' | 'PlainDate' | 'PlainTime'
  | 'PlainDateTime' | 'PlainYearMonth' | 'PlainMonthDay' | 'Duration';
```

## 3. Detection

`temporalTypeOf(value)` MUST return the `TemporalTypeName` of `value`, or `undefined`:

1. If `value` is not an object (`typeof value !== 'object' || value === null`), return `undefined`.
2. Let `tag` be the result of calling the captured `Object.prototype.toString` on `value`. If this throws, return `undefined`.
3. If `tag` equals `[object Temporal.<Name>]` for a `Name` in `TemporalTypeName`, return `Name`. Otherwise return `undefined`.

Rationale (informative): `Symbol.toStringTag` is identical for native Temporal, `temporal-polyfill` and `@js-temporal/polyfill` (verified 2026-09-23). `instanceof` is not usable across implementations or realms. The tag is spoofable. A spoofed object either throws during payload extraction or produces a payload that fails the encoder's self-validation (section 4.2), and in both cases raises `E_ENCODE`. Note that a spoof's inherited `Object.prototype.toString` happily returns `"[object Temporal.PlainDate]"` when called as `toString({ … })`, so self-validation is what catches it.

`isTemporal(value)` is `temporalTypeOf(value) !== undefined`.

`Temporal.Now` (`[object Temporal.Now]`) and the namespace itself (`[object Temporal]`) are not values and MUST NOT be detected.

## 4. Tagged records

### 4.1 Shape

A tagged record is an ordinary object whose own enumerable string keys are exactly, in this insertion order:

| Type | Keys |
|---|---|
| `ZonedDateTime` | `$temporal`, `t`, `v`, `tz`, `cal` |
| every other type | `$temporal`, `t`, `v` |

- `$temporal` is the number `1`.
- `t` is the `TemporalTypeName`.
- `v` is the payload (section 4.2).
- `tz` is the time zone identifier. `cal` is the calendar identifier. Both apply to `ZonedDateTime` only.

Key insertion order is part of the format. Golden vectors compare `JSON.stringify` output byte for byte.

### 4.2 Payload per type

The encoder MUST obtain every payload by calling exactly the accessors below on the value itself, and nothing else. These are the only calls on user objects the library is allowed to make (`CLAUDE.md` section 9).

| `t` | Payload (`v`, plus `tz`/`cal`) | Encoder call(s) on the value `x` |
|---|---|---|
| `Instant` | string, UTC, exactly 9 fractional digits, `Z` suffix | `x.toString({ fractionalSecondDigits: 9 })` |
| `ZonedDateTime` | `v`: the exact instant as for `Instant`; `tz`: time zone ID as reported; `cal`: calendar ID | `x.toInstant().toString({ fractionalSecondDigits: 9 })`, `x.timeZoneId`, `x.calendarId` |
| `PlainDate` | string | `x.toString({ calendarName: 'auto' })` |
| `PlainTime` | string, exactly 9 fractional digits | `x.toString({ fractionalSecondDigits: 9 })` |
| `PlainDateTime` | string, exactly 9 fractional digits | `x.toString({ fractionalSecondDigits: 9, calendarName: 'auto' })` |
| `PlainYearMonth` | string: full ISO reference date plus calendar annotation | `x.toString({ calendarName: 'always' })` |
| `PlainMonthDay` | string: full ISO reference date plus calendar annotation | `x.toString({ calendarName: 'always' })` |
| `Duration` | array of 10 numbers: `[years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds]` | the ten getters, in that order |

After building the record, the encoder MUST validate it against the structural rules of section 4.3 (self-validation). If any accessor call throws, or the record fails self-validation, the encoder MUST throw `TemporalCloneError` `E_ENCODE` with the path. `cause` is the thrown error if a call threw, and `undefined` otherwise.

Why each choice (informative, and each is covered by a hazard test in Phase 1):

- `ZonedDateTime` is carried as exact instant + time zone ID + calendar ID, not as its `toString()`. The string rounds sub-minute offsets (H-04) and, parsed with `offset: 'use'`, drifts by up to 30 seconds. Parsed with `'prefer'` or `'reject'`, it binds decoding to the reader's time zone rules. Exact instant + IDs mirrors whatwg/html#6284 (`[[EpochNanoseconds]]`, `[[TimeZone]]`, `[[Calendar]]`) and is lossless (H-04, H-05, H-06, H-07).
- `PlainYearMonth` and `PlainMonthDay` use `calendarName: 'always'` because that is the only string form that includes the ISO reference day or year. `from()` normalizes those fields, so decoding MUST use the constructor with fields parsed from the string (section 4.4) (H-02, H-03). Parsing through `PlainDate.from()` is also wrong: the minimum `PlainYearMonth` (`-271821-04`, encoded `-271821-04-01[u-ca=iso8601]`) lies below the `PlainDate` range and `PlainDate.from()` throws `RangeError` for it (verified).
- `Duration` uses fields because `toString()` rebalances sub-second units (H-01).
- 9 fixed fractional digits make `Instant`, `PlainTime`, `PlainDateTime` and `ZonedDateTime` payloads lexicographically sortable (H-11, section 9).

### 4.3 Structural validation (decoder)

Before reviving, the decoder MUST validate the record and throw `E_FORMAT` (with path) if any check fails:

1. Own enumerable string keys are exactly the set for `t` in section 4.1. Order is not checked on decode.
2. `t` is a `TemporalTypeName`.
3. `v` matches the pattern for `t`:

| `t` | Pattern for `v` |
|---|---|
| `Instant`, `ZonedDateTime` | `^(?:[+-]\d{6}\|\d{4})-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{9}Z$` |
| `PlainDate` | `^(?:[+-]\d{6}\|\d{4})-\d{2}-\d{2}(?:\[u-ca=[a-z0-9-]+\])?$` |
| `PlainTime` | `^\d{2}:\d{2}:\d{2}\.\d{9}$` |
| `PlainDateTime` | `^(?:[+-]\d{6}\|\d{4})-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{9}(?:\[u-ca=[a-z0-9-]+\])?$` |
| `PlainYearMonth`, `PlainMonthDay` | `^([+-]\d{6}\|\d{4})-(\d{2})-(\d{2})\[u-ca=([a-z0-9-]+)\]$` (capture groups: ISO year, ISO month, ISO day, calendar ID; used by revival in 4.4) |
| `Duration` | an array (captured `Array.isArray`) of exactly 10 elements, each satisfying `Number.isInteger` |

(`\|` in the table is a literal `|` in the regex.)

4. For `ZonedDateTime`: `tz` is a non-empty string not containing `[` or `]`; `cal` matches `^[a-z0-9-]+$`.

Validation is structural only. Calendar and time zone validity are decided by the Temporal implementation during revival (section 4.4). This keeps the library independent of any implementation's data.

### 4.4 Revival (decoder)

Let `T` be the resolved Temporal namespace (section 6.4). Revive exactly as follows. Any exception from `T` MUST be rethrown as `E_DECODE` with the path and the original error as `cause`.

| `t` | Revival |
|---|---|
| `Instant` | `T.Instant.from(v)` |
| `ZonedDateTime` | `new T.ZonedDateTime(T.Instant.from(v).epochNanoseconds, tz, cal)` |
| `PlainDate` | `T.PlainDate.from(v)` |
| `PlainTime` | `T.PlainTime.from(v)` |
| `PlainDateTime` | `T.PlainDateTime.from(v)` |
| `PlainYearMonth` | `[, y, m, d, cal] = <4.3 pattern>.exec(v); new T.PlainYearMonth(Number(y), Number(m), cal, Number(d))` |
| `PlainMonthDay` | `[, y, m, d, cal] = <4.3 pattern>.exec(v); new T.PlainMonthDay(Number(m), Number(d), cal, Number(y))` |
| `Duration` | `new T.Duration(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], v[9])` |

`from()` MUST NOT be used for `PlainYearMonth`, `PlainMonthDay` or `ZonedDateTime`. It is lossy for them (H-02, H-03, H-04).

Time zone data changes (informative, decided): the exact instant is authoritative. If the decoding engine's time zone rules differ from the encoding engine's, the revived `ZonedDateTime` has the same `epochNanoseconds`, `timeZoneId` and `calendarId`, and its wall-clock fields follow the decoding engine's rules. This matches whatwg/html#6284. An unknown time zone or calendar on the decoding side is `E_DECODE`, never a fallback.

### 4.5 Examples (normative; these are golden vectors)

| Value | Encoded (`JSON.stringify`) |
|---|---|
| `Instant.from('2026-10-31T01:30:00.123456789Z')` | `{"$temporal":1,"t":"Instant","v":"2026-10-31T01:30:00.123456789Z"}` |
| `ZonedDateTime.from('2026-11-01T01:30:00-05:00[America/Toronto]')` (second 01:30) | `{"$temporal":1,"t":"ZonedDateTime","v":"2026-11-01T06:30:00.000000000Z","tz":"America/Toronto","cal":"iso8601"}` |
| `PlainDate.from('2026-10-31')` | `{"$temporal":1,"t":"PlainDate","v":"2026-10-31"}` |
| `PlainDate.from('2026-10-31[u-ca=japanese]')` | `{"$temporal":1,"t":"PlainDate","v":"2026-10-31[u-ca=japanese]"}` |
| `PlainTime.from('01:30:00.000000001')` | `{"$temporal":1,"t":"PlainTime","v":"01:30:00.000000001"}` |
| `PlainDateTime.from('2026-10-31T01:30:00.000000001')` | `{"$temporal":1,"t":"PlainDateTime","v":"2026-10-31T01:30:00.000000001"}` |
| `PlainYearMonth.from('2026-10')` | `{"$temporal":1,"t":"PlainYearMonth","v":"2026-10-01[u-ca=iso8601]"}` |
| `new PlainYearMonth(2026, 10, 'iso8601', 15)` | `{"$temporal":1,"t":"PlainYearMonth","v":"2026-10-15[u-ca=iso8601]"}` |
| `PlainMonthDay.from('10-31')` | `{"$temporal":1,"t":"PlainMonthDay","v":"1972-10-31[u-ca=iso8601]"}` |
| `Duration.from('P1Y2M3W4DT5H6M7.008009010S')` | `{"$temporal":1,"t":"Duration","v":[1,2,3,4,5,6,7,8,9,10]}` |
| `Duration.from({ minutes: 90, milliseconds: 1500 })` | `{"$temporal":1,"t":"Duration","v":[0,0,0,0,0,90,0,1500,0,0]}` |

All of the above were produced identically by `temporal-polyfill` 1.0.5 (full) and `@js-temporal/polyfill` 0.5.1 on 2026-09-23.

## 5. Escape records

A user ordinary object that has an own enumerable property named `$temporal` MUST NOT reach the receiver as-is, or the decoder would misread it. The encoder wraps it:

```json
{ "$temporal": 0, "o": { "$temporal": <encoded original value>, "...": "<every other own enumerable key, encoded>" } }
```

- The wrapper's own enumerable keys are exactly `$temporal` (the number `0`) then `o`.
- `o` is a new ordinary object containing every own enumerable string key of the user object, in `Object.keys` order, values encoded, including the user's `$temporal` key.
- The decoder, on `$temporal === 0`, validates the key set (`E_FORMAT` otherwise) and that `o` is an ordinary object (`E_FORMAT` otherwise). It produces a new ordinary object with every own enumerable key of `o`, values decoded. It MUST NOT interpret `o`'s own `$temporal` key.
- Memoization (section 6.6) maps the original user object to the wrapper when encoding, and the wrapper to the result when decoding, so shared references and cycles through escaped objects are preserved.

Escape records are version-independent: `0` means "escape" in every future format version.

## 6. Graph walk

### 6.1 Intrinsics

`src/intrinsics.ts` MUST capture built-ins at module evaluation, and code that touches user data MUST use only the captured references. The minimum set: `Object.prototype.toString`, `Object.prototype.propertyIsEnumerable`, `Object.keys`, `Object.defineProperty`, `Object.getPrototypeOf`, `Object.getOwnPropertyDescriptor`, `Object.getOwnPropertySymbols`, `Array.isArray`, `Map`, `Map.prototype.forEach`, `Map.prototype.set`, `Map.prototype.has`, `Set`, `Set.prototype.forEach`, `Set.prototype.add`, `Set.prototype.has`, `WeakMap` and its `get`/`set`/`has`, `Number.isInteger`, `Number`, `JSON.stringify`, `Function.prototype.toString`, `RegExp.prototype.exec` and `RegExp.prototype.test` (used only on regexes built at module evaluation). Calls go through uncurried helpers built at module evaluation. Later phases MAY add intrinsics to this set. They MUST NOT bypass it.

### 6.2 Classification

Each value is classified by the first matching rule. If any step throws (for example, a revoked Proxy), the value is **opaque**.

| # | Class | Test |
|---|---|---|
| 1 | primitive | `value === null` or `typeof value` is not `'object'` or `'function'` |
| 2 | opaque | `typeof value === 'function'` |
| 3 | Temporal | `temporalTypeOf(value) !== undefined` |
| 4 | array | captured `Array.isArray(value)` |
| 5 | Map | captured `Map.prototype.has` called on `value` does not throw |
| 6 | Set | captured `Set.prototype.has` called on `value` does not throw |
| 7 | ordinary object | captured `Object.prototype.toString` on `value` returns `[object Object]` |
| 8 | opaque | everything else: `Date`, `RegExp`, `ArrayBuffer`, typed arrays, `DataView`, `Error`, boxed primitives, `Blob`, `File`, `MessagePort`, other platform objects, objects with a custom `Symbol.toStringTag`, `arguments` objects |

Arrays, Maps, Sets and ordinary objects are **walkable containers**. Class instances without a custom tag are ordinary objects. Structured clone turns them into plain objects, and so does the walker.

Deliberate divergence (informative, decided): structured clone also walks into ordinary JS objects that carry a custom `Symbol.toStringTag` (for example `{ [Symbol.toStringTag]: 'Foo', d }`), but pure JavaScript cannot reliably tell such objects apart from platform objects like `Blob`. Copying a `Blob` as an ordinary object would destroy it. The walker therefore treats every non-`[object Object]` tag as opaque. A Temporal value inside a custom-tagged object is not encoded. `findCloneIssues` (Phase 2) reports it, and the README documents it.

### 6.3 Encode

`encode(value, options?)`:

| Class | Result |
|---|---|
| primitive, opaque | the same value (by reference) |
| Temporal | if `options.passthrough?.(value, type) === true`, the same value; otherwise its tagged record |
| array | a new array with the same `length`. Every own enumerable string key of the source (indices and named keys, in `Object.keys` order) is defined on it with the encoded value. Holes stay holes. |
| Map | a new `Map` with entries in source iteration order; keys and values encoded |
| Set | a new `Set` with members in source iteration order, encoded |
| ordinary object without own enumerable `$temporal` | a new ordinary object (prototype `Object.prototype`) with every own enumerable string key in `Object.keys` order, values encoded |
| ordinary object with own enumerable `$temporal` | an escape record (section 5) |

Symbol-keyed and non-enumerable properties are not copied, matching structured clone.

### 6.4 Decode

`decode(value, options?)`:

| Class | Result |
|---|---|
| primitive, opaque, Temporal | the same value (raw Temporal values can arrive through passthrough) |
| array, Map, Set | new container with decoded contents, same rules as encode |
| ordinary object without own enumerable `$temporal` | new ordinary object with decoded values |
| ordinary object with own enumerable `$temporal` equal to `1` | validated (4.3) and revived (4.4) |
| ... equal to `0` | escape record, unwrapped (section 5) |
| ... an integer `>= 2` | throw `E_VERSION` with path |
| ... anything else | throw `E_FORMAT` with path |

Temporal namespace resolution: `options.Temporal ?? globalThis.Temporal`, resolved lazily on the first record that needs revival. If none is available at that point, throw `E_NO_TEMPORAL`. The message MUST tell the user to pass `{ Temporal }` from their polyfill. Decoding a graph with no records MUST succeed without any Temporal.

### 6.5 Property definition

Every key on every new object or array MUST be defined with the captured `Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true })`. Assignment (`target[key] = value`) is forbidden. It would invoke the inherited `__proto__` setter for a key named `"__proto__"`, which is prototype pollution and data loss at once (H-15).

Reading a source property uses ordinary `[[Get]]` (`source[key]`), which invokes getters, as structured clone does.

### 6.6 Identity, sharing and cycles

Within one `encode` or `decode` call, a memo `Map` from source object to result MUST ensure that:

- every source walkable container produces exactly one result container,
- every Temporal source value produces exactly one tagged record (encode),
- every tagged record object produces exactly one revived Temporal value (decode),
- therefore shared references and cycles are preserved (H-12, H-13), including through Map keys and Set members.

When a container is first reached, its (still empty) result is created, memoized and linked into its parent immediately. It is filled when its frame is processed. Cycles then resolve naturally.

### 6.7 Fast path

Before copying, each call runs a scan: an iterative, cycle-safe traversal of walkable containers (visited set, each container visited once).

- `encode` scan hits on a Temporal value that will be encoded (passthrough not true for it), or on an ordinary object with an own enumerable `$temporal`.
- `decode` scan hits on an ordinary object with an own enumerable `$temporal`.
- If there is no hit, the call MUST return its input unchanged (same reference) and allocate no containers. The scan MUST stop at the first hit.

Consequence (informative, document it in Phase 4): enumerable accessors on a graph that needs encoding are read twice, once by the scan and once by the copy. `findCloneIssues` reports enumerable accessors as `info`.

### 6.8 No mutation

`encode` and `decode` MUST NOT mutate their input: no writes, no `defineProperty`, no setter calls, no Map/Set mutation on any source object. Both MUST work on deeply frozen inputs (property test P-4).

### 6.9 Iteration, not recursion

Scan and copy MUST be iterative with an explicit stack of frames. A frame holds a source container, its result, and a cursor (keys array + index, or a pre-collected entries array for Map/Set collected with the captured `forEach`). Processing order is depth-first pre-order, keys in `Object.keys` order, Map/Set in iteration order. This is the order in which structured clone reads values. A 100,000-deep chain MUST NOT overflow the stack (H-18).

### 6.10 Not traversed

Opaque objects are never traversed. In particular, Temporal values inside an `Error`'s `cause`, inside objects with a custom `Symbol.toStringTag`, or inside platform objects are not encoded. `findCloneIssues` (Phase 2) reports the first two cases.

Proxies (informative): structured clone throws `DataCloneError` on any Proxy. JavaScript cannot detect a Proxy. A Proxy around a plain object or array classifies as a walkable container, and when a copy is made (6.7), the result is a plain container the platform can clone. This divergence is harmless and documented. It is not tested beyond one unit test that pins the behavior.

## 7. Paths

Paths identify a location in the user's logical structure. They are used in `TemporalCloneError.path` and in `CloneIssue.path`.

| Location | Syntax | Example |
|---|---|---|
| root | `$` | `$` |
| own property whose key matches `^[A-Za-z_$][A-Za-z0-9_$]*$` | `.key` | `$.order.due` |
| any other own property key | `[` + `JSON.stringify(key)` + `]` | `$["due date"]` |
| array element (index key of an array) | `[i]` | `$.items[3]` |
| Map entry key / value (0-based insertion index) | `.@entry(i).key` / `.@entry(i).value` | `$.byDay.@entry(2).value` |
| Set member (0-based iteration index) | `.@item(i)` | `$.holidays.@item(0)` |

Escape records are transparent: the decoder reports `$.a.b`, not `$.a.o.b`. When a value is reachable by several paths, the reported path is the first one reached in walk order (6.9).

## 8. Errors

```ts
export type TemporalCloneErrorCode =
  | 'E_NO_TEMPORAL' | 'E_FORMAT' | 'E_VERSION' | 'E_DECODE' | 'E_ENCODE'
  | 'E_NOT_INDEXABLE' | 'E_UNCLONEABLE' | 'E_ORIGIN_REQUIRED';

export class TemporalCloneError extends Error {
  constructor(
    code: TemporalCloneErrorCode,
    detail: string,
    options?: { readonly path?: string; readonly cause?: unknown; readonly issues?: readonly CloneIssue[] },
  );
  readonly name: 'TemporalCloneError';
  readonly code: TemporalCloneErrorCode;
  readonly path: string | undefined;
  readonly issues: readonly CloneIssue[] | undefined; // only for E_UNCLONEABLE
  // `cause` is set through the standard ES2022 Error `cause` option
}

// Declared here (Phase 1) because TemporalCloneError references them.
// The producer, findCloneIssues, is built in Phase 2.
export type IssueKind =
  | 'temporal' | 'function' | 'symbol' | 'weak-collection' | 'promise'
  | 'symbol-key' | 'class-instance' | 'accessor' | 'marker-key';
export type IssueSeverity = 'throws' | 'loss' | 'info';
export interface CloneIssue {
  readonly path: string;         // section 7
  readonly kind: IssueKind;
  readonly severity: IssueSeverity;
  readonly message: string;      // one sentence, actionable, names the fix when there is one
}
```

`message` MUST be `<code>: <detail>`, followed by ` (at <path>)` when a path exists. The constructor is public: adapters (Phase 3) construct errors through it.

| Code | Thrown by | When | Phase |
|---|---|---|---|
| `E_NO_TEMPORAL` | `decode` | a record needs revival and no Temporal namespace is available | 1 |
| `E_FORMAT` | `decode` | malformed tagged or escape record, or a `$temporal` value that is not `0`, `1` or an integer `>= 2` | 1 |
| `E_VERSION` | `decode` | `$temporal` is an integer `>= 2` | 1 |
| `E_DECODE` | `decode` | the Temporal implementation rejected a valid-looking payload (unknown time zone or calendar, out of range); `cause` set | 1 |
| `E_ENCODE` | `encode` | a value tagged as Temporal failed payload extraction; `cause` set | 1 |
| `E_NOT_INDEXABLE` | `indexKey` | argument is a `Duration` or not Temporal | 1 |
| `E_UNCLONEABLE` | `assertCloneable` | at least one issue with severity `throws` or `loss`; `issues` set | 2 |
| `E_ORIGIN_REQUIRED` | messaging adapter | `onMessage` on a `Window` target without `allowedOrigins` | 3 |

## 9. `indexKey`

`indexKey(value)` returns the `v` string that `encode` would produce for `value`. For `ZonedDateTime` that is the exact-instant string. It throws `E_NOT_INDEXABLE` for `Duration` and for non-Temporal input.

The library's IndexedDB convention: an index on a Temporal field `due` uses key path `due.v`. Queries use `indexKey()` for bounds, for example `IDBKeyRange.bound(indexKey(from), indexKey(to))`.

Ordering guarantee, for values whose ISO year is in `0000..9999` (extended years `+NNNNNN` / `-NNNNNN` do not sort correctly and are documented as such):

| Type | Lexicographic order of `indexKey` equals |
|---|---|
| `Instant` | `Temporal.Instant.compare` |
| `ZonedDateTime` | `Temporal.ZonedDateTime.compare` (exact time) |
| `PlainDate`, `PlainDateTime`, `PlainTime`, `PlainYearMonth` | the type's `compare`, for values that share a calendar |
| `PlainMonthDay` | order of the ISO reference date (`PlainMonthDay` has no `compare`; for ISO values created by `from()` this is month-day order) |

Every row MUST be covered by property test P-5.

## 10. Passthrough

`encode` accepts `options.passthrough?: (value: object, type: TemporalTypeName) => boolean`. When it returns `true`, the Temporal value is left as-is. Decoders MUST accept raw Temporal values anywhere (6.4). Storage adapters (Dexie, idb) MUST NOT pass a predicate: raw Temporal values are not valid IndexedDB keys, so they would silently break `field.v` indexes. The predicate that detects engine support is built in Phase 2.

## 11. Versioning and compatibility

- `$temporal: 1` identifies a v1 tagged record. `0` is the escape record in all versions. Integers `>= 2` are reserved for future formats. A v1 decoder throws `E_VERSION` for them and never guesses.
- Once Phase 1 is approved, v1 is frozen: the encoder output for every input MUST NOT change, and `test/vectors/v1.json` MUST NOT be edited.
- A future format is a new version number and a new major version of the package. Every future decoder MUST decode every v1 golden vector forever.

## 12. Golden vectors

`test/vectors/v1.json` is a JSON array of objects:

```ts
interface GoldenVector {
  id: string;                      // e.g. "PYM-002"
  description: string;
  type: TemporalTypeName;
  construct:
    | { kind: 'from'; input: string | Record<string, unknown> }        // T[type].from(input)
    | { kind: 'ctor'; args: (string | number | { bigint: string })[] } // new T[type](...args)
    | { kind: 'epochNs'; value: string };                              // T.Instant.fromEpochNanoseconds(BigInt(value))
  requires?: { calendars?: string[]; timeZones?: string[] };            // capability probes decide applicability
  encoded: TaggedRecordJson;       // exact expected record
}
```

Required coverage, at minimum: every example in 4.5; every hazard value from H-01 to H-11; Instant at `-8.64e21` and `+8.64e21` epoch nanoseconds; `ZonedDateTime` with `UTC`, `+05:30`, `Asia/Calcutta` (alias preserved), `America/Toronto` in 1880 (LMT) and a `hebrew` calendar; `PlainDate` in `japanese`, `hebrew`, `islamic-civil`; `PlainYearMonth` and `PlainMonthDay` in `hebrew`; `PlainYearMonth` at the minimum (`-271821-04`) and maximum (`+275760-09`); negative `Duration`; `Duration` with `seconds: Number.MAX_SAFE_INTEGER`.

For every vector and every implementation that passes its capability probe: `JSON.stringify(encode(constructed))` MUST equal `JSON.stringify(vector.encoded)`, and `decode(vector.encoded, { Temporal: T })` MUST equal `constructed` (section 12.1).

### 12.1 Equality used in tests

Same-implementation equality: `a.equals(b)` for types that have it, plus these additions:

- `ZonedDateTime`: additionally `a.timeZoneId === b.timeZoneId`. `equals` treats aliases as equal (`Asia/Calcutta` equals `Asia/Kolkata`, verified), so on its own it cannot detect alias canonicalization (H-07).
- `Duration` has no `equals`: compare all ten fields with `Object.is`.
- `PlainYearMonth` and `PlainMonthDay`: `equals` includes the reference fields and the calendar (verified), which is required.

Cross-implementation equality: `JSON.stringify(encode(a)) === JSON.stringify(encode(b))`.

## 13. JSON compatibility

Tagged and escape records contain only strings, integral finite Numbers (not necessarily safe integers: a `Duration`'s `nanoseconds` can legitimately exceed 2^53), arrays and ordinary objects. They are therefore valid JSON, and `JSON.parse(JSON.stringify(record))` yields identical Numbers. This is a property of the records only. Maps, Sets and other structured-clone-only values in the surrounding graph are the user's concern.
