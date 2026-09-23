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
