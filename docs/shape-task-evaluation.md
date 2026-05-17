# Shape Task Evaluation

この文書は、`/shape-task` を実運用で評価し、次の改善アクションを曖昧にしないための作業メモ。

## 目的

`/shape-task` が、相談をだらだらした会話にせず、次に取るべき具体アクションへ変換できるかを確認する。

評価対象は、実装の正しさだけではない。次の問いに答えられるかを見る。

- 目的を具体化できるか
- task weight を妥当に切れるか
- spec が必要か判断できるか
- decision candidates を出せるか
- adopt / hold / reject に進めるか

## 評価ケース

### Case 1: Harness Prioritization

入力:

```text
今の .claude ハーネスを Agentic Development Pipeline に沿って改善したい。
改善後の /shape-task を使って、次に優先すべき改善候補を整理し、
adopt / hold / reject を決めたい。
```

期待:

- `taskWeight`: `exploratory`
- `specNeeded`: `no`
- `suggestedTrack`: `continue-discussion`
- `decisionCandidates`:
  - Improve `/shape-task` output quality
  - Design route-task after shaping
  - Add an always-on suggestion for ambiguous requests

判定:

- PASS

### Case 2: Route-Task Readiness

入力:

```text
次の .claude ハーネス改善として、route-task 設計に進むべきか、
もう少し shape-task の実例レビューを続けるべきか判断したい。
```

期待:

- `taskWeight`: `exploratory`
- `specNeeded`: `no`
- `suggestedTrack`: `continue-discussion`
- route-task 設計を含む decision candidates が出る

判定:

- FIXED
- 初回評価では `standard` / `plan-or-route` に誤分類された
- 原因は `判断したい` / `進むべき` を prioritization signal として扱っていなかったこと
- `tests/lib/task-shaper.test.js` に回帰テストを追加済み

### Case 3: Lightweight Change

入力:

```text
簡単な設定修正をしたい。毎回重い spec や review を回さず、
軽く対応できるか判断したい。
```

期待:

- `standard` または軽量寄りの分類
- full spec を強制しない
- focused tests / validators 程度の evidence に収まる

判定:

- HOLD
- 現在は `standard` / `optional spec` として扱われる
- さらに軽い `trivial` 判定に寄せるかは、実例をもう少し見てから決める

## 現在の採否

- ADOPT: `/shape-task` の実例レビューを次アクション管理に使う
- ADOPT: route-task 設計に進む
- HOLD: always-on suggestion rule を追加する
- HOLD: 軽量タスクをより `trivial` に寄せる判定調整

## 次の具体アクション

1. route-task 設計を `docs/route-task-design.md` にまとめる
2. 設計を確認する
3. 実装に進む場合だけ、route-task v0 の `plan.md` に進む

## Non-Goals

- `/shape-task` を always-on にしない
- route-task をこの評価文書の中で実装しない
- 軽量タスク判定を急いで調整しない
