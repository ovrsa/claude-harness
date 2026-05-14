# `/next-action`

Operator-facing status surface for answering what to do next in the current harness workspace.

## Usage

```bash
node ~/.claude/scripts/harness-status.js
```

JSON output for automation:

```bash
node ~/.claude/scripts/harness-status.js --format json
```

## Reads

- git branch, working tree, latest commit, and remote presence
- lifecycle artifacts: `research.md`, `plan.md`, `progress.md`, `review-summary.md`, `verification-summary.md`, `observation-summary.md`
- latest pipeline evidence under `~/.claude/runs`
- task queue state under `~/.claude/tasks/index.json`
- optional runtime checkpoint state from telemetry SQLite when available

## Recommendation Priority

1. Dirty working tree: review, verify, then commit or continue active edits.
2. Lifecycle blocker: resolve the narrowest open lifecycle gate.
3. Blocked or running task queue item: inspect/recover before starting new work.
4. Clean and verified lifecycle: continue from the current `progress.md` next action.
5. Missing remote or missing pipeline evidence: report as secondary action unless it blocks the current work.

## Output Contract

Text output starts with:

```text
HARNESS STATUS: READY | NEEDS_ACTION | BLOCKED
```

The status then groups repo, lifecycle, pipeline, task queue, recommended next action, and secondary actions.
