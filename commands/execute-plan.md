---
description: Local pipeline entrypoint with .claude telemetry, permission, and stop-condition boundaries.
---

# Execute Plan

Use this command when a task is ready for pipeline-guided execution.

`/execute-plan` is the current local pipeline entrypoint. It coordinates `.claude` preflight/postflight, permission boundaries, telemetry, and the selected execution adapter or discipline pack.

For standard and heavy-risky work, this command records run evidence under `.claude/runs/` by calling `task-queue.js add`/`start` before execution begins (see Execution Flow step 4 and "Pipeline Evidence Mechanism" below). Lifecycle hooks currently warn when implementation or commit activity has no recent pipeline evidence; the warning is observational during the staged rollout and does not block by itself.

## Preconditions

- The task track is selected: `trivial`, `standard`, or `heavy-risky`.
- A suitable execution adapter or discipline pack is available in the active runtime.
- Requirements are clear enough for pipeline-guided planning or execution.
- Heavy-risky work has explicit approval before execution.
- Destructive actions, commit, push, PR creation, deploy, and external-service mutations are explicitly authorized before they run.

## Wrapper Contract

The wrapper may:

- start or confirm session tracing
- read repo-local `AGENTS.md`
- classify the task track
- invoke the selected planning/execution discipline
- preserve local permission boundaries
- capture verification evidence when needed
- capture observation evidence only when behavior changed
- record guardrail candidates when a recurring or reusable failure appears
- produce a PR-ready or handoff-ready summary

The wrapper must not:

- bypass the pipeline with a competing default execution path
- invoke `task-queue.js run/retry/watch` or `pipeline-runner.js --execute` merely to record evidence — those spawn a real provider adapter and constitute a competing execution path
- require heavyweight local artifacts for trivial tasks
- bypass adapter or discipline readiness checks
- bypass local permission policy
- auto-commit, auto-push, create PRs, deploy, or run destructive commands without explicit authorization
- treat a recorded gate (a `runs/` evidence file, a JSONL trace entry) as correctness evidence — a gate records that a check ran, not that the work is right

## Execution Flow

1. Run thin `.claude` preflight:
   - confirm runtime/session tracing
   - read repo-local `AGENTS.md`
   - classify the track
   - identify permission-sensitive operations
2. For unclear requirements, stop and return to `/shape-task` or `/grill-me` before planning. Do not start execution on unclear requirements.
3. For standard or heavy-risky work, pass through the pipeline plan gate.
4. For standard or heavy-risky work only, once the plan gate has passed and execution is about to start, stamp run evidence via the local task queue before touching code. Treat this as best-effort and non-blocking — do not stop the run if it errors.
   - Compute `task_id` as a stable kebab-case slug of the task title (e.g. `add-user-export-endpoint`).
   - Run from the repo root:
     ```bash
     node ~/.claude/scripts/task-queue.js add --task-id "<task_id>" --title "<short task title>" --order "<one-line restatement of the task objective>"
     node ~/.claude/scripts/task-queue.js start --task-id "<task_id>" --repo "$(git rev-parse --show-toplevel)"
     ```
   - If `add` reports the task already exists (re-entry on the same plan/session), ignore that and still run `start` — `start` is safe to call repeatedly and just opens a new run under the same task.
   - Never use `task-queue.js run`, `retry`, or `watch`, and never call `pipeline-runner.js` with `--execute`, from this step — see "Pipeline Evidence Mechanism" below.
   - Note in the postflight report whether this stamp succeeded, and if not, why (e.g. `node` unavailable, not a git repo, `~/.claude` not writable) — report it as a coverage gap, not a blocker.
   - Skip this step entirely for `trivial` work.
5. For execution, use `/implement-task` or the runtime's own execution adapter. Do not dispatch subagents unless the operator explicitly asks and the work is disjoint.
6. Let the pipeline own order, stop conditions, evidence, and handoff while adapters own execution mechanics.
7. Use local `.claude` evidence surfaces only as needed:
   - `verification-summary.md` when rerunnable evidence should be preserved or local commit gates require it
   - `review-summary.md` when unresolved findings or residual risks need durable capture
   - `observation-summary.md` when runtime, UI, or integration behavior changed
   - token metrics when the runtime exposes usage payloads; record missing usage as coverage gap, not as zero cost
8. Run thin `.claude` postflight:
   - summarize files and behavior changed
   - record verification/observation pointers
   - record guardrail candidates when warranted
   - state whether commit/PR/deploy still requires human authorization

## Stop Conditions

Stop and ask for an explicit decision when:

- no suitable adapter or discipline pack is available
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

## Pipeline Evidence Mechanism

- `/execute-plan` leaves run evidence for standard/heavy-risky work using `node scripts/task-queue.js add` + `start` (Execution Flow step 4). This only stamps `~/.claude/runs/<run_id>/meta.json` and `logs/events.ndjson`; it requires no artifact path, no provider adapter, and executes nothing.
- `node scripts/task-queue.js run|retry|watch` and `node scripts/pipeline-runner.js --execute ...` (also exposed as `npm run pipeline:runner`) drive a full autonomous, headless pipeline through a provider adapter (`codex` or `claude -p`). That is a separate, heavier mechanism intended for queued/unattended work — `/execute-plan` must not invoke it for its own in-session execution, since doing so would spawn a second, competing execution path.

## Relationship To Local Commands

- The decisions come from `docs/design/YYYY-MM-DD-<slug>.md`, written by `/docs-build`. `plan.md` was retired on 2026-08-17; there is no planning command.
- `/implement-task` is the local manual execution fallback.
- `/review-task` is the local durable findings fallback.
- `/verify` and `/eval` remain local evidence and acceptance surfaces.

## Output

Produce a concise execution report:

```text
EXECUTE PLAN: [DONE/NEEDS DECISION/BLOCKED]

Track:       [trivial/standard/heavy-risky]
Adapter:     [selected adapter/discipline/fallback]
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
