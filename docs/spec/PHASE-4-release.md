# Phase 4: Release readiness

## 4.1 Objective

Turn the repository into a package the owner can publish as `temporal-clone@0.1.0` with one tag push and one approval click: correct packaging, enforced size budgets, documentation whose examples are executed as tests, complete CI, and a release workflow with npm provenance. You prepare everything. The owner publishes. You MUST NOT publish.

## 4.2 Preconditions

- Phase 3 approved.
- Owner inputs in `00-OVERVIEW.md` section 13 are filled in. If any is still a `{{placeholder}}`, stop and ask.
- Run `npm view temporal-clone` again. If the name is taken, stop and ask.

## 4.3 Scope

In scope: `package.json` finalization, build, package linting, size budgets, all user documentation, doc tests, CI and release workflows, Dependabot config, a consumer smoke test, the upstream findings draft.

Out of scope: any behavior change in `src/` (a bug found now gets a failing test, a fix and a DECISIONS entry, and is flagged in the report), new features, running the release.

## 4.4 Packaging

- R4.1 `package.json` final state:
  - remove `"private": true` (only in this phase); `"version": "0.1.0"`
  - `"type": "module"`, `"sideEffects": false`, `"engines": { "node": ">=22.12" }` (unchanged since Phase 0; CI tests the latest 22.x)
  - `"exports"`, each entry with `types` before `default`: `.`, `./messaging`, `./comlink`, `./piscina`, `./dexie`, `./idb`, `./package.json`
  - `"files": ["dist", "README.md", "LICENSE", "CHANGELOG.md", "docs/FORMAT.md"]`
  - `"dependencies": {}`; `"peerDependencies"`: `comlink ^4.4.0`, `piscina ^5.0.0`, `dexie ^4.0.0`, `idb ^8.0.0`, each marked optional in `peerDependenciesMeta`
  - `"author"`, `"repository"`, `"bugs"`, `"homepage"` from owner inputs; `"keywords"` for temporal, structured clone, postMessage, web worker, indexeddb, dexie, comlink, piscina
  - no lifecycle scripts, except that `"prepublishOnly": "npm run verify"` is allowed. It runs at publish time on the publisher's machine or CI, not on install.
- R4.2 `npm run verify` = clean, build, typecheck, lint, test, test:browser, size, lint:package. The release workflow runs it.
- R4.3 `npm run lint:package` = `publint --strict` (zero errors and zero warnings) and `attw --pack` with the profile for ESM-only packages. Check the current `@arethetypeswrong/cli` docs for the exact flag; do not guess.
- R4.4 `npm pack --dry-run` output is pasted in the report. It MUST list only `dist/**`, `README.md`, `LICENSE`, `CHANGELOG.md`, `docs/FORMAT.md` and `package.json`. No tests, no `src`, no `.map` files.
- R4.5 Browser safety: no file reachable from `.`, `./messaging`, `./comlink`, `./dexie` or `./idb` may import a `node:` module. Add a test that bundles each of these entries with esbuild for `platform: 'browser'` and fails on any Node built-in.

## 4.5 Size budgets (size-limit, brotli, peers excluded)

| Entry (import) | Budget |
|---|---|
| `import { encode, decode } from 'temporal-clone'` | 2.0 kB |
| `import * as all from 'temporal-clone'` (entire core) | 3.5 kB |
| each adapter subpath, excluding core | 1.2 kB |

- R4.6 If a budget is exceeded, stop and report the measured size and the largest contributors. Do not raise a budget and do not minify by hand.

## 4.6 Documentation

Every behavior claim in the docs MUST link to the test or conformance result that proves it (`CLAUDE.md` rule 9).

- R4.7 `README.md`, in this order:
  1. One-sentence description.
  2. "The problem": the three-behavior table, generated from `conformance/results/*.json` by a script (`npm run docs:matrix`), not typed by hand, with a link to `conformance/MATRIX.md`.
  3. Install, and the supported Temporal implementations.
  4. Quick start: a worker round trip in under 15 lines.
  5. IndexedDB range query with `indexKey` (Dexie).
  6. "Find what won't survive": `findCloneIssues` example output with paths.
  7. Adapters: one short example each, with links to `docs/RECIPES.md`.
  8. Guarantees: lossless, cross-implementation, mirrors whatwg/html#6284, zero dependencies, provenance.
  9. Limitations: opaque objects, custom-`Symbol.toStringTag` objects and `Error.cause` are not traversed by `encode` (but are reported by `findCloneIssues`); Proxies cannot be detected; accessors are read up to twice; Temporal expandos are dropped; extended years do not sort; `decode<T>` is an unchecked cast; storage adapters never pass through native values.
  10. "When can I remove this?": explains the weekly canary and what changes when engines ship native cloning (messaging goes passthrough automatically; IndexedDB keeps encoding because Temporal is not a valid key).
  11. License.
- R4.8 `docs/FORMAT.md`: the normative content of `01-FORMAT.md` sections 2 to 13, written for users. Wording MAY change. Rules, patterns, examples and error codes MUST NOT.
- R4.9 `docs/API.md`: every export of every entry point, with its signature, behavior, errors thrown (codes) and one example.
- R4.10 `docs/RECIPES.md`: dedicated worker; `BroadcastChannel` across tabs; iframe with `allowedOrigins`; Comlink (both realms register); piscina; Dexie schema plus range query; idb with transactions and cursors using `encode`/`decode` explicitly; `history.state`; using `@js-temporal/polyfill` without a global (`{ Temporal }` option).
- R4.11 `docs/FAQ.md`: why not `toString()` (link H-01 to H-05); why not superjson or JSON; ZonedDateTime and time zone data changes (exact instant is authoritative); cross-implementation decoding; performance (link `docs/BENCHMARKS.md`).
- R4.12 `CHANGELOG.md` (0.1.0), `SECURITY.md` (private reporting via GitHub security advisories), `CONTRIBUTING.md` (commands, the phase and DECISIONS process, the format-freeze rule), `LICENSE` (MIT, owner name, year 2026).
- R4.13 Doc tests: every fenced code block tagged `ts test` in `README.md`, `docs/API.md` and `docs/RECIPES.md` is extracted and executed by Vitest (`npm test`). Browser-only snippets are tagged `ts test-browser` and run in Playwright. An untagged `ts` block is allowed only for type-only illustration. A test fails if a tagged block is removed without its test being updated (snapshot the list of block IDs).
- R4.14 `docs/UPSTREAM.md`: a factual, neutral draft the owner MAY post to whatwg/html#6284 and to the `@js-temporal/polyfill` and `temporal-polyfill` issue trackers. It summarizes the Phase 0 matrix, stresses that polyfilled values silently become `{}` (including in engines with native Temporal, for `@js-temporal/polyfill`), and links the data. It is a draft only. You MUST NOT post anything anywhere.

## 4.7 CI and release

- R4.15 `ci.yml` final: Node 22, 24, 26 matrix running verify minus browsers; one job for the three browsers; a TZ job (`TZ=America/Toronto`); `FC_NUM_RUNS=5000` on Node 24; size and package lint; a consumer smoke test (R4.18). All actions pinned to full SHAs, minimal `permissions`.
- R4.16 `release.yml`:
  - trigger: push of a tag matching `v*.*.*`
  - fails unless the tag equals `v` + `package.json` version, and unless the tagged commit is on `main`
  - runs `npm ci` and `npm run verify`
  - publishes with npm trusted publishing (OIDC) and provenance. Read the current npm documentation for trusted publishing and implement exactly what it specifies (at minimum `permissions: id-token: write, contents: read`). No `NPM_TOKEN` secret is used or referenced.
  - runs in a GitHub environment named `npm-release`. The owner configures that environment with themselves as a required reviewer, so every publish needs a human click.
- R4.17 `.github/dependabot.yml`: weekly updates for `github-actions` and `npm` (dev dependencies), with a cooldown of at least 3 days if the current Dependabot configuration supports it (check the docs). Group minor and patch updates.
- R4.18 Consumer smoke test (CI job): `npm pack`, install the tarball into a fresh temporary project with only `@js-temporal/polyfill`, run a Node script that does a `worker_threads` round trip through `temporal-clone/messaging`, and bundle a browser entry with esbuild. Both MUST succeed.

- R4.19 Placeholder check (used by X4.9):

```sh
grep -rnE '\{\{(OWNER_NAME|OWNER_CONTACT|REPO_URL)\}\}' \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=spec --exclude=START-HERE.md .
```

## 4.8 Owner release checklist (goes at the end of the Phase 4 report, verbatim, with any steps added)

1. On npmjs.com, configure trusted publishing for `temporal-clone` with this repository and `release.yml`, following the current npm docs. If npm requires the package to exist first, follow npm's documented bootstrap procedure. Do not create long-lived tokens.
2. In GitHub, create the environment `npm-release` and add yourself as a required reviewer.
3. Merge the Phase 4 branch to `main`.
4. Tag `v0.1.0` on `main` and push the tag.
5. Approve the `npm-release` deployment when `release.yml` asks.
6. Verify the provenance badge on npmjs.com, then run `npm view temporal-clone@0.1.0 dist.attestations`.

## 4.9 Deliverables

Final `package.json`, `size-limit` config, all docs in 4.6, the doc-test runner, `ci.yml`, `release.yml`, `dependabot.yml`, the consumer smoke test, `docs/UPSTREAM.md`, `docs/phase-reports/PHASE-4.md` with the owner checklist.

## 4.10 Exit criteria

| ID | Criterion |
|---|---|
| X4.1 | `npm run verify` passes locally; CI green on all jobs (link). |
| X4.2 | `publint --strict` and `attw` clean (paste output). |
| X4.3 | Size budgets met (paste the size-limit table). |
| X4.4 | `npm pack --dry-run` file list matches R4.4 exactly (paste it). |
| X4.5 | Doc tests pass; the report lists the number of executed blocks per file. |
| X4.6 | Consumer smoke test passes in CI. |
| X4.7 | `release.yml` reviewed against the current npm trusted-publishing docs. The report quotes the doc section you implemented and links it. The workflow has not been triggered. |
| X4.8 | `test/vectors/v1.json` unchanged since Phase 1. |
| X4.9 | No owner placeholder remains outside the spec: the command in R4.19 prints nothing (paste the command and its empty output). GitHub Actions `${{ }}` expressions are not placeholders. |

## 4.11 Stop conditions

- A size budget is exceeded.
- The package name is taken.
- npm trusted-publishing requirements differ from R4.16 in a way that needs a secret or a long-lived token.
- Any doc claim cannot be backed by a test or conformance result.
