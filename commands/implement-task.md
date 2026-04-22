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
3. Initialize or update `progress.md` from `~/.claude/templates/progress-template.md`, but treat the SQLite memory plane as the runtime source of truth.
4. Refine the behavior spec before editing implementation code:
   - normal
   - boundary
   - abnormal
   - Given / When / Then
5. Implement in strict small batches using RED -> GREEN -> REFACTOR:
   - pick exactly one approved plan checkbox or one small related batch
   - write or update the failing test first
   - run the RED command and confirm it fails for the expected reason
   - implement the minimum code needed to pass
   - run the GREEN command and confirm pass
   - refactor only while tests stay green
   - update the plan checklist and `progress.md` before moving to the next batch
6. Record rerunnable command evidence in `verification-summary.md`; keep runtime/browser/log evidence in `observation-summary.md`.
7. Stop and return to planning when the plan is unclear, RED does not fail as expected, GREEN repeatedly fails, or implementation scope drifts.
8. Write or update `review-summary.md` so unresolved findings and residual risks are explicit.
9. Run the acceptance gate represented by `/eval`.
10. If `observe_required: true`, write `observation-summary.md` with concrete evidence sources.
11. Before commit, update `progress.md` so `Blockers` and `Next Action` are `none` unless follow-up work remains intentionally open.
12. Keep automatic adaptation limited to low-risk tactics such as resume hints, prechecks, and verification ordering. Never auto-relax governance or approval gates.

## Hard guardrails

- Do not start without approved `plan.md`.
- Do not drift from the plan without returning to planning.
- Do not skip review, tests, verify, eval, or observe.
- Do not batch unrelated changes together.
- Do not implement before seeing a meaningful RED failure for behavior-changing code.
- Do not treat a passing GREEN command as acceptance; it still feeds review, verify, eval, and observe.

## Next Handoff

- After each meaningful batch, run `/review-task` when plan compliance, code quality, or test adequacy needs a checkpoint.
- After implementation batches are complete, run `/review-task`, then `/verify`.
- If build/type/test failures appear, use `/build-fix` with root-cause evidence.
- If review feedback arrives, handle it with `/receive-review`.
