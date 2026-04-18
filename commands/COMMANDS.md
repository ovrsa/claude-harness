# Command Surface

This file groups the local `~/.claude/commands/` surface by role.

Use it as the fastest command map after `CLAUDE.md`. It does not replace the command docs themselves.

## Preferred Lifecycle Path

Use these commands by default for implementation and bug-fix work:

- `/research` for conversational scoping before non-trivial work
- `/plan` to decide the approach and get approval
- `/plan-task` when the repository needs an approved `plan.md`
- `/review-task` to record findings and residual risks
- `/verify` to capture rerunnable checks
- `/eval` as the acceptance gate that decides whether the work is acceptable to accept

## Core Lifecycle Pairs

These pairs separate conversational guidance from repository artifacts:

- `/research` is the conversational research entrypoint; `/research-task` creates or updates repository `research.md`
- `/plan` is the conversational planning entrypoint; `/plan-task` creates or updates repository `plan.md`

## Command Groups

### Review, Verify, Evaluate

Primary lifecycle surface for implementation and bug-fix work.

- `/review-task`
- `/verify`
- `/eval`

### Implementation Helpers

Used while moving an approved task through execution.

- `/implement-task`
- `/build-fix`
- `/test-coverage`
- `/code-review`

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

- `primary`: default lifecycle commands most sessions should prefer
- `secondary`: useful but not required for the normal implementation path
- `optional`: specialized packs and utilities outside the core harness path
