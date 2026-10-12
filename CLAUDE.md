# Personal Harness Canonical

Entrypoint for my personal agent harness: decision rules, unusual constraints, and pointers.

## Before Writing Files

- Non-trivial work starts with the managed plugin's `grilling` skill. Codex resolves it with
  `node ~/.claude/harness/scripts/resolve-managed-skill.js grilling` and reads the returned
  `SKILL.md` completely.
- The Grill ends with a final understanding and waits for confirmation. Confirmation does not
  authorize file changes: wait for an explicit next instruction.
- With a declared tracker (`.claude/tracker.json`), work without an issue goes through
  `skills/draft-issue` first. File it only after the operator approves, then start it with
  `start-issue`, one task per conversation.
- Skip the Grill only when every field of that draft can be filled from the request and the
  environment without guessing. Otherwise ask only about the unfilled fields.
- Work too large for one conversation goes through the Grill, `/docs-build`, and `split-issue`.

## Core Rule

- `~/.claude` is the source of truth for the local control layer. Telemetry, permissions,
  adapters, and guardrails improve here, not in a second local authority.
- `~/.codex` is a runtime bridge, not a second harness. External frameworks, plugin packs, and
  upstream repos must remain observable through the local control layer.
- Vendored upstream skills (`AGENTS.md` → Upstream Assets) are tools the operator invokes
  explicitly: no lifecycle policy, nothing starts on its own, never edited.
- Active repositories expose a thin repo-local map (root `AGENTS.md`) that points to truth
  sources and does not duplicate the lifecycle.
- Between convenience and reliable continuity, prefer reliable continuity.

## Tracks And Artifacts

Use the lightest artifact chain that preserves correctness.

- `trivial`: context check plus verification of the changed surface
- `standard`: pipeline-guided planning/execution, verification evidence, and a lightweight
  acceptance summary
- `heavy-risky`: explicit approval, worktree isolation, review, verification, residual-risk
  acceptance, and observation when behavior changed

Artifacts:

- design doc: the decisions, written before implementation
- `verification-summary.md`: rerunnable checks, including the RED observation
- `review-summary.md`: findings, residual risks, and the refactoring, security, and
  comment-adequacy passes
- `observation-summary.md`: required when runtime or UI behavior changed
- `Guardrail Candidates` sections: recurring failure patterns. Promote them to the narrowest
  durable layer, never automatically; health and triage recommend next tasks first

`verify` proves rerunnable checks passed, `evaluate` that the work is acceptable, `observe`
runtime behavior. None substitutes for another. There is no `plan.md` or `progress.md`.
Repository artifacts are the control and approval surface.

Write task artifacts in Japanese, keeping the templates' canonical section headings. Use English
only for command names, file paths, API names, code identifiers, quoted output, and parser tokens.

## Execution Rules

- default spine for standard and heavy-risky work: the local pipeline (`/execute-plan`), or
  `start-issue` as a runtime goal when the project declares a tracker
- search for an existing implementation before writing new code (`gh search code`, package
  registries, open source) and prefer porting a proven approach
- diagnosis belongs to the Grill. Implement with `skills/tdd`: agree the seams, RED, minimum
  GREEN. Refactoring belongs to review
- do not implement heavy-risky work before explicit approval
- do not skip review or evaluate for implementation and bug-fix work
- do not claim done without verification evidence. For UI or runtime behavior changes, build and
  test alone are not enough
- security pass only when the change touches a decision boundary, untrusted input,
  shell/SQL/path construction, secrets, or a network destination. Then run the code
  adversarially instead of reading it
- multi-agent only for independent research, disjoint code slices, or sidecar verification
- when the agent got something wrong, add one line to that repository's `AGENTS.md` (`/repo-map`)
- hooks block only `git push` to `main`/`master` (`harness/hooks/git-push-guard.js`). Every other
  rule depends on discipline

## Task Finishing

Before reporting an implementation or fix complete, creating its PR, or moving its ticket to Done:

- finish the changed code, prose, and comments (`docs/how-to/run-a-task.md`), update
  documentation to the actual finished state, and rerun affected checks. No unrelated cleanup
- fill the `Code Quality` fields of `review-summary.md` with targets and reasons, even when no
  change is needed. After reviewing the final diff and evidence, record the `--fingerprint`
  output of the command below as `Revision`
- `node ~/.claude/harness/scripts/task-completion.js --repo <repo>` must exit zero before the
  completion action. A failed check means continue finishing, not asking the operator to request
  cleanup again

## Context And Recovery

- keep always-loaded instructions short and point to docs and skills instead of inlining.
  `harness/scripts/ci/validate-rules.js` fails above the limit
- nothing persists a state summary across a compact. Commit before compacting
- restore the current task from git first (branch, log, diff), then the design doc: the latest
  `docs/design/` entry, or with a tracker, the issue named in the branch and its parent
- gate evidence and run history: `harness/data/runs/<date>-<slug>/` (git-tracked). Execution
  trace: `projects/**/*.jsonl`
- `telemetry/telemetry.db` is an orphan on disk. Deleting it is a human decision

## Where Things Live

- commands: `commands/` (`COMMANDS.md` has the Ordered Path and the tracker flow)
- templates and their gate contracts: `harness/templates/`
- how it is wired today, where it blocks, what is not enforced: `docs/architecture.md`
- why it is shaped this way: `docs/design/` (dated, append-only)
