---
name: superpowers-implementation-discipline
description: Apply Superpowers-style implementation discipline inside the local lifecycle: small approved tasks, true RED/GREEN/REFACTOR TDD, evidence-first verification, checkpointed execution, and two-pass review. Use during implementation after plan approval, while keeping ~/.claude as the lifecycle source of truth.
---

# Superpowers Implementation Discipline

Use this skill only inside an approved implementation phase.

`~/.claude` remains the lifecycle source of truth. Superpowers-style practice is used as implementation discipline, not as a replacement for local approval, worktree, review, verify, observe, or commit gates.

## Operating Contract

1. Read the approved `plan.md` and identify the next smallest task.
2. Keep each implementation task small enough to review independently.
3. Do not write behavior-changing implementation code before a failing test or executable check exists.
4. Run the RED command and confirm it fails for the expected reason.
5. Write the minimum implementation needed to pass.
6. Run the GREEN command and record the evidence.
7. Refactor only while tests stay green.
8. Checkpoint after at most three plan tasks.
9. Run two-pass review before acceptance:
   - pass 1: plan/spec compliance and missing acceptance evidence
   - pass 2: code quality, maintainability, security, regressions, and test adequacy
10. Record reusable failure patterns as `Guardrail Candidates`; do not auto-promote them.

## Boundaries

- Do not bypass `plan.md` approval.
- Do not bypass `worktree_required: true`.
- Do not treat Superpowers as the canonical lifecycle.
- Do not dispatch subagents unless the operator explicitly asks and the work is disjoint.
- Do not continue if RED fails for the wrong reason or GREEN repeatedly fails.
- Do not mark completion without `review-summary.md`, `verification-summary.md`, and `observation-summary.md` when required.

## Handoff

When a batch completes, report:

- plan checkbox completed
- files touched
- RED command and result
- GREEN command and result
- review risks
- next checkbox
