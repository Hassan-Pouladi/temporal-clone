# Decisions

Decision log for `temporal-clone`. The implementing agent appends an entry whenever the spec is silent and a choice had to be made (`CLAUDE.md` section 5). Use the template in `docs/spec/00-OVERVIEW.md` section 12. Entries are never deleted. A reversed decision gets a new entry that references the old one.

<!-- entries below, newest last -->

### D-001: Playwright browsers use the default browser cache

- Date / phase: 2026-09-23 / 0
- Context: R0.4 installs browsers with `npx playwright install`, which writes outside the repository and conflicts with `CLAUDE.md` section 6 rule 10.
- Decision: explicit, narrow exception to rule 10. Playwright may use its default browser cache (`%LOCALAPPDATA%\ms-playwright` locally, the runner's cache in CI). Nothing else outside the repository. Locally: `npx playwright install chromium firefox webkit` (no `--with-deps`). CI keeps `--with-deps`.
- Alternatives considered: `PLAYWRIGHT_BROWSERS_PATH=0` (rejected by the owner: every `npm ci` would re-download about 1 GB).
- Consequences: browser binaries live outside the repository and are shared across projects on the machine.
- Owner approval: approved 2026-09-23

### D-002: CI installs npm 12.1.0 in every job

- Date / phase: 2026-09-23 / 0
- Context: the Node 22 and 24 runner images ship an older npm that ignores `allowScripts` and `min-release-age`.
- Decision: every CI job installs `npm@12.1.0` (pinned, never `@latest`) immediately after `actions/setup-node`. The Node 22 line must resolve to `>=22.22.2` (npm 12's engine range).
- Alternatives considered: use the bundled npm per Node version.
- Consequences: dependency install scripts are blocked identically on every Node version; npm is bumped deliberately.
- Owner approval: approved 2026-09-23

### D-003: HY3 accepts any error name for B8

- Date / phase: 2026-09-23 / 0
- Context: R0.19 HY3 says B8 (`v8.serialize`) "may report a different error name; record it" without saying whether that passes.
- Decision: a B8 cell satisfies HY3 if its outcome is `throws`, with any `errorName`. The matrix shows the name.
- Alternatives considered: require `DataCloneError` for B8 too.
- Consequences: HY3 stays meaningful for the HTML boundaries while tolerating V8's own error type.
- Owner approval: approved 2026-09-23

### D-004: S1 has no `version` in result files

- Date / phase: 2026-09-23 / 0
- Context: R0.16 gives every source an optional `version`; native Temporal has no package version.
- Decision: omit `version` for S1. `engineVersion` identifies the implementation. S2 to S4 record their package version.
- Alternatives considered: copy `engineVersion` into S1.
- Consequences: none beyond the result schema.
- Owner approval: approved 2026-09-23

### D-005: scripts `build:conformance` and `conformance:baseline`

- Date / phase: 2026-09-23 / 0
- Context: `CLAUDE.md` section 8 lists required scripts; the harness also needs a bundle step and an explicit way to write the baseline.
- Decision: add `build:conformance` (esbuild bundles into `conformance/dist/`) and `conformance:baseline` (writes `conformance/baseline.json` from the committed results). `conformance` runs `build:conformance` first. `conformance:baseline` exits 1 when the `CI` environment variable is set, so the canary can never rewrite the baseline.
- Alternatives considered: have `conformance:check` write a missing baseline (rejected: silent baseline creation).
- Consequences: the baseline only changes through a deliberate local command and a reviewed commit.
- Owner approval: approved 2026-09-23

### D-006: no baseline while any hypothesis fails

- Date / phase: 2026-09-23 / 0
- Context: section 0.7 says to stop when a hypothesis fails but does not say whether the baseline is created first.
- Decision: if any hypothesis fails, commit `conformance/results/*.json` and `MATRIX.md`, do NOT create `baseline.json`, then stop and report.
- Alternatives considered: commit the baseline anyway.
- Consequences: the owner reviews the evidence before any behavior is enshrined as expected.
- Owner approval: approved 2026-09-23

### D-007: `ci.yml` browser job runs on Node 22

- Date / phase: 2026-09-23 / 0
- Context: R0.20 gives a Node matrix for Node jobs but no Node version for the browser job.
- Decision: the browser job runs on Node 22, the lowest supported line.
- Alternatives considered: Node 24, Node 26.
- Consequences: browser tooling is exercised on the oldest supported Node.
- Owner approval: approved 2026-09-23

### D-008: `scripts/serve.mjs` is type-checked and linted through `checkJs`

- Date / phase: 2026-09-23 / 0
- Context: `serve.mjs` is plain JavaScript; `npm run typecheck` and `npm run lint` must cover it.
- Decision: a tsconfig with `allowJs` and `checkJs` includes `scripts/`; ESLint type-checked rules apply to it.
- Alternatives considered: exclude it from typechecking.
- Consequences: JSDoc types are needed where inference is not enough.
- Owner approval: approved 2026-09-23

### D-009: every npm script is cross-platform

- Date / phase: 2026-09-23 / 0
- Context: development happens on Windows, CI on Linux.
- Decision: no shell-prefix environment variables (`TZ=UTC cmd`), no `rm -rf`, no bash-only syntax in npm scripts. Environment variables are set in config files or small Node scripts. Phase 1's `TZ=UTC` requirement is met by setting `process.env.TZ` in the Vitest config or global setup.
- Alternatives considered: `cross-env` and `rimraf` (new dependencies, not allowed).
- Consequences: scripts that need environment or file-system work are small Node scripts.
- Owner approval: approved 2026-09-23

### D-010: `min-release-age=3` wins over "latest patch"

- Date / phase: 2026-09-23 / 0
- Context: `00-OVERVIEW.md` section 9 asks for the latest patch of each major; `.npmrc` `min-release-age=3` refuses versions younger than 3 days.
- Decision: pin the newest version that is at least 3 days old. If an exact pin fails with `ETARGET`, drop to the previous patch. Never remove the setting.
- Alternatives considered: remove or override `min-release-age`.
- Consequences: pins may lag the newest release by a few days.
- Owner approval: approved 2026-09-23

### D-011: permitted `gh` commands

- Date / phase: 2026-09-23 / 0
- Context: the agent needs CI evidence (R0.21, X0.2, X0.5).
- Decision: the agent may use `gh run list`, `gh run view`, `gh run watch`, `gh run download` and `gh repo view` only. Never `gh auth`, never read tokens, never create issues, PRs, releases or secrets. The canary workflow opening issues from CI is fine.
- Alternatives considered: none.
- Consequences: CI evidence is gathered read-only.
- Owner approval: approved 2026-09-23

### D-012: committed conformance results come only from Linux CI

- Date / phase: 2026-09-23 / 0
- Context: R0.21 allows committing CI artifacts for engines that cannot run locally; the local machine is Windows, the canary runs on Linux.
- Decision: all six committed `conformance/results/*.json` come from the Linux CI artifacts of the `phase-0` push. Local Windows runs are for development only and are never committed.
- Alternatives considered: commit local results where available.
- Consequences: the baseline and the weekly canary compare like with like.
- Owner approval: approved 2026-09-23

### D-013: agent created the initial `main` commit

- Date / phase: 2026-09-23 / 0
- Context: the owner setup (START-HERE steps 1 to 5) was not complete: the GitHub repository was empty. `CLAUDE.md` section 7 forbids the agent from committing to or pushing `main`.
- Decision: one-time exception, authorized by the owner in chat: the agent copied the specification pack plus `.gitattributes` (`* text=auto eol=lf`) into `D:\dev\temporal-clone`, committed `chore: add specification` (139fc85) on `main` and pushed it. All further work is on `phase-0`.
- Alternatives considered: the owner runs the commands.
- Consequences: section 7 applies unchanged from here on.
- Owner approval: approved 2026-09-23

### D-014: CI pins npm 12.0.2 until npm 12.1.0 is 3 days old

- Date / phase: 2026-09-23 / 0
- Context: D-002 pins `npm@12.1.0` in CI. npm 12.1.0 was published 2026-09-22T17:11Z, so under the repository's `.npmrc` (`min-release-age=3`, D-010) it resolves to `ETARGET` until 2026-09-25T17:11Z. Evidence: `npm pack --dry-run npm@12.1.0` in the repository fails with "No matching version found for npm@12.1.0 with a date before 20/09/2026"; the same command with `--min-release-age=0` succeeds. The bundled npm on the Node 24 and 26 runners honors `min-release-age`, so the global install would fail there.
- Decision: apply D-010's fallback: CI installs the previous version, `npm@12.0.2` (same engine range `^22.22.2 || ^24.15.0 || >=26.0.0`, same `approve-scripts` and `install-scripts` commands, verified from its published file list). Local development uses npm 12.1.0.
- Alternatives considered: running the global install outside the repository so `.npmrc` is not read (rejected: it sidesteps the setting); waiting until 2026-09-25 before the first push.
- Consequences: CI and local npm differ by one minor version for about two days. Bumping CI to 12.1.0 after 2026-09-25T17:11Z is a one-line change in both workflows.
- Owner approval: pending

### D-015: B8 deserialization failure is `async-error`

- Date / phase: 2026-09-23 / 0
- Context: R0.13 defines `throws` as "the send or put threw synchronously" and `async-error` as receiving-side failures (`messageerror`, IndexedDB errors). B8 is two synchronous calls.
- Decision: `v8.serialize` throwing is the send (`throws`); `v8.deserialize` throwing is the receiving side, the analogue of `messageerror` (`async-error`).
- Alternatives considered: `throws` for both.
- Consequences: none observed so far; every B8 failure seen is in `serialize`.
- Owner approval: pending

### D-016: the canary fails its run after opening an issue

- Date / phase: 2026-09-23 / 0
- Context: R0.21 says a difference on `schedule` / `workflow_dispatch` opens an issue; it does not say whether the run also fails.
- Decision: the check job opens the issue and then exits 1, so the run is also red in the Actions tab (louder failure).
- Alternatives considered: open the issue and pass.
- Consequences: each weekly run with a known, not-yet-baselined change is red and opens another issue until the baseline is updated.
- Owner approval: pending

### D-017: esbuild's `postinstall` is denied

- Date / phase: 2026-09-23 / 0
- Context: R0.4: approve install scripts only for packages that demonstrably fail without them.
- Decision: `esbuild@0.28.2` (`postinstall: node install.js`) is recorded as `false` in `allowScripts` (`npm install-scripts deny esbuild`). Evidence: with the script blocked, `npx esbuild --version` prints `0.28.2` and a `transform` call works, because the binary comes from the `@esbuild/<platform>` optional dependency. CI builds the harness with esbuild on Linux, which confirms it there. No other package has an install script (`npm install-scripts ls`: "No packages with unreviewed install scripts").
- Alternatives considered: leaving esbuild unreviewed (npm warns on every install).
- Consequences: no dependency runs code at install time.
- Owner approval: pending

### D-018: harness details the spec does not fix

- Date / phase: 2026-09-23 / 0
- Context: R0.13 to R0.15 leave some mechanics open.
- Decision:
  - `ownKeyCount` is `Reflect.ownKeys(value).length` (all own keys, including symbols and non-enumerable ones); `-1` if the keys cannot be listed (revoked Proxy); `0` for primitives.
  - `shape` falls back to `typeof value` when `JSON.stringify` returns `undefined`, and to `<unserializable: ErrorName>` when it throws. `receivedTag` is `<tag threw: ErrorName>` when `Object.prototype.toString` throws.
  - A thrown non-object gets `errorName` = its `typeof`; an object without a string `name` gets `unknown`. `messageerror` events are reported with `errorName` `messageerror`.
  - A cleanup that throws or does not finish within 5,000 ms turns the cell into `harness-error` (a leaked worker, port or database could contaminate later cells).
  - A realm that fails as a whole (crashed process, page that never loads) reports every one of its cells as `harness-error`, so no cell silently disappears.
  - Async boundaries ignore messages whose `expected` does not match the current cell (stragglers from an earlier timed-out cell).
  - `MATRIX.md` shows `MISSING` for a cell absent from a result file; this cannot happen with the runners in this repository.
  - `skipLibCheck` is on: `tinybench` (a Vitest dependency) references `DOMHighResTimeStamp`, which does not exist in the Node-only lib set.
- Alternatives considered: none material.
- Consequences: all covered by unit tests in `test/unit/conformance/`.
- Owner approval: pending
