---
description: Review current changes before commit. Feed the acceptance gate with findings, residual risks, and missing verify/observe evidence.
---

# Review Task

Use this command for the `Review` phase before commit.

## Required behavior

1. Review the current diff and surrounding code.
2. Write or update `review-summary.md`.
3. Check:
   - security
   - correctness
   - regressions
   - test gaps
   - plan drift
   - stale `progress.md`
   - missing `review-summary.md`
   - missing `verification-summary.md`
   - missing `observation-summary.md` when required
4. Record findings first using the canonical sections:
   - `Review Scope`
   - `Findings`
   - `Residual Risks`
   - `Next Action`
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

## Hard guardrails

- Do not approve behavior-changing work without required observation evidence.
- Do not approve behavior-changing work without `review-summary.md`.
- Do not approve changes that skipped verification.
- Do not treat review alone as sufficient to accept implementation or bug-fix work.
- Do not approve non-trivial implementation work with stale blockers in `progress.md`.
- Do not leave unresolved findings in `Findings` and still mark review as approval-ready.
- Do not write findings without severity prefixes.
- Prefer high-confidence findings only.
