# Personal Harness Canonical

This file is the thin operating entrypoint for my personal agent harness.

## Managed Grill Entry

Non-trivial work starts with the managed read-only plugin's `grilling` skill before this
harness's local pipeline begins. Claude Code uses the managed plugin directly. Codex resolves the
same installation with `node ~/.claude/harness/scripts/resolve-managed-skill.js grilling`, then reads the
returned `SKILL.md` completely.

The Grill closes the unresolved design frontier through questions and environment research. It
ends by presenting a final understanding and waiting for the operator to confirm it. Confirmation
does not authorize file changes: wait for an explicit next instruction. When the operator asks to
continue, resume the distribution lifecycle below.

### Work Without An Issue

In a project that declares a tracker (`.claude/tracker.json`), work that has no issue enters through
`skills/draft-issue` before any implementation: draft the task issue, pass it through
`stop-ai-slop-jp` and `task-goal.js --check`, show it to the operator, and file it only after they
approve. Then start it with `start-issue`.

The Grill may be skipped only when every field of that draft can be filled from the request and the
environment without guessing. Otherwise ask about the fields that cannot be filled, and nothing
else. Work too large for one conversation still goes through the Grill, `/docs-build`, and
`split-issue`.

The first write on a branch whose name carries no issue number gets one advisory per session from
`harness/hooks/lifecycle-pre-edit.js`. It does not stop the write.

## Core Rule

`~/.claude` is the source of truth for the local control layer.
Future improvements to telemetry, permissions, adapters, and guardrails should land here directly instead of introducing a second local authority.

- hooks live in `~/.claude/harness/hooks/` and `~/.claude/harness/scripts/hooks/`
- reusable commands live in `~/.claude/commands/`
- broad standards live in `~/.claude/rules/`
- templates live in `~/.claude/harness/templates/`

`~/.codex` is a runtime bridge, not a second harness.
External frameworks, plugin packs, and upstream repos may inform local improvements, but they must remain observable through the local control layer.

The local pipeline is the default execution spine for non-trivial work. `~/.claude` remains the governance, telemetry, permission, session-continuity, and improvement layer. Vendored upstream skills (see `AGENTS.md` → Upstream Assets) are tools the operator invokes explicitly; they do not define lifecycle policy and nothing starts on its own.

Active repositories should expose a thin repo-local map, preferably root `AGENTS.md`, that points to the real truth sources without duplicating the lifecycle.

Deeper references:

- `~/.claude/docs/architecture.md` for how the harness is wired today: layers, where it blocks,
  what is not enforced, and the order to restore state in
- `~/.claude/commands/COMMANDS.md` for the grouped command surface and the Ordered Path
- `~/.claude/docs/design/` for why it is shaped this way (dated, append-only)

Gate contracts live with the artifacts they govern, in `~/.claude/harness/templates/`.
Permission classes live in `~/.claude/harness/scripts/lib/permission-resolver.js`, not in a doc.

Completion model:

- `verify` proves rerunnable checks passed
- `evaluate` proves the work is acceptable to accept
- `observe` proves runtime behavior when changed behavior needs concrete evidence
- the weight of these gates is selected by task track: `trivial`, `standard`, or `heavy-risky`
- recurring failures should be recorded as `guardrail candidates` and later promoted into the narrowest durable layer that can prevent them
- health and triage should summarize recurring candidates into explicit next-task recommendations before broader automation is added

## Track-Based Artifact Chain

Use the lightest artifact chain that preserves correctness.

- `trivial`: context check plus verification of the changed surface
- `standard`: pipeline-guided planning/execution plus verification evidence and a lightweight acceptance summary
- `heavy-risky`: explicit approval, worktree isolation, review, verification, residual-risk acceptance, and observation when behavior changed

Local artifacts remain available when needed:

- `research.md` for prior art, options, and risks
- `docs/design/YYYY-MM-DD-<slug>.md` for the decisions themselves — written **before** implementation, not after.
  A project that declares a tracker in `.claude/tracker.json` keeps them in the parent issue body instead
- `review-summary.md` for acceptance findings and residual risks
- `verification-summary.md` for rerunnable verification evidence, including the RED observation
- `observation-summary.md` when runtime or UI behavior changed
- optional `Guardrail Candidates` sections when a failure pattern is worth promoting beyond the current task

`plan.md` and `progress.md` were retired on 2026-08-17. Telemetry showed the agent wrote `plan.md`
every time (88 `Write` + 138 `Edit` across 12 sessions) while the docs called it human work, and the
gate that read it could not fire — see below. The decisions live in the design doc.

**Nothing persists a state summary across a compact.** That capability went out with `progress.md`,
deliberately: `run_state.current_phase` / `next_action` / `blockers_json` were filled *from*
`progress.md`, not the other way round, so SQLite was the store and `progress.md` was the source.
Rebuilding it would need a new way to supply the summary, which a hook cannot do — it sees repository
files, not what the agent knows. Recovery is git (branch, log, diff) plus the design doc: the latest
`docs/design/` entry, or with a tracker, the issue named in the branch and its parent. **Commit before compacting.**

**The SQLite plane was retired on 2026-08-20.** Before removal every table was write-only: the
readers had already moved to the JSON logs, so the store was 144MB of data nothing consumed. What
replaced it:

- execution trace → `projects/**/*.jsonl`, which Claude Code writes anyway and which carries the real
  `is_error` flag, token usage, and slash-command invocations
- gate evidence, resume outcome, task↔session↔branch → `harness/data/runs/<date>-<slug>/`, git-tracked, and it
  survives `ExitWorktree(action: "remove")` — which the previous arrangement did not
- the pre-transcript history (oldest transcript record is 2026-07-07) → a one-time archive at
  `harness/data/runs/_archive/telemetry-sqlite-2026-08-20.json`

The `telemetry.db` file itself is an orphan on disk; deleting it is a human decision.

Repository artifacts remain the human-readable control surface and approval surface.

## Artifact Language

Task artifacts should be written in Japanese by default.

- Keep canonical machine-readable section headings when templates require them.
- Write the body text, bullets, decisions, risks, evidence notes, and handoff notes in Japanese.
- Use English only for exact command names, file paths, API names, code identifiers, quoted output, or required parser tokens.

## Execution Rules

- use the local pipeline as the default spine for standard and heavy-risky development work
- search for an existing implementation before writing new code: `gh search code` / package registries / adaptable open-source. Prefer porting a proven approach over net-new code
- do not implement heavy-risky work before explicit approval
- do not skip review or evaluate for implementation and bug-fix work
- do not treat verification as a substitute for evaluation
- do not skip `observation-summary.md` when behavior changed
- do not claim done without verification evidence
- for UI or runtime behavior changes, build/test alone is not enough
- use multi-agent only for independent research, disjoint code slices, or sidecar verification

### Where The Lifecycle Is Enforced

**The hook layer has one blocking gate: pushing to main/master.** Other hook checks advise.
The pipeline runner separately checks task-finishing evidence before reporting DONE.

| Step | Enforcement |
|---|---|
| editing | advisory only. `[Lifecycle Advisory]` names missing evidence and continues |
| `git commit` | advisory only. A commit is a checkpoint, not a claim of completion |
| declaring a task complete | advisory only. Nothing mechanical checks the evidence chain |
| merging a PR, or starting the next task before a merge | discipline. The goal flow leaves the merge to a person; nothing stops `gh pr merge` |
| **`git push` to `main`/`master`** | **blocked** by `harness/hooks/git-push-guard.js`, which resolves the target branch from the repository — so bare `git push` on main is caught, not just an explicit refspec |

A row may claim **blocked** only if it names the hook that implements it. The audit
(`harness/scripts/ci/audit-harness-contract.js`) enforces that, and checks the named hook exists and is
wired in `settings.json`. An unverifiable blocking claim is how the previous version of this table
went wrong.

Two removals, both for the same reason — a gate that can be satisfied vacuously is worse than no gate:

- **Edit blocking, removed 2026-07-28.** The block was satisfied by a placeholder `plan.md` nobody
  maintained, so review evidence still appeared in under 3% of sessions while read-only inspection
  of source files was being denied.
- **The completion gate, removed 2026-08-17.** `harness/hooks/lifecycle-progress-complete.js` exited
  immediately unless the file being written was `progress.md`, and no code in the harness ever
  created `progress.md`. So the gate never fired, while this table claimed completion was blocked.
  Verifying that a hook blocks is not the same as verifying when it fires.

What replaces it is discipline plus the evidence artifacts, and the `Execution Rules` above still
hold. They are now honestly advisory rather than falsely mechanical.

## Task Finishing

Before reporting an implementation/fix complete, creating its PR, or moving its ticket to Done,
read `docs/how-to/run-a-task.md` and finish the task's changed code, prose, and comments.
Apply needed cleanup, update documentation to the actual finished state, and rerun affected checks.
Record targets and reasons even when no change is needed; use the `Code Quality` fields in
`harness/templates/review-summary-template.md`. Do not make unrelated cleanup edits.
After reviewing the final diff and verification evidence, record the fingerprint from
`node ~/.claude/harness/scripts/task-completion.js --repo <repo> --fingerprint`, then run it without
`--fingerprint`. Exit zero is required before the completion action. A failed check means continue
finishing, not ask the operator to request cleanup again. The operator need not invoke a command.
The standard workflow runs the same check before DONE. Manual execution depends on the agent
calling it; no Stop hook intercepts arbitrary prose or external ticket API calls.

## Context Rules

- keep always-loaded instructions short
- prefer a thin repo-local map over ad hoc repository orientation
- prefer references to artifacts, docs, and skills over long inline guidance
- keep repo-local maps pointed at truth sources instead of copying global lifecycle rules
- restore the current task from git first (branch, log, diff), then the design doc (the latest `docs/design/` entry,
  or the issue named in the branch and its parent when the project declares a tracker)
- commit before compacting — nothing else carries the state across

## Preferred Commands

In lifecycle order. Diagnosis belongs to step 1, and the decisions are recorded in step 2 —
**before** implementation, while they are still fresh.

1. `/grill-me` for the depth pass before any file is written (upstream skill; the real content is `grilling`)
2. `/docs-build` for the design doc that records the decisions, and for persistent reference docs in `docs/`.
   With a declared tracker it writes the parent issue, `split-issue` proposes child issues, and
   `start-issue` starts each task in a new conversation as a runtime goal (`commands/COMMANDS.md`)
3. `skills/tdd` for implementation: agree the seams, RED, then the minimum GREEN. No refactoring inside the loop
4. the evidence artifacts: `verification-summary.md` for rerunnable checks, `review-summary.md`
   for findings, then the acceptance decision. **Refactoring, the security pass, and the
   comment-adequacy pass all belong here.** `/verify` `/review-task` `/eval` are optional
   entrypoints, not the step itself — measured over the full retained transcript window they were
   invoked **0 times** while the artifacts were written 37 / 37 / 16 times. The agent writes them
   without being asked, and what is mechanically read is the artifact
   (`harness/scripts/lib/task-artifacts.js` against `harness/templates/`), never the invocation.
   Security is required only when the change touches a decision boundary, untrusted input,
   shell/SQL/path construction, secrets, or a network destination — and then it is evidence from
   running the code adversarially, not from reading it
5. `/repo-map` for `AGENTS.md` when the agent got something wrong

`/execute-plan` remains the pipeline entrypoint when the work suits it.

There is no planning command. `commands/plan.md` and `commands/plan-task.md` were removed on
2026-08-12 because nothing consumed them; `plan.md` itself was retired on 2026-08-17.

The worktree is not a command you invoke. When the grilling settles and the next move writes files,
the agent creates it — see `rules/common/worktree-policy.md`.

See `~/.claude/commands/COMMANDS.md` for the grouped command taxonomy, lifecycle pairs, and secondary surfaces.

## Personal Default

If there is tension between convenience and reliable continuity, prefer reliable continuity.
