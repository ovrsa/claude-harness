# ハーネスの設計原則と外部ソースの位置づけ

日付: 2026-04-23

<!--
この1枚は 2026-08-15 の文書統合で作られたが、内容は新しく書いたものではない。
削除した HARNESS.md に 2026-04-23（ハーネス発足日）から載っていた
Design Principles と External Sources Policy を、消さずに移したもの。
日付は文が成立した日に合わせてある。原文の意味は変えていない。
-->

## Objective

ハーネスの形を決めている原則と、外部フレームワークの扱いを記録する。

## なぜ今これか

`HARNESS.md` を削除するにあたり、そこにしか無かった2節を失わないため。
どちらも「今どうなっているか」ではなく「なぜそう選んだか」なので `docs/architecture.md` には置けない。

## 設計原則

- Pipeline-first for development mechanics
- Track-first over one-size-fits-all gates
- Artifact-when-useful over artifact-every-time
- DB-first runtime state over Markdown-only checkpoints
- Session-first over transcript-first continuity
- Constrained autonomy over unbounded autonomy
- Evaluate-before-completion for implementation and bug-fix work
- Observe-first evidence for behavior changes
- Mechanical enforcement over informal reminders

最後の1つが他を支えている。**非形式的な注意書きより機械的な強制を選ぶ**という原則があるので、
守られていない規則は文書に残さず、強制できる層へ降ろすか撤去する。

## 外部ソースの位置づけ

外部フレームワークはアイデア・ワークフローの型・一度きりのスキル収穫のために参照してよい。
ただし**どれもライブなライフサイクル権威ではない**。

- 参照元であって正本ではない
- `.claude` のライブな正本にしてはならない
- 採用した時点で、ローカルのライフサイクル方針として独立に正当化されなければならない
- プラグインの有効化は任意で、中核ハーネスの動作条件ではない
- vendored な upstream スキルは明示起動する道具であり、ライフサイクル方針を定義しない。
  その場で編集してはならない（足りない要素はローカルの command / rule 側に置く）

## Non-goals

- 原則の追加・改訂。この1枚は移設であって、内容の見直しではない

## 却下した案

- **`docs/architecture.md` へ吸収する** — architecture.md は what だけを持つ。why を入れると厚くなり、
  直されなくなり、腐る
- **2026-08-15 の統合 doc に混ぜる** — 原則は 2026-04-23 の決定なので、日付を偽ることになる。
  加えて追加 doc の A4 1枚を超える

## Open Issues

- 原則のうち「Constrained autonomy over unbounded autonomy」は、段階的な autonomy ladder として
  `AUTONOMY_POLICY.md` に展開されていたが、上位2段が一度も到達されなかったため
  2026-08-15 に撤去した。実装は `scripts/lib/permission-resolver.js` にある
