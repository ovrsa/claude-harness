---
description: Local durable review fallback for recording findings, residual risks, and missing verify/observe evidence.
---

# Review Task

Use this command when local durable review evidence is needed.

Superpowers review workflow is the default for standard and heavy-risky work when installed. `/review-task` remains the local fallback or audit surface when unresolved findings, residual risks, or local commit gates need a repository artifact.

## Required behavior

1. Review the current diff and surrounding code.
2. Write or update `review-summary.md`.
3. Check:
   - plan/spec compliance
   - security
   - correctness
   - regressions
   - test gaps
   - TDD RED/GREEN evidence
   - BDD scenario coverage
   - plan drift
   - stale `progress.md`
   - missing `review-summary.md`
   - missing `verification-summary.md`
   - missing `observation-summary.md` when required
4. Record findings first using the canonical sections:
   - `Review Scope`
   - `Plan Compliance`
   - `Code Quality`
   - `Test Adequacy`
   - `Findings`
   - `Residual Risks`
   - `Next Action`
   - optional `Guardrail Candidates`
5. Use `Findings` only for unresolved issues. Prefix every finding with one of:
   - `CRITICAL:`
   - `HIGH:`
   - `MEDIUM:`
   - `LOW:`
   - `INFO:`
6. Move accepted or non-blocking concerns to `Residual Risks`.
7. Treat review as approval-ready only when `Findings` is `none`.
8. If verification has not run yet, leave `Next Action` pointing to verification instead of treating the task as approval-ready.
9. Treat review as the primary input to `/eval`, not as a substitute for `/verify`.
10. Separate review dimensions:
    - `Plan Compliance`: approved scope, interface expectations, and acceptance criteria
    - `Code Quality`: correctness, maintainability, security, regressions
    - `Test Adequacy`: RED/GREEN evidence, BDD scenarios, integration/E2E coverage, observation evidence when required
11. Run review in two passes for non-trivial implementation:
    - pass 1: plan/spec compliance and missing acceptance evidence
    - pass 2: code quality, maintainability, security, regressions, and test adequacy
12. When the same class of failure looks promotion-worthy, record it in `Guardrail Candidates` with:
    - `failure_pattern`
    - `source`
    - `recommended_layer`
    - `confidence`

## Relationship To Other Commands

- Superpowers review is the preferred review workflow when available.
- `/review-task` is the local durable review fallback for implementation and bug-fix work.
- `/verify` is the mechanical gate that comes before acceptance.
- `/eval` is the acceptance decision that consumes `review-summary.md` and `verification-summary.md`.
- `review-summary.md` should make the acceptance question easier to answer, not duplicate verification output.

## Hard guardrails

- Do not approve behavior-changing work without required observation evidence.
- Do not approve behavior-changing work without `review-summary.md`.
- Do not approve changes that skipped verification.
- Do not treat review alone as sufficient to accept implementation or bug-fix work.
- Do not approve non-trivial implementation work with stale blockers in `progress.md`.
- Do not leave unresolved findings in `Findings` and still mark review as approval-ready.
- Do not write findings without severity prefixes.
- Do not collapse plan compliance, code quality, and test adequacy into vague generic approval.
- Prefer high-confidence findings only.

## Next Handoff

- If `Findings` contains unresolved issues, handle them with `/receive-review` or return to `/implement-task`.
- If `Findings` is `none` but verification is missing, run `/verify`.
- If verification is present and findings are clear, run `/eval`.
