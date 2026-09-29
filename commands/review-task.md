---
description: Record findings, residual risks, and missing verify/observe evidence as a durable repository artifact.
---

# Review Task

Use this command when local durable review evidence is needed.

`/code-review` is the diff-level pass. `/review-task` owns the durable artifact that `/eval` consumes when unresolved findings, residual risks, or local commit gates need a repository record.

## Required behavior

1. Review the current diff and surrounding code.
2. Write or update `review-summary.md`.
3. Write artifact body text in Japanese by default while preserving canonical section headings and required severity prefixes.
4. Check:
   - design doc compliance (Objective / Non-goals / 触る対象)
   - correctness
   - regressions
   - test gaps
   - TDD RED/GREEN evidence
   - BDD scenario coverage
   - scope drift beyond the design doc's Non-goals
   - missing `verification-summary.md`
   - missing `observation-summary.md` when required
5. **Security.** Required only when the change touches one of these surfaces:
   - permission / auth decisions (any code returning allow or deny)
   - parsing of untrusted input (command strings, user input, external responses)
   - shell, SQL, or path construction
   - secrets, credentials, tokens
   - choosing a network destination

   If none were touched, write one line in `Security` saying so and move on.

   **If one was touched, reading the code is not enough. Run it with adversarial input and
   record the input/output table in `Security`.** The 2026-08-18 auto-allow bypass in
   `harness/scripts/lib/permission-resolver.js` survived every prior review precisely because reviews
   read the code; it was found in minutes by executing the classifier. Probe at least:
   case, flag order, chaining across `;` `&&` `||` `|`, quoting, command substitution,
   and boundary values (empty, oversized).

   `agents/code-reviewer.md` carries a Security (CRITICAL) checklist, and `skills/code-review`
   runs a Standards/Spec pass in parallel sub-agents. Both are user-invocable only — name them
   to the operator rather than spawning them.
6. **Comment adequacy.** Judge every comment the change added or touched:
   - **remove** chronology — what was removed when, and why, belongs in `docs/design/`.
     Keeping it in code puts the same contract in two places
   - **keep** reasoning that cannot be read off the code (why this condition, why this order,
     what breaks without it)
   - **add** one where a non-obvious decision landed unexplained

   Measure the ratio and compare it against the repository baseline (see
   `docs/how-to/run-a-task.md`). **There is no threshold** — a large gap needs a stated reason,
   not a failure.
7. Finish the task's changed code, prose, and comments before completion. Update stale operational
   instructions and resolved design Open Issues. Follow `docs/how-to/run-a-task.md` → 完了前の仕上げ.
   Fill the `Code Quality` finishing fields in `harness/templates/review-summary-template.md` with targets
   and reasons. Keep Verification pending until checks run after the final cleanup; record the
   fingerprint only after reviewing that final diff and evidence. Never invent cleanup changes.
8. Record findings first using the canonical sections:
   - `Review Scope`
   - `Design Compliance`
   - `Security`
   - `Comment Adequacy`
   - `Code Quality`
   - `Test Adequacy`
   - `Findings`
   - `Residual Risks`
   - `Next Action`
   - optional `Guardrail Candidates`
9. Use `Findings` only for unresolved issues. Prefix every finding with one of:
   - `CRITICAL:`
   - `HIGH:`
   - `MEDIUM:`
   - `LOW:`
   - `INFO:`
10. Move accepted or non-blocking concerns to `Residual Risks`.
11. Treat review as approval-ready only when no `CRITICAL:` or `HIGH:` finding remains. `MEDIUM:` and below are recorded, not blocking — that is what `harness/scripts/lib/task-artifacts.js` enforces.
12. If verification has not run yet, leave `Next Action` pointing to verification instead of treating the task as approval-ready.
13. Treat review as the primary input to `/eval`, not as a substitute for `/verify`.
14. Separate review dimensions:
    - `Plan Compliance`: approved scope, interface expectations, and acceptance criteria
    - `Code Quality`: correctness, maintainability, security, regressions
    - `Test Adequacy`: RED/GREEN evidence, BDD scenarios, integration/E2E coverage, observation evidence when required
15. Run review in two passes for non-trivial implementation:
    - pass 1: plan/spec compliance and missing acceptance evidence
    - pass 2: code quality, maintainability, security, regressions, and test adequacy
16. When the same class of failure looks promotion-worthy, record it in `Guardrail Candidates` with:
    - `failure_pattern`
    - `source`
    - `recommended_layer`
    - `confidence`

## Relationship To Other Commands

- `/code-review` is the diff-level review pass for implementation and bug-fix work.
- `/review-task` records the durable artifact that acceptance consumes.
- `/verify` is the mechanical gate that comes before acceptance.
- `/eval` is the acceptance decision that consumes `review-summary.md` and `verification-summary.md`.
- `review-summary.md` should make the acceptance question easier to answer, not duplicate verification output.

## Hard guardrails

- Do not approve behavior-changing work without required observation evidence.
- Do not approve behavior-changing work without `review-summary.md`.
- Do not approve changes that skipped verification.
- Do not treat review alone as sufficient to accept implementation or bug-fix work.
- Do not leave unresolved findings in `Findings` and still mark review as approval-ready.
- Do not write findings without severity prefixes.
- Do not collapse design compliance, code quality, and test adequacy into vague generic approval.
- Prefer high-confidence findings only.

## Refactoring belongs here

`skills/tdd` keeps refactoring **outside** the red/green loop and assigns it to the review stage.
So this is where structural cleanup happens — not during implementation.

Two consequences:

- **Refactoring here invalidates the earlier `/verify` run.** Rerun it. The loop between review and
  verify is expected, not a mistake
- For a wider pass, `skills/code-review` reviews the diff since a fixed point along two axes
  (Standards and Spec) in parallel sub-agents. It is `user-invocable-only` because it spawns agents —
  invoke it explicitly, it will not be selected automatically

`skills/code-review` reports "no spec available" for its Spec axis in repos without an issue tracker.
That is expected here; the Standards axis reads `rules/common/`.

## Next Handoff

- If `Findings` contains unresolved issues, handle them with `/receive-review` or return to `/implement-task`.
- If `Findings` is `none` but verification is missing, run `/verify`.
- If you refactored while reviewing, rerun `/verify` before `/eval`.
- If verification is present and findings are clear, run `/eval`.
