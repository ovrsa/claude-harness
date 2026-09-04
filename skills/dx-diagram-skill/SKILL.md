---
name: dx-diagram-skill
description: Use when a DX initiative needs business-analysis-aware questioning, current/future swimlane diagrams, service blueprints (サービスブループリント / 業務とシステムの対応 / 再現性のある俯瞰図), Mermaid sequence diagrams for implementation-critical flows, C4 diagrams, AI delegation decisions, prioritization, and implementation-ready artifacts from rough textual context.
---

# DX Delivery Diagram Workflow

DX 案件を `雑なコンテキスト -> 問題整理 -> 分析 -> 図 -> 実装前整理` の順で扱う Skill。

図解は主成果物だが、図解の前提となる DX 推進知識もこの Skill の内部に含める。

## When to Use

- DX 案件の現状分析を始めるとき
- ラフなヒアリングメモや業務テキストから図の下書きを起こしたいとき
- ボトルネックや手戻りを可視化したいとき
- 改善後の業務フローとシステム構造を整理したいとき
- AI の役割分担を図の外で整理したいとき
- 問題定義から実装前整理まで、図を使って合意形成したいとき

## Do Not Use

- 工程順や担当が全く分からないとき
- 単なる UI モックだけが必要なとき
- AI 導入が結論として固定されているとき

## Modes

### `diagram mode`

図解を主目的に進める。既存の業務情報や会話結果を前提に、必要最小限の確認で図と補助表を作る。

### `full mode`

問題定義、業務分析、選択肢比較、優先順位付け、図解、技術不確実性の整理、実装前整理まで進める。

図だけでは判断できないときは `full mode` を選ぶ。

## Read Order

1. `references/dx-playbook.md`
2. `references/business-analysis-rules.md`
3. `templates/dx-initiative-template.md`
4. `templates/swimlane-intake-template.md`
5. `references/swimlane-rules.md`
6. `references/swimlane-drawio-style.md`
7. `references/c4-rules.md`
8. `references/mermaid-sequence-rules.md`
9. `references/ai-delegation-rules.md`
10. `references/prioritization-rules.md`
11. `references/technical-research-rules.md`
12. `references/solution-evaluation-rules.md`
13. `references/diagram-review-rules.md`
14. `work/examples/README.md`
15. 必要なら `references/drawio-review-checklist.md`
16. 必要なら `references/playwright-verification-rules.md`

## Core Workflow

### Phase 0: Choose mode

- 図を描く前提情報が概ね揃っているなら `diagram mode`
- 何を描くべきか自体が曖昧なら `full mode`

### Phase 1: Frame the initiative

`templates/dx-initiative-template.md` を使い、少なくとも次を固める。

- initiative
- scope
- stakeholders
- current problem
- business impact
- success metrics

### Phase 2: Analyze the current state

`templates/swimlane-intake-template.md` にラフな情報を落とす。

確認必須:

- 時系列
- 責任主体
- handoff
- 開始条件
- 終了条件
- system of record

足りない情報があれば、図を描かずに不足項目一覧と仮置き前提を返す。

### Phase 3: Compare options and priorities

`full mode` では、図解の前に次を行う。

- `templates/solution-options-template.md` で選択肢比較
- `templates/prioritization-template.md` で優先順位付け

図を描く前に、何を改善し、何を残し、何を後回しにするかを明示する。

### Phase 4: Diagram the initiative

#### Swimlane Critical Rules（最優先・違反禁止）

スイムレーンを描く前と描いた後に必ず確認する。

1. **空きマスはそのまま空白にする** — `未関与` `主担当ではない` `結果待ち` `参照のみ` などのプレースホルダラベルは置かない（例外: `48h 待機` `承認停滞` 等のボトルネック表記のみ短い灰ラベル可）
2. **条件分岐は独立したひし形ノード（`rhombus`）で描く** — タスクボックス内に `◇` 文字や `判定` を埋め込まない。OK/NG は矢印ラベルで識別、NG は赤破線
3. **1 タスク = 1 ボックス（連番詰め込み禁止）** — 1 つの矩形に `① 〇〇 / ② 〇〇` と複数手順を並べない。各手順を独立ボックスにし、レーン内は細い矢印で接続。連番ラベル `① ② ③ …` はレーン跨ぎ handoff 矢印のみに付ける

詳細根拠は `references/swimlane-rules.md` および `references/swimlane-drawio-style.md`。

#### 手順

1. `work/examples/README.md` を見て出力粒度を確認する
2. スイムレーンの実装前設計を Markdown 表で提示しユーザー承認を得る（レーン一覧 / セル内容〔1 行 1 タスク〕 / 矢印一覧〔レーン跨ぎ番号付き・レーン内番号なし〕 / 判断ノード方針 / 空きマス方針 / グリッド方式宣言）。詳細は `references/swimlane-rules.md` の「実装前設計（必須）」節
3. 現状スイムレーンを 3 層分離方式で作る（背景＋細い区切り線＋小タスクボックス）。詳細は `references/swimlane-drawio-style.md`
4. ボトルネックを抽出する
5. `templates/ai-decision-matrix-template.md` を埋める
6. 改善後スイムレーンを作る
7. C4 Context と Container を作る
8. 実装判断に効く相互作用だけ Mermaid sequence diagram を作る
9. 複雑箇所だけ C4 Component を作る
10. `templates/kpi-template.md` を埋める

### Phase 5: Connect to implementation

`full mode` では、図を描いたあとに次を残す。

- `templates/stakeholder-map-template.md`
- `templates/requirements-traceability-template.md`
- 技術的不確実性メモ
- 導入後評価の観点

### Phase 6: Review and verify

1. スイムレーンの原本は必ず Draw.io (`.drawio`) で出力する
2. `references/diagram-review-rules.md` で図をレビューする
3. `references/drawio-review-checklist.md` で Draw.io 微調整を行う
4. 必要なら Playwright で出力確認する

## Output Set

- ステークホルダーマップ
- 現状整理メモ
- 現状スイムレーン
- 改善後スイムレーン
- 選択肢比較
- 優先順位表
- AI 判断表
- 必要時のみ Mermaid sequence diagram
- C4 Context
- C4 Container
- 必要時のみ C4 Component
- KPI シート
- 要求トレーサビリティ表
- 導入後評価メモ

## Guardrails

- AI 導入を前提にしない
- DX の知識なしに図だけ描こうとしない
- 図は一発完成ではなく反復改善を前提にする
- 図は単体で読めることを優先する
- 情報不足のまま、それっぽい図を生成しない
- 優先順位が曖昧なまま改善後図を固定しない
- スイムレーンは業務の流れと責任に限定する
- スイムレーンの原本は Draw.io (`.drawio`) とし、Markdown には補助説明と参照先だけを置く
- スイムレーンは `列=担当・システム / 行=フェーズ` を標準にする（時系列は上から下）
- **スイムレーンの Critical Rules（Phase 4 冒頭セクション）の 3 原則に違反しない**: 空きマスにプレースホルダラベルを置かない／条件分岐は独立ひし形ノードで描く／1 タスク = 1 ボックスで連番詰め込みをしない
- ツール / サービスは、責務があるなら行、補助ならセル近くの小さなボックスまたは注記として扱う
- C4 は構造と責務に限定する
- Mermaid sequence diagram は時系列と相互作用に限定する
- sequence diagram は 1 図 1 シナリオを守る
- sequence diagram の participant は責務単位で置き、増やしすぎない
- sequence diagram のメッセージは具体的な API / job / query 名で書く
- A/B/C は補助メモとして扱う
- KPI を持たずに完了扱いにしない
- `README.md` は人向け、`SKILL.md` は agent 向けとして混同しない
- `diagram mode` でも、必要な DX 問答は省略しない

## When Information Is Incomplete

- 不足条件は最低でも `時系列 / 責任主体 / handoff / 開始条件 / 終了条件`
- 足りない場合は、現状図・改善後図・C4 を描かずに止める
- 返す内容は `不足項目一覧` `仮置きできる前提` `追加で必要な確認事項`
- 推測で補う場合は、仮説であることを明示し、確定情報と混ぜない
