# Route Task Design

この文書は、`/shape-task` の後段として導入する route-task v0 の設計メモ。

`/shape-task` は曖昧な意図を task brief に変換する。route-task は、明確になった task brief をどこで扱うべきか分類する。

## 目的

明確になった task を、実行前に安全な作業場所へ振り分ける。

route-task が答える問い:

> この task は main context、subagent sidecar、task queue、isolated clone、human decision のどこで扱うべきか。

目標は自動実行ではない。目標は、実行前の判断を明示し、誤委譲や過剰プロセスを減らすこと。

## 前提

route-task は `/shape-task` の後に来る。

route-task に渡す task は、最低限次を持つ。

- objective
- acceptance criteria
- task weight
- constraints
- non-goals
- evidence needed
- open questions

open questions が残っている場合、route-task は実行先を決めず `human decision` または `continue shaping` を返す。

## v0 Scope

v0 は readonly advisory command とする。

やること:

- task brief を読む
- task weight を確認する
- open questions と approval need を確認する
- routing destination を提案する
- delegation eligibility を判定する
- stop conditions を列挙する
- required evidence を確認する

やらないこと:

- subagent を起動しない
- task queue に投入しない
- clone を作らない
- plan を実行しない
- push / deploy / PR 作成をしない
- credential を使わない
- residual risk を自動受諾しない

## Routing Destinations

### 1. Main Context

使う場面:

- small / standard work
- 変更範囲が狭い
- 現在の文脈が作業に必要
- delegation overhead が作業価値を上回る

必要な証跡:

- changed-files summary
- focused tests or validators

### 2. Subagent Sidecar

使う場面:

- main context の次アクションをブロックしない調査
- codebase exploration
- focused research
- failing test reproduction
- spec / diff / evidence consistency review
- verification log collection

制約:

- objective と scope が明確
- write scope がある場合はファイル範囲が分離されている
- user-owned decisions を委譲しない

委譲しないもの:

- 目的
- 採否
- scope expansion
- destructive action
- credential use
- deploy
- push
- PR creation
- residual-risk acceptance

### 3. Task Queue

使う場面:

- approved task brief がある
- standard 以上の作業
- evidence を run 単位で残したい
- pipeline-runner で扱える
- long-running または後続実行に回す価値がある

必要条件:

- approved plan or task order
- workflow
- adapter/runtime selection
- stop conditions
- verification target

### 4. Isolated Clone

使う場面:

- standard / heavy-risky の queued work
- main worktree を汚したくない
- competing attempt を分離したい
- merge/cleanup 前に diff を確認したい

必要条件:

- git repo with valid HEAD
- merge/cleanup の明示承認
- run evidence preservation

### 5. Human Decision

使う場面:

- open questions が残っている
- acceptance criteria が曖昧
- risk boundary が未承認
- credential / deploy / destructive action が必要
- task weight と process weight が合っていない
- verification failure が design uncertainty を示す

## Output Contract

route-task は次を返す。

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

Required Approval:
- ...

Required Evidence:
- ...

Stop Conditions:
- ...

Suggested Next Step:
- ...
```

## Decision Rules

### Readiness First

1. open questions があるなら `needs-shaping`
2. acceptance criteria がないなら `needs-shaping`
3. risk approval が必要で未承認なら `human-decision`
4. credential / deploy / destructive action が必要なら `human-decision`

### Weight Then Destination

- `trivial`: `main-context`
- `exploratory`: `main-context` or `subagent-sidecar`
- `standard`: `main-context`, `subagent-sidecar`, or `task-queue`
- `behavior-changing`: `main-context` or `task-queue`; observation evidence required
- `heavy-risky`: `human-decision` until approval; then `task-queue` plus `isolated-clone`

### Delegation Eligibility

Delegation is eligible when:

- objective is explicit
- acceptance criteria are explicit
- scope is bounded
- write scope is isolated or readonly
- required evidence is known
- no user-owned decision is being delegated

Delegation is not eligible when:

- task is still strategic
- task asks what should be accepted
- subagent would need credentials
- subagent would need deploy/push/PR authority
- subagent would decide residual risk

## Relationship To Existing Harness

- `/shape-task` creates the task brief.
- route-task classifies the shaped task.
- `plan.md` records approved execution intent when needed.
- `scripts/task-queue.js` executes approved queued work.
- `scripts/pipeline-runner.js` runs workflow steps with evidence.
- `scripts/hooks/subagent-stop.js` records delegated handoff details.
- `verification-summary.md` and `review-summary.md` remain acceptance evidence.

## Acceptance Criteria For Implementing v0

- A documented command surface exists.
- The routing library is deterministic and readonly.
- Tests cover:
  - open questions route back to shaping
  - trivial work stays main context
  - exploratory readonly research can route to subagent sidecar
  - standard approved work can route to main context or task queue
  - behavior-changing work requires observation evidence
  - heavy-risky work blocks on human decision without approval
  - credential / deploy / destructive actions never delegate
- Command validation passes.
- Focused tests pass.

## Current Decision

- ADOPT: design route-task after shaping
- ADOPT: create implementation plan for route-task v0
- HOLD: implement route-task until `plan.md` is approved
- HOLD: add always-on suggestion rule

Next action:

1. Review `plan.md`.
2. If accepted, implement route-task v0.
3. Add library, tests, and command documentation.
