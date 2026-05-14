# Superpowers Discipline Boundary

`~/.claude` can use Superpowers as a selected discipline pack when it is installed.

The local pipeline owns the execution spine: stage order, stop conditions, adapter selection, evidence, verification placement, observation placement, and handoff.

Superpowers may provide planning, TDD, review workflow, verification-before-completion, and branch finishing discipline behind that pipeline. It does not own lifecycle policy.

## Division Of Responsibility

### Superpowers Provides When Selected

- brainstorming when requirements are unclear
- writing implementation plans
- executing plans
- subagent-driven development when available
- git worktree setup
- TDD / RED-GREEN-REFACTOR discipline
- code review request and review feedback handling
- verification before completion
- finishing a development branch

### `.claude` Pipeline Owns

- Claude Code / Codex / Cursor adapter rules
- stage order and stop conditions
- adapter selection
- session start/end tracing
- SQLite runtime state and resume hints
- permission and destructive-action boundaries
- repo-local `AGENTS.md` routing
- track selection rules
- guardrail candidate capture
- health / triage / improve-harness loops
- pipeline metrics definition

## Default Track Model

Use the lightest track that preserves correctness.

- `trivial`
  - small docs, comments, typo, or behavior-neutral edits
  - Superpowers optional
  - no heavy research or planning artifact unless hooks require it
  - verify the changed surface

- `standard`
  - normal feature, bug fix, or multi-file change
  - use pipeline-guided planning and execution by default
  - capture telemetry and verification evidence
  - write a lightweight acceptance summary
  - observe only when behavior changed

- `heavy-risky`
  - auth, payment, permissions, data model, broad refactor, UI/backend combined, or rollout-sensitive work
  - require explicit approval before execution
  - use worktree isolation
  - use subagent-driven development when useful
  - require review, verification, residual-risk acceptance, and observation when behavior changed

## Verification Scope Policy

Verification scope is selected by track and recorded as evidence; SQLite telemetry is a measurement surface, not a correctness gate.

- `trivial`: verify the changed surface only. Prefer targeted searches, doc validators, or a directly related unit check over a full suite when later planned work is intentionally red.
- `standard`: run the checks named in the plan plus related tests for the touched surface. Add smoke coverage when the change crosses module or runtime boundaries.
- `heavy-risky`: run the relevant full suite, review/eval evidence, and observation evidence when runtime, UI, integration, permission, data, or rollout behavior changed.

If a verification scope is narrower than the full suite, state why it is track-appropriate in the final report or `verification-summary.md`.

## Default Flow

```text
Human / Trigger
  -> task, issue, spec, annotation, product input

Thin .claude Preflight
  -> session start tracing
  -> repo-local AGENTS.md routing
  -> permission class
  -> track selection

Local Pipeline
  -> selected planning discipline when unclear
  -> plan gate for standard/heavy work
  -> isolation when needed
  -> selected execution adapter
  -> review/eval placement
  -> verification placement
  -> observation when behavior changed
  -> handoff summary

Thin .claude Postflight
  -> session end tracing
  -> metrics capture
  -> guardrail candidates when warranted
  -> health / triage / improve-harness on explicit request
```

## Local Command Relationship

- `/execute-plan` is the current local pipeline entrypoint.
- `/plan-task`, `/implement-task`, `/review-task`, and `/worktree-start` are compatibility or fallback surfaces when the operator explicitly wants manual local control.
- `/verify`, `/eval`, and `observation-summary.md` remain available as local evidence surfaces, but their weight depends on the selected track.

## Installation Preference

Install Superpowers as a plugin or skill on each device.

Do not vendor-copy the Superpowers repository into `~/.claude`.

If a local clone is useful for reading or comparison, keep it outside the harness, for example:

```text
/Users/kyo/development/references/superpowers
```

## Guardrails

- Do not let Superpowers bypass local permission policy.
- Do not let Superpowers auto-commit, push, create PRs, deploy, or run destructive commands without explicit authorization.
- Do not use local fallback commands as a parallel default planning/execution engine when the pipeline can handle the task.
- Do not require heavyweight local artifacts for trivial tasks.
- Do not use SQLite telemetry as a substitute for immediate correctness checks.
- Record recurring failures as guardrail candidates and review them through health/triage instead of promoting them automatically.
