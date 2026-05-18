# Harness Architecture

`~/.claude` is the canonical local control layer.

Use this file as the authoritative map for how the personal control layer is organized.

For the fastest end-to-end summary of the current loop, start with `OPERATING_MODEL.md`, then use `commands/COMMANDS.md` for the grouped command surface, and return here for the deeper ownership and gate semantics.

## Core Model

The harness is split into five layers:

1. **Invariant entry layer**
   - short always-loaded instructions
   - track selection
   - high-level done criteria

2. **Lifecycle enforcement layer**
   - hook-owned hard boundaries
   - edit/commit ordering when local gates are active
   - permission and escalation policy
   - Superpowers wrapper boundaries

3. **Artifact and session continuity layer**
   - SQLite runtime state in `telemetry/telemetry.db`
   - local task artifacts when the selected track requires them
   - `SESSION.md`

4. **Repo-local map layer**
   - thin repository orientation, preferably via root `AGENTS.md`
   - points agents to local truth sources without redefining lifecycle behavior
   - may link to codemaps or deeper docs when they are useful

5. **Adapter layer**
- `.codex`, Cursor, and other runtimes consume `.claude`
- adapters inherit the workflow, not redefine it

The local pipeline is the development spine consumed by this control layer. Superpowers belongs behind that spine as a selectable discipline pack; `.claude` owns observability, permissions, session continuity, and improvement.

## Design Principles

- Pipeline-first for development mechanics
- Track-first over one-size-fits-all gates
- Artifact-when-useful over artifact-every-time
- DB-first runtime state over Markdown-only checkpoints
- Session-first over transcript-first continuity
- Constrained autonomy over unbounded autonomy
- Evaluate-before-completion for implementation and bug-fix work
- Observe-first evidence for behavior changes
- Mechanical enforcement over informal reminders

## Ownership

- `~/.claude/`
  Owns the canonical local control plane plus device-local runtime state.
  Future harness changes should land here directly; mirrors, archives, plugins, and upstream repos are reference or distribution layers only.

- `CLAUDE.md`
  Owns the thin invariant entry layer only.
- `hooks/` and `scripts/hooks/`
  Own hard boundaries and lifecycle enforcement.
- `templates/`
  Own artifact structure.
- `commands/`
  Own workflow entrypoints.
  `commands/COMMANDS.md` is the grouped summary of that surface, not a replacement for the command docs.
  `/execute-plan` is the current local pipeline entrypoint. `/plan-task`, `/implement-task`, `/review-task`, and `/worktree-start` are fallback or compatibility surfaces.
- root `AGENTS.md` in active repos
  Owns thin repo-local orientation and truth-source routing only.
- `AUTONOMY_POLICY.md`
  Owns autonomy classes and escalation rules.
- `OBSERVE.md`
  Owns runtime observation requirements.
- `SESSION.md`
  Owns session state, checkpoint semantics, and handoff contracts.

## Track-Based Artifact Chain

Use the lightest artifact chain that preserves correctness:

- `trivial`: context check plus verification of the changed surface
- `standard`: pipeline-guided plan/execution plus verification evidence and lightweight acceptance summary
- `heavy-risky`: explicit approval, worktree isolation, review, verification, residual-risk acceptance, and observation when behavior changed

Local artifacts remain available when useful:

- `research.md` for prior art, options, constraints, and risks
- `plan.md` for explicit local approval intent
- `verification-summary.md` for rerunnable verification evidence
- `review-summary.md` for acceptance findings and residual risks
- `observation-summary.md` when runtime or user-visible behavior changed
- `progress.md` as the durable session log for interrupted or multi-session work

The artifact chain is complemented by the SQLite memory plane:

- `telemetry/telemetry.db` stores runtime state, lifecycle telemetry, and low-risk tactical memory
- repository artifacts remain the approval-facing and human-readable layer

Optional promotion-oriented sections may also exist inside the primary artifacts:

- `Guardrail Candidates` in `review-summary.md`
- `Guardrail Candidates` in `verification-summary.md`
- `Guardrail Candidates` in `observation-summary.md`

## Completion Model

Implementation and bug-fix work use three distinct concepts. Their weight depends on the selected track:

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

Work is done only when the required checks for the selected track have passed. Verification and acceptance evaluation are always conceptually required; observation is required only when tests/build do not prove changed runtime, UI, or integration behavior.

## Execution Modes

Development execution has one preferred engine plus local fallbacks:

1. Local pipeline
   - default spine for standard and heavy-risky work
   - owns order, stop conditions, adapter selection, evidence, and handoff

2. `/execute-plan`
   - current local entrypoint into the pipeline
   - preserves `.claude` permission, telemetry, and stop conditions

3. Local fallback commands
   - `/plan-task`, `/implement-task`, `/review-task`, and `/worktree-start`
   - used when the operator explicitly wants manual local control

Humans intervene for strategy, ambiguous scope changes, residual risk, and release actions. Routine implementation sequencing is engine-owned when it remains inside approved scope and permission boundaries.

## Canonical Rules

- Do not use local fallback commands as a competing default when the pipeline can handle the task
- Do not use `/execute-plan` to bypass local permissions or explicit approval for heavy-risky work
- Do not commit before `verification-summary.md`
- Do not treat verification as a substitute for evaluation
- Do not treat review as complete while acceptance blockers remain unresolved
- Do not treat tests/build alone as sufficient when behavior changed
- Do not use `.codex` or other adapters as a second lifecycle source of truth
- Do not treat compact summaries as the source of truth when `progress.md` exists
- Do not treat `progress.md` as the authoritative runtime state when the SQLite memory plane is available
- Do not treat `review-summary.md` as complete while `Findings` contains unresolved items
- Do not leave accepted concerns in `Findings`; move them to `Residual Risks`
- Do not promote a one-off failure into a durable global rule without recurrence or clear severity justification
- Standard and heavy-risky implementation should enter through the local pipeline. The current entrance guardrail warns when no run evidence is found; it does not block yet.

## Feedback-To-Guardrail Loop

The harness should learn from repeated failures without immediately over-automating noisy signals.

Promotion ladder:

- `docs` when the main problem is missing explanation, terminology, or checklist clarity
- `command` when the problem recurs but still needs operator judgment
- `hook` when the problem is high-confidence, low-noise, and machine-detectable at the right lifecycle boundary
- `skill` when the pattern is stable, reusable, and too rich for a narrow command or hook

Operating rules:

- capture can be automatic
- promotion stays human-directed in this phase
- low-risk tactic adoption may be automatic when it does not change governance
- guardrail candidates belong in task artifacts before they become durable harness changes
- use the narrowest layer that can prevent the failure reliably

## Triage And Health Loop

Health and triage sit on top of guardrail capture.

- `health` summarizes the current grouped failure landscape from recent harness signals
- `triage` decides which grouped patterns should become the next follow-up tasks
- `/improve-harness` is the preferred request-driven entrypoint when the operator wants one concise recommendation pass
- both remain local and human-directed in this phase
- neither is scheduler-owned in the current model
- grouped patterns should distinguish `new`, `recurring`, `promotion-ready`, `stale`, and `resolved`
- the output should generate next-task candidates rather than just describing symptoms

## Repo-Local Maps

Repo-local maps are orientation docs, not lifecycle authorities.

- prefer root `AGENTS.md` as the thin repo-local map
- keep the map short enough to be default-readable
- point to the real truth sources instead of duplicating them
- use codemaps as deeper architecture references, not as the first repo entrypoint
- do not restate `~/.claude` lifecycle rules in full when a short bridge is enough

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

## External Sources Policy

External frameworks other than Superpowers may be mined for ideas, workflow patterns, or one-time skill harvests.

- they are reference sources only
- they must not become the live source of truth for `.claude`
- local lifecycle policy must be justified on its own terms once adopted
- plugin enablement is optional and not required for the core harness to function
