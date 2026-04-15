# Operating Model

This file is the fastest end-to-end summary of how the local `~/.claude` harness operates today.

Use it to reload the loop quickly. Use `HARNESS.md`, `OBSERVE.md`, and `AUTONOMY_POLICY.md` for deeper policy details.

## Lifecycle Loop

The steady local loop is:

1. `research`
2. `plan`
3. `implement`
4. `review`
5. `verify`
6. `evaluate`
7. `observe` when behavior changed
8. `post-commit capture`
9. `health / triage`
10. promote durable fixes into `docs`, `commands`, `hooks`, or `skills`

This keeps the harness focused on repeatable execution first, then on turning recurring failures into smaller, safer durable changes.

## Main Surfaces

### Entrypoints

- `CLAUDE.md`
  - thin global entrypoint
- root `AGENTS.md`
  - thin repo-local map

### Reference Docs

- `HARNESS.md`
  - canonical harness map
- `OBSERVE.md`
  - runtime evidence rules
- `AUTONOMY_POLICY.md`
  - approval and escalation classes
- `SESSION.md`
  - resume and session continuity rules

### Workflow Commands

- `/research`
- `/plan`
- `/plan-task`
- `/review-task`
- `/verify`
- `/eval`
- `/health-status`
- `/triage-loop`

### Durable Artifacts

- `research.md`
- `plan.md`
- `review-summary.md`
- `verification-summary.md`
- `observation-summary.md` when behavior changed
- `progress.md`

Optional promotion-oriented sections can live inside the main artifacts as `Guardrail Candidates`.

## Gate Semantics

- `review`
  - inspect the change and record unresolved findings
- `verify`
  - prove rerunnable checks passed
- `evaluate`
  - decide whether the change is acceptable to accept
- `observe`
  - record concrete runtime evidence when changed behavior needs more than tests/build output

Implementation and bug-fix work are done only when all required gates for that task are satisfied.

## Feedback Path

The harness does not jump directly from failure to global rule.

The intended path is:

1. capture recurring failures in task artifacts
2. store them as local guardrail candidates
3. summarize them through `health`
4. turn them into next-task recommendations through `triage`
5. promote only the narrowest durable fix that reliably prevents recurrence

Promotion ladder:

- `docs`
- `command`
- `hook`
- `skill`

## Enforced Now

- approved `plan.md` before implementation
- `review-summary.md` must have no unresolved `Findings` before approval-ready state
- `verification-summary.md` before commit
- `observation-summary.md` when runtime or UI behavior changed
- candidate capture at lifecycle boundaries

## Not Enforced Yet

- automatic promotion of recurring candidates
- mandatory periodic `health` or `triage` runs
- repo-map freshness enforcement
- automatic issue or task creation from triage output

These stay visible as backlog items so the harness does not pretend they already exist.

## How To Reload Fast

When resuming work:

1. read repo-local `AGENTS.md`
2. read the current task artifacts
3. use this file to place the task inside the full operating loop
4. jump to `HARNESS.md` or `OBSERVE.md` only when deeper rules are needed
