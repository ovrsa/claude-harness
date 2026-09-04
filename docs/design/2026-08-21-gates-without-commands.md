# ゲートをコマンドから成果物へ寄せ、抜けた実装段を書く

日付: 2026-08-21

## Objective

`docs/how-to/run-a-task.md` の確認節が前提にしている「コマンドが成果物を作る」という機構を、実測で動いている「エージェントが黙って成果物を書く」に合わせ、抜けている実装段（TDD）と死んだ受容基準を直す。

## なぜ今これか

保持期間の全トランスクリプト（154コマンド起動）で **`/verify` `/review-task` `/eval` は0回**。いっぽう成果物は `verification-summary.md` 37回・`review-summary.md` 37回・`observation-summary.md` 16回の Write/Edit で毎回書かれている。

`Security` と `Comment Adequacy` も6タスク全部で埋まっている（2〜84行）。**つまり「勝手にやる」は既に起きていて、doc だけがコマンド駆動だと言っている。**

2026-08-12 の [pipeline-trim](./2026-08-12-pipeline-trim.md) が既に「パーサとテンプレートが機構で、コマンドは語りだった」と結論している。ただし対象は「機構を名指しする記述」だけで、how-to の確認節はコマンドを段として書いたまま残った。この回はそこを埋める。

同時に2つの欠陥を直す。実装段（Ordered Path の手順6 = `skills/tdd`）が how-to に存在しないこと、そして確認節の `Findings` が `none` という基準が 2026-08-20 に置き換えた定義の前の版であること（現行は CRITICAL / HIGH のみブロック）。**この基準だと6タスク中4件が approval-ready でないままマージされている。**

## Non-goals

- **コマンドの削除。** 2026-08-12 に却下済み。起動0回でも成果物スキーマの説明場所として機能している
- **`evaluate` を完了モデルから外すこと。** 同上。`/eval` は成果物を持たず既存3種を読んで受容を答える段で、判断は会話に残る
- `Security` / `Comment Adequacy` の**内容**を機械判定すること。触っていない回は1行で足りるので、内容の閾値は置けない
- 新しいフックの追加。止まる場所は `hooks/git-push-guard.js` の1つだけを保つ
- `skills/tdd` の内容を how-to へ写すこと。契約が2箇所になる。how-to は段の存在と人間の判断だけを書く

## 触る対象

| 対象 | 変更内容 | 壊す可能性のあるもの |
|---|---|---|
| `docs/how-to/run-a-task.md` | 確認節を「エージェントが黙ってやること」と「機械が見る範囲」に再構成。実装段（seam 合意 -> RED -> 最小 GREEN）を追加し、seam 合意を人間の段へ。`Findings` の基準を CRITICAL / HIGH に | 人間向けの操作面。読み手が段を取り違える |
| `commands/COMMANDS.md` | Ordered Path 手順7〜9 を成果物中心の表記へ。コマンドは任意の入口として残す | **段番号。`audit-harness-contract.js` の検査4が段数と参照番号の一致を見る** |
| `CLAUDE.md` | Preferred Commands の手順4 を同様に | ライフサイクルの正本。COMMANDS.md と食い違うと層が2つの答えを持つ |
| `scripts/lib/task-artifacts.js` | `parseReviewState` の必須節をテンプレートの全10節に拡張 | **契約: `review-summary.md` の完全性判定。節が欠けた成果物はチェーンをブロックするようになる** |
| `tests/lib/task-artifacts.test.js` | 必須節リストとテンプレートの `##` 見出しが一致することを検査 | なし（乖離を検出するためのテスト） |
| `templates/review-summary-template.md` | 冒頭に「節を消さない」注記。`Findings` の受容基準を severity 別へ | **同じテンプレート内で矛盾していた**（Findings 節は severity 別、下の注記は `none` 必須） |
| `commands/review-task.md` `commands/eval.md` | 同じ `Findings` が `none` 基準を severity 別へ | 撤去済みの定義が3箇所に残っていた |
| `tests/hooks/hooks.test.js` `tests/lib/{harness-status,lifecycle-record}.test.js` `scripts/ci/smoke-harness-lifecycle.js` | review フィクスチャを全10節へ。`hooks.test.js` はインラインの重複3件を `writeCompleteReview` へ寄せ、`findings` / `nextAction` を上書き可能に | **不完全なフィクスチャは、断言が名指しする条件を切り分けられなくなる**（smoke の「未解決の指摘」ケースが同時に「節が足りない」でも落ちる状態だった） |

必須節の拡張は既存6件すべてが全10節を持っているので遡及的な破壊はない（実測）。

**実装中に判明した追加分（マージ前に降ろした）:** `Findings` が `none` の基準は how-to だけでなく
`templates/review-summary-template.md` `commands/review-task.md` `commands/eval.md` の3箇所にも
残っていた。テンプレートは**自分の中で矛盾していた** — `Findings` 節の注記は 2026-08-20 に
severity 別へ更新されたが、同じファイルの下部に `none` 必須の記述が残っていた。

## 却下した案

- **必須節を増やさず doc だけ直す** — 「勝手にやる」を規律のままにする。6/6で埋まっているが、欠けても誰も気づかない状態が残る
- **`Security` と `Comment Adequacy` だけを必須にする** — `Design Compliance` / `Code Quality` / `Test Adequacy` も同じく「やったかどうかが見えない活動」なので、2つだけ選ぶ理由がない
- **必須節リストをテンプレートから実行時に読む** — 契約は1箇所になるがファイル読みの依存が増える。テストで一致を検査すれば乖離は同じく防げる
- **`/eval` を段から外す** — 2026-08-12 の決定を覆すことになる。受容判断そのものは残る

## Open Issues

- 受容判断（`/eval` の中身）は成果物を持たないので、**後から「実施したか」を確かめられない。** 痕跡はマージコミットだけ
- **この worktree には別セッション（`a6f76cf3`）が同時に書き込んでいた。** 06:59〜07:00 に
  `commands/COMMANDS.md` `CLAUDE.md` `docs/how-to/run-a-task.md` を編集し、07:00:54 で止まっている。
  内容はこの design doc と整合していたので採用したが、**2つのセッションが同じ worktree を
  同時に触るのを止めるものは無い。** worktree は変更競合を減らすための仕組みなので、
  ここは穴（`rules/common/worktree-policy.md` は同時実行を扱っていない）
- 必須節を増やすと、`trivial` トラックで review を書く回に10節を要求する。トラック別に必須節を変える仕組みは無い（推定: `trivial` では review 自体を書かないので表面化しない）
- `Security` 節が「該当なし」の1行で埋まっているか、実際に叩いた結果が入っているかは機械では区別できない
