---
name: health-status
description: Summarize current local harness health from grouped guardrail candidates without making promotion decisions.
command: true
---

# Health Status

Use this command to summarize current local harness health from the local guardrail candidate registry.

## Required behavior

1. Read `~/.claude/.state/guardrail-candidates.jsonl` if it exists.
2. Group repeated candidate patterns by stable candidate key.
3. Summarize the current local harness health by count, recency, and grouped state.
4. Distinguish `new`, `recurring`, `promotion-ready`, `stale`, and `resolved` groups.
5. If useful for continuity, write `health-summary.md` using `~/.claude/templates/health-summary-template.md`.
6. Avoid making promotion decisions; this command is status-first.

## Hard guardrails

- avoid making promotion decisions here
- do not auto-promote candidates into docs, commands, hooks, or skills
- keep the output concise enough to use as a current health snapshot
