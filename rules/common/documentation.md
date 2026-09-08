# Documentation

永続リファレンス（`docs/` に置くもの）の分類と配置を定める。
ライフサイクル成果物（`review-summary.md` / `verification-summary.md` 等）は対象外 — それらは `~/.claude/docs/architecture.md` と `~/.claude/templates/` を参照。

## 中核原則: 維持コストゼロ (CRITICAL)

維持を前提にした doc は必ず嘘になる。**嘘の doc は、無い doc より悪い**（もっともらしいので疑われない）。

置いてよいのは3種類だけ。

| 種類 | なぜ腐らないか | 例 |
|---|---|---|
| **追加only** | 「その時点の決定」なので古くても嘘にならない | `docs/design/`, `docs/how-to/` |
| **コードと一体** | コードを変えれば同じ diff に入る。維持コストが乗らない | 契約（型定義 + コメント）、Tutorial（実行可能コマンド） |
| **使い捨て** | 腐る前に死ぬ | `TODO.md` |

例外は **`docs/architecture.md` の1ファイルのみ**。「これだけ見とけ」が無い構造はチームで回らないため許容する。

## 配置

```
README.md              目的だけ。機能一覧は書かない
AGENTS.md              ミスログ + 禁止事項 + コードに現れない実体の在り処。~100行・追記only
TODO.md                使い捨て・gitignore
docs/
├── architecture.md    今どうなっているか。唯一の維持義務。what だけ・A4 1〜2枚
├── design/            追加only・日付順。なぜ
│   ├── 0000-initial.md
│   └── YYYY-MM-DD-<slug>.md
└── how-to/            追加only。必要が出たら1枚足す
    └── deployment.md      自動化されていない手順だけ
コード内                契約（型 + コメント）／Tutorial（実行可能コマンド）
```

テンプレートは `~/.claude/templates/` にある（`readme-` / `repo-map-` / `todo-` / `architecture-` / `design-doc-initial-` / `design-doc-increment-` / `how-to-`）。

| 対象 | 入口 |
|---|---|
| `AGENTS.md` | `/repo-map` |
| `docs/` 一式 | `/docs-build`（**`/grill-me` を通してから**） |
| 書くべきかの判定 | `writing-reference-docs` スキル |

## `TODO.md` は実行状態ではない

| 対象 | 役割 | 所有者 |
|---|---|---|
| git（ブランチ・`log`・`diff`） | 実際に何が起きたか。**復帰の一次根拠** | — |
| `docs/design/` の最新1枚 | 決定された意図 | 人間 |
| `runs/<date>-<slug>/` | ゲートの証拠本文。worktree を消しても残る（git 追跡） | フック |
| `TODO.md` | 人間の作業メモ・現在地（使い捨て・gitignore・完了時に削除） | 人間 |

**`TODO.md` に実行状態を持たせない。** compaction で失われるのは会話の方なので、
復帰の根拠は git と `docs/design/` に置く。`TODO.md` は消えても復帰できるものだけを書く。

2026-08-17 まで、ここには `progress.md` が「完了ゲートの入力」として載っていた。
`progress.md` は撤去した（ゲートが到達不能だったため。`docs/architecture.md` の
「実際に止まる場所」を参照）。

2026-08-20 まで、この表の先頭は `run_state`（SQLite）で「compaction を跨いで残る durable な
実行状態」と書かれていた。**`current_phase` / `next_action` / `blockers` は `progress.md` から
埋めていたので、`progress.md` 撤去後は常に空だった。** 成果物が揃った状態で比較すると、
非空フィールドはすべて成果物ファイル側にもあった。SQLite ごと撤去した。

## Lifecycle

全体フローは `~/.claude/commands/COMMANDS.md` の Ordered Path が正本。
この節はそのうち**ドキュメント構築フェーズ（手順3の尋問と手順5の記録）**を展開したもの。

慣れるまではこの順序を守る。飛ばしてよいのは「0で止まる」場合だけ。

### 0. 書くか判定する（`writing-reference-docs`）

- Lynch の3問に答える（複数人で協調 / 3ヶ月以上 / 数年運用）
- **0個 Yes → ここで終了。** `AGENTS.md` と `TODO.md` だけで足りる
- 1個以上 Yes → 次へ

### 1. 尋問する（`/grill-me`）

`grill-me` は1行の入口スキル、実体は `grilling`。**どちらも upstream（mattpocock/skills）。書き換えない。**
足りない要素はローカル側（`/docs-build`）に置く。

upstream が定める進め方:

- 一度に1問だけ聞く。複数同時は混乱を招く
- **事実は環境（ファイルシステム・ツール）を調べて自分で解決する。人間に聞くのは決定だけ**
- 各質問に推奨回答を添える
- 決定木の枝を1本ずつ降り、決定間の依存を順に解消する
- 合意に達するまで着手しない

止め時のローカル基準（upstream には無い）— これが揃ったら止める。質問が尽きた時ではない:

- Objective が1文で言える／Non-goals が1つ以上／却下した案と理由／未確定事項／成功条件
- 設計用途なら追加で: 数字1つ以上／触る契約／許容した負債

### 2. 構築する（`/docs-build`）

- grilling を通っていなければ**構築しない**。`/grill-me` に戻る
- **Grill Record（10項目）を会話から抽出するのはこのコマンドの仕事。** upstream skill は構造化出力を持たない。
  抽出結果はユーザーに提示して確認を取る。拾えなかった項目は空欄のまま残す
- `docs/design/0000-initial.md` の有無で分岐
  - **無い（初回）** → `README.md` ＋ `docs/design/0000-initial.md`。3問の Yes が2個以上なら `docs/architecture.md` も
  - **ある（追加）** → `docs/design/YYYY-MM-DD-<slug>.md` を1枚。**A4 1枚に収める**
- セクションを選ぶ。不要な節は削る。**選んだ節は埋まらなくても空欄で残す**
- Grill Record の「推定を含む箇所」は該当箇所に「推定」と明記し Open Issues に載せる
- **構成（デプロイ単位）が変わる回のみ** C4 図を入れ、`docs/architecture.md` を同じ内容にセットで直す
- 図は `design-doc-mermaid`（汎用）/ `dx-diagram-skill`（DX・業務分析）/ `simple-er-diagram`（ER・データモデル）に委譲する

### 3. 実装へ渡す

- **design doc が実装の入力。** 決定は `/grill-me` で確定するので、実装に入る前に書く。
  Grill Record 10項目のうち実装後にしか分からないのは `触る対象` だけで、残りは尋問の場で確定している。
  **後回しにすると compaction で失われる**（2026-08-17 に `HARNESS.md` の Design Principles 9項目を
  実際に失った。記録を後回しにしたのが原因）
- **修正タスクの例外は狭い。** 「実装後にしか書けない」は診断と実装を混同した言い方だった。
  何が壊れているかを突き止めるのは read-only の調査で、`/grill-me` 側の仕事。
  **診断が終われば `却下した案` も `Non-goals` も確定するので、実装前に書ける。**
  実装後まで待つのは「実装してみて初めて原因が分かった回」だけ。既定ではなく稀なケース
- `Non-goals` がスコープ境界として効く。**置き場所は design doc の1箇所だけ**。
  2026-08-17 まで `plan.md` にも置いていたが、`plan.md` ごと撤去した
- **マージ前に `触る対象` と Open Issues を確定させる。** 実装で判明した分をここで降ろす。
  取り込んだ後は触らない（追加only は「過去の決定を消さない」規則なので、
  同じタスクのマージ前の草稿を直すのは履歴の改変ではない）
- compaction を跨ぐ見込みがあるなら `TODO.md` を作る（`.gitignore` 確認）。跨がないなら作らない
- `TODO.md` の項目は design doc から導出する。そこで新しくスコープを決めない

### 4. 実装中

- **契約はコードに置く**（型 + コメント）。doc に書かない
- エージェントが間違えたら `AGENTS.md` に1行追記する（`/repo-map`）

### 5. 完了時

- **`TODO.md` が死ぬ前に、発生した設計判断を `docs/design/` に落とす。** 判断は捨てられない
- 構成が変わったなら `docs/architecture.md` を直す
- `TODO.md` を削除する

### 6. `architecture.md` を触ったら検証する

- エージェントに「`architecture.md` とコードが一致しているか確認して」と投げる
- **検証させる。生成させない**（正しさの責任は人が持つ）

### 第三者が読む順序（構築物の受け取り側）

1. `README.md` — 何のプロジェクトか
2. `docs/architecture.md` — 今どうなっているか（「これだけ見とけ」）
3. `AGENTS.md` — 触ると危ないもの
4. `docs/design/` — なぜそうなっているか（必要になった時だけ、該当する1枚）

## 規模による段階

**この節はプロジェクト開始時の門。** 「そもそも doc を書くか、どこまで置くか」を決めるためのもので、
既に `docs/` を持ち規約が回っているプロジェクトに後から当てるものではない。確立したプロジェクトで
これを適用すると、既に維持されている `architecture.md` を「Yes が足りないから不要」と判定してしまう。
既存プロジェクトの維持義務は下の「必ず守ること」が定める。

Lynch の3問で切る。**満たさないなら doc を書かない。**

- 複数人で協調して実装するか
- 3ヶ月以上の作業になるか
- 数年本番で動くか

| Yes の数 | 置くもの |
|---|---|
| 0 | `AGENTS.md` + `TODO.md` のみ。`docs/` を作らない |
| 1 | + `docs/design/0000-initial.md` |
| 2以上 | + `README.md` を厚くする / `docs/architecture.md` |

最大構成を課さない。**空ファイルは無いより悪い**（腐った期待を作る）。

## 必ず守ること

- **維持義務は `architecture.md` だけ。** 維持義務を分散させると守られない。更新トリガーは「`docs/design/` に1枚書く時にセットで直す」（構成が変わる = design doc を書く。書かない変更では構成も変わらない）
- **契約は1箇所にしか置かない。** doc とコードの両方に書いたら契約が2つあるということで、必ず乖離する。型・値域・必須性で表現できるものはコードへ寄せ、doc から消す。doc に残すのは**依存先がコードの外にあるもの**だけ（列順序×過去データ、イベント名×アラート設定など）
- **「今の姿」の説明を保存しない。** 保存すればキャッシュになり腐る。必要時にエージェントに生成させ、**根拠（ファイル+行）を出させて検証する**。例外は `architecture.md`（人が書き、エージェントに検証させる）
- **`docs/` の索引を作らない。** 索引は維持されず嘘になる。索引が必要になったら、それは配置に失敗した合図。契約をコードの隣に置けば索引は不要になる
- **「どこにあるか」は書く。「値」は書かない。** 存在の事実は変わらないが、値は変わる
- **追加only の doc を書き換えない。** 書き換えると決定の記録が消える。変更は新しい1枚を足す
- **`architecture.md` に why を書かない。** why は `docs/design/` にある。書くと厚くなり、直されなくなり、腐る
- **C4 は Context と Container まで。** Component 以下は変化が速いので書かない
- **絵文字を使わない。** Mermaid のノードラベルも含む。`design-doc-mermaid` は unicode semantic symbols を推奨するが、この環境ではその推奨を上書きする。種別の区別は high-contrast の `classDef`（`color:` 必須）で行う
- **未確認の内容は「推定」と明示し、Open Issues で追跡する。** doc の信頼性は「間違いを書かないこと」より「確認済みと推定を区別すること」で保たれる

## 分類の判断基準

Diátaxis の4象限を**分類の判断基準としてのみ**使う。ディレクトリ構造には使わない（社内システムの読者はほぼ1種類で、分割の利益より探すコストが上回る）。

中核ルールは「**境界をぼかすな**」。

| 象限 | 満たし方 |
|---|---|
| Tutorial（行動×学習） | **実行可能コマンド**（`make dev` / `make test`）。doc で書かない。腐ったら CI が落ちるので気づける |
| How-to（行動×仕事） | `docs/how-to/` |
| Reference（認知×仕事） | **コード内の型定義 + コメント** |
| Explanation・今（認知×学習） | `docs/architecture.md` |
| Explanation・決定時（認知×学習） | `docs/design/` |

Explanation を時間軸で2分割するのは Diátaxis にない追加。これがないと「最新を知りたい」に答えられない。

## セクション選定に使う枠組み

| doc | 枠組み | 使い方 |
|---|---|---|
| `docs/design/` | Lynch "How to Write an Effective Software Design Document" | セクションはメニュー。不要な節は削る。ただし**選んだ節は空欄で残す**（空欄が欠落を可視化する。Open Issues の1行に畳むと穴が見えなくなる） |
| `docs/architecture.md` | arc42（12セクション） | 選んで使う。特に Quality（SLO・数字）と Risks/Technical Debt は忘れやすい |
| 図 | C4 + `design-doc-mermaid` / `dx-diagram-skill` / `simple-er-diagram` | 再発明しない。委譲する |

## Documentation Checklist

doc を追加・変更する前に:

- [ ] Lynch の3問を満たしているか（0個なら書かない）
- [ ] 3種類（追加only / コードと一体 / 使い捨て）のどれかに収まっているか
- [ ] 維持義務を新たに増やしていないか（`architecture.md` 以外に追随型 doc を作っていないか）
- [ ] 契約を doc とコードの両方に書いていないか
- [ ] 値（ID・ドメイン・パス）を doc に書いていないか
- [ ] 索引を作ろうとしていないか
- [ ] 絵文字が入っていないか（Mermaid ラベル含む）
- [ ] 未確認の内容に「推定」と明記したか
- [ ] `stop-ai-slop-jp` を通したか（false agency・両論併記・偏愛語）
