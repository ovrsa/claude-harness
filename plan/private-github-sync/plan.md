---
title: Private GitHub Sync For Claude Harness
status: approved
task_type: non_trivial
worktree_required: false
observe_required: false
review_required: true
---

# Plan: Private GitHub Sync For Claude Harness

## Summary

- Prepare `~/.claude` for private GitHub sync across devices.
- Keep the reusable harness control plane tracked.
- Keep runtime state, sessions, telemetry, caches, secrets, and local-only state out of Git.
- Do not push until explicitly approved.

## Non-Goals

- Do not publish this repository publicly.
- Do not commit credentials, tokens, session transcripts, telemetry databases, or local caches.
- Do not rewrite Git history unless a separate secret-history review finds a concrete need and the user approves.
- Do not make cross-OS portability perfect in this pass; macOS-to-macOS private sync is the baseline.

## Acceptance Criteria

- Forbidden runtime/private paths are ignored and not tracked.
- `settings.json` and `mcp-configs/mcp-servers.json` are reviewed for secrets and portability.
- Device migration docs clearly describe private GitHub sync setup.
- A repeatable pre-push verification command exists or is documented.
- Tests pass before any commit or push.
- User explicitly approves commit and push.

## Touched Files

- `.gitignore`
- `docs/device-migration.md`
- optional: `docs/github-sync.md`
- optional: `mcp-configs/mcp-servers.example.json`
- optional: `settings.example.json`
- optional: `scripts/ci/validate-github-sync-safe.js`
- lifecycle artifacts:
  - `plan/private-github-sync/research.md`
  - `plan/private-github-sync/plan.md`
  - `plan/private-github-sync/review-summary.md`
  - `plan/private-github-sync/verification-summary.md`

## Interface Expectations

- A future clone on another private device should support:
  - clone repo into `~/.claude`
  - install dependencies
  - confirm local settings
  - run harness tests
  - start Claude Code or Codex with the same command and hook surface

## Rollback

- Revert doc/script/config changes before commit if the chosen sync model changes.
- If a remote is incorrect, remove or replace it only after user confirmation.
- If any secret is found in tracked files, stop and decide whether to edit, rotate, or rewrite history.

## Risks

- Private repo can later become shared or public; treat credentials as forbidden anyway.
- `settings.json` contains macOS-specific hooks and high-autonomy settings that may not be desirable on every device.
- MCP config placeholders could become live secrets later if the file remains tracked.
- Force-adding ignored directories would leak local state.

## Behavior Spec

### Scenarios

- Given this harness is cloned on a second Mac
  When dependencies are installed and tests are run
  Then the command, hook, rule, template, and script surfaces should be available without copying telemetry or sessions.

- Given a runtime-state directory exists locally
  When pre-push safety checks run
  Then no forbidden runtime path should appear in `git ls-files`.

- Given MCP credentials are needed on a device
  When configuring that device
  Then credentials should be supplied locally rather than committed to the private repo.

### Normal / Boundary / Abnormal Cases

- normal: private GitHub sync for reusable harness source.
- boundary: macOS-specific `settings.json` copied to another Mac.
- abnormal: a token, DB, session transcript, or local project snapshot appears in tracked files.

## Phases

- Phase 1: Safety audit
  - Check tracked files against forbidden runtime paths.
  - Review `settings.json` and MCP config.
  - Search for obvious secret patterns and personal absolute paths.

- Phase 2: Sync documentation and guardrail
  - Update or add docs for private GitHub sync.
  - Add a focused verification script if existing checks are not enough.
  - Decide whether to template MCP/settings files.

- Phase 3: Verification
  - Run the targeted safety check.
  - Run existing harness tests.
  - Record review and verification summaries.

- Phase 4: GitHub setup, only after separate approval
  - Commit approved changes.
  - Push to the private repo.

## Stop Conditions

- A real secret or token is found in tracked files or history.
- User has not approved commit or push.
- Tests fail in a way that affects harness portability.

## Source Of Truth

- `plan/private-github-sync/plan.md` tracks approved intent for this task.
- `~/.claude/telemetry/telemetry.db` tracks runtime execution state for non-trivial or multi-session work.
- `plan/private-github-sync/progress.md` is the human-readable execution view if this task spans sessions.
- `plan/private-github-sync/review-summary.md` tracks acceptance findings and residual risks.
- `plan/private-github-sync/verification-summary.md` tracks reproducible verification evidence.

## Verify

- safety:
  - `git ls-files | rg '(^|/)(telemetry|sessions|session-env|tasks|todos|projects|file-history|cache|backups|plugins)(/|$)|policy-limits\.json|session-aliases\.json|stats-cache\.json|history\.jsonl|\.env|\.pem|\.key|\.db$'`
- existing:
  - `npm test`
  - or `npm run test:core`
- docs:
  - confirm device migration instructions match the chosen private sync model.

## Test Evidence Plan

### TDD / Unit

- RED command: only needed if adding a new safety validator.
- expected failure: validator catches a fixture or known forbidden path pattern.
- GREEN command: validator passes the current repository.
- refactor check: run full test suite.

### Integration

- path: repository root
- command: `npm test` or `npm run test:core`
- expected result: pass

## Evaluate

- review findings resolved: required before push.
- residual risks explicit: required before push.
- acceptance criteria checked: required before push.

## Observe

- required: no
- critical journey: no runtime behavior change in this planning pass.
- command: n/a
- evidence artifact: n/a
- logs / screenshots / traces / metrics: n/a

## Execution Todo

- [x] Approve this plan.
- [x] Run tracked-file forbidden path check.
- [x] Review `settings.json`.
- [x] Review `mcp-configs/mcp-servers.json`.
- [x] Decide whether to template settings and MCP configs.
- [x] Update sync documentation.
- [x] Add or reuse safety verification.
- [x] Run tests.
- [x] Record review and verification summaries.
- [ ] Ask for explicit approval before commit or push.

## Current Decision

- Keep `settings.json` tracked for private macOS-to-macOS sync.
- Keep `mcp-configs/mcp-servers.json` tracked only as a placeholder/template config.
- Do not commit live MCP credentials.
- Do not include unrelated working tree deletions in the GitHub sync commit.
