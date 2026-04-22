# Agent Map

This is the thin cross-runtime entrypoint for `~/.claude`.

The canonical lifecycle source remains [CLAUDE.md](/Users/kyo/.claude/CLAUDE.md:1).
Use that file for the full operating model, artifact chain, and lifecycle rules.

## Runtime Rule

- `~/.claude` is the harness source of truth
- `Codex` is a runtime bridge, not a second lifecycle definition
- do not redefine the lifecycle locally when this directory is the active workspace

## Codex Start / End

When running in `Codex`, execute these commands every session:

Start:

```bash
node ~/.claude/scripts/hooks/runtime-session-start.js
```

End:

```bash
node ~/.claude/scripts/hooks/runtime-session-end.js
```

This gives shared SQLite `session-level` tracing in `~/.claude/telemetry/telemetry.db`.

## Minimum Task Flow

For non-trivial work:

1. create `research.md`
2. create and approve `plan.md`
3. implement only after plan approval
4. record `review-summary.md` and `verification-summary.md`
5. record `observation-summary.md` when behavior changed

## Improvement Rule

- if a recurring failure appears, record it under `Guardrail Candidates`
- do not auto-promote recurring candidates
- run `/improve-harness` only when an explicit improvement pass is requested

## Pointers

- canonical lifecycle: [CLAUDE.md](/Users/kyo/.claude/CLAUDE.md:1)
- operating loop: [OPERATING_MODEL.md](/Users/kyo/.claude/OPERATING_MODEL.md:1)
- harness map: [HARNESS.md](/Users/kyo/.claude/HARNESS.md:1)
- Codex runbook: [docs/codex-operations-runbook.md](/Users/kyo/.claude/docs/codex-operations-runbook.md:1)
- Codex SQLite bridge: [docs/codex-telemetry-bridge.md](/Users/kyo/.claude/docs/codex-telemetry-bridge.md:1)
