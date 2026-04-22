---
title: Adopt Superpowers execution discipline into .claude lifecycle
status: approved
task_type: non_trivial
worktree_required: false
observe_required: false
review_required: true
---

# Plan: Adopt Superpowers execution discipline into `.claude`

## Summary

- Adopt Superpowers-style implementation discipline into existing `.claude` commands and templates without making Superpowers canonical.
- Strengthen plan, implementation, worktree, review, and E2E/observe guidance.
- Keep this as a command/template pass; do not add hook-level enforcement yet.

## Acceptance Criteria

- Non-trivial plans require behavior scenarios and TDD/E2E evidence planning.
- Implementation guidance requires per-batch RED -> GREEN -> REFACTOR evidence.
- Worktree startup guidance includes location discovery, ignore safety, setup, and baseline test checks.
- Review guidance separates plan compliance, code quality, and test adequacy.
- E2E guidance explicitly feeds concrete observation evidence.

## Touched Files

- `templates/plan-template.md`
- `commands/implement-task.md`
- `commands/worktree-start.md`
- `commands/review-task.md`
- `templates/review-summary-template.md`
- `commands/e2e.md`
- `templates/observation-summary-template.md`

## Verify

- `npm test`
- `npm run lint` when dependencies are available

## Execution Todo

- [x] Update plan template with behavior/TDD/E2E evidence sections.
- [x] Update implementation command with strict batch execution contract.
- [x] Update worktree command with safety and baseline checks.
- [x] Update review command/template with explicit review dimensions.
- [x] Update E2E/observation guidance to connect Playwright artifacts to observation evidence.
