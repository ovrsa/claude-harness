# Personal Harness Canonical

This file is the thin operating entrypoint for my personal agent harness.

## Core Rule

`~/.claude` is the source of truth for lifecycle behavior.

- hooks live in `~/.claude/hooks/` and `~/.claude/scripts/hooks/`
- reusable commands live in `~/.claude/commands/`
- broad standards live in `~/.claude/rules/`
- templates live in `~/.claude/templates/`

`~/.codex` is a runtime bridge, not a second harness.

Deeper references:

- `~/.claude/HARNESS.md` for the canonical harness map
- `~/.claude/AUTONOMY_POLICY.md` for approval and autonomy classes
- `~/.claude/OBSERVE.md` for runtime observation rules
- `~/.claude/SESSION.md` for session state and resume rules

## Required Artifact Chain

For any non-trivial task, keep task state in repository files instead of chat only.

- `research.md` for prior art, options, and risks
- `plan.md` for approved execution intent
- `review-summary.md` for findings and residual risks
- `verification-summary.md` for proof of completion
- `observation-summary.md` when runtime or UI behavior changed
- `progress.md` as the durable session log for interrupted or multi-session work

## Execution Rules

- do not implement before an approved `plan.md`
- do not skip review for behavior-changing work
- do not commit before `verification-summary.md`
- do not skip `observation-summary.md` when behavior changed
- do not claim done without verification evidence
- for UI or runtime behavior changes, build/test alone is not enough
- use multi-agent only for independent research, disjoint code slices, or sidecar verification

## Context Rules

- keep always-loaded instructions short
- prefer references to artifacts, docs, and skills over long inline guidance
- restore the current task from repository artifacts first
- treat `progress.md` as the durable session state when it exists
- compact only after persisting current state

## Preferred Commands

- `/research` before non-trivial implementation
- `/plan` to decide the approach and get human confirmation
- `/plan-task` when a repository `plan.md` artifact is required by lifecycle hooks
- `/verify` before completion or commit

## Personal Default

If there is tension between convenience and reliable continuity, prefer reliable continuity.
