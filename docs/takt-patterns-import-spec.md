# SPEC: TAKT Pattern Import Into The `.claude` Harness

Date: 2026-05-13
Status: implementation-spec
Owner: `.claude` local harness

## Purpose

Import TAKT's strongest coordination patterns into the git-managed `.claude`
user harness without making TAKT the runtime authority.

The target is not a superficial clone. The target is to reproduce TAKT's
operating advantages inside `.claude`:

- declarative workflow control
- faceted prompt composition
- task/run separation
- inspectable execution evidence
- permission-mode resolution
- review/fix routing
- provider adapters
- isolated task execution
- retry/instruct/list management

`.claude` remains the source of truth for lifecycle rules, telemetry,
permission policy, session continuity, and improvement loops.

## Decision

`.claude` owns the harness.

TAKT is treated as:

- reference implementation
- architecture catalog
- behavior target for local reimplementation
- optional comparison runner
- source-compatible inspiration when license and attribution are respected

TAKT is not treated as:

- canonical workflow authority
- required runtime dependency
- replacement for `.claude` telemetry
- replacement for local approval and permission policy
- replacement for operator judgment

## Research Summary

### TAKT Patterns Confirmed

From TAKT's current public README:

- TAKT runs agents through YAML-defined workflows with planning,
  implementation, review, and fix loops.
- It supports Claude Code, Codex, OpenCode, Cursor, GitHub Copilot CLI, and
  direct API usage.
- It queues tasks, creates isolated execution environments, logs every step,
  and lets users list/merge/retry/delete task branches.
- Workflow definitions use `steps`, `initial_step`, `max_steps`, per-step
  persona/policy/instruction/knowledge/output contracts, edit permissions, and
  routing rules.
- Workflow files resolve with local override priority:
  project `.takt/workflows/`, user `~/.takt/workflows/`, then builtins.

From TAKT task-management docs:

- `task_id` and run attempt are separate concerns.
- Tasks have metadata plus editable `order.md` and attachments.
- Runs have reports, NDJSON logs, context snapshots, and metadata.
- Interrupted `running` tasks are recovered to `pending`.
- Worktree-named execution is implemented with `git clone --shared`, not
  `git worktree`, so the agent sees an independent `.git` directory.

From TAKT faceted-prompting docs:

- Prompt concerns are split into five facets:
  - persona: who judges
  - policy: what constraints to uphold
  - knowledge: what context to reference
  - instruction: what procedure to perform
  - output contract: what shape to produce
- Persona goes to system prompt.
- Knowledge, task, instruction, output contract, and policy go to user message.
- Policy is placed late to exploit recency and keep constraints near output.
- Facets are composed declaratively from workflow definitions.

From source-level inspection:

- `InstructionBuilder` assembles execution context, task, previous response,
  user inputs, policy, knowledge, quality gates, and instructions as a single
  runtime prompt.
- `pieceParser` normalizes YAML into internal workflow objects, including
  `ai(...)` rules, `all(...)` / `any(...)` aggregate rules, parallel substeps,
  provider options, output contracts, quality gates, and loop monitors.
- `workflowExecution` creates a workflow engine, binds event logging, manages
  resume points, abort handling, iteration limits, session updates, provider
  options, and system-step services.
- `taskWorkflowExecution` resolves workflow identity, validates trust
  boundaries, resolves provider options, and passes execution options into the
  workflow executor.

### Local `.claude` Current State

Already implemented locally:

- `workflows/standard-development.yaml`
  - research -> plan -> implement -> review -> verify
  - readonly review step
  - bounded `max_steps`
  - review routes `needs_fix` back to implement
- `schemas/lifecycle-workflow.schema.json`
- `schemas/task.schema.json`
- `schemas/run.schema.json`
- `scripts/workflow-doctor.js`
  - validates local workflow files
  - catches duplicate steps, invalid modes, bad targets, review editability,
    and unbounded max steps
- `scripts/task-queue.js`
  - `add`
  - `list`
  - `start`
  - creates `.claude/tasks/{task_id}/order.md`
  - creates `.claude/runs/{run_id}/meta.json`
  - writes `.claude/runs/{run_id}/logs/events.ndjson`
  - links task runs into SQLite through `recordTaskRun`
- `facets/`
  - personas
  - policies
  - knowledge
  - instructions
  - output-contracts
- `scripts/prompt-assemble.js`
  - persona -> system prompt
  - knowledge -> task -> instruction -> output contract -> policy in user
    message
- `scripts/lib/permission-resolver.js`
  - workflow/track permission resolution
  - plan-text sensitive action detection
  - Bash command classification shared with permission hook
- `scripts/hooks/permission-request.js`
  - delegates Bash decisions to the shared resolver
- `scripts/pipeline-runner.js`
  - preflight
  - workflow load
  - adapter handoff
  - step loop with `--loop`
  - run evidence creation
  - `permission_resolved` / `permission_requested`
  - `step_started` / `step_completed`
  - `rule_matched`
  - `run_completed` / `run_blocked`
  - review aggregation for malformed/blocked/needs_fix/approved outcomes

Verified locally:

- `npm test`: 1123 passed, 0 failed
- `node tests/lib/permission-resolver.test.js`: 15 passed, 0 failed
- `node tests/hooks/hooks.test.js --allow-known-baseline`: 218 passed,
  3 known baseline failures, 0 unexpected failures
- `node tests/scripts/pipeline-runner.test.js`: 27 passed, 0 failed
- `node tests/scripts/task-queue.test.js`: 3 passed, 0 failed
- `node tests/scripts/prompt-assemble.test.js`: 2 passed, 0 failed
- `node tests/scripts/workflow-doctor.test.js`: 6 passed, 0 failed

## Architecture Target

The local target is a `.claude`-native TAKT-style harness:

```text
.claude/
  workflows/
    standard-development.yaml
    heavy-risky-development.yaml
    docs-only.yaml
  schemas/
    lifecycle-workflow.schema.json
    task.schema.json
    run.schema.json
    step-result.schema.json
  facets/
    personas/
    policies/
    knowledge/
    instructions/
    output-contracts/
  tasks/
    index.json
    {task_id}/
      order.md
      attachments/
      retry-notes.md
      instructions.md
  runs/
    {run_id}/
      meta.json
      logs/
        events.ndjson
      reports/
      context/
        previous-response.md
        prompt-preview.md
        diff-summary.md
  scripts/
    workflow-doctor.js
    task-queue.js
    prompt-assemble.js
    pipeline-runner.js
    provider-adapters/
      codex.js
      claude-code.js
      dry-run.js
```

## Core Contracts

### 1. Workflow Contract

Minimum local workflow shape:

```yaml
name: standard-development
initial_step: research
max_steps: 12
steps:
  - name: research
    mode: readonly
    facets:
      persona: researcher
      instruction: research-task
      output_contract: research-summary
    outputs:
      - research.md
    rules:
      - condition: research_complete
        next: plan
      - condition: blocked
        next: ABORT
```

Required behavior:

- `initial_step` must exist.
- Step names must be unique.
- `mode` must be `readonly`, `edit`, or `full`.
- Review steps must be readonly.
- Rule targets must be another step, `COMPLETE`, or `ABORT`.
- `max_steps` must be bounded.
- Missing rule matches block the run.

TAKT parity still missing:

- `ai("...")` rule conditions
- aggregate `all("...")` / `any("...")` rules
- nested parallel substep definitions
- loop monitors
- workflow inheritance / override resolution
- quality gates
- report output contract objects with filenames and formats

### 2. Facet Contract

Local prompt assembly order is fixed:

```text
system:
  persona

user:
  knowledge
  task
  instruction
  output_contract
  policy
```

Required behavior:

- Facet lookup is deterministic.
- Missing facets fail loudly.
- Policy remains late in the user message.
- Large docs stay referenced unless the step explicitly needs the content.

TAKT parity still missing:

- facet inheritance such as `{extends:base}`
- multiple policy/knowledge refs per step
- project/user/builtin facet resolution layers
- conflict warnings for truncated context
- prompt preview snapshots per run
- output contract objects that create report files automatically

### 3. Task Contract

`task_id` identifies intent.

Required local shape:

```json
{
  "task_id": "task-add-auth-abcdef12",
  "title": "Add auth",
  "status": "pending",
  "task_dir": "tasks/task-add-auth-abcdef12",
  "current_run_id": "",
  "created_at": "2026-05-13T00:00:00.000Z",
  "updated_at": "2026-05-13T00:00:00.000Z"
}
```

Required behavior:

- `add` creates metadata and `order.md`.
- `list` shows task status.
- `start` creates a run and marks the task `running`.
- task records are mirrored into SQLite where useful.

TAKT parity still missing:

- `run`
- `retry`
- `instruct`
- `delete`
- `recover-running`
- `watch`
- issue import through `gh`
- branch/worktree metadata
- task status finalization after runner completion

### 4. Run Contract

`run_id` identifies one attempt to execute one task.

Required local shape:

```json
{
  "run_id": "run-task-add-auth-abcdef12",
  "task_id": "task-add-auth-abcdef12",
  "status": "running",
  "workflow": "standard-development",
  "current_step": "implement",
  "step_count": 3,
  "repo_root": "/path/to/repo",
  "started_at": "2026-05-13T00:00:00.000Z",
  "updated_at": "2026-05-13T00:00:00.000Z"
}
```

Required NDJSON event types:

- `run_started`
- `step_started`
- `permission_resolved`
- `permission_requested`
- `step_completed`
- `rule_matched`
- `review_aggregated`
- `artifact_written`
- `verification_run`
- `run_completed`
- `run_blocked`

TAKT parity still missing:

- previous response context snapshot
- prompt preview snapshot
- report file generation from output contracts
- final run status sync into task index
- resume point / start-step retry
- structured provider event capture

### 5. Permission Contract

Local permission modes:

- `readonly`: read/search/inspect only
- `edit`: workspace edits permitted, no destructive/external mutation
- `full`: explicit authorization required for destructive/external actions

Provider mapping target:

```json
{
  "readonly": {
    "codex": "read-only",
    "claude": "default"
  },
  "edit": {
    "codex": "workspace-write",
    "claude": "acceptEdits"
  },
  "full": {
    "codex": "danger-full-access",
    "claude": "bypassPermissions"
  }
}
```

Required behavior:

- step mode sets the floor.
- plan text can raise to `full` when sensitive actions appear.
- heavy-risky work requires explicit approval.
- Bash permission hook shares the same classifier.
- destructive Bash commands hard-deny with interrupt.

TAKT parity still missing:

- provider profile resolution
- per-step provider options
- network access flags
- sandbox flags
- MCP server declarations
- config precedence across global/project/task/workflow/step

### 6. Review/Fix Contract

Required behavior:

- reviewers are readonly.
- review output is aggregated.
- malformed review payload blocks.
- blocked reviewer blocks.
- any finding routes to `needs_fix`.
- clean review routes to `approved`.
- `needs_fix` routes back to implement.

TAKT parity still missing:

- real parallel reviewer execution
- aggregate `all(...)` / `any(...)` rule evaluation
- reviewer-specific personas and policies
- severity-aware blocking:
  - `CRITICAL` / `HIGH` block completion
  - lower accepted concerns become residual risks
- per-reviewer reports

### 7. Provider Adapter Contract

Provider adapters must be small, inspectable programs called by
`pipeline-runner`.

Adapter input:

- CLI args from `pipeline-runner`
- environment variables:
  - `PIPELINE_RUNNER_REPO`
  - `PIPELINE_RUNNER_PLAN`
  - `PIPELINE_RUNNER_TRACK`
  - `PIPELINE_RUNNER_RUNTIME`
  - `PIPELINE_RUNNER_TASK_ID`
  - `PIPELINE_RUNNER_WORKFLOW`
  - `PIPELINE_RUNNER_STEP`
  - `PIPELINE_RUNNER_STEP_INDEX`
  - `PIPELINE_RUNNER_RUN_ID`
  - `PIPELINE_RUNNER_RUN_DIR`

Adapter output:

```json
{
  "condition": "implementation_complete",
  "status": "complete",
  "summary": "Implemented requested change.",
  "artifacts": ["path/to/file"],
  "blockers": [],
  "permission_requests": []
}
```

Required behavior:

- exit `0`: completed step
- exit `2`: needs human decision
- other nonzero: blocked/failed
- stdout first JSON line is parsed as step result
- adapters do not decide global lifecycle policy

TAKT parity still missing:

- Codex real adapter
- Claude Code real adapter
- dry-run scenario adapter as first-class fixture
- retry with prior run context
- provider session continuity
- provider stream event capture

### 8. Isolation Contract

Local policy target:

- standard and heavy-risky queued tasks default to isolated clone execution.
- trivial tasks may run in place.
- destructive cleanup requires explicit authorization.

TAKT behavior to mirror:

- prefer `git clone --shared` over `git worktree` for agent isolation.
- clone has independent `.git`.
- run executes inside clone.
- reports and context are written inside the clone-visible run directory where
  needed.
- main repository path is not leaked unnecessarily to the agent.
- merge/push/PR/delete remain explicit human authorization boundaries.

Local parity still missing:

- clone manager
- branch naming
- base branch detection
- diff/list actions
- try-merge / merge-cleanup flow
- clone preservation for retry/instruct
- cleanup state tracking

## Gap Matrix

| TAKT Capability | Local Status | Next Local Work |
| --- | --- | --- |
| YAML workflow | partial | expand schema and parser beyond local subset |
| workflow doctor | partial | validate facets, outputs, provider options |
| faceted prompting | partial | inheritance, multi-ref, prompt snapshots |
| task queue | partial | run/retry/instruct/delete/recover |
| run evidence | partial | final sync and richer provider event capture |
| permission modes | partial | provider profiles and network/sandbox options |
| review/fix loop | partial | real parallel reviewer execution |
| provider adapters | partial | provider profiles, dry-run fixture, live smoke coverage |
| isolated execution | missing | shared-clone lifecycle |
| list/merge/retry UI | missing | non-interactive first, interactive later |
| watch mode | missing | defer until queue semantics are stable |
| issue/PR integration | missing | gh-based import and explicit PR creation |

## Implementation Order

### Phase A: SPEC Refresh And Source Map

Status: done by this document.

Deliverables:

- current local implementation inventory
- TAKT behavior target
- gap matrix
- implementation order

### Phase B: Workflow Schema Parity

Deliverables:

- `step-result.schema.json`
- workflow parser support for:
  - output contract object format
  - multiple facets per concern
  - provider
  - model
  - provider_options
  - quality_gates
  - parallel substeps
  - aggregate rule syntax metadata
- `workflow-doctor` validation for facets and output contracts

Done when:

- standard workflow validates with richer TAKT-like fields.
- invalid facet/output/provider references fail before execution.

### Phase C: Task Queue Runner

Deliverables:

- `scripts/task-queue.js run`
- `scripts/task-queue.js retry`
- `scripts/task-queue.js instruct`
- `scripts/task-queue.js recover-running`
- final run status sync to task index
- retry notes appended to task records

Done when:

- pending task can execute through dry-run adapter and become completed/failed.
- failed task can be retried from a selected step with retry notes.

### Phase D: Run Evidence Parity

Deliverables:

- prompt preview snapshots
- previous response snapshots
- report creation from output contracts
- `artifact_written`, `review_aggregated`, and `verification_run` events
- SQLite/run-dir reconciliation command

Done when:

- a run can be inspected and replayed from task, workflow, prompts, logs, and
  reports without reading the full chat transcript.

### Phase E: Provider Adapters

Status: implemented for Codex and Claude Code executable adapters.

Deliverables:

- Codex adapter: `scripts/provider-adapters/codex.js`
- Claude Code adapter: `scripts/provider-adapters/claude-code.js`
- shared adapter library: `scripts/provider-adapters/lib/provider-step-adapter.js`
- provider command override for CI and local experiments
- prompt stdin delivery to provider commands
- raw prompt/stdout/stderr context evidence under `runs/{run_id}/context`
- conservative blocked JSON when provider output is malformed

Still deferred:

- dry-run adapter as a first-class fixture
- provider permission profile mapping beyond runner permission gates
- provider stream event capture
- provider session continuity

Done when:

- `pipeline-runner --adapter-command scripts/provider-adapters/codex.js` and
  `pipeline-runner --adapter-command scripts/provider-adapters/claude-code.js`
  can run through the existing step-result JSON contract.
- CI can verify adapter behavior without live provider calls.

### Phase F: Shared Clone Isolation

Status: implemented for queued `standard` and `heavy-risky` runs.

Deliverables:

- shared clone manager
- branch metadata
- clone path metadata
- run-in-clone mode for queued standard/heavy tasks
- diff/list commands
- explicit merge/delete boundaries

Implemented local surface:

- `scripts/lib/shared-clone-manager.js`
- `task-queue run/retry` default shared-clone isolation for `standard` and
  `heavy-risky`
- `--isolate` and `--no-isolate` queue controls
- `task-queue list-clones`
- `task-queue diff --task-id <id>` / `--run-id <id>`

Done when:

- a queued task can run in an isolated clone without mutating the main working
  tree.

### Phase G: Parallel Review

Deliverables:

- reviewer substep definitions
- parallel adapter execution
- aggregate rule evaluation
- severity-aware review merge
- per-reviewer reports

Done when:

- architecture/security/harness reviewers can run independently and aggregate
  into approved/needs_fix/blocked.

### Phase H: List/Manage Surface

Status: implemented for non-interactive clone/task management.

Deliverables:

- non-interactive `list --format json`
- diff action
- try-merge action
- merge-cleanup action
- delete action with explicit authorization
- interactive UI later, only after non-interactive contracts are stable

Implemented local surface:

- `task-queue list --format json`
- `task-queue list-clones --format json`
- `task-queue try-merge --run-id <id> [--target <branch>]`
- `task-queue merge-cleanup --run-id <id> --confirm-merge-cleanup`
- `task-queue delete-clone --run-id <id> --confirm-delete-clone`
- run metadata/events for merge checks, blocked merges, applied merges, and clone deletion

Still deferred:

- interactive UI
- push / PR creation
- task deletion
- run evidence deletion

Done when:

- completed and failed task branches can be managed without hidden state.

## Acceptance Criteria

- `.claude` remains the only canonical harness authority.
- No `.takt` directory is required for normal operation.
- Imported behavior is inspectable through local files, schemas, tests, logs,
  and SQLite telemetry.
- Workflow execution is reproducible from task, workflow, run metadata, prompt
  snapshots, and NDJSON logs.
- Permission decisions are deterministic and visible.
- Review steps cannot edit project files.
- Human authorization is required for destructive operations, commits, pushes,
  PRs, deploys, external mutations, and cleanup.
- Existing artifact chain remains compatible during migration.
- Existing `npm test` passes after each phase.
- Any direct code-level borrowing from TAKT must record MIT attribution and be
  isolated in a reviewable commit.

## Non-Goals

- Do not vendor TAKT wholesale.
- Do not switch canonical state to `.takt`.
- Do not make TAKT a required runtime dependency.
- Do not auto-merge, auto-push, auto-PR, auto-delete, or auto-deploy.
- Do not replace SQLite telemetry with file logs.
- Do not create a resident watch daemon before queue/retry semantics are
  stable.
- Do not make multiple execution paths compete silently; one execution path
  must be selected per task.

## Open Questions

- Should active project tasks live under project-local `.claude/tasks/` or
  remain only under user-global `~/.claude/tasks/`?
- Should root lifecycle artifacts remain canonical, or should run reports
  become canonical with root-level projections?
- Should the first real adapter target Codex or Claude Code?
- Should shared-clone execution preserve clones after success by default, or
  delete after successful branch push?
- Should review severity be parsed from Markdown reports, structured JSON, or
  both?
- Should `ai("...")` rule evaluation use the active provider or a fixed cheap
  judge model?

## Research Sources

- TAKT README: https://github.com/nrslib/takt/tree/main
- TAKT faceted prompting docs:
  https://raw.githubusercontent.com/nrslib/takt/main/docs/faceted-prompting.md
- TAKT task management docs:
  https://raw.githubusercontent.com/nrslib/takt/main/docs/task-management.md
- TAKT `InstructionBuilder`:
  https://raw.githubusercontent.com/nrslib/takt/main/src/core/piece/instruction/InstructionBuilder.ts
- TAKT `pieceParser`:
  https://raw.githubusercontent.com/nrslib/takt/main/src/infra/config/loaders/pieceParser.ts
- TAKT `workflowExecution`:
  https://raw.githubusercontent.com/nrslib/takt/main/src/features/tasks/execute/workflowExecution.ts
- TAKT `taskWorkflowExecution`:
  https://raw.githubusercontent.com/nrslib/takt/main/src/features/tasks/execute/taskWorkflowExecution.ts
