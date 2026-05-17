# Observation Summary

## Behavior Changed

- `scripts/task-queue.js run/retry/watch` now default to `workflows/standard-development.yaml` when `--workflow` is omitted.
- `scripts/task-queue.js run/retry/watch` now resolve omitted adapters from runtime: `codex` uses the Codex provider adapter and `claude` uses the Claude Code provider adapter.
- Explicit `--adapter-command` / `--engine-command` still wins over runtime adapter defaults.
- Unsupported runtime without an explicit adapter now blocks conservatively with `adapter-command is required`.
- `scripts/prompt-assemble.js` can now assemble prompts for object-form parallel reviewer substeps such as `architecture_review`.
- `scripts/task-queue.js watch` now recovers interrupted running tasks, reconciles run metadata, and executes pending tasks through the existing `executeTaskRun` path.
- `scripts/task-queue.js watch --max-tasks <n>` now bounds automatic queued task execution for deterministic local operation.
- `scripts/task-queue.js watch --format json` now emits structured watch results for automation.
- `scripts/task-queue.js watch --resident` / `--forever` can keep polling, while default watch mode exits after one scan when there is no more work.
- The local harness documentation now presents the pipeline as the primary execution spine for non-trivial work.
- Superpowers is now documented as a selectable discipline pack rather than the default lifecycle owner.
- TAKT is now documented as a reference pattern source only, not a runtime authority or dependency.
- `docs/pipeline-primary-harness-spec.md` records the pipeline-primary responsibility model, stage order, migration phases, acceptance criteria, non-goals, and open questions.
- `scripts/pipeline-runner.js` summary output now reports `Adapter:` with the selected adapter label or `not-selected`.
- `scripts/pipeline-runner.js --adapter-command` is now the preferred adapter execution flag.
- `scripts/pipeline-runner.js --engine-command` remains accepted as a compatibility alias during migration.
- `scripts/pipeline-runner.js` now records `adapter_command` metadata/evidence for adapter execution instead of new `engine_command` metadata.
- `scripts/task-queue.js run/retry` now call the pipeline with `--adapter-command`.
- `scripts/task-queue.js run/retry` still accept `--engine-command` as a compatibility input and normalize it to the adapter command internally.
- `scripts/pipeline-runner.js` can now interpret workflow adapter stdout as structured JSON.
- `scripts/pipeline-runner.js` can now run an opt-in bounded multi-step workflow loop with `--loop`.
- `scripts/pipeline-runner.js` now resolves permission mode before adapter execution and stops when full authorization is required.
- `scripts/hooks/permission-request.js` now reuses `scripts/lib/permission-resolver.js` for Bash command classification instead of maintaining a separate local classifier.
- `scripts/workflow-doctor.js` now validates TAKT-like workflow metadata before execution:
  - multiple facet references
  - output contract report formats
  - provider/model/provider options
  - quality gates
  - required permission floors
  - parallel reviewer substeps
  - aggregate rule metadata
- `scripts/prompt-assemble.js` now accepts multiple facet references and joins them deterministically inside the same prompt section.
- `scripts/lib/permission-resolver.js` now raises workflow permission mode when `required_permission_mode` exceeds the step mode.
- `scripts/task-queue.js` can now execute queued tasks through `pipeline-runner --execute --loop` and synchronize task/run status to `done` or `blocked`.
- `scripts/task-queue.js` can now retry tasks with a new run ID, append retry notes, add task instructions, and recover orphaned running tasks back to `pending`.
- When executing the `review` workflow step, reviewer payloads are aggregated into one routing condition:
  - no findings routes as `approved`
  - any findings route as `needs_fix`
  - blocked or malformed review payloads route as `blocked`
- When a `review` step defines object-form `parallel[]` reviewer substeps, `scripts/pipeline-runner.js` now executes each reviewer as an independent adapter invocation instead of executing the parent review adapter.
- Parallel reviewer adapter invocations receive the reviewer name through `--step`, the same repo, the same plan/task context, and the same run ID.
- Reviewer substeps are required to resolve to readonly permission; non-readonly or authorization-required reviewer substeps are converted into conservative blocked reviewer results.
- Parallel reviewer outputs are normalized into structured `reviewers[]` entries and aggregated in workflow order:
  - malformed reviewer output or adapter failure routes as `blocked`
  - any reviewer `blocked` status or condition routes as `blocked`
  - any reviewer `needs_fix` status/condition or finding routes as `needs_fix`
  - all clean reviewers route as `approved`
- Workflows without object-form reviewer substeps still use the legacy single review adapter `reviewers[]` payload fallback.
- Run evidence now records per-reviewer previous-response snapshots and report projections, plus `reviewer_started`, `reviewer_completed`, and `reviewer_blocked` NDJSON events.
- Loop runs create inspectable evidence under `.claude/runs/{run_id}`:
  - `meta.json`
  - `logs/events.ndjson`
  - `reports/`
  - `context/`
- Loop runs now write prompt previews to `.claude/runs/{run_id}/context/prompt-preview.{step}.md` before each step when prompt assembly succeeds.
- Prompt snapshot failures no longer block workflow execution; they are recorded as `prompt_snapshot_failed` events.
- Adapter JSON results are now preserved as `.claude/runs/{run_id}/context/previous-response.{step}.json`.
- Adapter `artifacts` values now produce `artifact_written` events in run NDJSON logs.
- Review aggregation and verify completion now emit `review_aggregated` and `verification_run` events.
- Workflow `output_contracts.report[]` entries now project timestamped inspection reports under `.claude/runs/{run_id}/reports/`.
- `scripts/task-queue.js reconcile-runs` now reconciles task index state from run metadata, writes `run_reconciled` events, and synchronizes SQLite `task_runs`.
- Missing run directories during reconciliation return linked tasks to `pending`, matching the existing recovery behavior.
- `scripts/provider-adapters/codex.js` can now be used as a `pipeline-runner --adapter-command` adapter and defaults to `codex exec -`; `--engine-command` remains a runner compatibility alias.
- `scripts/provider-adapters/claude-code.js` can now be used as a `pipeline-runner --adapter-command` adapter and defaults to `claude -p`; `--engine-command` remains a runner compatibility alias.
- Provider adapters now assemble the workflow step prompt, send it to the provider command through stdin, parse the provider's step-result JSON, and emit that JSON as the first stdout line for `pipeline-runner`.
- Provider adapters now write raw prompt/stdout/stderr evidence to `.claude/runs/{run_id}/context/provider-{prompt,stdout,stderr}.{step}.*` when a run directory is available.
- Malformed provider output now becomes a conservative `blocked` step-result JSON instead of crashing the runner path.
- `scripts/task-queue.js run/retry` now default queued `standard` and `heavy-risky` tasks to shared-clone execution.
- `scripts/task-queue.js run/retry --no-isolate` can keep a standard/heavy-risky run in the source repository when explicitly requested.
- `scripts/task-queue.js run/retry --isolate` can force clone execution for otherwise in-place runs such as `trivial`.
- Run metadata for isolated runs now records source repo root, clone path, task branch, base branch, base commit, and isolation mode.
- Isolated queue runs now execute adapters with `cwd` and `--repo` pointed at `.claude/runs/{run_id}/workspace`, leaving the source repo working tree untouched.
- Clone setup failures now block the task with `clone_failed` evidence instead of silently falling back to in-place execution.
- `scripts/task-queue.js list-clones` now lists run/task/branch/path/status for preserved clones.
- `scripts/task-queue.js diff` now summarizes clone-local changes with `git status --short` and `git diff --stat` without mutating the source repo.
- `scripts/task-queue.js list --format json` now emits machine-readable task queue state.
- `scripts/task-queue.js list-clones --format json` now emits machine-readable clone metadata.
- `scripts/task-queue.js try-merge` now checks whether a clone diff can apply to the source repo without mutating the source repo.
- `scripts/task-queue.js merge-cleanup --confirm-merge-cleanup` now applies clone changes to the source repo working tree, records merge metadata, and does not push, PR, commit, or delete run evidence.
- `scripts/task-queue.js delete-clone --confirm-delete-clone` now removes only the clone workspace and preserves run metadata, logs, reports, and context evidence.
- Clone management now emits `clone_merge_checked`, `clone_merge_blocked`, `clone_merged`, and `clone_deleted` events.
- `scripts/pipeline-runner.js` now preserves pre-existing run NDJSON events when queue setup has already written evidence before runner startup.
- Loop run logs now include `permission_resolved` or `permission_requested` events before step execution.
- Bash permission hook outputs preserve the existing external behavior:
  - dangerous commands are hard-denied with interrupt
  - read-only commands are auto-allowed
  - metadata commands are audit-only allowed
  - other Bash commands ask with justification
- `hooks/lifecycle-pre-edit.js` now warns when standard/non-trivial code edits have no recent pipeline run evidence.
- `hooks/lifecycle-pre-commit.js` now warns when approved standard/non-trivial commits have no recent pipeline run evidence.
- Pipeline entrance enforcement is staged as warning-only; missing pipeline evidence does not block edit or commit paths in this phase.
- `scripts/lib/pipeline-evidence.js` now detects matching run evidence by repo root from `.claude/runs/*/meta.json` and `logs/events.ndjson`.
- `scripts/lib/harness-status.js` now aggregates the current repo, lifecycle artifacts, latest pipeline evidence, task queue state, and optional telemetry into one next-action recommendation.
- `scripts/harness-status.js` now exposes that aggregate as text by default and JSON with `--format json`.
- `commands/next-action.md` now documents the operator-facing `/next-action` status surface.
- `commands/COMMANDS.md` now lists `/next-action` as the recommended status/orientation command.
- The status surface now reports `HARNESS STATUS: READY`, `NEEDS_ACTION`, or `BLOCKED`.
- Dirty working tree state takes priority and recommends review, targeted verification, and commit or continued edits.
- Lifecycle blockers report `BLOCKED` with the narrowest open lifecycle action.
- Blocked/running queue tasks are surfaced before starting new work.
- Clean verified lifecycle state falls back to the current `progress.md` next action.
- Missing remote and missing pipeline evidence are reported as secondary actions instead of retroactive blockers.
- Runtime telemetry is optional; missing or unreadable SQLite state does not fail status generation.

## Evidence Sources

- `tests/lib/permission-resolver.test.js`
- `tests/hooks/hooks.test.js`
- `tests/scripts/pipeline-runner.test.js`
- `tests/scripts/provider-adapters.test.js`
- `tests/scripts/workflow-doctor.test.js`
- `tests/scripts/prompt-assemble.test.js`
- `tests/scripts/task-queue.test.js`
- `node tests/scripts/pipeline-runner.test.js` (`34 passed, 0 failed`)
- `node tests/scripts/workflow-doctor.test.js` (`12 passed, 0 failed`)
- `node tests/scripts/task-queue.test.js` (`16 passed, 0 failed`)
- `node tests/scripts/task-queue.test.js` (`25 passed, 0 failed`)
- `node tests/scripts/provider-adapters.test.js` (`4 passed, 0 failed`)
- `node tests/scripts/pipeline-runner.test.js` (`34 passed, 0 failed`) after adapter-command normalization
- `node tests/scripts/task-queue.test.js` (`25 passed, 0 failed`) after adapter-command normalization
- `node tests/run-all.js` (`1164 passed, 0 failed`) after pipeline-primary docs and runner/queue updates
- `node tests/lib/pipeline-evidence.test.js` (`5 passed, 0 failed`)
- `node tests/hooks/hooks.test.js --allow-known-baseline` (`220 passed`, `0 unexpected failures`, `3 known baseline failures`)
- `node tests/run-all.js` (`1171 passed, 0 failed`)
- `node tests/lib/harness-status.test.js` (`6 passed, 0 failed`)
- `node tests/scripts/harness-status.test.js` (`4 passed, 0 failed`)
- `node scripts/harness-status.js --format json` reported the current dirty working tree as `NEEDS_ACTION`
- `node tests/run-all.js` (`1181 passed, 0 failed`)
- `node tests/scripts/task-queue.test.js` (`28 passed, 0 failed`)
- `node tests/scripts/pipeline-runner.test.js` (`34 passed, 0 failed`)
- `git diff --check` (pass)
- `npm test` (`1184 passed, 0 failed`)
- `node tests/scripts/prompt-assemble.test.js` (`4 passed, 0 failed`)
- `node tests/scripts/task-queue.test.js` (`33 passed, 0 failed`)
- `node tests/scripts/pipeline-runner.test.js` (`34 passed, 0 failed`)
- `npm test` (`1190 passed, 0 failed`)
- `git diff --check` (pass)
- `npm run lint` (pass)
- `npm test` (`1164 passed, 0 failed`)
- `node tests/scripts/prompt-assemble.test.js`
- `node tests/scripts/provider-adapters.test.js`
- `node tests/lib/permission-resolver.test.js`
- `node tests/hooks/hooks.test.js --allow-known-baseline`
- `node tests/scripts/pipeline-runner.test.js`
- `node tests/scripts/workflow-doctor.test.js`
- `node tests/scripts/prompt-assemble.test.js`
- `node tests/scripts/task-queue.test.js`
- `node tests/scripts/task-queue.test.js` (`16 passed, 0 failed`)
- `npm test`

## Guardrail Candidates

- none

## Residual Risks

- LOW: Review aggregation, loop execution, queue execution, report projections, aggregate-rule evaluation, provider adapters, and permission resolution are local and adapter-driven. Live-provider smoke tests and reviewer Markdown report parsing are still future work.
- LOW: Shared-clone merge cleanup and clone deletion are implemented behind explicit confirmation flags; push, PR, task deletion, and run evidence deletion remain deferred.
- LOW: `--engine-command` compatibility intentionally preserves old caller behavior during migration, so old terminology may still appear in external scripts until they are updated.
- LOW: `/execute-plan` is still the concrete command entrypoint; a future `/pipeline` alias remains undecided.
- LOW: Pipeline entrance guardrail is warning-only while signal quality is observed.
- LOW: Runtime telemetry in `/next-action` is optional and may be omitted when local SQLite access is unavailable.
- LOW: `/next-action` reports missing remote and missing pipeline evidence as secondary actions, not blockers.

## Behavior Checked

- Queued `standard` runs create a shared clone and execute adapter writes inside the clone.
- Queued `trivial` runs stay in the source repo by default.
- `--isolate` forces clone execution and `--no-isolate` opts standard runs back into in-place execution.
- Clone setup failure blocks a run with `clone_failed` evidence.
- `list-clones` and `diff` expose preserved clone state without mutating the source repo.
- Object-form parallel reviewers execute as independent adapter processes and aggregate to `approved`, `needs_fix`, or `blocked` according to structured reviewer JSON.
- Malformed reviewer output and reviewer adapter nonzero exits block conservatively.
- Legacy single-adapter review payloads with `reviewers[]` still route through the previous aggregation path.
- JSON task and clone list output is parseable.
- `try-merge` reports mergeability without creating files in the source repo.
- `merge-cleanup` blocks without `--confirm-merge-cleanup`.
- Confirmed `merge-cleanup` applies clone-created files to the source repo and records metadata/events.
- Confirmed `merge-cleanup` blocks on merge conflicts without overwriting source files.
- `delete-clone` blocks without `--confirm-delete-clone`.
- Confirmed `delete-clone` removes only the clone workspace and preserves run evidence.
- Runner dry-run output reports `Adapter:     not-selected`.
- Runner adapter execution output reports the selected adapter label.
- Runner execution telemetry records `adapter_command` and does not add new `engine_command` metadata.
- Queue execution forwards adapter selection to the runner through `--adapter-command`.
- Existing `--engine-command` callers still work through the compatibility alias.
- Missing pipeline run evidence emits warning-only stderr for standard/non-trivial pre-edit and pre-commit hook paths.
- Existing hard blocks still fire for missing progress, incomplete observation, unresolved findings, and other lifecycle failures.
- `/next-action` reports the current implementation state as `NEEDS_ACTION` because the new files are still uncommitted.
- `/next-action --format json` emits parseable JSON for automation.
- Missing telemetry state does not fail the status command.
- `task-queue watch --max-tasks 1` executes one pending task and leaves later pending tasks untouched.
- `task-queue watch --format json` emits parseable JSON with `status=WATCH`, `executed`, and per-task result entries.
- `task-queue run` can execute with omitted `--workflow` and omitted `--adapter-command` when `--runtime codex` is supplied and `PROVIDER_ADAPTER_COMMAND` overrides the provider command for tests.
- `task-queue watch` can execute pending tasks with omitted `--workflow` and omitted `--adapter-command`.
- `task-queue run` does not fall back to root `plan.md`; task `order.md` remains the implicit plan input.
- provider adapter prompt assembly no longer blocks on object-form parallel reviewer step names.

## Method

- Added targeted queue tests with temporary Git repositories, adapter fixtures, and isolated HOME directories.
- Re-ran runner/provider/prompt regression tests to cover Phase D/E evidence and adapter paths.
- stdout: captured command output from targeted runner/workflow/queue/provider test commands.
- logs: inspected run evidence expectations for `.claude/runs/{run_id}/logs/events.ndjson` reviewer events.

## Evidence

- stdout: `node tests/scripts/pipeline-runner.test.js` passed with `34 passed, 0 failed`.
- stdout: `node tests/scripts/workflow-doctor.test.js` passed with `12 passed, 0 failed`.
- stdout: `node tests/scripts/task-queue.test.js` passed with `16 passed, 0 failed`.
- stdout: `node tests/scripts/provider-adapters.test.js` passed with `4 passed, 0 failed`.
- stdout: `git diff --check` exited 0.
- stdout: `npm run lint` exited 0.
- stdout: `npm test` passed with `1164 passed, 0 failed`.
- `node tests/scripts/task-queue.test.js` passed with `25 passed, 0 failed`.
- `node tests/scripts/pipeline-runner.test.js` passed with `34 passed, 0 failed`.
- `node tests/scripts/provider-adapters.test.js` passed with `4 passed, 0 failed`.
- `node tests/scripts/prompt-assemble.test.js` passed with `3 passed, 0 failed`.
- `node tests/scripts/workflow-doctor.test.js` passed with `12 passed, 0 failed`.
- `npm test` passed with `1164 passed, 0 failed`.
- `node tests/run-all.js` passed with `1164 passed, 0 failed`.
- `node tests/lib/pipeline-evidence.test.js` passed with `5 passed, 0 failed`.
- `node tests/hooks/hooks.test.js --allow-known-baseline` passed with `220 passed`, `0 unexpected failures`, and `3 known baseline failures`.
- `node tests/run-all.js` passed with `1171 passed, 0 failed`.
- `node tests/lib/harness-status.test.js` passed with `6 passed, 0 failed`.
- `node tests/scripts/harness-status.test.js` passed with `4 passed, 0 failed`.
- `node scripts/harness-status.js --format json` reported `status=NEEDS_ACTION` and `workingTree=dirty`.
- `node tests/run-all.js` passed with `1181 passed, 0 failed`.

## Remaining Uncertainty

- Live provider behavior is not smoke-tested in CI.
- Reviewer Markdown report parsing and provider session continuity remain deferred.
- First-class `/pipeline` command naming and a named Superpowers adapter contract remain future migration decisions.
- Whether to promote pipeline entrance warnings to commit-time blocking remains a future decision after warning frequency is observed.
- Runtime telemetry in `/next-action` depends on local SQLite readability and remains optional by design.
