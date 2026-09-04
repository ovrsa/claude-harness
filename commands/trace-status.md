---
name: trace-status
description: Summarize the local JSON harness logs and report recent run metrics without making promotion decisions.
command: true
---

# Trace Status

Use this command to inspect what the harness has actually recorded. Two sources, both JSON:

- `runs/<date>-<slug>/` — which gates left evidence, resume outcomes, task↔session↔branch
- `projects/**/*.jsonl` — Claude Code's own transcripts: token usage, human turns, tool failures

`node scripts/trace-status.js`

## Required behavior

1. Read the run records and the transcripts if they exist.
2. Summarize:
   - total run records, and how many left verification / review / observation evidence
   - resume success rate over the sessions that had state to restore
   - review findings per review that ran
   - token totals by model
   - recent runs with gate presence and completeness
3. Keep the output status-first and concise.
4. If useful, relate findings to current `health-status` or `triage-loop` work.

## Hard guardrails

- do not auto-promote findings into docs, commands, hooks, or skills
- do not treat missing logs as task failure
- do not replace artifact-based review with these summaries
- **report a null rate rather than 0 when nothing was measured.** 0% reads as a broken subsystem;
  "nothing was asked of it" is a different statement

## What this used to read, and why it changed

Until 2026-08-20 this command read `~/.claude/telemetry/telemetry.db`. The store was retired
because every table had become write-only, and four of its KPIs were structurally constant:

| KPI | why it was dropped |
|---|---|
| `counts_by_status` | `computeFinalStatus` returns `blocked_before_plan` whenever `planStatus` is `missing`, which it always is since `plan.md` was retired on 2026-08-17 |
| `time_to_plan_approval_minutes` | needs `plan.md` |
| `token_data_coverage_rate` | all 3,113 `token_usage_observed` rows carried `input_tokens=null`, so coverage was 0% for the metric's whole life. The transcripts hold the real numbers |
| `estimated_cost_usd` | needs a unit-price table, which would be a maintained value in the harness |

The archive of the retired store is at `runs/_archive/telemetry-sqlite-2026-08-20.json`.
See `docs/design/2026-08-20-retire-sqlite.md` for the measurements.
