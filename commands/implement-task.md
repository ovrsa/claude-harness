---
description: Execute an approved design doc with TDD and small batches, keeping local lifecycle gates authoritative.
---

# Implement Task

Use this command for the `TDD Spec`, `Implement Small`, `Review`, `Verify`, `Evaluate`, and `Observe` phases.

`/implement-task` is the in-session execution surface for an approved design doc. `/execute-plan` is the same work plus pipeline preflight/postflight, telemetry stamping, and permission boundaries.

## Preconditions

- A `docs/design/YYYY-MM-DD-<slug>.md` entry exists for this work
- The operator has approved it in conversation. **There is no machine-readable approval flag** —
  `plan.md` and its `status: approved` were retired on 2026-08-17, and nothing blocks on approval now.
  Ask if you are unsure whether approval was given

## Required behavior

1. Read the design doc.
2. Critically review it before editing:
   - `触る対象` names or clearly implies every file you are about to change
   - the success conditions are testable
   - `Non-goals` is present, so scope has a boundary
   - required observe/E2E evidence is explicit when behavior changes
3. Stop before editing if the design doc has contradictions, unclear files, or scope beyond what was approved.
4. Use an isolated worktree (see `rules/common/worktree-policy.md`).
5. Refine the behavior spec before editing implementation code:
   - normal
   - boundary
   - abnormal
   - Given / When / Then
6. Apply the `tdd` skill when implementation work begins:
   - **agree the seams with the operator before writing any test**
   - keep batches small enough to review independently
   - do not write behavior-changing implementation code before the RED check exists
   - use exact file paths and concrete verification commands
   - keep local lifecycle gates authoritative
7. Implement in strict small batches using RED -> GREEN:
   - pick one small related batch inside the approved scope
   - write or update the failing test first
   - run the RED command and confirm it fails for the expected reason
   - implement the minimum code needed to pass
   - run the GREEN command and confirm pass
   - commit before moving to the next batch. **The commit is the checkpoint** — nothing else
     carries state across a compact
8. Checkpoint after at most three batches:
   - summarize files touched
   - record RED/GREEN commands run
   - note what remains
   - ask for feedback or continue only when the next batch is still clearly inside the approved scope
9. Record rerunnable command evidence in `verification-summary.md`; keep runtime/browser/log evidence in `observation-summary.md`. Record the RED observation in the `RED Evidence` section. Write human-authored evidence notes in Japanese by default.
10. Stop and return to `/grill-me` when the design doc is unclear, RED does not fail as expected, GREEN repeatedly fails, implementation scope drifts, or a checkpoint exposes a spec gap.
11. Refactor at this stage rather than inside the loop, and only while tests stay green. Then write or update `review-summary.md` so unresolved findings and residual risks are explicit. **Rerun `/verify` if you refactored.**
12. Finish changed code, prose, and comments following `docs/how-to/run-a-task.md` → 完了前の仕上げ.
    Run the acceptance gate represented by `/eval`; require the task-completion CLI to exit zero
    before a completion report, PR creation, or ticket Done. Continue fixing missing evidence autonomously.
13. If behavior changed, write `observation-summary.md` with concrete evidence sources.
14. Before merging, fold what implementation revealed — the confirmed `触る対象` and any Open Issues — back into the design doc.
15. Keep automatic adaptation limited to low-risk tactics such as resume hints, prechecks, and verification ordering. Never auto-relax governance or approval gates.

## Hard guardrails

- Do not start without an approved design doc.
- Do not drift from the approved scope without returning to `/grill-me`.
- Do not skip review, tests, verify, eval, or observe.
- Do not batch unrelated changes together.
- Do not execute more than three batches without a checkpoint commit.
- Do not implement before seeing a meaningful RED failure for behavior-changing code.
- Do not treat a passing GREEN command as acceptance; it still feeds review, verify, eval, and observe.
- Do not let an external plugin redefine the lifecycle source of truth.
- Do not dispatch subagents unless the operator explicitly asks and the work is disjoint.

## Next Handoff

- After each meaningful batch, run `/review-task` when design compliance, code quality, or test adequacy needs a checkpoint.
- After implementation batches are complete, run `/verify`, then `/review-task`.
- If build/type/test failures appear, use `/build-fix` with root-cause evidence.
- If review feedback arrives, handle it with `/receive-review`.
