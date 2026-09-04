# DX Delivery Diagram Skill Workbench

DX 推進の文脈を整理し、必要な問答を行い、図解と実装前整理までつなぐための作業フォルダ。

このディレクトリは `source workspace` です。正本はここに置き、agent 実行時は `~/.claude/skills/` または `~/.codex/skills/` へ symlink して使う前提です。

配布先で使う場合は、このフォルダを任意の場所へ配置したうえで、その配置先を `SKILL_SOURCE_DIR` として読み替える。

## このフォルダの役割

- 人間が Skill の思想、標準、導入方法を把握する
- agent が読める Skill package を育てる
- DX 推進の問答、分析、図解、優先順位付け、実装前整理の標準をまとめる
- intake から図・補助表・レビューまでの見本を保持する

## このフォルダが目指すもの

この Skill は、単なる図解ツールではなく、DX 推進の知識を内蔵したうえで図を主要成果物として使うことを目指す。

図の中心はスイムレーンと C4 だが、開発者にとって相互作用の誤読リスクが高い箇所では Mermaid sequence diagram も扱う。

そのため、使い方は次の 2 モードを前提にする。

- `diagram mode`
  既存情報をもとに、図解を主目的として進める
- `full mode`
  問題定義、業務分析、選択肢比較、優先順位付け、図解、技術整理、実装計画、評価まで扱う

## 標準成果物

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

## ツール標準

- スイムレーン: Draw.io
- シーケンス図: Mermaid
- C4: Structurizr DSL
- ローカル確認: ブラウザ + Playwright
- AI の入力: Markdown テンプレート

## スイムレーン標準

- 横軸（列）: 担当、部門、システム
- 縦軸（行）: 業務フェーズ
- 時系列は原則として上から下に流す
- `ツール / サービス` は末尾の補助列ではなく、セル近くの補助ボックスまたはシステム列で表現する
- アイコンは任意。四角ラベルでもよい

## 人向けの読む順番

1. `research.md`
2. `references/dx-playbook.md`
3. `references/business-analysis-rules.md`
4. `references/prioritization-rules.md`
5. `references/technical-research-rules.md`
6. `references/diagram-review-rules.md`
7. `references/swimlane-rules.md`
8. `references/c4-rules.md`
9. `references/mermaid-sequence-rules.md`
10. `templates/dx-initiative-template.md`
11. `templates/swimlane-intake-template.md`
12. `work/examples/README.md`

## agent の入口

- Human entrypoint: `README.md`
- Agent entrypoint: `SKILL.md`
- Agent は `SKILL.md` から読み始め、必要な `references/` と `templates/` にだけ進む

## 標準ワークフロー

### full mode

1. 問題定義と対象範囲を固める
2. ステークホルダーと成功指標を整理する
3. 現状業務を棚卸しする
4. ボトルネック、手戻り、責任境界を分析する
5. 改善案を比較する
6. 優先順位を付ける
7. 図解する
8. 必要なら Mermaid sequence diagram で実装相互作用を補う
9. 技術的不確実性を整理する
10. 実装計画につなぐ
11. 導入後評価に備える

### diagram mode

1. 既存情報から intake を埋める
2. 不足情報を確認する
3. 現状図と改善後図を作る
4. 必要な C4 を作る
5. 必要なら Mermaid sequence diagram を作る
6. AI 判断表と KPI を補助成果物として付ける
7. 図のレビューを行う

## インストール運用

正本をこのディレクトリに置いたまま、skill ディレクトリへ symlink して使う。

```bash
SKILL_SOURCE_DIR="/path/to/dx-diagram-skill"
ln -s "$SKILL_SOURCE_DIR" ~/.claude/skills/dx-diagram-skill
```

または

```bash
SKILL_SOURCE_DIR="/path/to/dx-diagram-skill"
ln -s "$SKILL_SOURCE_DIR" ~/.codex/skills/dx-diagram-skill
```

削除時は symlink だけを外し、正本ディレクトリは残す。

## 前提ツール

最低限、次の前提があると扱いやすい。

- Draw.io
- Structurizr CLI
- Java
- 任意で Playwright
- 任意で Codex または Claude Code の skill 実行環境

## 導入後の最小確認

symlink 作成後は、少なくとも次を確認する。

1. Skill 形式が壊れていない

```bash
python3 /path/to/quick_validate.py "$SKILL_SOURCE_DIR"
```

`quick_validate.py` が手元にない場合は、このチェックは省略してよい。

2. 入口定義が読める

```bash
sed -n '1,80p' "$SKILL_SOURCE_DIR/SKILL.md"
sed -n '1,40p' "$SKILL_SOURCE_DIR/agents/openai.yaml"
```

3. Structurizr のサンプルが開ける

```bash
cd "$SKILL_SOURCE_DIR/work/examples/structurizr"
JAVA_TOOL_OPTIONS='-Dserver.port=8081' structurizr local .
```

開いたら `http://127.0.0.1:8081/workspace/1` を確認する。

## 構成

- `research.md`: 調査結果と採用判断
- `plan.md`: このワークベンチの改善計画
- `SKILL.md`: agent 用の実行ルーター
- `agents/openai.yaml`: 入口説明の補助定義
- `references/`: DX 推進と図解のルール
- `templates/`: 実案件の入力雛形
- `work/examples/`: input -> output -> review の見本
- `verification-summary.md`: 現時点の検証記録

## 配布時の扱い

このフォルダは、そのまま配布しても使えるように構成しているが、利用者向けに必須なのは次です。

- `README.md`
- `SKILL.md`
- `agents/`
- `references/`
- `templates/`
- `work/examples/`

次は開発者向け補助文書なので、必要に応じて含める。

- `research.md`
- `plan.md`
- `verification-summary.md`

配布物を最小化したい場合でも、上の必須セットは残す。
