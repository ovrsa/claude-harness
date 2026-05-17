# Personal Harness Canonical

This file is the thin operating entrypoint for my personal agent harness.

## Core Rule

`~/.claude` is the source of truth for the local control layer.
Future improvements to telemetry, permissions, adapters, and guardrails should land here directly instead of introducing a second local authority.

- hooks live in `~/.claude/hooks/` and `~/.claude/scripts/hooks/`
- reusable commands live in `~/.claude/commands/`
- broad standards live in `~/.claude/rules/`
- templates live in `~/.claude/templates/`

`~/.codex` is a runtime bridge, not a second harness.
External frameworks, plugin packs, and upstream repos may inform local improvements, but they must remain observable through the local control layer.

The local pipeline is the default execution spine for non-trivial work. Superpowers, when installed, is a selectable discipline pack for planning, execution sequencing, TDD, review workflow, verification-before-completion, and branch finishing. `~/.claude` remains the governance, telemetry, permission, session-continuity, and improvement layer. See `~/.claude/docs/superpowers-adoption.md`.

Active repositories should expose a thin repo-local map, preferably root `AGENTS.md`, that points to the real truth sources without duplicating the lifecycle.

Deeper references:

- `~/.claude/OPERATING_MODEL.md` for the fastest end-to-end operating loop summary
- `~/.claude/HARNESS.md` for the canonical harness map
- `~/.claude/commands/COMMANDS.md` for the grouped command surface and preferred command path
- `~/.claude/AUTONOMY_POLICY.md` for approval and autonomy classes
- `~/.claude/OBSERVE.md` for runtime observation rules
- `~/.claude/SESSION.md` for session state and resume rules

Completion model:

- `verify` proves rerunnable checks passed
- `evaluate` proves the work is acceptable to accept
- `observe` proves runtime behavior when changed behavior needs concrete evidence
- the weight of these gates is selected by task track: `trivial`, `standard`, or `heavy-risky`
- recurring failures should be recorded as `guardrail candidates` and later promoted into the narrowest durable layer that can prevent them
- health and triage should summarize recurring candidates into explicit next-task recommendations before broader automation is added

## Track-Based Artifact Chain

Use the lightest artifact chain that preserves correctness.

- `trivial`: context check plus verification of the changed surface
- `standard`: pipeline-guided planning/execution plus verification evidence and a lightweight acceptance summary
- `heavy-risky`: explicit approval, worktree isolation, review, verification, residual-risk acceptance, and observation when behavior changed

Local artifacts remain available when needed:

- `research.md` for prior art, options, and risks
- `plan.md` for approved execution intent when explicit approval is required
- `review-summary.md` for acceptance findings and residual risks
- `verification-summary.md` for rerunnable verification evidence
- `observation-summary.md` when runtime or UI behavior changed
- `progress.md` as the durable session log for interrupted or multi-session work
- optional `Guardrail Candidates` sections when a failure pattern is worth promoting beyond the current task

The local SQLite memory plane under `~/.claude/telemetry/telemetry.db` is the runtime source of truth for:

- current run state and resume hints
- lifecycle telemetry
- verification/review persistence
- low-risk tactical learning

Repository artifacts remain the human-readable control surface and approval surface.

## Artifact Language

Task artifacts should be written in Japanese by default.

- Keep canonical machine-readable section headings when templates require them.
- Write the body text, bullets, decisions, risks, evidence notes, and handoff notes in Japanese.
- Use English only for exact command names, file paths, API names, code identifiers, quoted output, or required parser tokens.

## Execution Rules

- use the local pipeline as the default spine for standard and heavy-risky development work
- do not implement heavy-risky work before explicit approval
- do not skip review or evaluate for implementation and bug-fix work
- do not commit before `verification-summary.md`
- do not treat verification as a substitute for evaluation
- do not skip `observation-summary.md` when behavior changed
- do not claim done without verification evidence
- for UI or runtime behavior changes, build/test alone is not enough
- use multi-agent only for independent research, disjoint code slices, or sidecar verification

## Context Rules

- keep always-loaded instructions short
- prefer a thin repo-local map over ad hoc repository orientation
- prefer references to artifacts, docs, and skills over long inline guidance
- keep repo-local maps pointed at truth sources instead of copying global lifecycle rules
- restore the current task from repository artifacts first
- restore from the SQLite runtime state before falling back to repository artifacts
- treat `progress.md` as a human-readable projection of durable session state
- compact only after persisting current state

## Preferred Commands

- `/execute-plan` as the current local pipeline entrypoint
- `/research` and `/plan` for conversational scoping when requirements are unclear
- `/plan-task` only when a local `plan.md` artifact is required or manual local planning is explicitly wanted
- `/review-task` to record findings and residual risks before acceptance
- `/eval` to decide whether implementation or bug-fix work is acceptable to accept
- `/verify` before completion or commit

See `~/.claude/commands/COMMANDS.md` for the grouped command taxonomy, lifecycle pairs, and secondary surfaces.

## Personal Default

If there is tension between convenience and reliable continuity, prefer reliable continuity.
