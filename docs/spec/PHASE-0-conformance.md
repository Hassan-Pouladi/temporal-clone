# Phase 0: Scaffold and conformance matrix

## 0.1 Objective

Stand up the repository and measure, in six real engines, exactly what happens to each Temporal type from each Temporal implementation at each structured-clone boundary. The output is a committed, machine-checked baseline and a weekly CI canary.

No library code is written in this phase. `src/` MUST NOT exist at the end of Phase 0.

Why this phase exists: the defect table in `00-OVERVIEW.md` section 2 was reproduced in Node only. If real browsers behave differently, the design may change. Measuring first is cheaper than building on a wrong assumption.

## 0.2 Preconditions

- The owner has created the git repository, copied `CLAUDE.md` and `docs/spec/` into it, and created an empty `docs/DECISIONS.md` and `docs/phase-reports/`.
- Node 26 is available locally. Node 22 and 24 are available locally through a version manager the owner already uses (fnm, nvm or volta), or through CI: you push the `phase-0` branch and the workflows in R0.20 and R0.21 run on that push. You MUST NOT install a version manager or a Node version yourself. If you cannot run an engine locally, say so in your plan.
- The repository has a GitHub remote named `origin`, and the phase prompt allows you to push `phase-0` (`CLAUDE.md` section 7). If there is no remote, stop and ask before starting.

## 0.3 Scope

In scope: repository scaffold, tooling config, conformance harness (Node and browser), outcome classifier with unit tests, results, generated matrix, baseline, check script, CI workflows `ci.yml` and `conformance.yml`.

Out of scope: anything under `src/`, the codec, adapters, benchmarks, publishing config, README beyond a stub.

## 0.4 Requirements

### Scaffold

- R0.1 `package.json`: `"name": "temporal-clone"`, `"version": "0.0.0"`, `"private": true` (it stays private until Phase 4), `"type": "module"`, `"license": "MIT"`, `"engines": { "node": ">=22.12" }` (the same value ships in Phase 4), empty `dependencies`, no lifecycle scripts, and the scripts listed in `CLAUDE.md` section 8.
- R0.2 `.npmrc`: `save-exact=true` and `min-release-age=3` (npm 11.10+; the unit is days). If `min-release-age` blocks a version this spec requires, stop and ask; do not remove the setting.
- R0.3 Dev dependencies, exact pins, per `00-OVERVIEW.md` section 9: `typescript` 6.0.x, `@types/node` 22.x (the lowest supported Node major, so newer Node APIs cannot slip in), `vitest` 5.x, `fast-check` 4.x, `@playwright/test` 1.63.x, `esbuild`, `eslint` 10.x, `typescript-eslint` 8.x, `prettier` 3.x, `temporal-polyfill` 1.0.5, `@js-temporal/polyfill` 0.5.1. Nothing else without asking.
- R0.4 npm 12 blocks dependency install scripts. Run `npm approve-scripts --allow-scripts-pending`, approve only packages that demonstrably fail without their script, commit the resulting `allowScripts` block, and log each approval in `DECISIONS.md`. Playwright browsers are installed with `npx playwright install --with-deps chromium firefox webkit`, never through a lifecycle script.
- R0.5 TypeScript: `tsconfig.json` (strict settings from `CLAUDE.md` section 9, `target` and `lib` `ES2022`, `module` and `moduleResolution` `NodeNext`). Harness code that touches DOM or worker APIs gets its own tsconfig with the needed libs. `npm run typecheck` runs every tsconfig.
- R0.6 ESLint flat config with `typescript-eslint` strict type-checked rules, plus Prettier. `npm run lint` MUST pass with zero warnings (`--max-warnings 0`).
- R0.7 `.gitignore` covers `node_modules`, `playwright-report`, `test-results`, `conformance/results/tmp`, `conformance/dist`, `dist`, `coverage`, `.DS_Store`.
- R0.8 `scripts/serve.mjs`: a zero-dependency `node:http` static server. It binds `127.0.0.1` on a port given by env var or `0` (random) and prints the chosen port. It serves `.html`, `.js` and `.mjs` with correct MIME types and sends `Cache-Control: no-store`. It rejects path traversal (`..`, absolute paths, encoded variants) with 400. Playwright's `webServer` uses it.

### Matrix dimensions

- R0.9 Engines (6): `node22`, `node24`, `node26`, `chromium`, `firefox`, `webkit` (Playwright's builds of the installed `@playwright/test` version).
- R0.10 Temporal sources. Each source runs in a fresh realm: a fresh page per source in browsers, a fresh process per source in Node. A polyfill therefore never contaminates another source.

| ID | Source | How obtained |
|---|---|---|
| S1 | native | `globalThis.Temporal`, captured before any polyfill module is evaluated. Unavailable if absent. |
| S2 | `temporal-polyfill` | root export. Record `resolvedToNative` = identity check against the captured native namespace. |
| S3 | `temporal-polyfill/implementation` | always the polyfill |
| S4 | `@js-temporal/polyfill` | always the polyfill |

Browser bundles are built with esbuild into `conformance/dist/` (one entry per source, plus the worker entries). Node runners import the packages directly.

- R0.11 Sample values. Exactly these, constructed with the source's namespace:

| Type | Construction |
|---|---|
| Instant | `Instant.from('2026-10-31T01:30:00.123456789Z')` |
| ZonedDateTime | `ZonedDateTime.from('2026-11-01T01:30:00-05:00[America/Toronto]')` |
| PlainDate | `PlainDate.from('2026-10-31')` |
| PlainTime | `PlainTime.from('01:30:00.000000001')` |
| PlainDateTime | `PlainDateTime.from('2026-10-31T01:30:00.000000001')` |
| PlainYearMonth | `PlainYearMonth.from('2026-10')` |
| PlainMonthDay | `PlainMonthDay.from('10-31')` |
| Duration | `Duration.from('P1Y2M3W4DT5H6M7.008009010S')` |

- R0.12 Boundaries. The message is always the wrapper `{ value: sample, expected: { type, str } }`. `str` is `sample.toString()` for all types except `PlainYearMonth` and `PlainMonthDay`, which use `toString({ calendarName: 'always' })`. The receiver classifies what it got (R0.14).

| ID | Engines | Boundary |
|---|---|---|
| B1 | all | `structuredClone(message)` |
| B2 | all | `MessageChannel`: `port1.postMessage` to `port2` (Node: `worker_threads` `MessageChannel`) |
| B3 | all | dedicated worker. Browser: module `Worker`. Node: `worker_threads` `Worker`. Main posts to the worker; the worker classifies and posts the classification back. The worker loads no Temporal implementation. |
| B4 | all | `BroadcastChannel`: two instances with the same unique name in the same realm |
| B5 | browsers | `window.postMessage(message, '*')` to self |
| B6 | browsers | IndexedDB: fresh database per run, `put` then `get` in separate transactions, database deleted afterward |
| B7 | browsers | `history.replaceState(message, '')`, then read `history.state` |
| B8 | Node | `v8.deserialize(v8.serialize(message))` |

### Classification

- R0.13 Outcome codes (exactly these):

| Outcome | Meaning | `detail` fields |
|---|---|---|
| `ok` | received `value` has tag `[object Temporal.<type>]` and its string form (computed as for `expected.str`) equals `expected.str` | none |
| `throws` | the send or put threw synchronously | `errorName`, `message` (first 200 chars) |
| `silent-loss` | a value arrived and it is not `ok` | `receivedTag`, `ownKeyCount`, `shape` (JSON, first 200 chars) |
| `async-error` | `messageerror`, IndexedDB request/transaction error, or rejected promise | `errorName`, `message` |
| `timeout` | nothing arrived within 5,000 ms | none |
| `unavailable` | the source does not exist in this engine | `reason` |
| `harness-error` | the harness itself failed | `errorName`, `message`, `stack` (first 1,000 chars) |

- R0.14 `conformance/classify.ts` is a pure function `classify(observation: Observation, expected) => Cell` with no I/O. The harness turns what happened into an `Observation`, a discriminated union: `{ kind: 'received'; value: unknown }`, `{ kind: 'send-threw'; error: unknown }`, `{ kind: 'async-error'; error: unknown }`, `{ kind: 'timeout' }`, `{ kind: 'unavailable'; reason: string }` and `{ kind: 'harness-error'; error: unknown }`. Vitest unit tests MUST cover every outcome with synthetic observations, including a received value whose `toString` throws, and a received value that is a Temporal of the wrong type.
- R0.15 Every cell is time-bounded (5,000 ms) and cleans up: terminate workers, close ports and channels, delete databases, restore `history.state`. A harness failure in one cell MUST NOT abort the rest of the run.

### Results, matrix, baseline

- R0.16 `conformance/results/<engine>.json`:

```ts
interface EngineResult {
  engine: 'node22' | 'node24' | 'node26' | 'chromium' | 'firefox' | 'webkit';
  engineVersion: string;              // process.version or browser.version()
  runAt: string;                      // ISO timestamp, excluded from comparisons
  sources: Record<'S1'|'S2'|'S3'|'S4', { available: boolean; version?: string; resolvedToNative?: boolean }>;
  cells: Array<{ source: string; boundary: string; type: string; outcome: string; detail?: Record<string, string | number> }>;
}
```

Cells are sorted by source, boundary, then type (in `TemporalTypeName` order). Output is deterministic apart from `runAt` and version strings.

- R0.17 `conformance/MATRIX.md` is generated by `npm run conformance:report` from all six result files. It contains: a summary table (rows = engine x source, value = the dominant outcome with counts), one detailed table per engine (rows = source x boundary, columns = the 8 types, cells = `OK`, `THROW(<errorName>)`, `LOSS(<shape>)`, `ASYNC(<errorName>)`, `TIMEOUT`, `N/A`, `HARNESS`), and the hypothesis evaluation (R0.19). The file header states it is generated and MUST NOT be hand-edited.
- R0.18 `conformance/baseline.json` holds the normalized cells of all six engines: no `runAt`, no versions, `detail` reduced to `errorName` / `shape`. `npm run conformance:check` compares fresh results against it and exits 1 with a readable diff on any difference. The check MUST have its own unit test: an unchanged copy passes, a copy with one flipped cell fails and the diff names the cell.

### Hypotheses (evaluated automatically in MATRIX.md)

- R0.19 The report evaluates each hypothesis and prints PASS or FAIL with the offending cells:

| ID | Hypothesis |
|---|---|
| HY1 | S1 is available in `chromium`, `firefox` and `node26`, and unavailable in `webkit`, `node22` and `node24` |
| HY2 | wherever S1 is available, S2 `resolvedToNative` is `true`; elsewhere `false` |
| HY3 | every S1 cell, and every S2 cell where S2 resolved to native, is `throws` with `errorName` `DataCloneError` (B8 may report a different error name; record it) |
| HY4 | every S3 and S4 cell, and every S2 cell where S2 did not resolve to native, is `silent-loss` with `shape` `{}` |
| HY5 | no cell anywhere is `ok` |
| HY6 | no cell is `timeout`, `async-error` or `harness-error` |

### CI

- R0.20 `.github/workflows/ci.yml`, on push to any branch and on pull request: `npm ci`, typecheck, lint, `npm test`, Playwright browser install, `npm run test:browser`. Node matrix 22, 24, 26 for Node jobs.
- R0.21 `.github/workflows/conformance.yml`, triggered by `schedule` (weekly, Monday 13:00 UTC), `workflow_dispatch`, and `push` to branches matching `phase-*`. (GitHub only allows `workflow_dispatch` for workflows on the default branch, so the `push` trigger is how Phase 0 gets its first CI results.)
  - A job matrix runs the Node runner on 22, 24 and 26 and the browser runner on chromium, firefox and webkit, and uploads each engine's result file as an artifact.
  - On `schedule` and `workflow_dispatch` only, the browser job first installs the latest `@playwright/test` without committing it (`npm install --no-save @playwright/test@latest`), then installs browsers. This makes the canary track new browser releases. On `push`, it uses the pinned version.
  - A final job collects the six result files and runs `conformance:check`. While `conformance/baseline.json` does not exist yet (the bootstrap push), the job skips the check and only uploads the collected results. Once the baseline exists, the check always runs. On `push`, a difference fails the job. On `schedule` and `workflow_dispatch`, a difference opens a GitHub issue titled `Conformance change detected: <engines>` with the diff in the body (`gh issue create`, `permissions: issues: write` on that job only). It MUST NOT update the baseline.
  - To produce the initial results for engines you cannot run locally, download the artifacts from the `push` run of `phase-0` and commit them. The report links that run.
- R0.22 Every third-party action is pinned to a full commit SHA with the version in a trailing comment. Every workflow declares minimal `permissions` at the top (`contents: read` unless more is required).

### Tests that exist at the end of Phase 0

- R0.23 `npm test` (Vitest) covers `classify.ts` (R0.14), the baseline comparison (R0.18), and `scripts/serve.mjs`: correct MIME types, 404 for missing files, 400 for every traversal variant (`/../`, `%2e%2e/`, `..%2f`, absolute paths, backslashes).
- R0.24 `npm run test:browser` (Playwright) is a harness smoke test in all three browsers: the harness page loads from `serve.mjs`, the bundled classifier runs, and one S3 `PlainDate` cell per boundary completes with any outcome other than `harness-error` or `timeout`. The full matrix runs under `npm run conformance`, not here.

## 0.5 Deliverables

`package.json`, `package-lock.json`, `.npmrc`, `tsconfig*.json`, `eslint.config.js`, `.prettierrc`, `.gitignore`, `.editorconfig`, `scripts/serve.mjs`, `conformance/**` (harness, `classify.ts`, runners, report generator, check script, `results/*.json`, `baseline.json`, `MATRIX.md`), `test/unit/conformance/*.test.ts`, `playwright.config.ts`, `vitest.config.ts`, `.github/workflows/ci.yml`, `.github/workflows/conformance.yml`, `README.md` (stub: one paragraph plus "under construction"), `docs/phase-reports/PHASE-0.md`.

## 0.6 Exit criteria

| ID | Criterion |
|---|---|
| X0.1 | `npm ci && npm run typecheck && npm run lint && npm test && npm run test:browser` passes locally. Paste the tail of each output in the report. |
| X0.2 | Result files exist for all six engines. For engines you could not run locally, the report links the CI run that produced them. |
| X0.3 | `MATRIX.md` is generated and evaluates HY1 to HY6. |
| X0.4 | `baseline.json` is committed. `conformance:check` passes against the committed results, and its unit test proves a flipped cell fails. |
| X0.5 | `ci.yml` and `conformance.yml` exist and follow R0.20 to R0.22. The latest `push` runs of both workflows on `phase-0` are green; link them. (The first `schedule`/`workflow_dispatch` run happens after the owner merges to `main`. The owner verifies it.) |
| X0.6 | `src/` does not exist. `dependencies` is empty. No lifecycle scripts. |
| X0.7 | Phase report written with resolved versions and the full hypothesis table copied from `MATRIX.md`. |

## 0.7 Stop conditions

Stop and report to the owner, without starting Phase 1 work, if:

- any hypothesis FAILs. This is expected to be possible, and it is the point of the phase. Present the evidence. The owner decides whether the design changes.
- WebKit reports S1 available (Temporal shipped in Playwright's WebKit build).
- any cell is `ok` (an engine clones Temporal natively).
- you cannot run an engine locally and CI on the pushed `phase-0` branch cannot produce it either.
