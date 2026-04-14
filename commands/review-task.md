---
description: Review current changes before commit. Check security, regressions, plan drift, and missing verify/observe evidence.
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
5. Block CRITICAL and HIGH issues.
6. If verification has not run yet, leave `Next Action` pointing to verification instead of treating the task as approval-ready.

## Hard guardrails

- Do not approve behavior-changing work without required observation evidence.
- Do not approve behavior-changing work without `review-summary.md`.
- Do not approve changes that skipped verification.
- Do not approve non-trivial implementation work with stale blockers in `progress.md`.
- Prefer high-confidence findings only.
