# Harness Architecture

`~/.claude` is the canonical harness implementation.

Use this file as the authoritative map for how the personal harness is organized.

## Core Model

The harness is split into four layers:

1. **Invariant entry layer**
   - short always-loaded instructions
   - required artifact chain
   - high-level done criteria

2. **Lifecycle enforcement layer**
   - hook-owned hard boundaries
   - edit/commit ordering
   - permission and escalation policy

3. **Artifact and session continuity layer**
   - `research.md`
   - `plan.md`
   - `review-summary.md`
   - `verification-summary.md`
   - `observation-summary.md`
   - `progress.md`
   - `SESSION.md`

4. **Adapter layer**
   - `.codex`, Cursor, and other runtimes consume `.claude`
   - adapters inherit the workflow, not redefine it

## Design Principles

- Plan-first over prompt-first
- Artifact-first over chat-history-first
- Session-first over transcript-first continuity
- Constrained autonomy over unbounded autonomy
- Observe-first completion for behavior changes
- Mechanical enforcement over informal reminders

## Ownership

- `CLAUDE.md`
  Owns the thin invariant entry layer only.
- `hooks/` and `scripts/hooks/`
  Own hard boundaries and lifecycle enforcement.
- `templates/`
  Own artifact structure.
- `commands/`
  Own workflow entrypoints.
- `AUTONOMY_POLICY.md`
  Owns autonomy classes and escalation rules.
- `OBSERVE.md`
  Owns runtime observation requirements.
- `SESSION.md`
  Owns session state, checkpoint semantics, and handoff contracts.

## Required Artifact Chain

For non-trivial work, state must live in repository artifacts:

- `research.md` for prior art, options, constraints, and risks
- `plan.md` for approved execution intent
- `verification-summary.md` for proof of completion
- `review-summary.md` for findings-first review output and residual risks
- `observation-summary.md` when runtime or user-visible behavior changed
- `progress.md` as the durable session log for interrupted or multi-session work

## Canonical Rules

- Do not implement before an approved `plan.md`
- Do not commit before `verification-summary.md`
- Do not treat verification as a substitute for review on behavior-changing work
- Do not treat tests/build alone as sufficient when behavior changed
- Do not use `.codex` or other adapters as a second lifecycle source of truth
- Do not treat compact summaries as the source of truth when `progress.md` exists

## Adapter Rule

`~/.codex` is a bridge.

It may:
- preserve runtime-specific config
- define permissions
- expose imported skills and commands

It must not:
- redefine the lifecycle
- weaken edit/commit gates
- replace the artifact chain with chat-only continuity
