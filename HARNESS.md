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
- Evaluate-before-completion for implementation and bug-fix work
- Observe-first evidence for behavior changes
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
- `verification-summary.md` for rerunnable verification evidence
- `review-summary.md` for acceptance findings and residual risks
- `observation-summary.md` when runtime or user-visible behavior changed
- `progress.md` as the durable session log for interrupted or multi-session work

## Completion Model

Implementation and bug-fix work use three distinct gates:

1. `verify`
   - answers: "did the programmed checks pass?"
   - artifact: `verification-summary.md`
   - scope: rerunnable checks such as build, lint, types, tests, and contract audits

2. `evaluate`
   - answers: "should this change be accepted?"
   - artifact: `review-summary.md`
   - scope: unresolved findings, acceptance criteria, residual risk, and approval readiness

3. `observe`
   - answers: "what concrete runtime evidence showed the changed behavior?"
   - artifact: `observation-summary.md`
   - scope: runtime, UI, or system interactions that tests alone do not fully prove

Work is done only when all required gates have passed. `verify` and `evaluate` are required for implementation and bug-fix work. `observe` is additionally required when behavior changes need runtime evidence.

## Canonical Rules

- Do not implement before an approved `plan.md`
- Do not commit before `verification-summary.md`
- Do not treat verification as a substitute for evaluation
- Do not treat review as complete while acceptance blockers remain unresolved
- Do not treat tests/build alone as sufficient when behavior changed
- Do not use `.codex` or other adapters as a second lifecycle source of truth
- Do not treat compact summaries as the source of truth when `progress.md` exists
- Do not treat `review-summary.md` as complete while `Findings` contains unresolved items
- Do not leave accepted concerns in `Findings`; move them to `Residual Risks`

## Review Gate Semantics

`review-summary.md` is the primary `evaluate` artifact for implementation and bug-fix work.

- `Findings` contains unresolved issues only
- each finding must use a severity prefix:
  - `CRITICAL:`
  - `HIGH:`
  - `MEDIUM:`
  - `LOW:`
  - `INFO:`
- `Residual Risks` contains accepted or non-blocking concerns
- review is approval-ready only when `Findings` is `none`
- evaluation is incomplete while `Findings` still contains unresolved items
- commit must stop while `Findings` still contains unresolved items

## Verification Gate Semantics

`verification-summary.md` is the primary `verify` artifact.

- capture rerunnable checks only
- record the commands run and their results
- treat verification as necessary but not sufficient for acceptance
- do not fold unresolved review findings or observation evidence into verification

## Observation Gate Semantics

`observation-summary.md` is evidence-first and source-aware.

- `Behavior Checked` states what runtime behavior was validated
- `Method` states how it was inspected
- `Evidence` states what concrete artifact or signal was seen
- at least one `Method` or `Evidence` line must name a concrete source:
  - `browser`
  - `screenshot`
  - `logs`
  - `stderr` / `stdout`
  - `trace`
  - `runtime health`
  - `process state`
  - `metrics`
- generic prose without a named evidence source is not observation-ready
- observation evidence does not settle review or acceptance concerns on its own

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
