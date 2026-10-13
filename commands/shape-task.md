---
description: Translate rough intent into an approval-ready task brief before planning, routing, or execution.
---

# Shape Task

Use `/shape-task` when the user has purpose, strategy, concern, or rough intent that is not yet a clear implementation task.

The command is a readonly shaping surface. It does not execute work, spawn subagents, create queued tasks, or mutate repositories.

## Purpose

`/shape-task` answers:

> What task are we actually about to do, how heavy is it, and what evidence would make it acceptable?

It sits before planning and routing. It should prevent unclear discussions from being prematurely turned into durable artifacts or delegated work.

## Required Behavior

1. Restate the user's purpose in plain terms.
2. Separate user-owned decisions from agent-proposed execution details.
3. Propose a concrete objective.
4. List success criteria, constraints, non-goals, assumptions, and open questions.
5. Classify task weight:
   - `trivial`
   - `exploratory`
   - `standard`
   - `behavior-changing`
   - `heavy-risky`
6. Decide whether a spec is needed:
   - `no`
   - `optional`
   - `recommended`
   - `required`
7. Name the suggested artifact, if any.
8. Define acceptance criteria and evidence needed.
9. Set review weight.
10. Recommend the next step:
    - continue discussion
    - bounded research or sensemaking
    - planning
    - routing
    - direct execution for trivial work

## Output Contract

Produce a concise task brief:

```text
Task Shape

Interpreted Purpose:
- ...

Proposed Objective:
- ...

Success Criteria:
- ...

Constraints:
- ...

Non-Goals:
- ...

Assumptions:
- ...

Open Questions:
- ...

Decision Candidates:
- ...

Task Weight:
- trivial | exploratory | standard | behavior-changing | heavy-risky

Spec Needed:
- no | optional | recommended | required

Suggested Artifact:
- ...

Acceptance Criteria:
- ...

Evidence Needed:
- ...

Review Weight:
- ...

Human Approval Needed:
- yes | no

Suggested Next Step:
- ...
```

## Guardrails

- Do not create or update `research.md` or any `docs/design/` entry during shaping.
- Do not treat shaping as approval to implement.
- Do not force a full spec for every task.
- Do not delegate before objective, scope, and acceptance are clear.
- Do not let the agent own purpose, scope expansion, destructive action, credential use, deploy, push, PR creation, or residual-risk acceptance.
- If the task is only reading, learning, conceptual discussion, strategy shaping, or applying an external document as judgment material, keep it in Sensemaking Flow until the user chooses an actionable improvement.

## Examples

Strategy discussion:

```text
/shape-task ユーザーハーネスを自立化したい。どう進めるべきか整理したい。
```

Expected direction: `exploratory`, no full spec, continue discussion or bounded sensemaking.
When the request is about `.claude` harness prioritization, include concrete decision candidates such as `/shape-task` output quality, route-task design, or always-on suggestions.

Clear implementation:

```text
/shape-task Add a readonly task-shaping command and focused tests.
```

Expected direction: `standard`, optional spec, plan or route after approval.

Risky implementation:

```text
/shape-task Update production auth migration flow and deploy it.
```

Expected direction: `heavy-risky`, required approved plan or design spec, stronger verification and residual-risk acceptance.

## Relationship To Other Commands

- `research-task` creates durable research artifacts only when durable context is needed.
- The decisions are recorded by `/docs-build` into `docs/design/YYYY-MM-DD-<slug>.md` once the Grill has settled them; there is no planning command.
- `execute-plan` runs approved work.
- `verify` records rerunnable evidence.
- `eval` judges whether the change is acceptable.

## Notes

- v0 is explicitly invoked. It is not an always-on entrance rule.
- A later version may suggest shaping for ambiguous standard or heavy-risky requests after this output contract proves useful.
