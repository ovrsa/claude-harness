---
title: Add Superpowers follow-up discipline for debugging, review reception, and handoffs
status: approved
task_type: non_trivial
worktree_required: false
observe_required: false
review_required: true
---

# Plan: Add Superpowers follow-up discipline

## Summary

- Add root-cause-first build/debug recovery.
- Add a dedicated review feedback reception command.
- Add explicit Next Handoff sections to lifecycle commands.
- Keep this as command guidance only; do not add hook-level enforcement.

## Acceptance Criteria

- Build fixes require root cause evidence before edits.
- Review feedback is handled through verify/evaluate/implement-one-item-at-a-time flow.
- Lifecycle commands expose clear next handoff guidance.
- Command surface lists the new review feedback command.

## Verify

- `git diff --check`
- `npm test`
- `npm run lint` when `eslint` is available

## Execution Todo

- [x] Update `commands/build-fix.md`.
- [x] Add `commands/receive-review.md`.
- [x] Add Next Handoff sections to lifecycle commands.
- [x] Update `commands/COMMANDS.md`.
