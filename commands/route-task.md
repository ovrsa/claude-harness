---
description: Classify a shaped task into the right execution destination without executing or delegating it.
---

# Route Task

Use `/route-task` after `/shape-task` or an equivalent task brief.

`/route-task` is a readonly advisory surface. It does not spawn subagents, create queued tasks, create clones, execute plans, push, deploy, create PRs, use credentials, or accept residual risk.

## Purpose

`/route-task` answers:

> Where should this shaped task be handled before execution begins?

## Required Input

Route only after the task has:

- objective
- acceptance criteria
- task weight
- constraints
- non-goals
- required evidence
- open questions

If open questions remain, route back to shaping or human decision.

## Destinations

- `main-context`: small, trivial, or standard work that is best handled in the current context.
- `subagent-sidecar`: bounded readonly or isolated side work such as exploration, reproduction, review, or evidence collection.
- `task-queue`: approved work that should leave run-level evidence through the local pipeline.
- `isolated-clone`: approved high-risk or queued work that should not dirty the main worktree.
- `human-decision`: unresolved scope, approval, risk, credential, deploy, destructive, push, PR, or residual-risk decisions.

## Output Contract

```text
Task Route

Input Readiness:
- ready | needs-shaping | blocked

Recommended Destination:
- main-context | subagent-sidecar | task-queue | isolated-clone | human-decision

Reasoning:
- ...

Delegation Eligible:
- yes | no

Delegation Boundary:
- ...

Heavy Context:
- yes | no

Can Delegate Read-Only:
- yes | no

Delegation Task:
- ...

Required Approval:
- ...

Required Evidence:
- ...

Stop Conditions:
- ...

Suggested Next Step:
- ...
```

## Guardrails

- Do not route unclear tasks to execution.
- Do not delegate purpose, acceptance, scope expansion, destructive action, credential use, deploy, push, PR creation, or residual-risk acceptance.
- Delegate heavy context only for readonly reading, summarization, extraction, or evidence collection.
- Do not treat route-task output as approval to implement.
- Do not create queue entries or clones in v0.
- Heavy-risky work requires human risk approval before it can leave `human-decision`.

## Relationship To Other Commands

- `/shape-task` creates the task brief.
- `/route-task` classifies the shaped task.
- `/execute-plan` runs approved work.
- `/verify` records rerunnable evidence.
- `/eval` judges whether the completed change is acceptable.
