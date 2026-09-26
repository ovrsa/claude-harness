## Parent

- PRI-4
- Refs: 設計判断 > ゴールと停止条件

## What to build

Issue 本文から、両ランタイム共通のゴール文面を作る。

## Acceptance criteria

- [ ] 受け入れ条件と停止条件を含む1行の文面を出す。
- [ ] 4,000 字を超える文面は切り詰めずに拒否する。

## Verification

- 検証: `node tests/scripts/task-goal.test.js`
- 観測: 不要（CLI の出力だけで判定できる）

## Blocked by

- PRI-5

## Constraints

- Issue 本文を書き換えない

## Graph

- Type: none
