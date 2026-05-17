---
title: Harness Repo Cleanup
status: approved
task_type: non_trivial
worktree_required: false
observe_required: false
review_required: true
---

# Plan: Harness Repo Cleanup

## Summary

- Clean the private `ovrsa/claude-harness` repository so it accurately represents a personal Claude Code harness sync repo.
- Replace upstream ECC/public-distribution identity with local harness identity.
- Avoid broad deletions until references and tests prove the surface is safe to prune.

## Non-Goals

- Do not make this a public product README.
- Do not publish to npm.
- Do not remove runtime-critical hooks/scripts without dependency checks.
- Do not sync runtime state, sessions, telemetry, cache, or credentials.
- Do not rewrite Git history unless a separate secret/history issue is found and approved.

## Acceptance Criteria

- `README.md` explains:
  - what this repo is
  - how to clone it to another device
  - what files are intentionally not tracked
  - how to verify the harness
  - where the operating model lives
- `package.json` no longer advertises upstream ECC as the package identity.
- Root-level stale task artifacts are removed or intentionally retained with explanation.
- Delete candidates are checked with `rg` before removal.
- `npm test` passes after cleanup, or any skipped/changed test scope is explicitly justified.
- Final diff separates identity cleanup from risky pruning where possible.

## Touched Files

- `README.md`
- `package.json`
- `package-lock.json`
- `commands/skill-create.md`
- optional after reference check: `.claude-plugin/plugin.json`
- optional: `llms.txt`
- optional after content and reference check: `install.sh`
- optional: `pipeline-runner-v0-review-summary.md`
- optional: `pipeline-runner-v0-verification-summary.md`
- optional: selected `agents/`, `rules/`, or docs after dependency checks
- `plan/harness-repo-cleanup/research.md`
- `plan/harness-repo-cleanup/plan.md`
- `plan/harness-repo-cleanup/verification-summary.md`
- `plan/harness-repo-cleanup/review-summary.md`

## Interface Expectations

- A new device should still be able to clone the repo into `~/.claude`, install dependencies, and run verification.
- Existing Claude Code hooks in `settings.json` should continue resolving their referenced scripts.
- Existing local commands should continue validating unless intentionally removed.

## Rollback

- Revert individual file deletions if `npm test` or reference checks show they are still needed.
- Keep README/package rewrite in a separate commit from pruning if pruning becomes broad.
- If cleanup accidentally removes required hook files, restore them before commit.

## Risks

- Tests and validators assume certain files exist.
- Hook settings reference skill/script paths that may look optional but are runtime-critical.
- `package.json` can be rewritten, but scripts and dev dependencies are still used for validation.
- Removing too many docs at once can make future harness operation harder.

## Behavior Spec

### Scenarios

- Given a person opens the repo on GitHub
  When they read the root README
  Then they should understand it is a private Claude Code harness sync repo, not the upstream ECC public project.

- Given the repo is cloned on another Mac
  When `npm install` and `npm test` are run
  Then the harness verification should pass.

- Given a file is proposed for deletion
  When reference checks are run
  Then any local references should be reviewed before deletion.

### Normal / Boundary / Abnormal Cases

- normal: rewrite identity docs and metadata.
- boundary: delete obviously unrelated docs only after reference checks.
- abnormal: deletion breaks hooks, tests, or command validation.

## Phases

- Phase 1: Identity cleanup
  - Rewrite `README.md`.
  - Rewrite `package.json` metadata with `"private": true`.
  - Keep npm scripts and dev dependencies.
  - Check references before deciding whether to rename `.claude-plugin/plugin.json`.

- Phase 2: Safe prune research
  - Check references for `llms.txt`, `install.sh`, root pipeline summary artifacts, selected agents, selected rules, and broad docs.
  - Classify each as keep/delete/defer.
  - Treat first-pass low-risk deletion as limited to `llms.txt` and root `pipeline-runner-v0-*.md` unless research proves more.

- Phase 3: Prune only low-risk files
  - Remove files with no local references and low harness value.
  - Avoid deleting hook/script/test dependencies in this pass.

- Phase 4: Verification and review
  - Run safety checks.
  - Run `npm test`.
  - Record verification and review summaries.

- Phase 5: Commit/push decision
  - Treat `120c03d` as already pushed.
  - Commit only approved scope.
  - Push only after explicit approval.

## Stop Conditions

- A proposed deletion has unresolved references.
- `npm test` fails unexpectedly.
- Cleanup scope expands beyond README/package/low-risk prune without approval.
- User has not approved commit or push.

## Source Of Truth

- `plan/harness-repo-cleanup/plan.md` tracks approved intent for this cleanup task.
- `plan/harness-repo-cleanup/research.md` tracks file-surface research.
- `plan/harness-repo-cleanup/verification-summary.md` will track command evidence.
- `plan/harness-repo-cleanup/review-summary.md` will track findings and residual risks.

## Verify

- status:
  - `git status --short --branch`
- references:
  - `rg -n "<candidate-path-or-name>" . --glob '!node_modules/**'`
- safety:
  - `git ls-files | rg '(^|/)(telemetry|sessions|session-env|tasks|todos|projects|file-history|cache|backups|plugins)(/|$)|policy-limits\.json|session-aliases\.json|stats-cache\.json|history\.jsonl|\.env|\.pem|\.key|\.db$'`
  - `node scripts/ci/validate-no-personal-paths.js`
- full:
  - `npm test`

## Test Evidence Plan

### TDD / Unit

- RED command: not required for README/package metadata cleanup.
- expected failure: n/a
- GREEN command: `npm test`
- refactor check: `npm test`

### Integration

- path: repository root
- command: `npm test`
- expected result: pass

## Evaluate

- README matches private harness purpose.
- package metadata no longer points at upstream ECC identity.
- delete candidates are either removed with evidence or deferred.
- residual risks are explicit.

## Observe

- required: no
- critical journey: no runtime behavior change expected.
- command: n/a
- evidence artifact: n/a
- logs / screenshots / traces / metrics: n/a

## Execution Todo

- [x] Approve this plan.
- [x] Confirm `120c03d` is already pushed.
- [x] Rewrite `README.md`.
- [x] Rewrite `package.json` metadata with private harness identity.
- [x] Remove leftover upstream identity footer from `commands/skill-create.md`.
- [x] Check references for `.claude-plugin/plugin.json`.
- [x] Check contents and references for `install.sh`.
- [x] Check references for delete candidates.
- [x] Remove only approved low-risk files.
- [x] Run safety checks.
- [x] Run `npm test`.
- [x] Record verification and review summaries.
- [ ] Ask for explicit commit/push approval.

## Current Decision

- Keep `install.sh` because it is still referenced by `rules/README.md`, `commands/sync-global.md`, `package.json`, and `knip.json`.
- Keep `.claude-plugin/plugin.json` unchanged in this pass because tests validate its shape and it may remain useful as a plugin manifest.
- Delete only first-pass low-risk files:
  - `llms.txt`
  - `pipeline-runner-v0-review-summary.md`
  - `pipeline-runner-v0-verification-summary.md`
