# 00: Overview

Status: approved for implementation. Audience: the implementing engineer (a senior software engineer). Read `CLAUDE.md` first.

## 1. What we are building

`temporal-clone` is a zero-dependency TypeScript library, published to npm as ESM, that makes TC39 Temporal values survive every structured-clone boundary in browsers and Node.js:

- `structuredClone()`
- `postMessage` on `Worker`, `MessagePort`, `BroadcastChannel`, `Window`, and Node `worker_threads`
- IndexedDB (raw, Dexie, idb)
- `history.pushState` / `history.replaceState`
- worker pools (piscina) and RPC layers (Comlink)

It does this with a small, versioned, lossless wire format (`01-FORMAT.md`), a graph walker that behaves like structured clone, a diagnostic that finds values which will not survive a boundary, and thin adapters for the common integration points.

## 2. The defect

Temporal became part of ECMAScript 2026 (TC39 Stage 4, March 2026). It ships natively in Chrome/Edge 144 (January 2026), Firefox 139 (May 2025) and Node.js 26 (May 2026; LTS from October 2026). Safari does not ship it: it is absent from the Safari 27 release notes (2026-09-17). Node 24 LTS does not ship it.

The HTML specification change that makes Temporal objects serializable, whatwg/html#6284, has been open since 2021-01-13 (last activity 2026-03-27). Its tests, web-platform-tests/wpt#46865, are also unmerged. No engine can clone a Temporal object today.

The result is that the same line of code behaves three different ways depending on which Temporal implementation produced the value:

| Temporal implementation | Engines with native Temporal (Chrome, Firefox, Node 26) | Engines without it (Safari, Node 24 LTS) |
|---|---|---|
| Native | throws `DataCloneError` | not available |
| `temporal-polyfill` (root export; uses native when present) | throws `DataCloneError` | silently delivers `{}` |
| `@js-temporal/polyfill` (always the polyfill) | silently delivers `{}` | silently delivers `{}` |

"Silently delivers `{}`" means the receiving side gets an empty plain object with no error anywhere. Through IndexedDB, the empty object is persisted. The data is gone.

Provenance of this table: reproduced by the spec author on 2026-09-23 in Node 22.22.2 with the polyfills above, `fake-indexeddb` and `worker_threads`. It has NOT been verified in real browsers. Phase 0 exists to verify or refute it. Until Phase 0 is approved, treat the table as a hypothesis.

Demand, for scale: in the week of 2026-09-15 to 2026-09-21, `temporal-polyfill` had 2,566,401 downloads and `@js-temporal/polyfill` had 2,180,497. Temporal was the most-wanted proposal in State of JS 2025, and "dates" was the second-ranked language pain point.

Existing packages cover neighbouring problems and are explicitly out of scope for us: JSON (`superjson-temporal`), validation (`zod-temporal`, `temporal-zod`), PostgreSQL drivers and ORMs (`temporal-sql`). Nothing covers structured clone.

## 3. Goals

- G1. Lossless round trip of all eight Temporal value types through every boundary in section 1, for native Temporal, `temporal-polyfill` (basic and full) and `@js-temporal/polyfill`.
- G2. Cross-implementation interoperability: a value encoded with one implementation decodes with any other that supports its calendar and time zone.
- G3. Semantics that mirror whatwg/html#6284 slot for slot, so that when engines ship native cloning, switching to native passthrough changes no observable value.
- G4. IndexedDB range queries on Temporal fields. This works through a sortable encoding (`01-FORMAT.md` section 9). Native serialization will never provide it, because Temporal objects are not valid IndexedDB keys. This is what keeps the library useful after browsers catch up.
- G5. Loud failure: no silent loss anywhere. Malformed input, unsupported versions, missing Temporal and undecodable payloads all throw `TemporalCloneError` with a code and a path.
- G6. Zero runtime dependencies, no install scripts, signed provenance on every release.
- G7. A permanent conformance matrix, re-run weekly in CI, that opens an issue the day any engine changes behavior (for example, when a browser ships native Temporal cloning).

## 4. Non-goals (v1)

The following MUST NOT be implemented. If you think one is needed, ask.

- JSON serialization, `superjson`, `devalue`, `seroval`, React Server Components, TanStack Start, React Router loaders.
- Database drivers or ORMs other than the IndexedDB adapters in Phase 3.
- `Date` to Temporal conversion, codemods, lint rules.
- Polyfilling or shimming Temporal, or installing any global.
- SharedArrayBuffer-backed representations.
- Service Worker, SharedWorker or cross-origin iframe helpers beyond what the messaging adapter provides.
- Custom calendars or time zones (removed from Temporal in 2024).
- Preserving expando properties on Temporal objects.

## 5. Design principles

- P1. Mirror the platform. The encoded form carries exactly the internal slots whatwg/html#6284 serializes: epoch nanoseconds for `Instant`; epoch nanoseconds, time zone ID and calendar ID for `ZonedDateTime`; ISO date/time fields and calendar ID for the plain types, including the reference ISO day or year for `PlainYearMonth` and `PlainMonthDay`; the ten fields for `Duration`.
- P2. Lossless beats pretty. Wherever the obvious `toString()` / `from()` round trip loses information, the format does something else. Section 6 lists the known traps and every one has a named regression test.
- P3. Fail loudly and precisely. Errors carry a stable code and a path to the offending value.
- P4. Behave like structured clone. The walker follows structured-clone semantics for everything it traverses (key order, holes, shared references, cycles, Map/Set order, accessor invocation) and leaves everything else by reference, so transfer lists stay valid.
- P5. Implementation-agnostic. Detection uses `Symbol.toStringTag` (identical across native and both polyfills, verified). Decoding uses a caller-supplied Temporal namespace, falling back to `globalThis.Temporal`.
- P6. Zero cost when unused. A graph with nothing to encode is returned as the same reference.

## 6. Known traps (each MUST have a regression test; IDs are used in Phase 1)

All of these were reproduced on 2026-09-23 with `temporal-polyfill` 1.0.5 and `@js-temporal/polyfill` 0.5.1.

| ID | Trap | Naive approach and what goes wrong |
|---|---|---|
| H-01 | `Duration.toString()` rebalances sub-second fields | `{ milliseconds: 1500 }` becomes `PT1.5S`, which parses back as `{ seconds: 1, milliseconds: 500 }` |
| H-02 | `PlainYearMonth.from()` normalizes the ISO reference day | `new PlainYearMonth(2026, 10, 'iso8601', 15)` round-trips to reference day 1 even with `calendarName: 'always'` |
| H-03 | `PlainMonthDay.from()` normalizes the ISO reference year | reference year 2000 becomes 1972 |
| H-04 | `ZonedDateTime.toString()` rounds the offset to minutes | Toronto in 1880 has offset `-05:17:32`; parsing the string with `offset: 'use'` is off by 28 seconds |
| H-05 | Wall-clock encoding of an ambiguous time | `2026-11-01T01:30 America/Toronto` occurs twice; without the exact instant the second occurrence decodes as the first |
| H-11 | `Instant.toString()` omits trailing zeros | `…55.4Z` sorts after `…55.49Z` lexicographically, breaking index order |

The full hazard list (H-01 to H-25) is in `PHASE-1-codec.md`.

## 7. Architecture

```
  sender side                                             receiver side
  -----------                                             -------------
  user value                                              cloned value
      |                                                       |
      v                                                       v
  encode(): scan -> copy walk -> tagged records            decode(): scan -> copy walk -> revive via T
      |                                                       |
      v                                                       v
  clone-safe value ==> structuredClone / postMessage ==>   user value (real Temporal objects)
                       IndexedDB / history.state

  core (temporal-clone):  brand, format v1, walker, errors, paths, indexKey,
                          findCloneIssues, native detection
  adapters (subpaths):    /messaging /comlink /piscina /dexie /idb
                          (each depends only on core plus one optional peer)
```

Module map (`src/`):

| Module | Responsibility | Phase |
|---|---|---|
| `intrinsics.ts` | Built-ins captured at module evaluation | 1 |
| `brand.ts` | `temporalTypeOf`, `isTemporal` | 1 |
| `format.ts` | Per-type payload encode/decode, record validation | 1 |
| `walk.ts` | Iterative scan and copy walkers for encode/decode | 1 |
| `paths.ts` | Path syntax (`01-FORMAT.md` section 7) | 1 |
| `errors.ts` | `TemporalCloneError` | 1 |
| `index-key.ts` | `indexKey` | 1 |
| `issues.ts` | `findCloneIssues`, `assertCloneable` | 2 |
| `native.ts` | `supportsNativeTemporalClone`, `nativePassthrough` | 2 |
| `messaging/`, `comlink/`, `piscina/`, `dexie/`, `idb/` | Adapters | 3 |

## 8. Supported environments

Runtime support for the published package:

- Node.js 22.12 and later (`engines: ">=22.12"`). ESM, and `require()`-able from CommonJS on these versions.
- Evergreen browsers with ES2022 and `structuredClone`. CI verifies the latest Chromium, Firefox and WebKit through Playwright.

Temporal implementations (all MUST be tested):

| ID | Source | Notes |
|---|---|---|
| S1 | Native `globalThis.Temporal` | Chromium, Firefox, Node 26+. Never via a flag. |
| S2 | `temporal-polyfill` root export | Resolves to native when present (verified: `Temporal === globalThis.Temporal`) |
| S3 | `temporal-polyfill/implementation` | Always the polyfill. ISO calendar only; non-ISO calendars need `temporal-polyfill/full/implementation` (S3F). |
| S4 | `@js-temporal/polyfill` | Always the polyfill, even where native exists. Known bug: `PlainYearMonth.from({ calendar: 'chinese', … })` throws an internal TypeError in 0.5.1. Use capability probes, not hard-coded skips. |

## 9. Toolchain (pinned choices)

Pin exact versions. Use the latest patch of the listed major available at install time and record the resolved versions in the phase report.

| Tool | Version | Rationale |
|---|---|---|
| Node.js (dev) | 22.12+, 24, 26 | Vitest 5 requires `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0` |
| npm | 12.x | Blocks dependency install scripts by default; approve only what is needed |
| TypeScript | 6.0.x | NOT 7.x: `typescript-eslint` 8.x peer range is `<6.1.0` (checked 2026-09-23) |
| @types/node | 22.x | Lowest supported Node major, so newer Node APIs cannot slip in |
| Vitest | 5.x | Node unit, property and type tests; benchmarks |
| @vitest/coverage-v8 | same major as Vitest | Coverage gates (added in Phase 1) |
| fast-check | 4.x | Property-based tests |
| @playwright/test | 1.63.x | Browser tests: chromium, firefox, webkit |
| esbuild | latest | Bundles browser harness and test fixtures only (dev) |
| ESLint + typescript-eslint | 10.x + 8.x | Flat config |
| Prettier | 3.x | Formatting |
| temporal-polyfill | 1.0.5 | Dev and test only |
| @js-temporal/polyfill | 0.5.1 | Dev and test only |

Phase 3 adds `comlink` 4.4.x, `piscina` 5.x, `dexie` 4.x, `idb` 8.x and `fake-indexeddb` 6.x as dev dependencies. Phase 4 adds `size-limit` 14.x with `@size-limit/preset-small-lib`, `publint` 0.3.x and `@arethetypeswrong/cli` 0.18.x.

Build output is plain `tsc` (ESM + `.d.ts`). No bundler for the library itself.

## 10. Repository layout (end state)

```
CLAUDE.md
package.json  tsconfig.json  tsconfig.build.json  tsconfig.core.json
eslint.config.js  .prettierrc  .npmrc  .gitignore  .editorconfig
src/                      library source (Phase 1+)
test/unit/                Vitest unit tests
test/property/            fast-check properties
test/types/               type tests (expectTypeOf)
test/vectors/v1.json      golden vectors, frozen after Phase 1
e2e/                      Playwright adapter tests (Phase 3)
conformance/
  harness/                browser pages, worker scripts, node runners
  classify.ts             pure outcome classifier (unit-tested)
  results/<engine>.json   raw results (committed)
  baseline.json           normalized expected results (committed)
  MATRIX.md               generated report (committed)
bench/                    Vitest benchmarks (Phase 2)
scripts/serve.mjs         zero-dependency static server for browser tests
docs/spec/                this specification (read-only for you)
docs/DECISIONS.md         your decision log
docs/phase-reports/       one report per phase
docs/FORMAT.md  docs/API.md  docs/RECIPES.md  docs/FAQ.md   (Phase 4)
.github/workflows/ci.yml  conformance.yml  release.yml
```

You MUST NOT edit anything under `docs/spec/`. If the spec needs to change, propose the change in your phase report.

## 11. Phase plan and report template

| Phase | File | Outcome |
|---|---|---|
| 0 | `PHASE-0-conformance.md` | Scaffold. Measure real behavior in 6 engines. Baseline and weekly canary. |
| 1 | `PHASE-1-codec.md` | Format v1, walker, errors, `indexKey`, golden vectors, hazard suite, properties. Format frozen at approval. |
| 2 | `PHASE-2-safety-net.md` | `findCloneIssues`, `assertCloneable`, native detection, codec-applied matrix (all green), performance. |
| 3 | `PHASE-3-adapters.md` | messaging, comlink, piscina, dexie, idb, with Node and real-browser tests. |
| 4 | `PHASE-4-release.md` | Packaging, docs, CI, release workflow, supply-chain hygiene. Ready for the owner to publish 0.1.0. |

Phase report template (`docs/phase-reports/PHASE-<n>.md`):

```markdown
# Phase <n> report

## Summary
<3 to 6 sentences: what exists now that did not before.>

## Exit criteria
| ID | Criterion | Evidence (command and result) | Status |
|----|-----------|-------------------------------|--------|

## Resolved versions
<tool: exact version, one per line>

## Decisions made this phase
<links to DECISIONS.md entries, or "none">

## Deviations from the spec
<each deviation, why, and whether the owner approved it; or "none">

## Findings that contradict the spec
<observations that disagree with any statement in docs/spec, with evidence; or "none">

## Open questions for the owner
<numbered list, or "none">

## What the next phase needs to know
<short list>
```

## 12. `docs/DECISIONS.md` entry template

```markdown
### D-<nnn>: <title>
- Date / phase: <YYYY-MM-DD> / <n>
- Context: <what the spec did not say>
- Decision: <what you chose>
- Alternatives considered: <list>
- Consequences: <what this commits us to>
- Owner approval: pending | approved <date>
```

## 13. Owner inputs (the owner fills these in; you MUST NOT invent them)

| Key | Value |
|---|---|
| `OWNER_NAME` (LICENSE, package.json author) | `{{OWNER_NAME}}` |
| `OWNER_CONTACT` (package.json author email, or `none`) | `{{OWNER_CONTACT}}` |
| `REPO_URL` | `{{REPO_URL}}` |
| npm package name | `temporal-clone` (free on 2026-09-23; re-verify with `npm view temporal-clone` in Phase 4 and stop if taken) |

If a value is still a `{{placeholder}}` when you need it, stop and ask.

## 14. Glossary

- Boundary: any operation that runs the HTML structured serialize/deserialize algorithms.
- Native: a Temporal object created by the engine's built-in `Temporal`.
- Implementation: any object that provides the `Temporal` namespace (native, S2, S3, S3F, S4).
- Tagged record: the plain object that replaces one Temporal value in encoded output (`01-FORMAT.md` section 4).
- Escape record: the wrapper that protects a user object whose own key collides with the tag key (`01-FORMAT.md` section 5).
- Walkable container: array, Map, Set or ordinary object (`01-FORMAT.md` section 6.2).
- Passthrough: leaving a native Temporal value unencoded because the engine can clone it (Phase 2).
- Owner: the human who owns this repository and approves phases.

## 15. References

- whatwg/html#6284, Temporal serialization: https://github.com/whatwg/html/pull/6284
- web-platform-tests/wpt#46865, tests for the above: https://github.com/web-platform-tests/wpt/pull/46865
- tc39/proposal-temporal#3294, time zone data changes during deserialization (raised 2026-03-09)
- Temporal support data: https://web-platform-dx.github.io/web-features-explorer/features/temporal/
- WebKit features for Safari 27.0: https://webkit.org/blog/18325/webkit-features-for-safari-27-0/
- Node.js 26 release notes (Temporal unflagged)
- State of JS 2025, features: https://2025.stateofjs.com/en-US/features/
