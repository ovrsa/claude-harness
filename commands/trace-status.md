---
name: trace-status
description: Summarize the local SQLite harness telemetry store and report recent run metrics without making promotion decisions.
command: true
---

# Trace Status

Use this command to inspect the local `~/.claude/telemetry/telemetry.db` event store.

## Required behavior

1. Read the SQLite telemetry store if it exists.
2. Summarize:
   - total runs
   - run counts by final status
   - initial KPI rollups
   - recent runs with gate presence and intervention counts
3. Keep the output status-first and concise.
4. If useful, relate telemetry findings to current `health-status` or `triage-loop` work.

## Hard guardrails

- do not auto-promote telemetry findings into docs, commands, hooks, or skills
- do not treat missing telemetry as task failure
- do not replace artifact-based review with telemetry summaries
