# Phase 1: Core codec

## 1.1 Objective

Implement the core of `temporal-clone` exactly as specified in `01-FORMAT.md`: detection, tagged and escape records, the iterative walker, errors, paths and `indexKey`. Prove it with golden vectors, a named hazard suite, property-based tests across all Temporal implementations, and type tests.

When the owner approves this phase, wire format v1 is frozen permanently. Treat every encoded byte as a public contract.

## 1.2 Preconditions

- Phase 0 approved. Any hypothesis that FAILed has an owner decision recorded in `DECISIONS.md`.
- You have re-read `01-FORMAT.md` in full in this session.

## 1.3 Scope

In scope: `src/intrinsics.ts`, `src/brand.ts`, `src/format.ts`, `src/walk.ts`, `src/paths.ts`, `src/errors.ts`, `src/index-key.ts`, `src/types.ts`, `src/index.ts`; `test/unit/**`, `test/property/**`, `test/types/**`, `test/vectors/v1.json`; `tsconfig.build.json`, `tsconfig.core.json`; `npm run build`. New dev dependency: `@vitest/coverage-v8` (same major as `vitest`).

Out of scope: `findCloneIssues`, `assertCloneable`, native detection (Phase 2); adapters (Phase 3); benchmarks (Phase 2); packaging and docs (Phase 4).

## 1.4 Public API (normative)

`src/index.ts` MUST export exactly the following runtime names, and no others: `encode`, `decode`, `indexKey`, `temporalTypeOf`, `isTemporal`, `isTaggedRecord`, `TemporalCloneError`, `TAG_KEY`, `FORMAT_VERSION`. A unit test MUST assert the exact set of runtime export names.

```ts
export const TAG_KEY: '$temporal';
export const FORMAT_VERSION: 1;

export type TemporalTypeName =
  | 'Instant' | 'ZonedDateTime' | 'PlainDate' | 'PlainTime'
  | 'PlainDateTime' | 'PlainYearMonth' | 'PlainMonthDay' | 'Duration';

/** Minimal structural view of a Temporal namespace. Native, temporal-polyfill and
 *  @js-temporal/polyfill namespaces MUST all be assignable to it (type test T-2). */
export interface TemporalNamespace {
  readonly Instant: { from(item: string): { readonly epochNanoseconds: bigint } };
  readonly ZonedDateTime: new (epochNanoseconds: bigint, timeZone: string, calendar?: string) => object;
  readonly PlainDate: { from(item: string): object };
  readonly PlainTime: { from(item: string): object };
  readonly PlainDateTime: { from(item: string): object };
  readonly PlainYearMonth: new (isoYear: number, isoMonth: number, calendar?: string, referenceISODay?: number) => object;
  readonly PlainMonthDay: new (isoMonth: number, isoDay: number, calendar?: string, referenceISOYear?: number) => object;
  readonly Duration: new (
    years?: number, months?: number, weeks?: number, days?: number, hours?: number,
    minutes?: number, seconds?: number, milliseconds?: number, microseconds?: number, nanoseconds?: number,
  ) => object;
}

export type TaggedRecord =
  | { readonly $temporal: 1; readonly t: 'Instant' | 'PlainDate' | 'PlainTime' | 'PlainDateTime' | 'PlainYearMonth' | 'PlainMonthDay'; readonly v: string }
  | { readonly $temporal: 1; readonly t: 'ZonedDateTime'; readonly v: string; readonly tz: string; readonly cal: string }
  | { readonly $temporal: 1; readonly t: 'Duration'; readonly v: readonly [number, number, number, number, number, number, number, number, number, number] };

export interface EncodeOptions {
  readonly passthrough?: (value: object, type: TemporalTypeName) => boolean;
}
export interface DecodeOptions {
  readonly Temporal?: TemporalNamespace;
}

export function encode(value: unknown, options?: EncodeOptions): unknown;
export function decode<T = unknown>(value: unknown, options?: DecodeOptions): T;
export function indexKey(value: unknown): string;
export function temporalTypeOf(value: unknown): TemporalTypeName | undefined;
export function isTemporal(value: unknown): boolean;
export function isTaggedRecord(value: unknown): value is TaggedRecord; // structural check per 01-FORMAT 4.3, no revival

// Exactly as 01-FORMAT section 8, including the public constructor:
export type TemporalCloneErrorCode = /* … */;
export class TemporalCloneError extends Error { /* … */ }
export type IssueKind = /* … */;
export type IssueSeverity = /* … */;
export interface CloneIssue { /* … */ }
```

`decode<T>` is an unchecked cast by design. The docs (Phase 4) MUST say so.

## 1.5 Requirements

- R1.1 Implement every section of `01-FORMAT.md` exactly. Where this file and `01-FORMAT.md` differ, `01-FORMAT.md` wins and you report the conflict.
- R1.2 Module boundaries follow `00-OVERVIEW.md` section 7. `walk.ts` knows nothing about individual Temporal types. It delegates to `format.ts` through two functions: `encodeTemporal(value, type, at)` and `reviveRecord(record, T, at)`. `at` is a lazy path handle (R1.6), not a string. `format.ts` also exports the structural validator used both for decoder validation (`01-FORMAT.md` 4.3) and for encoder self-validation (4.2).
- R1.3 The core files, `src/*.ts` (top level only, excluding the adapter folders added in Phase 3), MUST compile under `tsconfig.core.json` with `"lib": ["ES2022"]` and `"types": []`. The core has no DOM or Node dependency.
- R1.4 No `any`, no non-null assertions (`!`), no type assertions except in `intrinsics.ts` where built-ins are uncurried. Each assertion there has a comment.
- R1.5 `encode` and `decode` are synchronous, re-entrant and stateless between calls. No module-level mutable state except the captured intrinsics.
- R1.6 Path strings are built lazily. The happy path MUST NOT allocate path strings. Keep enough information on each frame (parent frame and key) to build the path only when an error is thrown.
- R1.7 `npm run build` cleans `dist/` and runs `tsc -p tsconfig.build.json`, emitting ESM `.js` and `.d.ts` for `src/**`. No source maps, no declaration maps.

## 1.6 Hazard suite (each is a named test: `it('H-05 ambiguous wall-clock time keeps the second occurrence', ...)`)

Each hazard runs against every implementation that passes the capability probe for it (S3, S3F, S4, and S1 on Node 26).

| ID | Input | Required result |
|---|---|---|
| H-01 | `Duration.from({ minutes: 90, milliseconds: 1500 })` | decodes with fields `[0,0,0,0,0,90,0,1500,0,0]` exactly (not `seconds: 1, milliseconds: 500`) |
| H-02 | `new PlainYearMonth(2026, 10, 'iso8601', 15)` | decoded `.equals(original)` is `true` (reference day 15 kept) |
| H-03 | `new PlainMonthDay(10, 31, 'iso8601', 2000)` | decoded `.equals(original)` is `true` (reference year 2000 kept) |
| H-04 | `ZonedDateTime.from({ timeZone: 'America/Toronto', year: 1880, month: 1, day: 1, hour: 12 })` (offset `-05:17:32`) | decoded `epochNanoseconds` equal to the original (a `toString()` + `offset: 'use'` implementation is off by 28,000,000,000 ns; add that naive implementation in the test as a control and assert it fails) |
| H-05 | `ZonedDateTime.from('2026-11-01T01:30:00-05:00[America/Toronto]')` | decoded `.offset === '-05:00'` and same `epochNanoseconds`; the first occurrence (`-04:00`) round-trips to `-04:00` |
| H-06 | `ZonedDateTime.from('2026-11-01T01:30:00-05:00[America/Toronto][u-ca=hebrew]')` | `calendarId === 'hebrew'`, `.equals(original)` |
| H-07 | `ZonedDateTime.from('2026-01-01T00:00[Asia/Calcutta]')` | `timeZoneId === 'Asia/Calcutta'` (alias not canonicalized) |
| H-08 | offset zone `+05:30`; zone `UTC` | `timeZoneId` preserved exactly |
| H-09 | `Instant.fromEpochNanoseconds(-8640000000000000000000n)` and `+8640000000000000000000n` | round trip; encoded `v` uses 6-digit signed years |
| H-10 | 1 ns precision on `Instant`, `PlainTime`, `PlainDateTime`, `ZonedDateTime` | nanosecond field preserved |
| H-11 | Instants `…55.4Z` and `…55.49Z` | `indexKey(a) < indexKey(b)`; also assert `a.toString() > b.toString()` as a control showing why the fixed 9 digits matter |
| H-12 | `const d = PlainDate.from('2026-10-31'); { a: d, b: d, m: new Map([[d, d]]) }` | decoded `a === b`, and the Map key and value are that same object |
| H-13 | `const o = { d }; o.self = o;` | decoded `r.self === r`; `r.d` is a PlainDate |
| H-14 | user objects `{ $temporal: 1, t: 'PlainDate', v: '2026-10-31' }`, `{ $temporal: 0, o: {} }`, `{ $temporal: 2 }`, `{ $temporal: 'x' }` inside a graph that also has a real Temporal value | each round-trips as the identical plain user object, never revived, never an error |
| H-15 | `JSON.parse('{"__proto__": {"polluted": true}}')` with a Temporal sibling | round trip keeps an own data property `__proto__`; `Object.getPrototypeOf(result) === Object.prototype`; `({}).polluted === undefined` |
| H-16 | `Map` with Temporal keys and values; `Set` of Temporal values | contents revived; iteration order preserved |
| H-17 | `const a = [d, , d]; a.extra = d;` | result has `length === 3`, `!(1 in result)`, `result.extra` revived |
| H-18 | linked list 100,000 deep with a `PlainDate` at the tail | no `RangeError`; tail revived; both encode and decode |
| H-19 | a `hebrew` vector decoded with S3 (`temporal-polyfill/implementation`, no non-ISO calendars) | throws `TemporalCloneError` `E_DECODE`, correct path, `cause` is the implementation's error |
| H-20 | `decode` of a graph with records while no Temporal is available (no option, `globalThis.Temporal` absent) | `E_NO_TEMPORAL`; the same call on a graph with no records succeeds |
| H-21 | records with: `$temporal: 3`; `$temporal: 'x'`; an extra key; a missing key; `Instant` `v` with 3 fractional digits; `Duration` `v` of length 9; `Duration` field `1.5` | `E_VERSION` for the first, `E_FORMAT` for the rest, each with the path |
| H-22 | spoofed values at `$.x`: `{ [Symbol.toStringTag]: 'Temporal.PlainDate' }` (its inherited `toString` returns `"[object Temporal.PlainDate]"`); `{ [Symbol.toStringTag]: 'Temporal.ZonedDateTime' }` (no `toInstant`); `{ [Symbol.toStringTag]: 'Temporal.Duration' }` (getters return `undefined`) | each: `encode` throws `E_ENCODE` at `$.x`. PlainDate and Duration spoofs fail self-validation (`cause` is `undefined`). The ZonedDateTime spoof has `cause instanceof TypeError`. |
| H-23 | graph containing an `ArrayBuffer`, a `Uint8Array` and a `MessagePort`-like opaque object next to a Temporal value | the encoded graph holds the identical (`===`) objects, so transfer lists stay valid |
| H-24 | class instance `new Task(PlainDate…)` | encoded as a plain object with a tagged record; decoded prototype is `Object.prototype` (matches structured clone) |
| H-25 | enumerable getter returning a Temporal value | value encoded; getter invoked at most twice (assert the count) |

## 1.7 Property tests (fast-check)

Default `numRuns` is 1,000 per property. `FC_NUM_RUNS` overrides it. CI runs 5,000 on Node 24. Every property runs for every available implementation.

- P-1 Per-type round trip. Arbitraries cover each type's full valid range: `Instant` over the full epoch-nanosecond range; `ZonedDateTime` over time zones `UTC`, `America/Toronto`, `Europe/London`, `Asia/Kolkata`, `Asia/Calcutta`, `Australia/Lord_Howe`, `Pacific/Chatham`, `America/St_Johns`, `+05:30`, `-00:01`, with `iso8601` plus any non-ISO calendar the implementation supports (probe); plain types via ISO fields and via the constructor with arbitrary reference fields for `PlainYearMonth` and `PlainMonthDay`; `Duration` with same-sign fields inside Temporal's limits (build candidates, discard those the constructor rejects). Assert `decode(encode(x))` equals `x` (`01-FORMAT.md` 12.1), and that `JSON.stringify(encode(x))` is identical across every implementation that can construct `x`.
- P-2 Graph round trip through the real boundary. Arbitrary graphs (`fc.letrec`) of ordinary objects, arrays (with holes and named keys), Maps, Sets, primitives including `bigint`, `Date`, `ArrayBuffer`, embedded Temporal values, marker-colliding objects, `__proto__` keys, plus post-processed shared references and cycles. Assert `decode(structuredClone(encode(g)))` is isomorphic to `g`. Write `assertIsomorphic(a, b)` in `test/helpers/`: a lockstep walk with a bijection map that checks structure, key order, Map/Set order, sharing and cycles, and compares Temporal values with 12.1 equality. `assertIsomorphic` MUST have its own tests, including cases it must reject.
- P-3 Fast path. For graphs with no Temporal values and no own `$temporal` keys: `encode(g) === g` and `decode(g) === g`.
- P-4 No mutation. Deep-freeze every generated input. `encode` and `decode` succeed, and a pre-call snapshot equals the input afterward.
- P-5 `indexKey` ordering per `01-FORMAT.md` section 9, for every row of that table, with ISO years restricted to `0000..9999`.

## 1.8 Cross-implementation matrix

For every golden vector and every ordered pair (A, B) of available implementations that both pass the vector's capability probe:

`JSON.stringify(encode(decode(encode(constructWith(A, vector)), { Temporal: B }))) === JSON.stringify(vector.encoded)`

Implementations in Node: S3 (`temporal-polyfill/implementation`), S3F (`temporal-polyfill/full/implementation`), S4 (`@js-temporal/polyfill`), and S1 (native) when running on Node 26. Decide capabilities with probes at test start (for example, `T.PlainDate.from('2026-10-31[u-ca=hebrew]')` in try/catch). Never hard-code which implementation supports what. Print the capability table in the test output.

## 1.9 Type tests (`test/types/*.test-d.ts`, Vitest typecheck mode)

- T-1 Every public signature in section 1.4, checked with `expectTypeOf`.
- T-2 `typeof import('temporal-polyfill').Temporal`, `typeof import('temporal-polyfill/full/implementation').Temporal` and `typeof import('@js-temporal/polyfill').Temporal` are each assignable to `TemporalNamespace`. If TypeScript 6 ships `Temporal` lib types (`esnext`), the global `typeof Temporal` too.
- T-3 `decode<{ due: unknown }>(x)` returns `{ due: unknown }`. `TemporalCloneErrorCode` is exactly the eight codes.

## 1.10 Quality gates

- Vitest v8 coverage over `src/**`: 100% lines, statements and functions; at least 98% branches. Coverage exclusion comments are forbidden. Delete unreachable code instead.
- `npm run lint` with zero warnings. `npm run typecheck` covers `tsconfig.core.json`.
- No test depends on the local time zone or the current time. Set `TZ=UTC` in the test scripts, and add one test job that runs the suite with `TZ=America/Toronto` to prove independence.

## 1.11 Deliverables

`src/*.ts` (section 1.3), `test/vectors/v1.json` (coverage per `01-FORMAT.md` section 12), `test/unit/**`, `test/property/**`, `test/types/**`, `test/helpers/assertIsomorphic.ts` with tests, `tsconfig.build.json`, `tsconfig.core.json`, updated `vitest.config.ts`, updated `ci.yml` (adds build, coverage, TZ job, `FC_NUM_RUNS=5000` on Node 24), `docs/phase-reports/PHASE-1.md`.

## 1.12 Exit criteria

| ID | Criterion |
|---|---|
| X1.1 | All of `CLAUDE.md` section 8 plus `npm run build` pass on Node 22, 24 and 26 (locally or in CI; link runs). |
| X1.2 | Every golden vector passes for every implementation whose probe allows it. The report includes the capability table and the count of vector x implementation checks executed. |
| X1.3 | H-01 to H-25 pass. Each is visible by ID in the test output. |
| X1.4 | P-1 to P-5 pass with `FC_NUM_RUNS=5000`. |
| X1.5 | The cross-implementation matrix passes, including S1 on Node 26. |
| X1.6 | Type tests T-1 to T-3 pass. |
| X1.7 | Coverage gates met (paste the summary). |
| X1.8 | The runtime export set test passes (exactly the names in 1.4). |
| X1.9 | The report contains a "Format freeze review" section: the full `test/vectors/v1.json` content, plus one sentence per `01-FORMAT.md` section confirming the implementation matches it. The owner approves the freeze by approving the phase. |

## 1.13 Stop conditions

- Two implementations produce different `encode` output for the same value (golden vector or P-1). The format must not freeze on a disagreement. Report it with the exact values.
- Any hazard cannot be satisfied with the procedures in `01-FORMAT.md` section 4.
- An implementation's namespace type is not assignable to `TemporalNamespace` (T-2).
- The coverage gate cannot be met without exclusions.
- You find any case where `encode` output would differ from what whatwg/html#6284 serializes (principle P1).
