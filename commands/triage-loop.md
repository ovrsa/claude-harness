---
name: triage-loop
description: Classify grouped candidate patterns and suggest the next follow-up tasks without auto-promoting changes.
command: true
---

# Triage Loop

Use this command after reviewing current health status to decide what follow-up work should happen next.

## Required behavior

1. Read the grouped health view from the current local candidate registry.
2. Review grouped patterns by state, recency, and likely layer.
3. Identify which items should become the next follow-up tasks.
4. Recommend the narrowest durable destination for each selected group.
5. If useful for continuity, write `triage-summary.md` using `~/.claude/templates/triage-summary-template.md`.
6. Keep the output focused on next follow-up tasks.

## Hard guardrails

- avoid auto-promoting changes from this command
- do not treat every captured candidate as a task
- do not mark an item resolved unless the pattern has clearly stopped recurring
