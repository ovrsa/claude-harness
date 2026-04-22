# Eval Command

Run the acceptance gate for implementation and bug-fix work.

## Usage

`/eval`

## Purpose

`/eval` answers:

> Should this change be accepted?

This is distinct from:

- `/verify`, which proves rerunnable checks passed
- `observation-summary.md`, which proves runtime behavior when changed behavior needs concrete evidence

`/eval` is the primary acceptance gate that ties together:

- `review-summary.md`
- acceptance criteria from `plan.md`
- residual risks
- whether additional observation evidence is still required

The flow is:

1. `/verify` proves the mechanical checks passed.
2. `review-summary.md` records unresolved findings and accepted risks.
3. `/eval` decides whether the change is acceptable to accept.
4. `observation-summary.md` supplies runtime evidence only when the change needs it.

## Required behavior

1. Read the approved `plan.md` when it exists.
2. Read `review-summary.md`.
3. Confirm `review-summary.md` uses the canonical sections:
   - `Review Scope`
   - `Findings`
   - `Residual Risks`
   - `Next Action`
4. Treat `Findings` as unresolved blockers only.
5. Treat evaluation as incomplete while `Findings` is not `none`.
6. Confirm `verification-summary.md` exists for implementation and bug-fix work.
7. If the task changed runtime behavior, UI behavior, or system interaction patterns that tests alone do not fully prove:
   - require `observation-summary.md`
   - require concrete evidence sources in that artifact
8. Compare the current change against the acceptance criteria in `plan.md`.
9. Move accepted non-blocking concerns to `Residual Risks`, not `Findings`.
10. Produce an acceptance decision:
    - `ACCEPT`
    - `NEEDS WORK`
    - `BLOCKED`

## Output

Produce a concise evaluation report:

```text
EVALUATION: [ACCEPT/NEEDS WORK/BLOCKED]

Plan:      [OK/MISSING]
Verify:    [OK/MISSING]
Review:    [OK/X findings]
Observe:   [OK/NOT REQUIRED/MISSING]

Findings:
- [none or unresolved items]

Residual Risks:
- [none or accepted concerns]

Next Action:
- [what must happen before the work is acceptable]
```

## Guardrails

- Do not treat passing tests as equivalent to acceptance.
- Do not accept work while `Findings` still contains unresolved issues.
- Do not treat observation evidence as a substitute for review.
- Do not treat review prose without canonical sections as an acceptable evaluation artifact.
- Do not approve behavior-changing work when required observation evidence is missing.

## Notes

- The older feature-eval workflow should move to a different command name if retained later.
- In this harness, `/eval` is reserved for the acceptance gate of implementation and bug-fix work.
- `/review-task` feeds `/eval`; `/verify` feeds `/eval`; neither replaces `/eval`.

## Next Handoff

- If `NEEDS WORK`, return to `/receive-review`, `/implement-task`, or `/build-fix` based on the blocker.
- If `BLOCKED`, return to `/plan-task` or ask for the missing decision.
- If `ACCEPT` and observe is required, ensure `observation-summary.md` is complete before commit.
- If `ACCEPT` and observe is not required, proceed to the commit or branch-finishing path requested by the operator.
