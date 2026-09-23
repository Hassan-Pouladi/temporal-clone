# Phase 0 report

## Summary

The repository now has a strict TypeScript/ESLint/Prettier/Vitest/Playwright scaffold with no runtime dependencies and no install scripts. It also has a conformance harness that measures, in six real engines, what happens to each of the 8 Temporal types from each of 4 Temporal sources at every structured-clone boundary (1,008 cells). A pure classifier, report generator, baseline comparison and static server all have unit tests (99 Vitest tests), and a Playwright smoke test passes in chromium, firefox and webkit. `ci.yml` and the weekly `conformance.yml` canary run green on `phase-0`, and the six committed result files come from Linux CI (D-012).

**Phase 0 stopped on a section 0.7 stop condition.** Playwright's WebKit 26.6 exposes native `globalThis.Temporal`, so HY1 fails. HY2 to HY6 pass in all six engines. Per D-006, `baseline.json` was not created, and the owner decides how to proceed.

## Exit criteria

| ID   | Criterion                                                                                                              | Evidence (command and result)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Status                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| X0.1 | `npm ci && npm run typecheck && npm run lint && npm test && npm run test:browser` passes locally                       | Windows 11, Node v26.7.0, npm 12.1.0. Chain exit code 0. Tails are below the table.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Met                                            |
| X0.2 | Result files for all six engines; CI run linked for engines not run locally                                            | `conformance/results/{node22,node24,node26,chromium,firefox,webkit}.json` are the `conformance-results` artifact of the `phase-0` push run [Conformance 35921753866](https://github.com/Hassan-Pouladi/temporal-clone/actions/runs/35921753866), downloaded with `gh run download 35921753866 --name conformance-results`. Per D-012 all six come from Linux CI, including the engines that also run locally. A second push run, [35922082455](https://github.com/Hassan-Pouladi/temporal-clone/actions/runs/35922082455), produced identical `sources` and `cells` for all six engines.                      | Met                                            |
| X0.3 | `MATRIX.md` generated and evaluates HY1 to HY6                                                                         | `npm run conformance:report` printed `HY1 FAIL (1 offending)`, `HY2 PASS`, `HY3 PASS`, `HY4 PASS`, `HY5 PASS`, `HY6 PASS` and `wrote ...\conformance\MATRIX.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                              | Met                                            |
| X0.4 | `baseline.json` committed; `conformance:check` passes against committed results; unit test proves a flipped cell fails | The unit-test part is met: `test/unit/conformance/compare.test.ts` "fails on one flipped cell and names the cell" expects `chromium S1 B6 PlainDate: expected THROW(DataCloneError), got OK`, and "passes for an unchanged copy of the results" passes (`npm test`: 99 passed). `baseline.json` is **deliberately absent** because HY1 fails (D-006), so `conformance:check` exits 1 with "does not exist. Create it deliberately with npm run conformance:baseline."                                                                                                                                         | **Not met (blocked by D-006, awaiting owner)** |
| X0.5 | `ci.yml` and `conformance.yml` follow R0.20 to R0.22; latest `push` runs on `phase-0` green                            | Latest push runs, on commit 825498e: [CI 35922082492](https://github.com/Hassan-Pouladi/temporal-clone/actions/runs/35922082492) success, [Conformance 35922082455](https://github.com/Hassan-Pouladi/temporal-clone/actions/runs/35922082455) success (`gh run watch --exit-status`: exit 0 for both). The first push runs, 35921753496 and 35921753866, were also green. Every action is pinned to a full SHA with the version in a comment. Top-level `permissions: contents: read`; `issues: write` only on the `check` job. The push of this report triggers one more pair of runs; see the owner notes. | Met                                            |
| X0.6 | `src/` does not exist; `dependencies` empty; no lifecycle scripts                                                      | `test -e src`: no. `package.json` `dependencies`: `{}`. Lifecycle scripts among `preinstall, install, postinstall, prepare, prepublish, prepublishOnly`: `[]`.                                                                                                                                                                                                                                                                                                                                                                                                                                                | Met                                            |
| X0.7 | Phase report with resolved versions and the full hypothesis table from `MATRIX.md`                                     | This file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Met                                            |

X0.1 output tails (local, `npm ci && npm run typecheck && npm run lint && npm test && npm run test:browser`):

```
found 0 vulnerabilities
npm notice run tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.browser.json && tsc --noEmit -p tsconfig.worker.json
npm notice run eslint . --max-warnings 0 && prettier --check .
Checking formatting...
All matched files use Prettier code style!

 Test Files  7 passed (7)
      Tests  99 passed (99)

Running 3 tests using 3 workers
  ✓  1 [chromium] › test\browser\harness.spec.ts:8:1 › the harness page loads, the bundled classifier runs, and one S3 PlainDate cell per boundary completes (256ms)
  ✓  3 [webkit] › test\browser\harness.spec.ts:8:1 › ... (505ms)
  ✓  2 [firefox] › test\browser\harness.spec.ts:8:1 › ... (1.4s)
  3 passed (4.1s)
chain-exit=0
```

### Hypothesis table (copied from `conformance/MATRIX.md`)

| ID  | Hypothesis                                                                                                                        | Result |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------ |
| HY1 | S1 is available in chromium, firefox and node26, and unavailable in webkit, node22 and node24                                     | FAIL   |
| HY2 | wherever S1 is available, S2 resolvedToNative is true; elsewhere false                                                            | PASS   |
| HY3 | every S1 cell, and every S2 cell where S2 resolved to native, is throws with errorName DataCloneError (B8: any error name, D-003) | PASS   |
| HY4 | every S3 and S4 cell, and every S2 cell where S2 did not resolve to native, is silent-loss with shape {}                          | PASS   |
| HY5 | no cell anywhere is ok                                                                                                            | PASS   |
| HY6 | no cell is timeout, async-error or harness-error                                                                                  | PASS   |

HY1 offending cells (1):

- webkit: S1 available is true

## Resolved versions

- Node.js (local): v26.7.0 on Windows 11
- npm (local): 12.1.0
- Node.js (CI, Linux): v22.23.2, v24.21.0 (CI run) / v24.20.0 (Conformance run), v26.10.0
- npm (CI): 12.0.2 (D-014)
- typescript: 6.0.3
- @types/node: 22.20.4
- vitest: 5.0.1
- fast-check: 4.10.2
- @playwright/test: 1.63.0 (browsers: chromium 153.0.8010.12, firefox 155.0, webkit 26.6)
- esbuild: 0.28.2
- eslint: 10.11.0
- typescript-eslint: 8.70.0 (8.70.1 was under 3 days old, D-010)
- prettier: 3.9.8 (3.9.9 was under 3 days old, D-010)
- temporal-polyfill: 1.0.5
- @js-temporal/polyfill: 0.5.1
- actions/checkout: v7.0.1 (3d3c42e5aac5ba805825da76410c181273ba90b1)
- actions/setup-node: v7.0.0 (820762786026740c76f36085b0efc47a31fe5020)
- actions/upload-artifact: v7.0.1 (043fb46d1a93c77aae656e7c1c64a875d1fc6a0a)
- actions/download-artifact: v8.0.1 (3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c)

## Decisions made this phase

- D-001 to D-013: owner rulings from the Phase 0 plan review (approved 2026-09-23).
- D-014: CI pins npm 12.0.2 until npm 12.1.0 is 3 days old (pending).
- D-015: a B8 deserialization failure is `async-error` (pending).
- D-016: the canary fails its run after opening an issue (pending).
- D-017: esbuild's `postinstall` is denied (pending).
- D-018: harness details the spec does not fix (pending).

## Deviations from the spec

1. **X0.4 not met**, by owner ruling D-006: there is no `baseline.json` while HY1 fails.
2. **npm 12.0.2 in CI instead of 12.1.0** (D-014, pending). D-002 says 12.1.0, but it is younger than `min-release-age=3` until 2026-09-25T17:11Z. D-010's own fallback rule selects 12.0.2.
3. **Script approval command.** R0.4 says to approve with `npm approve-scripts`. In npm 12.1.0, `npm approve-scripts --allow-scripts-pending` lists pending packages (it reported `esbuild@0.28.2 (postinstall: node install.js)`). The approval or denial itself was recorded with `npm install-scripts deny esbuild`, which wrote `"allowScripts": { "esbuild": false }`. No package needed approval (D-017).

## Findings that contradict the spec

1. **Playwright's WebKit ships native Temporal.** `00-OVERVIEW.md` section 2 and HY1 expect `webkit` to have no `globalThis.Temporal`. With `@playwright/test` 1.63.0, WebKit 26.6 exposes a complete Temporal namespace, on Linux CI (`conformance/results/webkit.json`: `"S1":{"available":true}`, `"S2":{..."resolvedToNative":true}`) and on Windows locally. Its native values behave like Chromium's and Firefox's: every S1 and S2 cell is `throws` with `DataCloneError` ("The object can not be cloned."). For example, `S1 B1 Instant`, `S1 B6 ZonedDateTime`, `S1 B7 Duration` and `S2 B3 PlainDate` all do.
   - This does not contradict the statement that Safari 27 does not ship Temporal: Playwright's WebKit build is not Safari. Why Temporal is enabled in that build was not investigated, so no claim is made.
   - Consequence: the matrix now has **no browser without native Temporal**. The "`temporal-polyfill` silently delivers `{}`" row of the defect table (section 2) is confirmed only in Node 22 and 24 (S2 there is `LOSS({})` at every boundary). No browser in the matrix covers it.
2. Everything else in the section 2 defect table is confirmed in real engines:
   - Native Temporal throws `DataCloneError` in chromium, firefox and node26. In Node, B8 (`v8.serialize`) throws a plain `Error` with the same message.
   - `temporal-polyfill` resolves to native wherever native exists.
   - `temporal-polyfill/implementation` and `@js-temporal/polyfill` silently deliver `{}` at every boundary in every engine, including IndexedDB, `history.state` and workers.
   - No cell was `ok`, `timeout`, `async-error` or `harness-error`.

## Open questions for the owner

1. **WebKit and HY1 (stop condition).** How should Phase 0 proceed? Options I see:
   - (a) Amend HY1 to expect S1 available in `webkit` for Playwright's build, then create the baseline from the committed results (`npm run conformance:baseline`) and finish X0.4.
   - (b) Keep HY1 as written and look for a browser configuration without native Temporal before baselining (not researched; it may not exist in Playwright).
   - (c) Accept the observation and baseline it without amending HY1.

   The codec design does not appear affected, because WebKit's native values fail exactly like Chromium's and Firefox's. What is lost is browser coverage of the polyfill-without-native path.

2. Please approve or reject D-014 to D-018.
3. D-012 and R0.17 interact. `npm run conformance` writes `conformance/results/<engine>.json`, the same paths as the committed CI results, so a local run leaves modified files that must not be committed (`git restore conformance/results` undoes it). Keep this, or add an output-directory option for local runs?
4. `actions/setup-node` with `node-version: '24'` resolved v24.21.0 in one workflow and v24.20.0 in the other on the same push, because it uses the runner's tool cache. Should the workflows set `check-latest: true` so every job gets the newest patch? That matters for D-002's `>=22.22.2` floor if a runner image ever caches an older Node 22.
5. After 2026-09-25T17:11Z, should CI move from npm 12.0.2 to 12.1.0 (D-014)?

## What the next phase needs to know

- Three tsconfigs exist: `tsconfig.json` (Node, `checkJs`), `tsconfig.browser.json` (DOM) and `tsconfig.worker.json` (WebWorker). New tsconfigs (Phase 1 adds `tsconfig.build.json` and `tsconfig.core.json`) must be added to `npm run typecheck` and to `parserOptions.project` in `eslint.config.js`.
- Vitest only picks up `test/unit/**/*.test.ts`. Playwright only picks up `test/browser`. Set Phase 1's `TZ=UTC` in the Vitest config or a global setup (D-009).
- The harness in `conformance/` is reusable for Phase 2's codec-applied matrix: `cell.ts` (time-bounded cells with cleanup), `source.ts` (per-source runs), the per-platform `boundaries.ts`, and `browser-driver.ts` (one fresh page per source).
- Harness bundles are built by `npm run build:conformance`: Node bundles keep npm packages external, and browser bundles are self-contained. Polyfill versions are injected at build time (`conformance/build-constants.d.ts`).
- `ubuntu-latest` moves to Ubuntu 26 from 2026-10-19 (runner annotation). The canary may then report changes caused by the image rather than by browsers.
