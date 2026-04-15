---
description: Run the research phase before planning. Inspect existing code deeply, compare options, surface risks, and write a persistent research artifact.
---

# Research Task

Use this command for the `Research` phase of the coding lifecycle.

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
