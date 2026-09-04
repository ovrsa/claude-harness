---
description: Capture reusable learning after commit or merge. Classify findings into task notes, docs updates, or skill candidates.
---

# Post-Commit Capture

Use this command after commit, PR, or merge.

## Required behavior

1. Review what was learned.
2. Classify each lesson as:
   - task-specific knowledge
   - docs update
   - command follow-up
   - hook follow-up
   - skill candidate
3. For reusable workflow candidates, use `~/.claude/templates/skill-candidate-template.md`.
4. Keep one-off knowledge in task docs or notes.
5. Prefer the narrowest durable destination that would have prevented the failure.
6. Treat captured candidates as feedstock for the later triage and health loop rather than as immediate automatic promotions.

## Hard guardrails

- Do not create a skill for one-off knowledge.
- Do not globalize project-specific workflow.
- Promote to a skill only if it is repeated, stable, and has clear inputs/outputs.
- Do not jump straight to a hook when a docs update or command guide would solve the problem with less noise.
- Do not treat capture alone as proof that a change should be promoted; grouped review happens in the triage loop.
