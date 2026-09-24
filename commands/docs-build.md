---
name: docs-build
description: Build or extend persistent reference docs from the templates from settled decisions. Detects initial vs incremental and fills only the sections that apply.
command: true
---

# Docs Build

Use this command to construct `docs/` から永続リファレンスを組み立てるとき。

標準は `~/.claude/rules/common/documentation.md`、判定は `writing-reference-docs` スキル、
雛形は `~/.claude/templates/` が正本。このコマンドは**構築の実行**だけを担う。

`AGENTS.md` はこのコマンドの対象外。`/repo-map` を使う。

## design doc の置き場所

決定と書き込み権限を確かめたら（Required behavior 1）、書く前に管理先の宣言を解決する。

```bash
node ~/.claude/scripts/resolve-tracker.js --repo .
```

- `configured`: design doc を**親 Issue の本文**に書き、`docs/design/` には書かない。新しい仕様なら起票し、既存の Issue なら本文を更新する。
  テンプレートの節は選んで使い、不要な見出しと説明は省く。Required behavior 3（規模ゲート）と 4（初回・追加の分岐）は適用しない。
  1つのタスクとして着手するなら `受け入れ条件` と `検証方法` の節を入れる（`scripts/task-goal.js` が読む）。
  書いたら、次は `split-issue` で分割案を示す
- `none`: Required behavior のとおり `docs/` に書く
- `unconfigured`（終了コード 2）: `candidates` を示して人に選んでもらい、`expected_path` に書いてから再実行する。
  **人が選ぶ前に Issue を作らない**
- `invalid`: `error` を示して止まる

GitHub では `tracker.repo` のリポジトリの Issue に書く。他の管理先では、そのランタイムで使える手段で書く。

## Required behavior

1. **必要な決定と書き込み権限を確認する。** 会話や承認済み仕様で目的・範囲・成功条件が決まっていれば、
   その根拠から構築を進める。未確定の判断が構築を妨げる場合だけ `grilling` を使う。
   分析だけの依頼は書き込みの許可ではない。既存手順の `docs/how-to/` は実装と照合する（Required behavior 8）。
2. **下表の決定項目を会話・承認済み仕様から抽出する。** 既に確認された判断は再確認しない。
   **空欄は推定で埋めない。** 拾えなかった項目は空欄のまま残し、Open Issues に載せる。
   実装を妨げる未確定事項は質問する。確認が取れていない内容には「推定」と明記する。
3. 規模ゲート（Lynch の3問）を適用する。**0個 Yes なら doc を書かない**と返して止まる。
   - 複数人で協調して実装するか
   - 3ヶ月以上の作業になるか
   - 数年本番で動くか
4. `docs/design/0000-initial.md` の有無で分岐する。
   - **無い → 初回構築**: `readme-template.md` → `README.md`、`design-doc-initial-template.md` → `docs/design/0000-initial.md`。
     3の Yes が2個以上なら `architecture-template.md` → `docs/architecture.md` も作る。
   - **ある → 追加構築**: `design-doc-increment-template.md` → `docs/design/YYYY-MM-DD-<slug>.md`（日付は当日。連番は振らない）。
5. **セクションを選ぶ。** テンプレの全節を埋めようとしない。案件に不要な節は削る。
   ただし**選んだ節は埋まらなくても空欄で残す**（空欄が欠落を可視化する。Open Issues の1行に畳まない）。
6. 追加構築では **A4 1枚に収める**。全体像・用語・アーキテクチャ全体は初回 doc にあるので繰り返さない。差分だけ書く。
7. **構成（デプロイ単位）が変わる場合のみ**、C4 図を1枚入れ、`docs/architecture.md` を**同じ内容にセットで直す**。
   構成が変わらない回は図を入れず、`architecture.md` も触らない。
8. 手順が必要になったら `how-to-template.md` → `docs/how-to/<slug>.md`。**自動化されていない部分だけ**書く。
   既存手順を書き起こす場合も、書いた内容を**実装と1つずつ突き合わせて検証する**。
   フックの挙動はフックのコードを、コマンドの有無は `commands/` を、必須節はパーサを見る。**推測で書かない。**
9. `TODO.md` を使うなら `.gitignore` に入っているか確認し、無ければ追加する。
10. 未確認の内容を書いた箇所には「推定」と明記し、Open Issues に載せる。
11. 図の生成・検証は `design-doc-mermaid` / `dx-diagram-skill` に委譲する。再実装しない。

## Grill Record のマッピング

会話・承認済み仕様（grilling を使った場合はその会話）から抽出する10項目と、テンプレのセクションの対応。

| Grill Record | 初回（`0000-initial.md`） | 追加（`YYYY-MM-DD-<slug>.md`） | なぜ後から書けないか |
|---|---|---|---|
| Objective | `Objective` | `Objective` | — |
| なぜ今これか | `Background` | `なぜ今これか` | 動機は時間が経つと復元できない |
| **Non-goals** | `Non-goals` | `Non-goals` | 決定の場でしか出ない。目的の drift を止める最も安い装置 |
| **却下した案** | `Alternatives Considered` | `却下した案` | 後から書くと推定になる |
| 成功条件 | `Goals` | （`Objective` に含める） | — |
| 触る対象（**どの契約**） | `Architecture` | `触る対象` | 変更時にしか分からない |
| 数字 | `Quality` | — | 忘れられやすい。無いなら空欄で残す |
| 許容したリスク・負債 | `Risks and Technical Debt` | — | 「許容した」判断は後から復元できない |
| 未確定事項 | `Open Issues` | `Open Issues` | — |
| 推定を含む箇所 | 該当箇所に「推定」と明記 | 同じ | — |

Grill Record に無い項目（`Glossary` / `Scenarios` / `Security & Privacy` / `Constraints`）は、
案件に必要なら追加で聞く。不要なら節ごと削る。

## Hard guardrails

- **未確定の判断を捏造しない。** Required behavior 1 の条件で確認し、既存の実行許可は再利用する。
- **upstream skill (`grill-me` / `grilling`) を書き換えない。** `grill-me` は1行の入口スキルで、それが正しい姿。
  足りない要素はこのコマンド側に置く
- **テンプレを全節埋めない。** 不要な節は削る。埋まらない節は空欄で残す
- **追加only の doc を書き換えない。** `docs/design/` の既存ファイルは変更せず、新しい1枚を足す
- **「今の姿」の doc を新設しない。** `docs/architecture.md` が唯一の例外。overview / summary の類を作らない
- **`docs/` の索引を作らない。** ファイル名で分かるようにする
- **値（ID・ドメイン・パス）を doc に書かない。** 「どこにあるか」だけ書く
- **契約を doc に書かない。** 型・値域で表現できるものはコードへ寄せる。doc に残すのは依存先がコードの外にあるものだけ
- **`architecture.md` に why を書かない。** why は `docs/design/`
- **C4 は Context と Container まで。** Component 以下は書かない
- **絵文字を使わない。** Mermaid のノードラベルも含む。種別の区別は high-contrast な `classDef`（`color:` 必須）
- 設定値の一覧、ディレクトリ構成の羅列、手順の文章による Tutorial を作らない

## 構築後

- 書いた本文を `stop-ai-slop-jp` に通す。doc で特に出るのは false agency（「課題が浮き彫りになる」「設計が結実する」）と両論併記。決定を書く doc で両論併記が残っていたら、それは決めていないということ

- `docs/architecture.md` を作った・直した場合、エージェントに「コードと一致しているか確認して」と投げて**検証させる**（生成させるのではない。正しさの責任は人が持つ）
- `TODO.md` が死ぬ時、そこで発生した設計判断が `docs/design/` に落ちているか確認する。**判断は捨てられない**
