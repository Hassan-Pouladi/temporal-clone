# START HERE (for you, the owner)

This pack is the complete specification for `temporal-clone`, written for a Claude Code agent. The agent does the building. You approve each phase. This file tells you how to run it.

## What's in the pack

```
CLAUDE.md                         agent operating rules (Claude Code loads this automatically)
docs/spec/00-OVERVIEW.md          problem, goals, principles, toolchain, layout, templates
docs/spec/01-FORMAT.md            the wire format and walker semantics (normative, frozen after Phase 1)
docs/spec/PHASE-0-conformance.md  scaffold + measure real behavior in 6 engines + weekly canary
docs/spec/PHASE-1-codec.md        the core library, golden vectors, 25 hazard tests, property tests
docs/spec/PHASE-2-safety-net.md   diagnostics, native-clone detection, proof in real engines, perf
docs/spec/PHASE-3-adapters.md     messaging, Comlink, piscina, Dexie, idb
docs/spec/PHASE-4-release.md      packaging, docs-as-tests, CI, provenance release
docs/DECISIONS.md                 empty decision log the agent appends to
START-HERE.md                     this file
```

## One-time setup

1. Create an empty GitHub repository named `temporal-clone` and clone it.
2. Copy everything from this pack into the repository root, and create an empty `docs/phase-reports/` folder.
3. Open `docs/spec/00-OVERVIEW.md` section 13 and replace `{{OWNER_NAME}}`, `{{OWNER_CONTACT}}` (an email for `package.json`, or the word `none`) and `{{REPO_URL}}`.
4. Make sure Node 26 is installed. Node 22 and 24 are optional locally: when the agent pushes its phase branch, CI runs them.
5. Commit on `main`: `chore: add specification`. Push.
6. Open Claude Code in the repository root.

## Running a phase

Paste the prompt for the phase. The agent replies with a plan and a list of questions, then waits. Answer the questions, then reply `go`. When it finishes, it writes `docs/phase-reports/PHASE-<n>.md` and stops. Review using the checklist below. Reply `Phase <n> approved`, or give feedback. Merge the `phase-<n>` branch when you're happy. Then start a fresh session for the next phase.

### Phase 0 prompt

```
We are starting Phase 0 of temporal-clone.

Read CLAUDE.md, docs/spec/00-OVERVIEW.md, docs/spec/01-FORMAT.md and docs/spec/PHASE-0-conformance.md in full, plus docs/DECISIONS.md. Do not create or modify any file yet.

Reply with: (1) your plan: files, order, test strategy; (2) which of the six engines you can run locally and how you will get results for the rest; (3) every ambiguity, gap or conflict you found in the spec. Then wait for my "go".

Execute Phase 0 only. You may commit on the phase-0 branch and push phase-0 to origin so CI runs; never push anything else. Stop when every exit criterion in section 0.6 is met and evidenced in docs/phase-reports/PHASE-0.md. If any stop condition in 0.7 triggers, stop immediately and report.
```

### Phase 1 prompt

```
Phase 0 approved. We are starting Phase 1 of temporal-clone.

Read CLAUDE.md, docs/spec/00-OVERVIEW.md, docs/spec/01-FORMAT.md, docs/spec/PHASE-1-codec.md, docs/DECISIONS.md and docs/phase-reports/PHASE-0.md in full. Do not create or modify any file yet.

Reply with your plan (module by module, test-first order), the golden vectors you intend to include (ids and one-line descriptions), and every ambiguity or conflict you found. Then wait for my "go".

Remember: when I approve this phase, wire format v1 is frozen forever. Execute Phase 1 only. You may commit on the phase-1 branch and push phase-1 to origin so CI runs; never push anything else. Stop at the exit criteria in section 1.12.
```

### Phase 2 prompt

```
Phase 1 approved. Format v1 is now frozen. We are starting Phase 2 of temporal-clone.

Read CLAUDE.md, docs/spec/00-OVERVIEW.md, docs/spec/01-FORMAT.md, docs/spec/PHASE-2-safety-net.md, docs/DECISIONS.md and all reports in docs/phase-reports/ in full. Do not create or modify any file yet.

Reply with your plan and every ambiguity or conflict, then wait for my "go". Execute Phase 2 only. You may commit on the phase-2 branch and push phase-2 to origin so CI runs; never push anything else. Stop at the exit criteria in section 2.11.
```

### Phase 3 prompt

```
Phase 2 approved. We are starting Phase 3 of temporal-clone.

Read CLAUDE.md, docs/spec/00-OVERVIEW.md, docs/spec/01-FORMAT.md, docs/spec/PHASE-3-adapters.md, docs/DECISIONS.md and all reports in docs/phase-reports/ in full. Before planning, read the installed type declarations of comlink, piscina, dexie and idb, and confirm or refute every "Facts about" statement in PHASE-3 against the installed versions.

Reply with your plan, the results of that fact check, and every ambiguity or conflict. Then wait for my "go". Execute Phase 3 only. You may commit on the phase-3 branch and push phase-3 to origin so CI runs; never push anything else. Stop at the exit criteria in section 3.12.
```

### Phase 4 prompt

```
Phase 3 approved. We are starting Phase 4 of temporal-clone. The owner inputs in docs/spec/00-OVERVIEW.md section 13 are filled in.

Read CLAUDE.md, docs/spec/00-OVERVIEW.md, docs/spec/01-FORMAT.md, docs/spec/PHASE-4-release.md, docs/DECISIONS.md and all reports in docs/phase-reports/ in full. Re-check that the npm name temporal-clone is still available. Read the current npm trusted-publishing docs and the current @arethetypeswrong/cli docs before planning.

Reply with your plan and every ambiguity or conflict, then wait for my "go". Execute Phase 4 only. You may commit on the phase-4 branch and push phase-4 to origin so CI runs; never push anything else. You must not publish. Stop at the exit criteria in section 4.10.
```

### Resuming an interrupted phase

```
We are resuming Phase <n>. Re-read CLAUDE.md and docs/spec/PHASE-<n>-*.md, run git log and git status, and tell me what is done, what is left, and whether anything is in a broken state. Then wait for my "go".
```

## Your review checklist per phase

Phase 0
- [ ] Open `conformance/MATRIX.md`. Do HY1 to HY6 pass? If not, read the evidence before approving anything.
- [ ] `src/` does not exist. `dependencies` is empty.
- [ ] The weekly canary workflow exists and the actions are pinned to SHAs.
- [ ] After you merge to `main`, run `conformance.yml` once by hand (GitHub, Actions tab, "Run workflow") and confirm it is green. That is the first real canary run.

Phase 1 (this is the big one: approval freezes the format)
- [ ] Read the "Format freeze review" section in the report.
- [ ] Hazard tests H-01 to H-25 all show up by name in the test output.
- [ ] Coverage summary meets the gate. No exclusion comments (`grep -rn "istanbul\|c8 ignore\|v8 ignore" src`).
- [ ] The cross-implementation matrix ran on Node 26 with native Temporal.

Phase 2
- [ ] The "With temporal-clone" section of `MATRIX.md` is all OK or N/A in all six engines.
- [ ] The benchmark numbers are in `docs/BENCHMARKS.md` and come from a real run.

Phase 3
- [ ] The requirement-to-test mapping table covers R3.1 to R3.32.
- [ ] The cross-origin iframe test shows a rejected origin.

Phase 4
- [ ] The README table is generated from conformance data, not typed by hand.
- [ ] `npm pack --dry-run` lists only the allowed files.
- [ ] Follow the owner release checklist at the end of the report to publish 0.1.0.
