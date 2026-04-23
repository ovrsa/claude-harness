# Research Report: Superpowers primary engine with thin .claude harness

## Goal

- Move toward option C: use Superpowers as the primary development execution engine while keeping `~/.claude` as a thin governance, telemetry, permission, and improvement layer.
- Align the target operating model with the SpeakerDeck harness-engineering direction: deterministic pipeline steps + agentic implementation/review + logs/evals + reduced human intervention during routine execution.

## Current Backup

- Portable current settings backup created at:
  - `/Users/kyo/Desktop/claude-backups/claude-20260423-211929`
- Excluded device-local runtime state:
  - `.git/`
  - `node_modules/`
  - `telemetry/`
  - `debug/`
  - `sessions/`
  - `todos/`
  - `backups/`
  - `statsig/`
  - `paste-cache/`
  - `shell-snapshots/`
  - `cache/`
  - `projects/`
  - `tasks/`
  - `file-history/`
  - `session-env/`

## External Research

### SpeakerDeck Target

Source: https://speakerdeck.com/rkaga/how-to-approach-harness-engineering

Relevant target pattern:

- The focus is not just rule files or personal coding-agent usage.
- The target is an AI-native development process designed as a pipeline.
- The example pipeline uses `Claude Agent SDK + TypeScript`.
- It alternates deterministic steps such as lint, branch push, browser testing, screenshots, and PR creation with agentic steps such as implementation, CI fixing, and cross-model review.
- Logs/evals are sent to analysis infrastructure such as Braintrust so the team can measure task categories, success rate, and human-intervention-free merge rate.
- Trigger surfaces extend beyond the terminal:
  - GitHub Issue
  - GitHub Actions
  - Chrome extension UI annotations
  - product-side AI interview results

Implication for this harness:

- The long-term target is not a larger `CLAUDE.md`.
- The target is a reproducible development pipeline with logged runs, deterministic gates, and narrow human decision points.

### Superpowers Capability

Sources:

- https://github.com/obra/superpowers
- https://skills.sh/obra/superpowers/executing-plans
- https://www.claudepluginhub.com/skills/obra-superpowers-2/writing-plans

Superpowers covers more than TDD:

- `brainstorming`
- `writing-plans`
- `executing-plans`
- `subagent-driven-development`
- `using-git-worktrees`
- `test-driven-development`
- `requesting-code-review`
- `receiving-code-review`
- `verification-before-completion`
- `finishing-a-development-branch`
- `systematic-debugging`

Superpowers `writing-plans` is explicitly designed to create implementation plans before touching code, with file paths, tests, docs, commands, and bite-sized tasks.

Superpowers `executing-plans` reads and critically reviews a written plan, executes tasks sequentially, runs specified verification, stops on blockers, integrates with worktrees, and hands off to development-branch finishing.

Implication:

- Superpowers can own much of the current local plan/implement/review/finish workflow.
- Treating Superpowers only as "TDD discipline" is too narrow.

## Existing Local Harness

Current `~/.claude` strengths:

- canonical entrypoints:
  - `CLAUDE.md`
  - `OPERATING_MODEL.md`
  - `HARNESS.md`
  - `OBSERVE.md`
  - `AUTONOMY_POLICY.md`
  - `SESSION.md`
- command surface:
  - `/research`
  - `/plan`
  - `/plan-task`
  - `/implement-task`
  - `/execute-plan`
  - `/review-task`
  - `/verify`
  - `/eval`
  - `/health-status`
  - `/triage-loop`
  - `/improve-harness`
- SQLite runtime plane:
  - session start/end tracing
  - run state
  - lifecycle telemetry
  - resume hints
- hooks:
  - edit/commit ordering
  - permission handling
  - session start/end
  - telemetry pre/post tool on Claude Code where available
- improvement loop:
  - `Guardrail Candidates`
  - health
  - triage
  - explicit improve pass

Current overlap with Superpowers:

- local `/plan-task` overlaps with Superpowers `writing-plans`
- local `/implement-task` and `/execute-plan` overlap with Superpowers `executing-plans` and `subagent-driven-development`
- local `/review-task` overlaps with Superpowers review skills
- local `/worktree-start` overlaps with Superpowers `using-git-worktrees`
- local branch finishing guidance overlaps with Superpowers `finishing-a-development-branch`

## Proposed Boundary

Use Superpowers as the primary development engine:

- plan/spec writing
- worktree setup
- implementation task breakdown
- TDD execution
- subagent-driven implementation where available
- code review workflow
- verification before completion
- branch finishing

Keep `.claude` as thin control and memory layer:

- runtime bridge for Claude Code / Codex / Cursor
- session start/end tracing
- SQLite telemetry and run-state persistence
- permission policy and destructive action boundaries
- local source-of-truth routing
- recurring failure capture
- health/triage/improve-harness
- pipeline metrics definition
- adapter rules so plugin/frameworks do not become unobservable black boxes

## Gate Simplification

The heavy local artifact chain should not be mandatory at the same weight for every task.

Recommended track model:

- Trivial:
  - no heavy research
  - no separate local plan artifact unless code-edit hooks require it
  - Superpowers may not be needed
  - verify only
- Standard:
  - Superpowers plan/execution
  - local session telemetry
  - verification evidence
  - acceptance summary
  - observe only if behavior changed
- Heavy/Risky:
  - explicit plan approval
  - worktree
  - Superpowers subagent-driven development
  - review and verification
  - observe when UI/runtime/integration changed
  - residual risk acceptance

Phases 6-9 should not all be heavy every time:

- Evaluate:
  - always needed conceptually
  - may be lightweight for trivial tasks
- Observe:
  - only when behavior changed or runtime evidence is needed
- Commit:
  - only when user wants the change recorded
- Post-commit capture:
  - only when reusable learning or recurring failure exists

SQLite should be used for continuous memory and periodic review, not as a substitute for immediate correctness checks.

## Token / Precision Hypothesis

Likely bad mode:

- Superpowers instructions plus full local lifecycle docs plus all task artifacts read every run.
- Result: high token cost, duplicate instructions, confused authority.

Likely good mode:

- Superpowers owns the active development workflow.
- `.claude` loads only thin invariant policy, telemetry hooks, permission policy, and improvement loop.
- Task artifacts are created only when they add durable value or are needed for approval/audit.

Expected precision improvement:

- Superpowers improves implementation precision through bite-sized tasks, TDD, worktrees, verification-before-completion, and review workflow.
- `.claude` improves long-term reliability through session continuity, permission boundaries, telemetry, and recurring-failure review.

## Target Architecture

```text
Human / Trigger
  -> issue, spec, annotation, product input

Pipeline Runner
  -> deterministic preflight
  -> Superpowers planning
  -> plan approval when needed
  -> worktree
  -> Superpowers execution / subagents
  -> deterministic verification
  -> review / cross-model review
  -> observe evidence when needed
  -> PR-ready output

Thin .claude Harness
  -> runtime bridge
  -> permissions
  -> session tracing
  -> SQLite run state
  -> guardrail candidates
  -> health / triage
  -> pipeline metrics
```

## Metrics To Decide If C Is Working

- total tokens per accepted task
- wall-clock time
- human intervention count
- plan revision count
- verification failure count
- repeated failure count
- review findings count
- rework count
- pass rate by task type
- PR-ready rate
- tasks merged without additional human implementation steering
- restore/resume success after context loss

## Risks

- Superpowers may become an implicit lifecycle authority if `.claude` does not clearly define the boundary.
- Keeping both local `/plan-task` and Superpowers `writing-plans` as equal defaults creates duplicate planning surfaces.
- Keeping both local `/execute-plan` and Superpowers `executing-plans` as equal defaults creates duplicate execution surfaces.
- Too many mandatory local artifacts will erase the token and autonomy gains.
- Too little local telemetry will make the pipeline hard to improve.

## Recommendation

- Adopt option C.
- Make Superpowers the default development engine.
- Shrink `.claude` to governance, memory, telemetry, permissions, and periodic improvement.
- Update local docs/commands so they do not compete with Superpowers for planning/execution authority.
- Add a pilot pipeline before building a TypeScript SDK runner.
