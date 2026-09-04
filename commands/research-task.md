---
description: Persistent research artifact for when durable context is needed before planning.
---

# Research Task

Use this command when durable local research is needed before pipeline planning, or when the repository needs a persistent research artifact.

`/research-task` is the artifact-producing research path and `/research` is the conversational one. Neither is required for trivial work.

## Required behavior

1. Clarify the task briefly.
2. Read the existing code deeply.
3. Find similar implementations and adjacent flows.
4. Compare relevant libraries or patterns if needed.
5. Write one persistent artifact:
   - `research.md`, or
   - `{task}_research.md`
6. Follow the structure in `~/.claude/templates/research-template.md`.
7. Write artifact body text in Japanese by default while preserving canonical template headings and exact technical identifiers.
8. Stop after research. Do not implement code.

## Hard guardrails

- Do not skip directly to planning.
- Do not keep output only in chat.
- Do not make architecture commitments that belong in the design doc.
- If research is shallow, continue until a planner can work from the file alone.

## Relationship To `/research`

- `/research` is the conversational research entrypoint.
- `/research-task` writes the repository artifact and should be used when the research needs to persist.
- Keep both commands focused on the same question set and scope boundaries.
