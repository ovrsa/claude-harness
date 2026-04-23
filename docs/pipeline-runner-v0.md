# Pipeline Runner v0

This document defines the first local runner target for the Superpowers-primary, thin `.claude` harness model.

The target is inspired by the SpeakerDeck slide 15 direction: constrain behavior, verify correctness, and improve the next run through one pipeline. v0 intentionally stops at specification and orchestration boundaries; it does not replace Superpowers and does not implement a full Claude Agent SDK runner yet.

## Goal

Create a small, repeatable pipeline contract for running an approved plan with the same order, evidence, and stop conditions across Claude Code, Codex, and future SDK-based execution.

The v0 runner is not an implementation agent. It is a control and evidence layer around the development engine.

## Responsibility Boundary

Superpowers owns:

- implementation planning
- plan execution
- TDD sequencing
- worktree mechanics
- review workflow
- verification-before-completion
- branch finishing guidance

The `.claude` runner owns:

- preflight checks
- permission and authorization boundaries
- track-based verification routing
- telemetry and token coverage capture
- evidence collection
- guardrail candidate capture
- PR-ready or handoff-ready summary generation

## Inputs

The runner accepts:

- `repo_root`: target repository root
- `plan_path`: approved plan file
- `track`: `trivial`, `standard`, or `heavy-risky`
- `runtime`: `claude`, `codex`, or `sdk`
- optional `task_id`: caller-provided task identifier

v0 requires an approved plan before execution. If requirements are still unclear, use Superpowers brainstorming or planning before invoking the runner.

## Pipeline

### 1. Preflight

- confirm `repo_root` exists and is a git repository
- confirm `plan_path` exists and is approved
- confirm `track` is valid
- detect permission-sensitive operations in the plan
- confirm heavy-risky work has explicit approval
- record `pipeline_started` telemetry

### 2. Execute

- call Superpowers execution semantics through the active runtime
- use existing `/execute-plan` wrapper behavior when running inside `.claude`
- stop when scope expands beyond the approved plan
- stop when the implementation engine reports a blocker

### 3. Verify

- `trivial`: verify the changed surface only
- `standard`: run plan-specified checks and related tests
- `heavy-risky`: run the relevant full suite plus required review/eval evidence
- record exact commands, status, and evidence references

### 4. Review

- collect review findings or residual risks
- preserve unresolved findings in `review-summary.md` when needed
- treat review as input to acceptance, not a replacement for verification

### 5. Finalize

- record `trace-status` snapshot
- record token coverage status when available
- capture guardrail candidates for recurring or reusable failures
- produce a PR-ready or handoff-ready summary
- require explicit authorization before commit, push, PR creation, deploy, or destructive actions

## Stop Conditions

The runner stops and returns `NEEDS_DECISION` when:

- no approved plan exists
- `track` cannot be classified safely
- Superpowers is unavailable
- heavy-risky approval is missing
- scope expansion is required
- baseline failure cannot be classified
- verification failure implies design uncertainty
- required observation evidence cannot be captured
- authorization is missing for destructive, external-service, commit, push, PR, or deploy actions

## Output Contract

The runner returns a structured summary:

```text
PIPELINE RUNNER: [DONE/NEEDS_DECISION/BLOCKED]

Task:        [task_id or derived name]
Track:       [trivial/standard/heavy-risky]
Runtime:     [claude/codex/sdk]
Engine:      [Superpowers/fallback]
Preflight:   [pass/fail]
Execution:   [complete/partial/blocked/not-run]
Verify:      [pass/fail/not-run/not-needed]
Review:      [pass/findings/not-run]
Observe:     [pass/not-required/missing]
Telemetry:   [recorded/partial/missing]

Evidence:
- ...

Residual Risks:
- ...

Next Action:
- ...
```

## Future Extensions

v0 does not include these as required behavior:

- Claude Agent SDK + TypeScript implementation
- browser test and screenshot orchestration
- cross-model review
- automatic PR creation
- Braintrust or external eval export
- issue or annotation trigger integration

Those belong in v0.5 or v1 after the local runner contract has been validated on real tasks.
