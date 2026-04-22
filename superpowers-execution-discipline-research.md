# Research Report: Superpowers execution discipline adoption

## Goal

- Compare Superpowers' implementation workflow with the current `~/.claude` harness and identify the safest way to adopt its stronger execution practices, especially TDD, BDD-style scenarios, E2E, worktree setup, and completion handoff.

## Existing Code

- `CLAUDE.md`, `OPERATING_MODEL.md`, and `HARNESS.md` define the current canonical loop: research, plan, implement, review, verify, evaluate, observe, post-commit capture, health/triage.
- `templates/plan-template.md` already includes `Verify`, `Evaluate`, `Observe`, and `Execution Todo`, but it does not make behavior scenarios, RED/GREEN evidence, or E2E evidence first-class plan fields.
- `commands/implement-task.md` mentions TDD, normal/boundary/abnormal cases, Given/When/Then, and RED -> GREEN -> REFACTOR, but the workflow is described at a high level rather than as a strict per-batch execution contract.
- `commands/tdd.md` has strong TDD guidance, including RED/GREEN/REFACTOR, boundary/error cases, Given/When/Then, and 80%+ coverage. It is not tightly wired into `plan-template.md`, `implement-task.md`, `verification-summary.md`, or lifecycle gates.
- `commands/e2e.md` has Playwright-oriented E2E guidance and artifact expectations. `OBSERVE.md` and `templates/observation-summary-template.md` require concrete evidence sources, but `/e2e` does not explicitly feed `observation-summary.md`.
- `commands/worktree-start.md` creates a worktree after plan approval, but it hardcodes a worktree root style and does not yet include Superpowers-style directory preference discovery, ignore verification, dependency setup, or clean baseline tests.
- `commands/review-task.md` records unresolved findings and residual risks, but it does not split review into plan/spec compliance, code quality, and test adequacy.
- `rules/common/testing.md` and several testing skills already say tests should be written first, but the central lifecycle artifacts do not require proof that the RED phase happened.

## Similar Patterns

- Superpowers treats workflow as a chain of skills. A design/spec flow hands off to plan writing; plan writing hands off to subagent-driven or inline execution; execution hands off to finishing the branch.
- Superpowers' plan format is execution-focused. Tasks are bite-sized, use checkbox tracking, name exact files, include concrete test/code snippets, include exact commands, and state expected outputs.
- Superpowers' worktree skill does more than create a branch. It chooses the worktree location systematically, verifies project-local worktree directories are ignored, performs setup, and checks a clean baseline test result before implementation.
- Superpowers' completion flow verifies tests, then presents structured options: merge locally, push/create PR, keep as-is, or discard with explicit confirmation.
- The current `.claude` harness is stronger than Superpowers on durable session continuity and governance: SQLite run state, `progress.md`, review/verify/evaluate/observe distinction, and health/triage improvement loops.

## Prior Art

- Superpowers README describes the core workflow as brainstorming, worktree setup, writing plans, subagent-driven development or executing plans, TDD, code review, and finishing the development branch.
- `skills/writing-plans/SKILL.md` requires implementation plans with exact file paths, complete code for code steps, exact commands, expected output, TDD, and frequent commits.
- `skills/using-git-worktrees/SKILL.md` requires isolated worktrees before implementation plans, directory selection rules, `.gitignore` safety checks, setup, and clean baseline verification.
- `skills/executing-plans/SKILL.md` requires loading and critically reviewing the plan before execution, then executing each task exactly, running specified verification, and stopping on blockers rather than guessing.
- `skills/finishing-a-development-branch/SKILL.md` requires tests before completion and presents a small fixed option set for merge/PR/keep/discard.

## Technical Options / Tradeoffs

- Option A: Install or directly depend on Superpowers.
  - Pros: fastest access to its tuned workflow.
  - Cons: violates the local rule that `~/.claude` remains canonical; may create two lifecycle authorities; may introduce behavior that conflicts with the artifact/evaluate/observe model.

- Option B: Copy Superpowers skills into this harness.
  - Pros: preserves much of the wording and workflow.
  - Cons: high risk of stale forks and duplicated lifecycle semantics; harder to reconcile with existing commands and artifacts.

- Option C: Adopt the execution discipline into the existing `.claude` lifecycle artifacts and commands.
  - Pros: preserves the current canonical control plane; improves the weak execution layer; keeps Superpowers as reference prior art rather than authority.
  - Cons: requires careful command/template updates and follow-up verification to avoid prose-only improvement.

- Recommended: Option C.
  - Reason: the current harness already has the stronger governance and continuity model. The gap is execution discipline: plan granularity, TDD evidence, worktree baseline checks, E2E/observe linkage, and structured finish options.

## Constraints

- Existing root `plan.md`, `research.md`, `progress.md`, `review-summary.md`, and `verification-summary.md` are for a different active task. This adoption should use a new plan before implementation.
- The worktree is already dirty with many unrelated changes. Any future edits must be tightly scoped and avoid reverting existing user or prior-agent work.
- The project rule says external frameworks such as Superpowers are reference-only and must not become live lifecycle authority.
- The current lifecycle requires approved `plan.md` before implementation for non-trivial changes.

## Risks

- Adding too many new commands can worsen the current command-surface problem.
- Requiring strict TDD for every trivial task can add friction; the policy should distinguish trivial, standard, and risky work.
- Capturing RED evidence in `verification-summary.md` could blur verify vs review unless the artifact remains focused on rerunnable command evidence.
- Strengthening worktree requirements without a hook or command check may leave the improvement as documentation only.
- E2E evidence can become expensive and flaky if required for every behavior change rather than only critical user journeys and runtime behavior that tests cannot prove.

## Open Questions for Plan

- Should TDD RED/GREEN evidence live in `verification-summary.md`, `progress.md`, or a new `test-evidence` section in `plan.md`?
- Should BDD scenarios be mandatory for all standard/risky implementation tasks, or only when user-facing behavior changes?
- Should `/worktree-start` enforce Superpowers-style baseline tests immediately, or first document the behavior and add enforcement later?
- Should `/review-task` template change to include plan compliance, code quality, and test adequacy sections, or should those remain subheadings inside `Findings`?
- Should `/e2e` update `observation-summary.md` directly, or should it only instruct the agent to copy evidence into observation?

## Recommended Approach

- Keep `.claude` as the source of truth and adopt Superpowers as reference prior art.
- Make the first implementation narrow and artifact-level:
  - update `templates/plan-template.md` with `Behavior Spec`, `TDD Evidence Plan`, and `E2E / Observe Evidence`
  - update `commands/implement-task.md` so every implementation batch must follow RED -> GREEN -> REFACTOR and update execution state
  - update `commands/worktree-start.md` with worktree location discovery, ignore verification, setup, and baseline tests
  - update `commands/review-task.md` to review plan compliance, code quality, and test adequacy explicitly
  - update `commands/e2e.md` and observation guidance so Playwright screenshots/traces/logs become observation evidence
- Defer hook-level enforcement until the command/template changes prove useful and low-noise.

## Sources

- Superpowers README: https://github.com/obra/superpowers
- Superpowers `writing-plans`: https://raw.githubusercontent.com/obra/superpowers/main/skills/writing-plans/SKILL.md
- Superpowers `using-git-worktrees`: https://raw.githubusercontent.com/obra/superpowers/main/skills/using-git-worktrees/SKILL.md
- Superpowers `executing-plans`: https://raw.githubusercontent.com/obra/superpowers/main/skills/executing-plans/SKILL.md
- Superpowers `finishing-a-development-branch`: https://raw.githubusercontent.com/obra/superpowers/main/skills/finishing-a-development-branch/SKILL.md
