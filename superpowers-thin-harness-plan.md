---
title: Superpowers primary engine with thin .claude harness
status: approved
task_type: non_trivial
worktree_required: false
observe_required: false
review_required: true
---

# Plan: Superpowers primary engine with thin `.claude` harness

## Summary

- Move to option C: Superpowers becomes the default planning/execution/review/finish engine.
- `~/.claude` becomes a thin governance, telemetry, permission, session-continuity, and improvement layer.
- Preserve the long-term SpeakerDeck target: deterministic + agentic hybrid pipeline with logging, evals, and reduced human intervention.
- Do this in phases so the current harness remains usable and rollback is simple.

## Non-Goals

- Do not delete the existing harness in this pass.
- Do not build the full Claude Agent SDK + TypeScript runner immediately.
- Do not remove SQLite telemetry.
- Do not make Superpowers the unobservable source of truth for permissions, telemetry, or human approval.
- Do not require heavy review/verify/observe artifacts for every trivial task.

## Acceptance Criteria

- The local lifecycle docs clearly state:
  - Superpowers is the default development engine.
  - `.claude` is the thin control/memory layer.
  - Superpowers owns plan/execution/review/finish mechanics by default.
  - `.claude` owns telemetry, permissions, runtime bridge, guardrail candidates, and periodic improvement.
- Local command docs stop competing with Superpowers for the same planning/execution responsibility.
- `/execute-plan` is repositioned as a wrapper/adapter around Superpowers execution, not a parallel home-grown runner.
- `software-licecycle.md` reflects the new model.
- A pilot measurement plan exists for comparing token cost, human interventions, failures, and acceptance quality.

## Touched Files

- `CLAUDE.md`
- `OPERATING_MODEL.md`
- `HARNESS.md`
- `commands/COMMANDS.md`
- `commands/execute-plan.md`
- `commands/implement-task.md`
- `docs/superpowers-adoption.md`
- `docs/codex-operations-runbook.md`
- `/Users/kyo/Documents/obsidian-development/software-licecycle.md`
- `superpowers-thin-harness-pilot-report.md`

## Interface Expectations

- Human provides task, issue, spec, or annotation.
- Agent selects a track:
  - trivial
  - standard
  - heavy/risky
- Standard/heavy tasks use Superpowers planning/execution by default.
- `.claude` starts session tracing and applies permission boundaries.
- SQLite receives session/run telemetry.
- Guardrail candidates are captured only when a reusable or recurring pattern appears.
- Heavy evidence artifacts are created only when the track requires them.

## Proposed Target Flow

```text
Human / Trigger
  -> task, issue, spec, annotation, product input

Thin .claude Preflight
  -> session start tracing
  -> repo-local AGENTS.md routing
  -> permission class
  -> track selection

Superpowers Engine
  -> brainstorming when requirements are unclear
  -> writing-plans for standard/heavy work
  -> using-git-worktrees when needed
  -> subagent-driven-development when available
  -> test-driven-development
  -> requesting-code-review / receiving-code-review
  -> verification-before-completion
  -> finishing-a-development-branch

Thin .claude Postflight
  -> session end tracing
  -> metrics capture
  -> guardrail candidate capture when warranted
  -> health / triage / improve-harness on explicit request
```

## Phase 1: Clarify Authority Boundary

- Rewrite `docs/superpowers-adoption.md` around the C model:
  - Superpowers = development engine
  - `.claude` = governance/memory/telemetry layer
- Update `CLAUDE.md` so the always-loaded rule is short and does not duplicate Superpowers process.
- Update `HARNESS.md` and `OPERATING_MODEL.md` so execution modes no longer imply local commands are the default engine.

## Phase 2: Reposition Local Commands

- Update `/execute-plan`:
  - make it a wrapper contract that invokes Superpowers `executing-plans` or `subagent-driven-development` semantics
  - keep local stop conditions for permission, scope, and telemetry
- Update `/implement-task`:
  - mark as fallback/manual mode, not the preferred path
- Update `/plan-task`:
  - mark as local fallback or compatibility path
  - prefer Superpowers `writing-plans` for implementation planning when available
- Update `commands/COMMANDS.md`:
  - default standard path should name Superpowers first, `.claude` control second

## Phase 3: Simplify Gate Weight By Track

- Define track-based requirements:
  - trivial: context check + verify
  - standard: Superpowers plan/execution + verification + lightweight acceptance summary
  - heavy/risky: explicit approval, worktree, review, verify, observe if behavior changed, residual risk acceptance
- Clarify:
  - evaluate is conceptually required but can be lightweight
  - observe is conditional
  - post-commit capture is conditional
  - SQLite periodic review handles trend learning, not immediate correctness

## Phase 4: Update Obsidian Lifecycle

- Update `/Users/kyo/Documents/obsidian-development/software-licecycle.md`:
  - replace "current `.claude` based lifecycle" with "Superpowers primary + thin `.claude` control layer"
  - change Phase 3 from `Implement` to `Execute`
  - show Superpowers as the owner of plan/execution mechanics
  - show `.claude` as telemetry/permission/improvement layer
  - clarify 6-9 are track-dependent, not uniformly heavy

## Phase 5: Pilot Measurement

- Run 3 comparable tasks through:
  - A: current `.claude` lifecycle
  - B: Superpowers-only
  - C: Superpowers + thin `.claude`
- Capture:
  - total tokens
  - wall-clock time
  - human intervention count
  - verification failures
  - review findings
  - rework count
  - acceptance quality
  - resume quality
- Store pilot summaries in SQLite and the human-readable pilot report at `superpowers-thin-harness-pilot-report.md`.

## Phase 6: SpeakerDeck-Style Pipeline Design

- After the C pilot, design a pipeline runner:
  - deterministic preflight
  - Superpowers planning/execution
  - deterministic verification
  - cross-model review
  - browser/screenshot evidence when needed
  - PR-ready output
  - log export for eval/analysis
- Start as a local command/script before moving to Claude Agent SDK + TypeScript.

## Stop Conditions

- Superpowers is not installed or not callable in the target runtime.
- Local hooks block Superpowers execution in a way that cannot be safely scoped.
- The updated docs create conflicting default paths.
- Token usage increases without reducing human intervention or rework.
- SQLite telemetry cannot capture enough run metadata to evaluate the pilot.

## Rollback

- Restore from `/Users/kyo/Desktop/claude-backups/claude-20260423-211929`.
- Revert docs/commands to the previous model where `.claude` owns lifecycle and Superpowers is only implementation discipline.

## Verify

- Documentation consistency:
  - search for old claims that Superpowers is only TDD discipline
  - search for local commands still described as preferred default over Superpowers
- Command map consistency:
  - `commands/COMMANDS.md` names one default path
  - fallback paths are clearly marked
- Backup exists:
  - `/Users/kyo/Desktop/claude-backups/claude-20260423-211929`

## Observe

- Not required for this planning pass.
- Required later when a real pipeline runner changes runtime behavior.

## Execution Todo

- [x] Approve or revise this plan.
- [x] Confirm whether Superpowers should be installed as plugin on every device or referenced externally.
- [x] Update `docs/superpowers-adoption.md`.
- [x] Update core lifecycle docs.
- [x] Reposition local commands as wrappers/fallbacks.
- [x] Update Obsidian lifecycle note.
- [x] Define pilot metrics and reporting location.
- [x] Run pilot tasks before building a TypeScript runner.
- [x] Add token coverage telemetry before building a runner.
- [x] Document verification scope by task track.
