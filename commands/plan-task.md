---
description: Turn research into an implementation-ready plan.md. Use a plan file with explicit approval state and stop before code changes.
---

# Plan Task

Use this command for the `Plan` and `Confirm` phases of the coding lifecycle.

`/plan-task` is the artifact-producing planning path. It is the primary command when the repository needs a durable `plan.md`.

## Required behavior

1. Read `research.md` or `{task}_research.md`.
2. Produce `plan.md` using `~/.claude/templates/plan-template.md`.
3. Keep `status: draft` until the human explicitly approves.
4. Include non-goals, touched files, interface expectations, rollback, verify steps, observe steps, and an execution todo list.
5. Use explicit annotation states:
   - `draft`
   - `needs_annotation`
   - `revised`
   - `approved`
6. For non-trivial work that will span implementation, prepare `progress.md` as a human-readable projection and assume runtime state will also persist into the SQLite memory plane.
7. Stop and wait for explicit confirmation.

## Hard guardrails

- Do not write implementation code.
- Do not continue if research is missing for a non-trivial task.
- Do not leave plan steps vague.
- Do not omit verify or observe.
- Do not treat `progress.md` as the only durable execution state.

## Relationship To `/plan`

- `/plan` is the conversational planning entrypoint.
- `/plan-task` writes the repository artifact and should be used when the plan needs to survive beyond chat.
- Keep both commands aligned on the same scope and acceptance criteria.

## Next Handoff

- If `status: draft`, stop for human approval.
- After approval, use `/worktree-start` for non-trivial or worktree-required implementation.
- If no worktree is required, continue with `/implement-task`.
