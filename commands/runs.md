---
name: runs
description: Inspect the JSON run records under runs/ - gate evidence bodies, lifecycle events, and the transcripts they resolve to.
command: true
---

# Runs

Use this command to read what actually happened on a past task.

`runs/<YYYY-MM-DD>-<slug>/` holds the durable record. The slug matches
`docs/design/YYYY-MM-DD-<slug>.md`, so the decision and the evidence share a name.

## Required behavior

1. Run `node scripts/runs-cli.js list` to see the run records, newest first.
2. For a specific run, use the subcommand that answers the question:
   - `show <run-id>` — gate evidence bodies, printed verbatim
   - `show <run-id> --json` — the same record, machine-readable
   - `diff <run-a> <run-b>` — which gates and evidence differ
   - `trace <run-id>` — the raw JSONL transcript paths for that run's sessions: Claude Code's
     `projects/`, and Codex's `sessions/` and `archived_sessions/` matched by session_meta.
     It lists the model at each line where it changed, and exits 2 when the run is unlinked,
     missing or only partly resolved
3. When diagnosing a failure, read the trace, not just the evidence summary.
4. Report the run id alongside any conclusion so it can be re-checked.

## What is and is not here

- **Is**: gate evidence bodies (`verification` / `review` / `observation`), the branch,
  the session ids, which gates fired and when
- **Is not**: the raw tool calls. Those stay in the runtimes' own logs (`projects/**/*.jsonl`,
  Codex rollouts) and are never copied. `trace` resolves a run to them
- **Is not**: anything before 2026-08-18. Earlier evidence was written into worktrees
  that were then removed

## Hard guardrails

- do not summarize evidence bodies when the question is why something failed
- do not treat a missing transcript as a missing run. Transcript retention belongs to
  Claude Code, so an older run can legitimately have no trace left
- do not edit files under `runs/`. It is an append-only record of what happened
