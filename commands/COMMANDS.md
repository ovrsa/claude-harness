# Command Surface

This file groups the local `~/.claude/commands/` surface by role.

Use it as the fastest command map after `CLAUDE.md`. It does not replace the command docs themselves.

## Preferred Lifecycle Path

Use the local pipeline by default for standard and heavy-risky implementation and bug-fix work.

- `/execute-plan` as the current local pipeline entrypoint
- `/research` and `/plan` for conversational scoping when requirements are unclear
- `/verify` to capture local rerunnable evidence when needed
- `/eval` to record local acceptance judgment when needed

Standard and heavy-risky work should leave pipeline run evidence through `/execute-plan` or task queue execution. The current guardrail warns when that evidence is missing but does not block the work.

Local `/plan-task`, `/implement-task`, `/review-task`, and `/worktree-start` are fallback or compatibility commands when the operator explicitly wants manual local control.

## Core Lifecycle Pairs

These pairs separate conversational guidance from repository artifacts. They are local fallback paths, not the standard pipeline path.

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

Used while moving a task through execution when manual local control or local wrapper behavior is needed.

- `/execute-plan`
- `/implement-task`
- `/build-fix`
- `/test-coverage`
- `/code-review`

`/execute-plan` is the preferred local pipeline entrypoint. It should preserve pipeline stop conditions rather than reimplement a parallel home-grown runner.

`/implement-task` remains the conservative manual fallback and should not be the default when the pipeline can handle the task.

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
