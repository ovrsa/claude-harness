# Session Resume State

Use this file as the canonical definition of session state for the personal harness.

## Core Rule

`context != session`

- context window is disposable
- compact summaries are secondary
- SQLite-backed runtime state is the primary session source of truth
- repository task artifacts remain the human-readable control surface

## Source Of Truth Order

When resuming work, read state in this order:

1. `telemetry/telemetry.db` `run_state` for current execution state
2. `telemetry/telemetry.db` lifecycle records for verify/review/observe presence
3. `plan.md` for approved intent and strategy
4. `progress.md`, `review-summary.md`, `verification-summary.md`, and `observation-summary.md` as human-readable views
5. session temp files only as fallback continuity

## Durable Session State

`telemetry/telemetry.db` is the durable session state for interrupted or multi-session work.
`progress.md` remains the default human-readable projection.

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
The SQLite runtime state may contain richer structured fields than the Markdown projection exposes.

Commit-ready convention:

- set `Blockers` to `- none`
- set `Next Action` to `- none` when the task is ready to commit without immediate follow-up

## Checkpoint Semantics

- `SessionStart` restores from SQLite runtime state before repository artifacts or transcript-style summaries
- `PreCompact` must preserve the current session checkpoint before context is summarized
- `SubagentStop` must leave a handoff that a parent agent can act on without rereading full chat history
- lifecycle guardrails may use machine-managed checkpoint state as fallback continuity when operator-owned fields are blank

## Runtime Memory Model

The local memory plane stores at least:

- session and lifecycle events
- current `run_state`
- tool execution telemetry
- verification results
- review findings
- project-scoped semantic, episodic, and procedural memory
- tactic candidates and tactic adoptions

Automation may learn and auto-apply low-risk tactics such as resume hints, prechecks, or verification ordering.
Automation must not relax approval, security, sandbox, or architecture governance.

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
