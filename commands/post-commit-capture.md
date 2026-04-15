---
description: Capture reusable learning after commit or merge. Classify findings into task notes, docs updates, or skill candidates.
---

# Post-Commit Capture

Use this command after commit, PR, or merge.

## Required behavior

1. Review what was learned.
2. Classify each lesson as:
   - task-specific knowledge
   - project documentation update
   - reusable workflow candidate
3. For reusable workflow candidates, use `~/.claude/templates/skill-candidate-template.md`.
4. Keep one-off knowledge in task docs or notes.

## Hard guardrails

- Do not create a skill for one-off knowledge.
- Do not globalize project-specific workflow.
- Promote to a skill only if it is repeated, stable, and has clear inputs/outputs.
