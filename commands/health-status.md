---
name: health-status
description: Summarize current local harness health from grouped guardrail candidates without making promotion decisions.
command: true
---

# Health Status

Use this command to summarize current local harness health from the local guardrail candidate registry and telemetry-derived health candidates when available.

## Required behavior

1. Read `~/.claude/.state/guardrail-candidates.jsonl` if it exists.
2. Merge telemetry-derived health candidates from `~/.claude/telemetry/telemetry.db` when available.
3. Group repeated candidate patterns by stable candidate key.
4. Summarize the current local harness health by count, recency, and grouped state.
5. Distinguish `new`, `recurring`, `promotion-ready`, `stale`, and `resolved` groups.
6. If useful for continuity, write `health-summary.md` using `~/.claude/templates/health-summary-template.md`.
6. Avoid making promotion decisions; this command is status-first.

## Hard guardrails

- avoid making promotion decisions here
- do not auto-promote candidates into docs, commands, hooks, or skills
- keep the output concise enough to use as a current health snapshot
