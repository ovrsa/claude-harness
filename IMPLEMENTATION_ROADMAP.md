# Harness Implementation Roadmap

This file converts the current research conclusions into an executable rollout plan for the local `~/.claude` harness.

Use it when the question is not "what should the harness do?" but "what exact changes should land next, in what order, and how do we verify them?"

This roadmap assumes the current architecture in `HARNESS.md` and `OPERATING_MODEL.md` remains correct:

- keep the artifact-first lifecycle
- keep human-directed promotion
- add missing standard guardrails rather than building a new custom framework

## Target State

The target operating shape is:

1. `~/.claude` remains the canonical control plane
2. active repositories receive thin repo-local maps plus repo-specific adapters
3. local CLI analyzers enforce structure and policy checks
4. recurring maintenance is reviewed through explicit local operator commands
5. repo hosts remain optional adapters rather than lifecycle authorities
6. telemetry continues to surface recurring failures into local health and triage work

## Non-Goals

Do not use this rollout to:

- replace the current artifact chain with chat-only memory
- auto-promote recurring failures directly into hooks or skills
- let agents rewrite architecture policy without human approval
- make GitHub, Docker, or any single remote platform a hard dependency

## Phase 0: Baseline And Policy Lock

Objective:
Freeze the operating assumptions before adding new automation.

Files to update:

- `HARNESS.md`
- `OPERATING_MODEL.md`
- `AUTONOMY_POLICY.md`
- `IMPLEMENTATION_ROADMAP.md`

Changes:

- document that the current harness is `self-observing + improvement-ready`
- state that automatic capture is allowed, but promotion remains human-directed
- define the rollout order for governance, structure analysis, and recurring health work
- define the autonomy boundary for future semi-automation

Verification:

- `npm test`
- `node scripts/ci/audit-harness-contract.js`
- `node scripts/ci/validate-runtime-surface.js`

Exit criteria:

- the roadmap is the single reference for rollout sequencing
- the existing policy docs do not contradict the rollout plan

## Phase 1: Local-First Operations Baseline

Objective:
Define the durable local operating baseline before adding more analyzers.

Files to add:

- `docs/local-operations-baseline.md`

Files to update:

- `package.json`
- `README.md` if public operator guidance needs to mention the new checks

Recommended implementation:

- keep local scripts canonical
- keep local verification runnable without any repo host
- define which explicit improvement commands operators should prefer
- treat remote CI as a mirror of local scripts, not as the source of truth

Verification:

- `npm test`
- `npm run lint`

Exit criteria:

- the harness is operable without GitHub-specific primitives
- operators can understand the local-first loop from one short document

## Phase 2: Structure Drift Detection

Objective:
Detect slop creep mechanically with off-the-shelf analyzers.

Files to add:

- `knip.json` or equivalent Knip config
- `.dependency-cruiser.cjs` or `.dependency-cruiser.js`

Files to update:

- `package.json`
- `commands/refactor-clean.md`

Recommended implementation:

- add `knip` in advisory mode first
  - detect unused files
  - detect unused exports
  - detect unused dependencies
- add `dependency-cruiser` in advisory mode first
  - prevent accidental cycles
  - encode allowed layer boundaries
  - keep the first rule set small and obvious
- add `semgrep` only if policy-as-code checks become necessary

Suggested package scripts:

- `lint:unused`
- `lint:architecture`
- `lint:repo`

Verification:

- `npm test`
- `npm run lint:unused`
- `npm run lint:architecture`

Exit criteria:

- structure drift is visible in CI
- baseline false positives are low enough to graduate from advisory to blocking checks

## Phase 3: Request-Driven Improvement Loop

Objective:
Move recurring failure review from scattered ad hoc usage to one explicit operator entrypoint.

Files to update:

- `OPERATING_MODEL.md`
- `HARNESS.md`
- `commands/health-status.md`
- `commands/triage-loop.md`
- `commands/improve-harness.md`
- `templates/health-summary-template.md`
- `templates/triage-summary-template.md`

Files to add:

- `docs/health-triage-operations.md` if the operating cadence needs a dedicated runbook

Recommended implementation:

- keep health and triage human-directed
- keep the preferred entrypoint explicit and operator-invoked
- generate a grouped summary from the SQLite memory plane plus guardrail candidate artifacts
- distinguish `new`, `recurring`, `promotion-ready`, `stale`, and `resolved`
- emit `1-3` follow-up recommendations, not silent automatic promotion
- keep `docs -> command -> hook -> skill` as the promotion ladder
- prefer `/improve-harness` when the operator asks for self-improvement

Verification:

- `npm test`
- `node scripts/health-status.js`
- `node scripts/triage-loop.js`

Exit criteria:

- the harness has one clear improvement entrypoint
- recurring failures become explicit next-task candidates

## Phase 4: Promotion Discipline

Objective:
Clarify what can be improved automatically and what must remain operator-approved.

Files to update:

- `HARNESS.md`
- `AUTONOMY_POLICY.md`
- `commands/promote.md`
- `commands/post-commit-capture.md`
- `commands/guardrail-status.md`

Rules:

- automatic capture is acceptable
- docs and command proposals may be semi-automatic
- hook or skill promotion stays human-approved
- architecture policy changes always require explicit review

Verification:

- `npm test`
- `node scripts/ci/audit-harness-contract.js`

Exit criteria:

- the harness can improve its control plane without creating governance drift

## Recommended Landing Order

Use this order unless a blocking dependency changes:

1. Phase 0 policy lock
2. Phase 1 local-first operations baseline
3. Phase 2 structure drift detection in advisory mode
4. Phase 3 request-driven improvement loop
5. promote only one low-risk recurring pattern at a time

## Minimal First PR

The safest first implementation PR is:

1. document the local-first operations baseline
2. keep `npm test` and `npm run lint` host-agnostic
3. add `knip` and `dependency-cruiser` in advisory mode
4. add one explicit command for `health` + `triage` driven improvement review

Reason:

- it keeps the control plane portable across repositories
- it does not hard-bind the harness to GitHub
- it keeps self-improvement explicit instead of hiding it in background automation

## Decision Heuristics

Choose the narrowest durable fix that reliably prevents the failure:

- missing explanation -> `docs`
- recurring judgment workflow -> `command`
- high-confidence machine-detectable failure -> `hook`
- stable reusable pattern spanning multiple repos -> `skill`

If a fix requires inventing a new framework layer, stop and ask whether GitHub, Claude Code, or an existing analyzer already solves it.
