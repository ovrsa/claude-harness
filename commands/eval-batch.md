---
name: eval-batch
description: Generate a weekly evaluation report from the local JSON logs. Periodic batch input for /improve-harness; promotion stays human-directed.
command: true
---

# Eval Batch (Weekly)

`/eval-batch` runs the local JSON logs through aggregation and emits a weekly snapshot to `telemetry/eval-weekly-<ISO-week>.json` plus a human-readable Markdown sibling.

Two sources, both JSON:

- Claude Code's own transcripts (`~/.claude/projects/**/*.jsonl`) — tool failures, token usage, human turn counts
- the run records (`harness/data/runs/<date>-<slug>/`) — which gates left evidence, and what review found

The output is the canonical periodic input for `/improve-harness`. It does not replace ad-hoc candidate review — it anchors prioritization on a fixed cadence so that recurring failures get summarized into next-task candidates.

## When to use

- Weekly cadence (manually, or via `/loop 7d /eval-batch`, or scheduled via `/schedule`).
- Before running `/improve-harness` if the last eval-weekly file is older than ~7 days.
- After a noticeable failure cluster, even mid-week, to confirm whether the pattern is recurring.

This is **not** a per-task gate. Verification still belongs to `/verify`; acceptance still belongs to `/eval` and `/review-task`. `/eval-batch` summarizes the harness itself, not individual deliverables.

## Required behavior

1. Run `node harness/scripts/eval-batch.js [--week <ISO-week>] [--output-dir <path>] [--transcript-dir <path>] [--runs-dir <path>]`.
2. Default output directory is `telemetry/` under the active repo root.
3. Defaults read `~/.claude/projects` and the run store resolved by `harness/scripts/lib/run-record.js`.
4. Read the resulting JSON and Markdown, summarize the top movers in chat, and offer to feed them into `/improve-harness`.

## Output structure (JSON)

```json
{
  "week": "<ISO-week>",
  "generatedAt": "<ISO-timestamp>",
  "window": { "start": "<ISO>", "end": "<ISO>" },
  "previousWindow": { "start": "<ISO>", "end": "<ISO>" },
  "gateCoverage": {
    "current": {
      "harness/data/runs": [ { "runId": "...", "verification": true, "verificationComplete": true, "review": true, "observation": false } ],
      "totals": { "harness/data/runs": <n>, "verification": <n>, "review": <n>, "observation": <n> }
    },
    "previous": { ... }
  },
  "findingsHistogram": {
    "current": { "histogram": { "<severity>": <n> }, "total": <n>, "reviewsRead": <n> },
    "previous": { ... }
  },
  "toolFailureRate": {
    "byTool": { "<tool>": { "total": <n>, "ok": <n>, "failed": <n>, "pending": <n>, "failureRate": 0..1 } },
    "ranked": [ ... sorted by failureRate desc, then total desc ... ]
  },
  "tokenUsage": {
    "totals": { "records": <n>, "input_tokens": <n>, "output_tokens": <n>, "cache_read_input_tokens": <n>, "cache_creation_input_tokens": <n> },
    "byModel": { "<model>": { ... } },
    "ranked": [ ... sorted by output_tokens desc ... ]
  },
  "highTurnSessions": [ { "sessionId": "...", "turns": <n>, "commands": <n>, "projectSlug": "..." } ]
}
```

Three keys were removed on 2026-08-20 rather than reimplemented; see `docs/design/2026-08-20-json-readers-and-dead-metrics.md` for the measurements:

- `successRate` — `final_status='completed_clean'` became unreachable when `plan.md` was retired. `gateCoverage` measures whether the lifecycle produced evidence, which is what the gates are for.
- `pipelineEvents` — `pipeline_*` was never recorded once.
- `highInterventionRuns` — replaced by `highTurnSessions`, which excludes the harness-injected turns the old count included.

`tokenUsage` carries no cost estimate. Unit prices change, so a price table would be a maintained value in the harness.

## Hard guardrails

- this command does not auto-promote candidates
- this command does not modify hooks, skills, or core policy files
- `/eval-batch` is read-only against the transcripts and the run records
- an absent transcript directory or run store produces an empty report, not an error: nothing it reads is a required dependency
