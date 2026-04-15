# Personal Harness Canonical

This file is the thin operating entrypoint for my personal agent harness.

## Core Rule

`~/.claude` is the source of truth for lifecycle behavior.

- hooks live in `~/.claude/hooks/` and `~/.claude/scripts/hooks/`
- reusable commands live in `~/.claude/commands/`
- broad standards live in `~/.claude/rules/`
- templates live in `~/.claude/templates/`

`~/.codex` is a runtime bridge, not a second harness.

Active repositories should expose a thin repo-local map, preferably root `AGENTS.md`, that points to the real truth sources without duplicating the lifecycle.

Deeper references:

- `~/.claude/HARNESS.md` for the canonical harness map
- `~/.claude/AUTONOMY_POLICY.md` for approval and autonomy classes
- `~/.claude/OBSERVE.md` for runtime observation rules
- `~/.claude/SESSION.md` for session state and resume rules

Completion model:

- `verify` proves rerunnable checks passed
- `evaluate` proves the work is acceptable to accept
- `observe` proves runtime behavior when changed behavior needs concrete evidence
- recurring failures should be recorded as `guardrail candidates` and later promoted into the narrowest durable layer that can prevent them
- health and triage should summarize recurring candidates into explicit next-task recommendations before broader automation is added

## Required Artifact Chain

For any non-trivial task, keep task state in repository files instead of chat only.

- `research.md` for prior art, options, and risks
- `plan.md` for approved execution intent
- `review-summary.md` for acceptance findings and residual risks
- `verification-summary.md` for rerunnable verification evidence
- `observation-summary.md` when runtime or UI behavior changed
- `progress.md` as the durable session log for interrupted or multi-session work
- optional `Guardrail Candidates` sections when a failure pattern is worth promoting beyond the current task

## Execution Rules

- do not implement before an approved `plan.md`
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
- treat `progress.md` as the durable session state when it exists
- compact only after persisting current state

## Preferred Commands

- `/research` before non-trivial implementation
- `/plan` to decide the approach and get human confirmation
- `/plan-task` when a repository `plan.md` artifact is required by lifecycle hooks
- `/eval` to decide whether implementation or bug-fix work is acceptable to accept
- `/verify` before completion or commit

## Personal Default

If there is tension between convenience and reliable continuity, prefer reliable continuity.
