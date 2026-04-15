# Session Model

Use this file as the canonical definition of session state for the personal harness.

## Core Rule

`context != session`

- context window is disposable
- compact summaries are secondary
- repository task artifacts hold the durable state

## Source Of Truth Order

When resuming work, read state in this order:

1. `plan.md` for approved intent
2. `progress.md` for current execution state
3. `review-summary.md` for findings and residual risks
4. `verification-summary.md` and `observation-summary.md` for completion evidence
5. session temp files only as fallback continuity

## Durable Session State

`progress.md` is the durable session log for interrupted or multi-session work.

Minimum required sections:

- `## Current Phase`
- `## Last Completed Step`
- `## Next Action`
- `## Blockers`
- `## Delegated Work`

Machine-managed sections:

- `## Latest Checkpoint`
- `## Latest Delegated Handoff`

If a section has no active items, write `- none`.

Operator-owned fields:

- `Current Phase`
- `Last Completed Step`
- `Next Action`
- `Blockers`
- `Delegated Work`

Hook-managed fields:

- `Latest Checkpoint`
- `Latest Delegated Handoff`

Hooks may update only the machine-managed sections. They must not overwrite the operator-owned fields.

Commit-ready convention:

- set `Blockers` to `- none`
- set `Next Action` to `- none` when the task is ready to commit without immediate follow-up

## Checkpoint Semantics

- `SessionStart` restores from repository artifacts before transcript-style summaries
- `PreCompact` must preserve the current session checkpoint before context is summarized
- `SubagentStop` must leave a handoff that a parent agent can act on without rereading full chat history
- lifecycle guardrails may use machine-managed checkpoint state as fallback continuity when operator-owned fields are blank

## Delegation Contract

Subagent handoffs should preserve at least:

- `agent`
- `status`
- `goal`
- `result`
- `files_touched`
- `verification_run`
- `open_risks`
- `next_action`

## Stale-Assumption Review

Treat these as revisitable harness assumptions:

- compaction behavior still preserves the right state
- restore order still prefers the right artifacts
- delegated handoff schema is still sufficient
- permission heuristics still match actual risk

When one of these assumptions changes, update docs and smoke coverage together.
