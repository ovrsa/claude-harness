---
description: Show the current artifact lifecycle chain, current gate, and next required action.
---

# Chain Status

Use this command when you need to know where the current task is in the lifecycle chain.

## Required behavior

1. Read the repository task artifacts:
   - `research.md`
   - `docs/design/` の最新の1枚
   - `verification-summary.md`
   - `review-summary.md`
   - `observation-summary.md`
2. Build the lifecycle chain in order:
   - research
   - plan
   - progress
   - implementation
   - verification
   - review
   - observation
   - completion
3. Report:
   - current step
   - next required action
   - blocked gates
   - artifact responsible for each incomplete step
4. If the current step is blocked, recommend the narrowest action that unblocks the next gate.
5. Do not skip ahead. A later artifact does not make an earlier incomplete gate valid.

## Output shape

```text
Lifecycle chain:
- research: complete | research.md present
- design: complete | docs/design/<slug>.md present
- implementation: active | execute approved plan in small TDD batches
- verification: pending | write verification-summary.md with rerunnable command evidence

Current step: implementation
Next required action: execute approved plan in small TDD batches
Blocked: missing verification-summary.md
```

## Hard guardrails

- Do not mutate files from this command.
- Do not treat this command as approval.
- Do not infer missing evidence from chat history.
- Do not mark the chain complete while any earlier required gate is blocked.
