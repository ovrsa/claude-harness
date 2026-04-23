# Command Surface

This file groups the local `~/.claude/commands/` surface by role.

Use it as the fastest command map after `CLAUDE.md`. It does not replace the command docs themselves.

## Preferred Lifecycle Path

Use Superpowers by default for standard and heavy-risky implementation and bug-fix work.

- `/execute-plan` as the local wrapper around Superpowers `executing-plans` or `subagent-driven-development`
- `/research` and `/plan` for conversational scoping when requirements are unclear
- `/verify` to capture local rerunnable evidence when needed
- `/eval` to record local acceptance judgment when needed

Local `/plan-task`, `/implement-task`, `/review-task`, and `/worktree-start` are fallback or compatibility commands when Superpowers is unavailable or the operator explicitly wants manual local control.

## Core Lifecycle Pairs

These pairs separate conversational guidance from repository artifacts. They are local fallback paths, not the standard Superpowers path.

- `/research` is the conversational research entrypoint; `/research-task` creates or updates repository `research.md`
- `/plan` is the conversational planning entrypoint; `/plan-task` creates or updates repository `plan.md`

## Command Groups

### Review, Verify, Evaluate

Local evidence surface for implementation and bug-fix work.

- `/review-task`
- `/receive-review`
- `/verify`
- `/eval`

### Implementation Helpers

Used while moving a task through execution when Superpowers is unavailable or local wrapper behavior is needed.

- `/execute-plan`
- `/implement-task`
- `/build-fix`
- `/test-coverage`
- `/code-review`

`/execute-plan` is the preferred local wrapper. It should invoke Superpowers execution semantics rather than reimplement a parallel home-grown runner.

`/implement-task` remains the conservative manual fallback and should not be the default when Superpowers is installed.

### Repo Orientation And Maintenance

Used to enter a repo cleanly and keep deeper references current.

- `/repo-map`
- `/update-codemaps`
- `/sessions`

### Continuous Learning And Promotion

Secondary surface. Use when a pattern is worth extracting or promoting beyond the current task.

- `/learn`
- `/learn-eval`
- `/evolve`
- `/promote`
- `/post-commit-capture`
- `/guardrail-status`
- `/trace-status`
- `/health-status`
- `/triage-loop`
- `/improve-harness`

### Advanced Orchestration And Loops

Preferred advanced workflows for multi-agent, long-running, or orchestrated work.

- `/orchestrate`
- `/multi-plan`
- `/multi-execute`
- `/multi-workflow`
- `/loop-start`
- `/loop-status`

### Optional Builders And Utilities

Optional surfaces for specialized operator workflows. Use only when the task clearly calls for them.

- presentation, content, security, setup, and project-specific command packs
- runtime-specific adapters that should not redefine the lifecycle

## Visibility Tiers

- `primary`: default local wrappers and evidence surfaces most sessions should prefer
- `secondary`: useful but not required for the normal implementation path
- `optional`: specialized packs and utilities outside the core harness path
