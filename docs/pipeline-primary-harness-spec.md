# SPEC: Pipeline-Primary Harness

Date: 2026-05-14
Status: design-spec
Owner: `.claude` local harness

## Purpose

Make the development harness easier to reason about by making the pipeline the
primary organizing concept.

The goal is not to adopt TAKT, replace Superpowers, or introduce another runtime
authority. The goal is to clean up the local control flow so each layer has one
clear job:

- the pipeline owns order and stop conditions
- adapters own execution mechanics
- `.claude` owns policy, evidence, telemetry, and continuity
- external frameworks and skills remain replaceable helpers

TAKT remains useful as a pattern reference for queueing, task/run separation,
faceted prompts, review/fix routing, run evidence, and isolated execution. It is
not a dependency or a source of truth.

## Problem

The current harness describes Superpowers as the primary development engine and
also contains a local pipeline runner, task queue, adapter layer, permission
policy, artifact chain, and telemetry plane.

That split works, but it makes the daily model harder than necessary:

- `Superpowers` is described as owning mechanics.
- `pipeline-runner` is described as a control and evidence layer around that
  engine.
- `task-queue` owns task/run/list/retry/merge surfaces.
- `.claude` owns lifecycle policy, session tracing, and artifacts.
- TAKT import docs describe another orchestration vocabulary.

The result is a blurred question: when a task starts, what is the actual spine of
execution?

The intended answer should be simple: the pipeline.

## Decision

Adopt a pipeline-primary model.

The local pipeline becomes the canonical execution spine for non-trivial work.
Superpowers, local fallback commands, Codex, Claude Code, dry-run mode, and
future SDK runners are all execution or discipline providers behind the
pipeline, not owners of the lifecycle.

This changes the conceptual hierarchy from:

```text
Superpowers engine
  -> .claude wrapper
  -> local evidence and telemetry
```

to:

```text
.claude pipeline
  -> selected execution adapter
  -> local evidence, review, verification, observation, and handoff
```

The pipeline may still invoke Superpowers when it is the best available
discipline pack for planning, TDD, review workflow, or verification-before-
completion. It should not require Superpowers as the conceptual center.

## Responsibility Model

### Pipeline Owns

- stage order
- track selection enforcement
- preflight checks
- plan approval gate
- permission and authorization stop conditions
- adapter selection
- retry and re-entry semantics
- review/eval placement
- verification placement
- observation placement when behavior changed
- final handoff summary

### `.claude` Owns

- canonical harness authority
- runtime session tracing
- SQLite telemetry
- artifact chain
- permission policy
- destructive-action boundaries
- repo-local `AGENTS.md` routing
- guardrail candidates and improvement loop
- command surface

### Task Queue Owns

- task intake
- task/run separation
- run status indexing
- list and status views
- retry notes and human instructions
- diff/merge/delete-clone management surfaces

The queue should call into the pipeline instead of becoming a separate execution
engine.

### Execution Adapters Own

- how a step is executed
- provider-specific command invocation
- prompt/stdin delivery
- stdout/stderr capture
- provider result normalization
- provider-specific blocked/error mapping

Adapters do not own lifecycle policy, commits, pushes, PR creation, deploys, or
cleanup authorization.

### Superpowers Owns, When Selected

- brainstorming discipline
- implementation planning discipline
- TDD discipline
- execution sequencing discipline
- review-feedback discipline
- verification-before-completion discipline

Superpowers should be treated as an adapter or discipline pack selected by the
pipeline, not as the lifecycle source of truth.

### TAKT Owns Nothing Locally

TAKT is a reference implementation and design catalog only.

Useful imported ideas:

- declarative workflow stages
- task/run separation
- faceted prompt composition
- review/fix routing
- run evidence
- list/retry/instruct management
- isolated task execution

Non-imported parts:

- `.takt` canonical state
- TAKT runtime dependency
- TAKT permission authority
- TAKT telemetry replacement
- TAKT command surface as the daily interface

## Pipeline Stages

The canonical pipeline shape is:

```text
intake
  -> classify
  -> preflight
  -> research or clarify when needed
  -> plan gate
  -> isolate when required
  -> execute through adapter
  -> review / evaluate
  -> verify
  -> observe when behavior changed
  -> record evidence
  -> handoff
```

### 1. Intake

Accept task input from chat, issue text, explicit command, queued task, or local
artifact.

Output:

- task id when queued
- task text or order
- target repo
- initial track guess

### 2. Classify

Select the lightest safe track:

- `trivial`
- `standard`
- `heavy-risky`

Classification should drive required artifacts, isolation, review weight,
verification scope, and approval gates.

### 3. Preflight

Check:

- repo exists
- repo has local instructions
- task state is not stale
- permission-sensitive operations are identified
- baseline state is understood when relevant
- runtime session tracing is active

### 4. Research Or Clarify

Only gather enough context to create a correct plan. Do not require heavy
research artifacts for trivial work.

Durable `research.md` remains useful when:

- prior art matters
- alternatives must be compared
- risks are non-obvious
- the work spans sessions

### 5. Plan Gate

For standard and heavy-risky work, produce an implementation-ready plan or use a
selected planning discipline. Heavy-risky work requires explicit approval before
execution.

The plan gate belongs to the pipeline even when Superpowers writes the plan.

### 6. Isolation

Use isolation when the track or risk demands it.

Preferred queued-task isolation remains `git clone --shared` because the agent
gets an independent `.git` directory and the main working tree stays untouched.

`git worktree` remains useful for manual feature branch work, but it should not
be the default queued execution mechanism unless a future spec changes that
decision.

### 7. Execute

Run the selected adapter with a structured contract:

- repo path
- plan path or task order
- track
- runtime
- task id
- run id
- permission mode
- workflow step when applicable

The adapter returns normalized status:

- `DONE`
- `NEEDS_DECISION`
- `BLOCKED`

### 8. Review / Evaluate

Review answers whether the change should be accepted. Verification answers
whether checks passed. Keep those separate.

Review may be:

- lightweight self-review
- local `review-summary.md`
- Superpowers review workflow
- parallel reviewer aggregation
- future dedicated review adapter

### 9. Verify

Run rerunnable checks appropriate to the selected track:

- `trivial`: changed surface
- `standard`: plan-specified checks and related tests
- `heavy-risky`: relevant full suite plus required review/eval evidence

Record exact commands and outcomes when durable evidence is required.

### 10. Observe

Observation is required only when tests/build do not prove changed runtime, UI,
integration, permission, data, or rollout behavior.

### 11. Record Evidence

Persist enough evidence to resume or audit without depending on the chat
transcript:

- run metadata
- prompt snapshots when adapter-driven
- stdout/stderr
- NDJSON events
- reports
- verification summary
- review summary
- observation summary when required
- guardrail candidates when a recurring failure appears

### 12. Handoff

End with a concise status:

- what changed
- what passed
- what remains blocked
- residual risks
- next human authorization required

Commit, push, PR creation, deploy, destructive actions, and cleanup remain
explicit authorization boundaries.

## Command Surface Target

The command surface should reflect the pipeline-primary model.

Preferred future shape:

```text
/pipeline          primary non-trivial execution entrypoint
/queue             task intake and queue management
/verify            rerunnable verification evidence
/eval              acceptance and residual-risk evidence
/observe           runtime evidence when behavior changed
/improve-harness   explicit improvement pass
```

Existing commands can remain as compatibility surfaces during migration:

- `/execute-plan`
- `/plan-task`
- `/implement-task`
- `/review-task`
- `/worktree-start`

They should point toward the pipeline instead of describing themselves as a
parallel lifecycle.

## Migration Plan

### Phase 1: Documentation Reframe

Update the main docs so the pipeline is the conceptual center:

- `CLAUDE.md`
- `OPERATING_MODEL.md`
- `HARNESS.md`
- `docs/pipeline-runner-v0.md`
- `docs/superpowers-adoption.md`
- `commands/execute-plan.md`

Done when:

- Superpowers is described as selected discipline/adapter, not primary
  lifecycle owner.
- TAKT is described only as reference pattern input.
- `pipeline-runner` is described as the canonical spine for non-trivial work.

### Phase 2: Runner Contract Cleanup

Rename or revise runner language:

- replace `Engine: Superpowers` hardcoding with selected adapter name
- rename runner-facing `engine-command` terminology to `adapter-command` while
  retaining compatibility aliases
- make adapter status mapping explicit
- make review/verify/observe stage ownership explicit
- make task queue calls clearly enter the pipeline

Done when:

- `pipeline-runner` output explains which adapter ran.
- dry-run and provider adapters use the same status contract.

### Phase 3: Queue UX Cleanup

Make daily task flow obvious:

```text
queue add
queue run
queue list
queue diff
queue instruct
queue retry
queue try-merge
queue merge-cleanup
```

Done when:

- a user can see all pending/completed/failed runs and the next available
  action without inspecting files manually.

### Phase 4: Adapter Normalization

Normalize adapters under one contract:

- dry-run
- Codex
- Claude Code
- Superpowers discipline wrapper
- future SDK runner

Done when:

- adapters are interchangeable from the pipeline perspective.
- provider-specific logic does not leak into lifecycle policy.

### Phase 5: Evidence Unification

Make run evidence the durable execution record while keeping human-readable
artifacts for approval and review.

Done when:

- a run can be understood from task, run metadata, logs, reports, and summaries
  without reading the chat transcript.

## Acceptance Criteria

- `.claude` remains the canonical harness authority.
- The pipeline is the primary conceptual execution spine.
- Superpowers is optional from the pipeline's perspective.
- TAKT is not required for normal operation.
- Task queue and runner do not become competing lifecycle authorities.
- Permission decisions are deterministic and visible.
- Review, verification, and observation remain distinct.
- Destructive actions, commits, pushes, PRs, deploys, and cleanup require
  explicit authorization.
- Existing task artifacts remain compatible during migration.
- Existing tests continue to pass after implementation phases.

## Non-Goals

- Do not install or depend on TAKT.
- Do not vendor TAKT into `.claude`.
- Do not remove Superpowers immediately.
- Do not force all tasks through heavyweight artifacts.
- Do not auto-commit, auto-push, auto-PR, auto-deploy, or auto-cleanup.
- Do not replace SQLite telemetry with file logs.
- Do not make task queue, pipeline runner, and local commands separate
  competing execution paths.
- Do not introduce a resident daemon before queue and adapter contracts are
  stable.

## Open Questions

- Should `/execute-plan` be renamed to `/pipeline`, or should `/pipeline` be
  added first as a clearer alias?
- Should queued task runs always use shared clones, or should the track select
  between in-place, worktree, and shared-clone isolation?
- Should Superpowers integration be a named adapter, a discipline profile, or
  both?
- Should run reports eventually replace root-level `review-summary.md` and
  `verification-summary.md`, or should both remain as separate audit surfaces?
