# ライフサイクル判定を plan.md から切り離す

日付: 2026-08-20

## Objective

`buildLifecycleState` のゲート要否判定を `verification-summary.md` の有無に付け替え、
`plan.md` / `progress.md` に依存した段と分岐を撤去する。

## なぜ今これか

**review と observe のゲートは 2026-08-17 以降、構造的に無効になっていた。** ルーティング判断の
すべてが `plan.md` のメタデータから来ており、`plan.md` を撤去した時点で4つとも恒久的に `false`
になった。

```js
const observeRequired = Boolean(plan && /true/i.test(String(plan.observe_required || '')));
const reviewRequired  = Boolean(plan && (/true/i.test(String(plan.review_required || '')) || observeRequired));
const worktreeRequired = Boolean(plan && /true/i.test(String(plan.worktree_required || '')));
const nonTrivial      = Boolean(plan && (/non_trivial/i.test(String(plan.task_type || '')) || worktreeRequired));
```

実測（2026-08-20）。ゲートの成果物3種を置き、`review-summary.md` に未解決の `CRITICAL` を1件
含めた状態:

```
planStatus        : missing
reviewRequired    : false
observeRequired   : false
currentStepId     : plan
nextRequiredAction: create plan.md
blocked           : ["missing plan.md"]

  research        skipped   optional; findings belong in docs/design/...
  plan            pending   create plan.md
  progress        skipped   not required for trivial work
  implementation  complete  implementation has verification evidence
  verification    complete  verification-summary.md complete
  review          skipped   review not required by plan metadata
  observation     skipped   observation not required by plan metadata
  completion      pending   chain has open gates before commit
```

2つの問題が同時に出ている。

1. **全セッションに撤去済み成果物の作成を指示している。** `nextRequiredAction=create plan.md`。
   SQLite 撤去（2026-08-20）でこれが復帰時の唯一の出力になった
2. **未解決の `CRITICAL` 指摘が報告されない。** `hasBlockingFindings` は `true` に計算されているが、
   その検査は `if (reviewRequired)` の内側にあり、**2026-08-17 以降到達不能**。
   `blocked` に出るのは `missing plan.md` だけ

`CLAUDE.md` の Execution Rules は「実装とバグ修正で review を飛ばさない」「挙動が変わったら
`observation-summary.md` を飛ばさない」と定めているが、コードは毎回「not required」と報告していた。

## Non-goals

- **`parsePlanState` は撤去しない。** `pipeline-runner.js` が `--plan <path>` の入力として使う。
  「パイプラインの引数としての plan ファイル」と「リポジトリ直下のライフサイクル成果物」は別物
- `docs/design/` を `findTaskArtifacts` の走査対象に加えない。走査は固定6ファイルのまま
  （`plan.md` / `progress.md` を除いた4ファイルになる）
- track（trivial / standard / heavy-risky）を成果物から判定する仕組みは作らない。
  design doc の front matter に track を書く案は却下（下記）
- ゲートを機械的にブロックしない。助言のままにする（強制点は `git push` の1箇所だけ）

## 触る対象

| 対象 | 変更内容 | 壊す可能性のあるもの |
|---|---|---|
| `scripts/lib/task-artifacts.js` | 要否を `Boolean(verification)` に。`plan` / `progress` 段を撤去 | **契約: `buildLifecycleState` の戻り値**。下表参照 |
| 同 | `hasBlockingFindings` の検査を要否から独立させる | 未解決指摘のある run が `blocked` を持つようになる |
| 同 | `ARTIFACT_FILES` から `plan.md` / `progress.md` を外す | `buildArtifactContext` の `artifacts=` 一覧 |
| 同 | `parseProgressState` / `classifyProgressExecutionState` / `defaultSessionState` / `PROGRESS_SECTION_*` / `formatProgressState` を撤去 | `formatProgressState` は既に参照ゼロ |
| `scripts/lib/harness-status.js` | `sessionState` 由来の `current_phase` / `last_completed_step` 出力を撤去 | **契約: `/next-action` の出力行** |
| `scripts/ci/smoke-harness-lifecycle.js` | `plan.md` / `progress.md` を置くフィクスチャを作り直す | CI スモーク |
| `tests/lib/task-artifacts.test.js` | 26件のうち7件が plan/progress に触る | — |
| `tests/lib/harness-status.test.js` | `plan.md status=draft` で BLOCKED を期待する test | — |
| `docs/architecture.md` | Open Issues の該当項目 | — |

戻り値から落とすキー（**契約変更**）:

| キー | 理由 |
|---|---|
| `planStatus` | `plan.md` を走査しない |
| `worktreeRequired` | 出所が `plan.md`。強制は 2026-07-28 に撤去済みで、いま worktree はエージェントが作る |
| `nonTrivial` | 出所が `plan.md` |
| `progressPresent` / `progressExecutionState` / `sessionState` | 出所が `progress.md` |

残るキー: `reviewRequired` `observeRequired` `hasReview` `hasVerification` `hasObservation`
`hasResearch` `chain` `currentStep` `currentStepId` `nextRequiredAction` `blocked`

変更後の chain: `research`（任意）→ `implementation` → `verification` → `review` → `observation`
→ `completion`。**`CLAUDE.md` の完了モデル（verify / evaluate / observe）と一致する。**

## 却下した案

- **常に review / observe を要求する** — `CLAUDE.md` の文言には最も忠実だが、read-only の調査や
  「どういう状況？」への回答でも `blocked` が3件立つ。助言が常に鳴っていると読まれなくなる
- **`docs/design/` の front matter に track を書く** — 追加only の doc に新しい契約を課すことになり、
  既存の design doc には front matter が無い。維持義務を増やす
- **「必要」という概念自体をやめ、存在するものだけ評価する** — review を飛ばしても
  `completion` が `complete` になる。飛ばしたことを言えなくなる
- **`implementation` 段も撤去する** — 対応する成果物がディスクに無いので一貫はするが、
  「次に何をすべきか」を伝える段が消える。`verification` は証拠を書く段で、`implementation` は
  作る段。要約文が別の仕事をしている
- **`parsePlanState` ごと撤去する** — `pipeline-runner.js` の `--plan` が壊れる

## Open Issues

- **read-only タスクと「実装したが検証していない」を区別できない。** どちらも
  `verification` 無しなので `review skipped`。後者を捕まえるには「実装したか」を
  ディスクから知る必要があり、それは git の diff にしか無い（**推定**: 将来 `git diff --stat` を
  見る余地はある）
- `observeRequired` を review と同じ条件にした。`CLAUDE.md` は「挙動が変わったら」と書いているが、
  それはディスクから導出できない。**過剰に要求する側に倒した**
- `plan.md` / `progress.md` が実際にリポジトリ直下に残っている場合、走査対象から外れるので
  一覧に出なくなる。**無視されることが分かりにくい**（`.gitignore` されているので実害は小さい）
