---
description: Execute an approved plan.md with TDD and small batches. Require plan approval and worktree usage for non-trivial tasks.
---

# Implement Task

Use this command for the `TDD Spec`, `Implement Small`, `Review`, `Verify`, `Evaluate`, and `Observe` phases.

## Preconditions

- `plan.md` exists
- `plan.md` has `status: approved`

## Required behavior

1. Read approved `plan.md`.
2. If `task_type: non_trivial` or `worktree_required: true`, use an isolated worktree.
3. Initialize or update `progress.md` from `~/.claude/templates/progress-template.md`.
4. Refine TDD spec:
   - normal
   - boundary
   - abnormal
   - Given / When / Then
5. Implement in small batches using RED -> GREEN -> REFACTOR.
6. Update the Execution Todo checklist and `progress.md` as work completes.
7. Write or update `review-summary.md` so unresolved findings and residual risks are explicit.
8. Write `verification-summary.md` with rerunnable verification evidence.
9. Run the acceptance gate represented by `/eval`.
10. If `observe_required: true`, write `observation-summary.md`.
11. Before commit, update `progress.md` so `Blockers` and `Next Action` are `none` unless follow-up work remains intentionally open.

## Hard guardrails

- Do not start without approved `plan.md`.
- Do not drift from the plan without returning to planning.
- Do not skip review, tests, verify, eval, or observe.
- Do not batch unrelated changes together.
