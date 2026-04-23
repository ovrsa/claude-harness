---
description: Local wrapper around Superpowers plan execution with .claude telemetry, permission, and stop-condition boundaries.
---

# Execute Plan

Use this command when a task is ready for execution and Superpowers is available.

`/execute-plan` is not a parallel home-grown runner. It is the local wrapper around Superpowers `executing-plans` or `subagent-driven-development`, with `.claude` preflight/postflight, permission boundaries, and telemetry around it.

## Preconditions

- The task track is selected: `trivial`, `standard`, or `heavy-risky`.
- Superpowers is installed and callable in the active runtime.
- Requirements are clear enough for Superpowers planning or execution.
- Heavy-risky work has explicit approval before execution.
- Destructive actions, commit, push, PR creation, deploy, and external-service mutations are explicitly authorized before they run.

## Wrapper Contract

The wrapper may:

- start or confirm session tracing
- read repo-local `AGENTS.md`
- classify the task track
- invoke Superpowers planning/execution semantics
- preserve local permission boundaries
- capture verification evidence when needed
- capture observation evidence only when behavior changed
- record guardrail candidates when a recurring or reusable failure appears
- produce a PR-ready or handoff-ready summary

The wrapper must not:

- reimplement Superpowers planning/execution as the default path
- require heavyweight local artifacts for trivial tasks
- bypass Superpowers readiness checks
- bypass local permission policy
- auto-commit, auto-push, create PRs, deploy, or run destructive commands without explicit authorization
- treat SQLite telemetry as immediate correctness evidence

## Execution Flow

1. Run thin `.claude` preflight:
   - confirm runtime/session tracing
   - read repo-local `AGENTS.md`
   - classify the track
   - identify permission-sensitive operations
2. For unclear requirements, use Superpowers brainstorming.
3. For standard or heavy-risky work, use Superpowers `writing-plans`.
4. For execution, use Superpowers `executing-plans`; use `subagent-driven-development` when the work is disjoint and the runtime supports it.
5. Let Superpowers own worktree setup, TDD, implementation sequencing, review workflow, verification-before-completion, and branch finishing.
6. Use local `.claude` evidence surfaces only as needed:
   - `verification-summary.md` when rerunnable evidence should be preserved or local commit gates require it
   - `review-summary.md` when unresolved findings or residual risks need durable capture
   - `observation-summary.md` when runtime, UI, or integration behavior changed
   - token metrics when the runtime exposes usage payloads; record missing usage as coverage gap, not as zero cost
7. Run thin `.claude` postflight:
   - summarize files and behavior changed
   - record verification/observation pointers
   - record guardrail candidates when warranted
   - state whether commit/PR/deploy still requires human authorization

## Stop Conditions

Stop and ask for an explicit decision when:

- Superpowers is unavailable
- the task track cannot be classified safely
- heavy-risky work lacks explicit approval
- scope needs to expand beyond the accepted task
- baseline failure cannot be classified
- verification repeatedly fails in a way that implies design uncertainty
- required observation evidence cannot be captured
- permission, secret, external service, destructive action, commit, push, PR, or deploy authorization is missing

## Verification Scope

- `trivial`: verify only the changed surface unless the change touches shared runtime behavior. Do not run broad suites solely because a full suite exists.
- `standard`: run plan-specified checks and related tests for the touched surface; add smoke checks for cross-boundary changes.
- `heavy-risky`: run the relevant full suite plus review/eval evidence; capture observation when behavior changed.

When the scope is narrower than the full suite, report the reason and the exact evidence used.

## Relationship To Local Commands

- `/plan-task` is the local planning fallback when Superpowers `writing-plans` is unavailable or a local artifact is required.
- `/implement-task` is the local manual execution fallback.
- `/review-task` is the local durable findings fallback.
- `/verify` and `/eval` remain local evidence and acceptance surfaces.

## Output

Produce a concise execution report:

```text
EXECUTE PLAN: [DONE/NEEDS DECISION/BLOCKED]

Track:       [trivial/standard/heavy-risky]
Engine:      [Superpowers executing-plans/subagent-driven/fallback]
Preflight:   [pass/fail]
Execution:   [complete/partial/blocked]
Verify:      [pass/fail/not needed]
Observe:     [pass/not required/missing]
Postflight:  [complete/blocked]

Files Changed:
- ...

Residual Risks:
- ...

Next Action:
- ...
```
