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
4. Include phases, risks, review steps, verify steps, observe steps, and an execution todo list.
5. For non-trivial work that will span implementation, prepare `progress.md` from `~/.claude/templates/progress-template.md`.
6. Stop and wait for explicit confirmation.

## Hard guardrails

- Do not write implementation code.
- Do not continue if research is missing for a non-trivial task.
- Do not leave plan steps vague.
- Do not omit verify or observe.

## Relationship To `/plan`

- `/plan` is the conversational planning entrypoint.
- `/plan-task` writes the repository artifact and should be used when the plan needs to survive beyond chat.
- Keep both commands aligned on the same scope and acceptance criteria.
