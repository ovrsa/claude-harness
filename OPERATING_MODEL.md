# Operating Model

This file is the fastest end-to-end summary of how the local `~/.claude` control layer operates today.

Use it to reload the loop quickly. Use `HARNESS.md`, `OBSERVE.md`, and `AUTONOMY_POLICY.md` for deeper policy details.

When the question is about rollout order rather than lifecycle semantics, use `IMPLEMENTATION_ROADMAP.md`.

## Lifecycle Loop

The default development loop is:

1. intake and track selection
2. thin `.claude` preflight: session tracing, repo routing, permission class
3. pipeline-guided planning/execution for standard and heavy-risky work
4. deterministic verification
5. lightweight acceptance evaluation
6. observation only when behavior changed
7. commit/PR/deploy only with explicit authorization
8. thin `.claude` postflight: telemetry, guardrail candidates, and post-commit capture when warranted
9. health / triage / improve-harness on explicit improvement requests

This keeps the local layer focused on observability, permission boundaries, continuity, and recurring-failure improvement while selected adapters or discipline packs handle execution mechanics.

## Main Surfaces

### Entrypoints

- `CLAUDE.md`
  - thin global entrypoint
- root `AGENTS.md`
  - thin repo-local map

### Reference Docs

- `HARNESS.md`
  - canonical harness map
- `OBSERVE.md`
  - runtime evidence rules
- `AUTONOMY_POLICY.md`
  - approval and escalation classes
- `SESSION.md`
  - resume and session continuity rules

### Workflow Commands

- `/execute-plan`
- `/research`
- `/plan`
- `/plan-task`
- `/review-task`
- `/verify`
- `/eval`
- `/health-status`
- `/triage-loop`
- `/improve-harness`

### Durable Artifacts

- `research.md` when prior art or explicit options matter
- `plan.md` when explicit local approval is required
- `review-summary.md` when findings or residual risks need durable capture
- `verification-summary.md` when rerunnable evidence should be preserved
- `observation-summary.md` when behavior changed
- `progress.md` for interrupted or multi-session work

Optional promotion-oriented sections can live inside the main artifacts as `Guardrail Candidates`.

## Track Semantics

- `trivial`
  - use the smallest context check and verify the changed surface
  - Superpowers is optional
  - no heavy local artifact chain unless hooks or risk require it

- `standard`
  - use pipeline-guided planning and execution by default
  - capture verification evidence and a lightweight acceptance summary
  - observe only when runtime, UI, or integration behavior changed

- `heavy-risky`
  - require explicit approval before execution
  - use worktree isolation
  - use subagent-driven development when useful
  - require review, verification, residual-risk acceptance, and observation when behavior changed

## Pipeline Primary Spine

The local pipeline is the default spine for standard and heavy-risky development work.

It owns:

- stage order and stop conditions
- track selection enforcement
- preflight and plan gates
- adapter selection
- review/eval, verification, and observation placement
- evidence and handoff summaries

Superpowers remains available as a selectable discipline pack for brainstorming, planning, TDD, review workflow, verification-before-completion, and branch finishing. Local commands such as `/plan-task`, `/implement-task`, `/review-task`, and `/worktree-start` are fallback or compatibility surfaces when manual local control is explicitly wanted.

`.claude` still owns permission boundaries, runtime bridge behavior, SQLite session state, guardrail candidates, and the health/triage improvement loop.

## Feedback Path

The harness does not jump directly from failure to global rule.

The intended path is:

1. capture recurring failures in task artifacts
2. store them as local guardrail candidates
3. summarize them through `health`
4. turn them into next-task recommendations through `triage` or one explicit `/improve-harness` pass
5. promote only the narrowest durable fix that reliably prevents recurrence

Promotion ladder:

- `docs`
- `command`
- `hook`
- `skill`

## Enforced Now

- permission and destructive-action boundaries
- session start/end tracing where supported by the runtime
- `verification-summary.md` before local commit when the local commit gate is active
- `observation-summary.md` when runtime or UI behavior changed and local gates require durable evidence
- candidate capture at lifecycle boundaries

## Not Enforced Yet

- automatic promotion of recurring candidates
- automatic or scheduled improvement runs
- repo-map freshness enforcement
- automatic issue or task creation from triage output
- automatic Superpowers installation/parity checks on every device
- SpeakerDeck-style TypeScript/Claude Agent SDK pipeline runner

These stay visible as backlog items so the harness does not pretend they already exist.

## How To Reload Fast

When resuming work:

1. read repo-local `AGENTS.md`
2. read the current task artifacts
3. use this file to place the task inside the full operating loop
4. jump to `HARNESS.md` or `OBSERVE.md` only when deeper rules are needed
