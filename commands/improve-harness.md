---
name: improve-harness
description: Review current harness candidates and propose the next 1-3 durable improvements without auto-promoting changes.
command: true
---

# Improve Harness

Use this command when the operator explicitly wants the harness to improve itself.

## Required behavior

1. **Read raw evidence before any summary.** Summaries are a starting index, not the input.
   - `node harness/scripts/runs-cli.js list` — which task runs exist
   - `node harness/scripts/runs-cli.js show <run-id>` — the gate evidence bodies, verbatim
   - `node harness/scripts/runs-cli.js trace <run-id>` — the raw JSONL transcript for that run
   - grep the transcript directly for the failure being diagnosed
2. Use `health-status` and `triage-loop` outputs only to decide **where to look**. Do not let a
   summary stand in for the trace it summarizes. If a candidate cannot be traced back to raw
   evidence, say so rather than acting on the summary alone.
3. Select at most `1-3` improvements worth acting on now.
4. Recommend the narrowest durable destination for each selected item:
   - `docs`
   - `command`
   - `hook`
   - `skill`
5. Explain briefly why each selected destination is narrower or safer than the stronger alternatives.
6. If useful for continuity, write or update `health-summary.md` and `triage-summary.md` before presenting the recommendation.
7. Keep the output focused on actionable next improvements rather than exhaustive candidate review.
8. Distinguish artifact-derived candidates from telemetry-derived candidates when that provenance materially affects the recommendation.
9. For the top recommendation, draft the next implementation task shape:
   - target files
   - recommended promotion layer
   - expected validator or test
   - rollback condition
10. Prefer exactly one implementation-ready next task when one candidate is clearly highest leverage.

## Why raw evidence, not summaries

Meta-Harness (arXiv 2603.28052) measured this directly. Given the same budget, a proposer that
sees raw execution traces reached 50.0 median accuracy; scores-only reached 34.6 and
scores-plus-LLM-summary reached 34.9 — **worse than its own best candidate under scores-only**.
Summaries do not recover the missing signal and can compress away the detail that identifies the
cause. Until 2026-08-18 this command read only the summary layer.

## Hard guardrails

- **do not diagnose from summaries alone.** Name the run id and the trace you read
- do not auto-promote changes from this command
- do not directly edit hooks, skills, or core policy files unless the operator explicitly asks for implementation after reviewing the recommendation
- prefer `docs` or `command` when confidence is not yet high
- skip one-off or stale items unless the severity clearly justifies immediate action
- do not recommend more than one hook or skill promotion in the same improvement pass
