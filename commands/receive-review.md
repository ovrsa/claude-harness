---
description: Receive human, subagent, or external review feedback with technical verification before implementing changes.
---

# Receive Review

Use this command when review feedback arrives and needs to be handled without blind agreement or unverified changes.

## Required Behavior

1. Read the complete feedback before responding.
2. Classify each item:
   - blocking correctness/security issue
   - important maintainability or regression issue
   - minor cleanup
   - unclear item
   - technically disputed item
3. For each item, verify against codebase reality before editing:
   - does the finding match the current code?
   - does the suggested fix preserve existing behavior?
   - does it conflict with the approved plan or architecture?
   - is the code path actually used, or is this YAGNI?
4. Clarify all unclear items before implementing partial fixes.
5. Implement one verified item at a time.
6. Run the narrowest relevant test or check after each fix.
7. Update `review-summary.md`:
   - resolved findings leave `Findings`
   - accepted non-blocking concerns move to `Residual Risks`
   - disputed feedback is recorded with technical rationale

## Pushback Rules

Push back with evidence when feedback:

- breaks existing behavior
- lacks full context
- violates the approved plan
- adds unused or speculative functionality
- conflicts with compatibility requirements
- cannot be verified without more information

Use technical reasoning and code/test evidence. Do not use performative agreement as a substitute for verification.

## Implementation Order

1. Blocking issues
2. Simple safe fixes
3. Complex fixes
4. Accepted minor cleanup

Test each group before moving to the next. If a fix changes runtime or UI behavior, make sure observe evidence is still required and captured.

## Output

```text
REVIEW FEEDBACK HANDLING: [READY / NEEDS CLARIFICATION / DISPUTED / FIXED]

Verified:
- ...

Needs Clarification:
- ...

Disputed:
- ...

Fixed:
- ...

Next Action:
- ...
```

## Hard Guardrails

- Do not implement unclear feedback.
- Do not accept external feedback as correct without checking the codebase.
- Do not batch unrelated review fixes.
- Do not remove compatibility code without verifying supported targets.
- Do not treat review feedback fixes as complete without rerunning relevant checks.

## Next Handoff

- If fixes were made, run `/verify`.
- If findings remain, rerun `/review-task` or ask for clarification.
- If verification passes and findings are clear, run `/eval`.
