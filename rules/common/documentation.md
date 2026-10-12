# Documentation

永続リファレンス（`docs/` に置くもの）の分類と配置を定める。
ライフサイクル成果物（`review-summary.md` 等）は対象外で、`harness/templates/` が定める。

## 中核原則: 維持コストゼロ (CRITICAL)

維持を前提にした doc は必ず嘘になる。**嘘の doc は、無い doc より悪い。** 置いてよいのは3種類だけ。

- **追加only**: その時点の決定なので、古くても嘘にならない（`docs/design/`、`docs/how-to/`）
- **コードと一体**: コードを変えれば同じ diff に入る（契約は型定義 + コメント、Tutorial は実行可能コマンド）
- **使い捨て**: 腐る前に死ぬ（`TODO.md`。gitignore・完了時に削除）

例外は **`docs/architecture.md` の1ファイルのみ**。

## 配置

- `README.md`: 目的だけ。機能一覧は書かない
- `AGENTS.md`: ミスログ、禁止事項、コードに現れない実体の在り処（約100行・追記only）
- `docs/architecture.md`: 今どうなっているか。what だけ・A4 1〜2枚
- `docs/design/0000-initial.md`、`docs/design/YYYY-MM-DD-<slug>.md`: なぜ（日付順）
- `docs/how-to/`: 自動化されていない手順だけ

design doc の置き場所は管理先の宣言で分かれる。`.claude/tracker.json` で管理先を宣言したプロジェクトは親 Issue の本文に
だけ置き、`docs/design/` には置かない。宣言が `none` なら `docs/design/`。宣言が無ければ、最初の起票の前に人が選ぶ。
解決は `harness/scripts/resolve-tracker.js` が行い、GitHub を全プロジェクトに強制しない。

入口: 書くべきかの判定は `writing-reference-docs` スキル、`docs/` 一式と親 Issue の本文は `/docs-build`
（**`/grill-me` を通してから**）、`AGENTS.md` は `/repo-map`。

## 規模による段階

プロジェクト開始時の門。既に `docs/` を持ち規約が回っているプロジェクトに後から当てない。
Lynch の3問（複数人で協調して実装するか / 3ヶ月以上の作業になるか / 数年本番で動くか）の Yes の数で切る。

- 0: `AGENTS.md` + `TODO.md` のみ。`docs/` を作らない
- 1: + `docs/design/0000-initial.md`
- 2以上: + `README.md` を厚くする / `docs/architecture.md`

最大構成を課さない。**空ファイルは無いより悪い。** Issue の本文はゴールの入力になるので、この3問で省かない。

## 必ず守ること

- **維持義務は `architecture.md` だけ。** 構成が変わる design doc を書く時に、セットで直す
- **契約は1箇所にしか置かない。** 型・値域・必須性で表せるものはコードへ寄せる。doc に残すのは依存先がコードの外にあるものだけ
- **「今の姿」の説明を保存しない。** 必要時に生成させ、根拠（ファイル+行）を出させて検証する。
  `architecture.md` だけは人が書き、エージェントには検証させる（生成させない）
- **`docs/` の索引を作らない。**
- **「どこにあるか」は書く。「値」は書かない。**
- **追加only の doc を書き換えない。** 変更は新しい1枚を足す。同じタスクのマージ前の草稿は直してよい
- **`architecture.md` に why を書かない。** why は `docs/design/` にある
- **C4 は Context と Container まで。** 図を入れるのは構成（デプロイ単位）が変わる回だけ
- **図は再発明せず委譲する。** `design-doc-mermaid`（汎用）/ `dx-diagram-skill`（DX・業務分析）/
  `simple-er-diagram`（ER・データモデル）/ `show-me`（会話の中の図解）
- **絵文字を使わない。** Mermaid のノードラベルも含む。`design-doc-mermaid` の unicode semantic symbols の推奨は上書きし、
  種別は high-contrast の `classDef`（`color:` 必須）で区別する
- **節は枠組みから選ぶ。** design doc は Lynch の節をメニューとして、`architecture.md` は arc42 から選ぶ。
  選んだ節は埋まらなくても空欄で残す
- **未確認の内容は「推定」と明示し、Open Issues で追跡する。**
- **書いた本文は `stop-ai-slop-jp` に通す。**
- **実装後まで決定の記録を待つのは、実装して初めて原因が分かった回だけ。** マージ前に `触る対象` と Open Issues を確定させる
- **`TODO.md` に実行状態を持たせない。** 復帰の根拠は git と design doc。作るのは compaction を跨ぐ見込みがある時だけ。
  項目は design doc から導出し、そこで新しくスコープを決めない。消す前に、発生した設計判断を design doc に落とす
- **Grill の止め時は質問が尽きた時ではない。** Objective、Non-goals、却下した案と理由、未確定事項、成功条件が揃ったら止める
  （設計用途なら数字、触る契約、許容した負債も）。upstream の Grill に足りない要素は `/docs-build` 側に置く
