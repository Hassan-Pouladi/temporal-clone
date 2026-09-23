# Phase 2: Safety net, native detection, proof in real engines, performance

## 2.1 Objective

Four deliverables:

1. `findCloneIssues` and `assertCloneable`: a diagnostic that tells users exactly which values will not survive a boundary and why, with paths.
2. `supportsNativeTemporalClone` and `nativePassthrough`: detection of engines that clone Temporal natively, and a passthrough predicate for messaging, so the library steps aside when the platform catches up.
3. The codec-applied conformance matrix: the Phase 0 harness re-run with `encode` before and `decode` after every boundary. It MUST be all `ok` in all six engines. This is the proof that the library works where it matters.
4. Performance evidence: the fast path, linear scaling, no stack overflow, and documented benchmark numbers.

## 2.2 Preconditions

Phase 1 approved. Format v1 is frozen. You MUST NOT change encoder output.

## 2.3 Scope

In scope: `src/issues.ts`, `src/native.ts`, their exports from `src/index.ts`, `bench/**`, a codec mode in the conformance harness, `docs/BENCHMARKS.md`.

Out of scope: adapters (Phase 3), packaging and user docs (Phase 4), any change to `format.ts` output or `test/vectors/v1.json`.

## 2.4 Public API additions (normative)

`src/index.ts` adds exactly these runtime exports: `findCloneIssues`, `assertCloneable`, `supportsNativeTemporalClone`, `nativePassthrough`. Update the export-set test.

`IssueKind`, `IssueSeverity` and `CloneIssue` already exist (declared in Phase 1 per `01-FORMAT.md` section 8). Do not redeclare them.

```ts
export interface FindCloneIssuesOptions {
  readonly maxIssues?: number;       // default 100, minimum 1
  readonly includeInfo?: boolean;    // default false
  readonly assumeEncoded?: boolean;  // default false; see R2.4a
}

export function findCloneIssues(value: unknown, options?: FindCloneIssuesOptions):
  { readonly issues: readonly CloneIssue[]; readonly truncated: boolean };

/** Throws TemporalCloneError E_UNCLONEABLE if any issue has severity 'throws' or 'loss'.
 *  The message lists at most the first 10; `.issues` holds all found (up to maxIssues). */
export function assertCloneable(value: unknown, options?: FindCloneIssuesOptions): void;

/** True only if this engine's structuredClone round-trips every one of the 8 Temporal
 *  types of the given namespace (default globalThis.Temporal) to an equal value of the
 *  same type. Never throws. Cached per namespace object. */
export function supportsNativeTemporalClone(Temporal?: unknown): boolean;

/** Returns an EncodeOptions['passthrough'] predicate if and only if
 *  supportsNativeTemporalClone(Temporal) is true; otherwise undefined. The predicate
 *  returns true only for values that are instances of that namespace's constructors. */
export function nativePassthrough(Temporal?: unknown):
  ((value: object, type: TemporalTypeName) => boolean) | undefined;
```

## 2.5 Requirements: `findCloneIssues`

- R2.1 The traversal is iterative and cycle-safe, visits each walkable container once, uses the classification of `01-FORMAT.md` 6.2, and reports issues in walk order (6.9). Deterministic output for a given input.
- R2.2 Beyond the codec's walkable containers, it also traverses two kinds of opaque objects that the codec does not (`01-FORMAT.md` 6.2 and 6.10), so that it can report what the codec will not fix:
  - the `cause` property of objects whose tag is `[object Error]`;
  - the own enumerable string-keyed properties of objects whose tag is not `[object Object]` and not one of the ES built-in tags (`Date`, `RegExp`, `ArrayBuffer`, `SharedArrayBuffer`, `DataView`, any typed array, `Error`, `Boolean`, `Number`, `String`, `BigInt`, `Map`, `Set`, `Array`). This covers custom `Symbol.toStringTag` objects, which structured clone walks into and the codec does not. Platform objects such as `Blob` have no own enumerable properties, so nothing is reported for them.
  - Issues of every kind found through these routes are reported. A Temporal value found this way gets kind `temporal` with a message saying `encode` does not traverse that location, and `assumeEncoded` does not suppress it.
- R2.3 Severity of a `temporal` issue:
  - `throws` if the value is an instance of the corresponding constructor of `globalThis.Temporal`, and that constructor is native (its `Function.prototype.toString` contains `[native code]`), and `supportsNativeTemporalClone()` is `false`;
  - no issue at all if the same holds but `supportsNativeTemporalClone()` is `true`;
  - `loss` otherwise (polyfill objects become `{}`).
- R2.4 Severity per kind (normative):

| Kind | Severity | Notes |
|---|---|---|
| `temporal` | per R2.3 | |
| `function` | `throws` | |
| `symbol` | `throws` | a symbol primitive as a value |
| `weak-collection` | `throws` | `WeakMap`, `WeakSet`, `WeakRef`, `FinalizationRegistry` (brand-checked with captured intrinsics) |
| `promise` | `throws` | tag `[object Promise]` |
| `symbol-key` | `loss` | own enumerable symbol-keyed property; dropped by structured clone and by `encode` alike |
| `class-instance` | `info` | prototype other than `Object.prototype` or `null` |
| `accessor` | `info`, or `throws` if the getter threw during inspection (message includes the error) | |
| `marker-key` | `info` | own enumerable `$temporal`; `encode` escapes it |

`info` issues are returned only when `includeInfo` is `true`.

- R2.4a `assumeEncoded: true` means "report as if this value will be passed through `encode` before crossing the boundary". Temporal values in walkable positions are then not reported. Everything else is reported exactly as without the option. The messaging adapter's `validate` option (Phase 3, R3.9) uses this mode on the original message, so validation gives the same answer whether or not the message contains Temporal values.
- R2.5 For every graph `g` produced by the P-2 generator, `findCloneIssues(encode(g))` reports no issue of kind `temporal`. Property test P-6. (The P-2 generator does not place Temporal values inside opaque objects. For graphs that do, R2.2 intentionally reports them.)
- R2.6 It never mutates input, never throws on any input (including revoked proxies and throwing getters: a throwing getter yields an issue of kind `accessor` with severity `throws` and the error message), and stops collecting at `maxIssues` with `truncated: true`.

## 2.6 Requirements: native detection

- R2.7 `supportsNativeTemporalClone(T)`: returns `false` if `T` is not an object, if `structuredClone` is not a function, or on any exception. For each of the 8 types, construct one instance from the fixed samples in `PHASE-0` R0.11 via `T`, `structuredClone` it, and require: same tag, and equality per `01-FORMAT.md` 12.1. Result cached in a `WeakMap` keyed by `T`.
- R2.8 The internal logic lives in a function `detectNativeClone(T, cloneFn)` that is exported from `src/native.ts` (not from `index.ts`). Tests inject a fake `cloneFn` to cover the `true` path, since no engine supports native cloning today.
- R2.9 `nativePassthrough(T)` returns `undefined` when detection is `false`. When it returns a predicate, the predicate uses `instanceof T[type]` (same-realm only by design: a cross-realm native value fails the check and is encoded, which is always safe).
- R2.10 A conformance-backed test asserts that `supportsNativeTemporalClone()` returns `false` in every engine of the matrix today, and records the value in the results. When an engine ships native cloning, this test and the Phase 0 canary both flip, and that is the signal to release a passthrough-enabled version.

## 2.7 Requirements: codec-applied conformance matrix

- R2.11 Add a `codec` mode to the Phase 0 harness. The sender runs `encode(message)`; the receiver runs `decode(received, { Temporal: <receiver's namespace> })` before classifying. For B3 (worker) the worker loads the same source as the sender. For B6 (IndexedDB) and B7 (history) the same realm decodes.
- R2.12 Cross-source worker cases, in engines with native Temporal (chromium, firefox, node26): sender S1 with worker S4, and sender S4 with worker S1. Encoded values cross implementations.
- R2.13 Results go to `conformance/results/<engine>.codec.json`. `MATRIX.md` gains a section "With temporal-clone". The baseline gains the codec cells. The weekly canary covers them.
- R2.14 Expected result: every codec cell is `ok`, except cells whose source is `unavailable`. Anything else is a stop condition.

## 2.8 Requirements: performance

- R2.15 `bench/codec.bench.ts` (Vitest bench) with these fixtures, generated deterministically from a seed:
  - F1: 10,000 flat records, no Temporal values.
  - F2: 10,000 records, each with an `Instant`, a `PlainDate` and a `ZonedDateTime`.
  - F3: a chain 100,000 deep with one `PlainDate` at the tail.
  - F4: a `Map` of 50,000 entries with `PlainDate` keys and small object values.
  - Compare three pipelines for each fixture: `structuredClone(raw)` where cloneable; `decode(structuredClone(encode(x)))`; and a "manual" baseline where the same records carry pre-computed strings in place of Temporal values.
- R2.16 Hard gates (unit tests, not benches, so they run in CI):
  - F1: `encode(f1) === f1` and `decode(f1) === f1`.
  - F3: encode and decode complete without `RangeError`.
- R2.17 Soft gate (local, recorded in the report). Definitions for F2:
  - Codec pipeline: `decode(structuredClone(encode(F2)), { Temporal: S4 })`, where F2's values were constructed with S4.
  - Manual baseline: `structuredClone` of the same records carrying the `indexKey`-style strings (and `tz`/`cal` strings for `ZonedDateTime`), followed by reviving every string with `S4.<Type>.from(...)` (`ZonedDateTime` via `S4.Instant.from(v).toZonedDateTimeISO(tz).withCalendar(cal)`).
  - Gate: on Node 24, the codec pipeline's median MUST be no more than 3x the manual baseline's. Report S3 numbers too, informationally. If the gate fails, stop and report with a CPU profile. Do not start optimizing without the owner's go-ahead.
  - Calibration (informative): an early prototype measured about 1.4x (S4) and 1.6x (S3) on Node 22 with 10,000 records.
- R2.18 `docs/BENCHMARKS.md` records machine (CPU, cores, RAM, OS), Node version, command, and the results table for all four fixtures. Every number in it comes from a run you actually performed.

## 2.9 Tests

- Unit tests for every `IssueKind` and severity, `maxIssues` truncation, `includeInfo`, throwing getters, revoked proxies, `Error.cause` traversal, cycles, and paths through Map entries and Set members.
- P-6 (fast-check): for graphs from the P-2 generator, `findCloneIssues(encode(g)).issues` contains no issue of kind `temporal`.
- P-7 (fast-check): for graphs from the P-2 generator extended with functions, symbol values, `WeakMap`s, `Promise`s and custom-tagged ordinary objects (no Proxies, which are undetectable per `01-FORMAT.md` 6.10, and no `Error`s, whose `cause` serialization varies by engine), `structuredClone(g)` throws in Node if and only if `findCloneIssues(g)` reports at least one `throws` issue. Run on Node 26 as well, where native values exist. `Error.cause` reporting is covered by unit tests instead.
- Unit test: a custom-tagged object containing a polyfill `PlainDate` yields a `temporal` issue with severity `loss` at the correct path, even with `assumeEncoded: true`.
- `detectNativeClone` with a fake clone function covering the `true` path, each single-type failure, a throwing clone, and a non-object namespace.

## 2.10 Deliverables

`src/issues.ts`, `src/native.ts`, index exports, tests (unit, property, type), harness codec mode, `conformance/results/*.codec.json`, updated `baseline.json` and `MATRIX.md`, `bench/codec.bench.ts`, `npm run bench`, `docs/BENCHMARKS.md`, `docs/phase-reports/PHASE-2.md`.

## 2.11 Exit criteria

| ID | Criterion |
|---|---|
| X2.1 | All commands green on Node 22, 24, 26 and in three browsers. |
| X2.2 | Codec-applied matrix: every cell in all six engines is `ok` or `unavailable` (paste the summary table). |
| X2.3 | `supportsNativeTemporalClone()` is `false` in every engine, recorded in the results. |
| X2.4 | P-6 and P-7 pass with `FC_NUM_RUNS=5000`. |
| X2.5 | Coverage gates from Phase 1 still hold for all of `src/**`. |
| X2.6 | R2.16 hard gates pass in CI. R2.17 result is in the report (pass, or a stop). |
| X2.7 | `test/vectors/v1.json` is byte-identical to its Phase 1 approval commit (`git diff <phase-1-commit> -- test/vectors/v1.json` is empty; paste the command). |

## 2.12 Stop conditions

- Any codec cell is not `ok` (other than `unavailable`).
- `supportsNativeTemporalClone()` is `true` anywhere. Good news, but it changes release planning.
- R2.17 soft gate fails.
- Any requirement here would need a change to encoder output.
