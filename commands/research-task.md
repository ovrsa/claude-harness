---
description: Local fallback for persistent research artifacts when durable context is needed before Superpowers planning.
---

# Research Task

Use this command when durable local research is needed before pipeline planning, or when the repository needs a persistent research artifact.

`/research-task` is the local artifact-producing research path. It is not required for trivial tasks and should not be used as a competing default when Superpowers can gather enough context for planning.

## Required behavior

1. Clarify the task briefly.
2. Read the existing code deeply.
3. Find similar implementations and adjacent flows.
4. Compare relevant libraries or patterns if needed.
5. Write one persistent artifact:
   - `research.md`, or
   - `{task}_research.md`
6. Follow the structure in `~/.claude/templates/research-template.md`.
7. Stop after research. Do not implement code.

## Hard guardrails

- Do not skip directly to planning.
- Do not keep output only in chat.
- Do not make architecture commitments that belong in `plan.md`.
- If research is shallow, continue until a planner can work from the file alone.

## Relationship To `/research`

- `/research` is the conversational research entrypoint.
- `/research-task` writes the repository artifact and should be used when the research needs to persist.
- Keep both commands focused on the same question set and scope boundaries.
