---
name: improve-harness
description: Review current harness candidates and propose the next 1-3 durable improvements without auto-promoting changes.
command: true
---

# Improve Harness

Use this command when the operator explicitly wants the harness to improve itself.

## Required behavior

1. Read the current grouped health view from the local candidate registry and telemetry-backed health summaries when available.
2. Reuse `health-status` and `triage-loop` outputs when they already exist; otherwise derive the equivalent grouped view directly.
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

## Hard guardrails

- do not auto-promote changes from this command
- do not directly edit hooks, skills, or core policy files unless the operator explicitly asks for implementation after reviewing the recommendation
- prefer `docs` or `command` when confidence is not yet high
- skip one-off or stale items unless the severity clearly justifies immediate action
- do not recommend more than one hook or skill promotion in the same improvement pass
