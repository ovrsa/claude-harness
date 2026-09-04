# Skills 棚卸し — 2026-05-20

## 実施済みアクション（2026-05-20）

優先度高の 4 件は本セッション内で適用済み。

| # | アクション | 結果 |
|---|------------|------|
| 1 | `continuous-learning` を deprecated に | frontmatter に `status: deprecated` + `superseded_by: continuous-learning-v2` を追加。本文先頭に DEPRECATED ノート挿入 |
| 2 | `continuous-agent-loop` を削除 | skill ディレクトリ削除。`autonomous-loops` 冒頭の旧互換ノートを修正 |
| 3 | `worktree-execution` を `autonomous-loops` へマージ | autonomous-loops に「7. Manual Post-Plan Worktree Workflow」セクション追加、元 skill 削除 |
| 4 | `e2e-testing` を `browser-verification-harness` へマージ | browser-verification-harness に「Generic Playwright Suite Patterns」セクション追加、README.md の 2 参照を更新、元 skill 削除 |

skill 総数: 72 → **69**（SKILL.md 件数）。

優先度中の 4 件（mcp-server-patterns Update / enterprise-agent-ops Improve / post-commit-asset-capture Improve / visa-doc-translate 要判断）は未着手。

## 概要

`~/.claude/skills/` 配下の SKILL.md 全 72 件を `skill-stocktake` フレームに沿って評価した結果。プロジェクト側 `.claude/skills/` は存在しないため対象外。

- 評価モード: Full Stocktake
- 評価方法: Explore subagent × 4 並列バッチ（各 18 件、Opus）
- 退役方針: propose-only（自動削除なし）
- スコア軸: actionability / scope fit / uniqueness / currency

## サマリ

| Verdict | 件数 |
|---------|------|
| Keep    | 64   |
| Retire  | 2    |
| Merge   | 2    |
| Update  | 2    |
| Improve | 2    |
| **合計** | **72** |

要対応は 8 件のみ。harness 全体として skill の構成は良好。

## アクション項目（優先度順）

### 🟥 優先度高 — 重複/陳腐化（4 件）

#### 1. `continuous-agent-loop` → Retire
- 状態: 45 行のスタブ。実体は `autonomous-loops` への forward reference のみ。
- 推奨: 完全削除。`autonomous-loops` が後継。
- リスク: なし（参照されているコマンドがあれば `autonomous-loops` に差し替え）。

#### 2. `worktree-execution` → Merge into `autonomous-loops`
- 状態: 42 行。`autonomous-loops` の Ralphinho worktree isolation セクションと内容が重複。`worktree-start` コマンドも既存。
- 推奨: `autonomous-loops` に "Worktree Isolation" 小節として吸収し、本 skill を削除。
- リスク: 低。CLAUDE.md / rules で参照されているか要確認。

#### 3. `e2e-testing` → Merge into `browser-verification-harness`
- 状態: 326 行。Playwright config・CI 統合・flaky test 戦略が `browser-verification-harness` (213 行) と重複。後者が前者を reference skill として既に列挙。
- 推奨: Playwright config 雛形と critical-flow patterns を `browser-verification-harness` に取り込み、本 skill は廃止。
- リスク: 中。`e2e-testing` を直接 trigger している commands が無いか要確認。

#### 4. `continuous-learning` → Update（v2 への誘導）
- 状態: 119 行の v1。`continuous-learning-v2` が hooks ベース（100% reliable）+ instincts + confidence scoring + project-scoped isolation で実質的に上位互換。
- 推奨: frontmatter に deprecation note + "use continuous-learning-v2 instead" を追加。互換性のため本体は残す。
- リスク: なし。

### 🟧 優先度中 — 単独陳腐化/拡充（4 件）

#### 5. `mcp-server-patterns` → Update
- 状態: 71 行。`@modelcontextprotocol/sdk` の `registerTool` / `tool` 等の API はバージョン差があるが pinning されていない。
- 推奨: テスト済み SDK バージョン（例: `0.7.0+`）を frontmatter に追記し、"Verify against" セクションを正式化。
- 工数: 30–60 分。

#### 6. `enterprise-agent-ops` → Improve
- 状態: 50 行のスケルトン。operational domains のリストはあるが、具体パターンやコード例がない。
- 推奨: immutable artifact / secret injection / timeout budget の雛形、observability dashboard (Prometheus/ELK)、incident runbook、PM2/systemd 統合例を追加。150–200 行目標。
- 工数: 2–4 時間。

#### 7. `post-commit-asset-capture` → Improve
- 状態: 39 行。分類ロジック（task-specific / project docs / workflow candidate）と promotion criteria はあるが、例示が無く判断境界が曖昧。
- 推奨: 各分類パスに 2–3 個の実例を追加するか、CLAUDE.md の guideline 節として吸収。
- 工数: 1–2 時間。

#### 8. `visa-doc-translate` → Retire（要判断）
- 状態: 117 行。ビザ申請書類翻訳という単一ユースケース。
- 推奨: ユーザーの使用頻度次第。実利用しているなら Keep のまま、もしくは「個人ツール」として `docs/` 等に降格。
- リスク: ユーザーの個人ワークフロー依存。**削除前に確認推奨**。

## Keep（64 件）

良好な状態と判断。詳細は `~/.claude/skills/skill-stocktake/results.json` 参照。代表的にユニーク価値が高いものを抜粋:

- **Lifecycle/methodology**: `coding-agent-lifecycle-guardrails` (31), `superpowers-tdd` (45), `systematic-debugging` (66), `pre-plan-research` (141), `search-first` (161), `eval-harness` (270), `verification-loop` (126)
- **Patterns (broad references)**: `python-patterns` (750), `python-testing` (817), `frontend-patterns` (642), `backend-patterns` (598), `git-workflow` (751), `coding-standards` (530), `tdd-workflow` (410), `api-design` (523)
- **RAG/Vector**: `rag-implementation` (571), `embedding-strategies` (608), `hybrid-search-implementation` (570), `similarity-search-patterns` (560), `vector-index-tuning` (523)
- **Niche but unique**: `foundation-models-on-device` (243), `clickhouse-io` (439), `nutrient-document-processing` (166), `plankton-code-quality` (240), `regex-vs-llm-structured-text` (221)
- **Workflow (Japanese)**: `mr-split` (209), `mr-description` (116), `linear-project-overview-md` (95), `service-blueprint-swimlane` (120), `dx-diagram-skill` (171)

## 棚卸しから見えた harness 全体への所感

1. **skill 数 72 は適切な規模**。重複は限定的（4 件のみ）で、命名と scope が概ね区別されている。
2. **patterns 系（broad）と workflow 系（narrow）の二層が成立**している。両者を統合しない判断は妥当。
3. **使用回数は全件 0/0**。これはテレメトリの skill 起動カウントが未統合 or 集計期間外と推定。`continuous-learning-v2` の hook 統合と合わせ、後続でテレメトリ側を見ると判断材料が増える。
4. **続編の宿題**: `~/.claude/commands/` 側の棚卸しが未実施。skill と命名が重複している可能性が高く（例: `verify` / `verification-loop`、`research` / `pre-plan-research` / `deep-research`）、別タスクとして実施推奨。

## 次のステップ候補

| # | アクション | 工数目安 | 備考 |
|---|------------|----------|------|
| 1 | `continuous-agent-loop` 削除 | 10 分 | 参照箇所の grep + 差し替え |
| 2 | `worktree-execution` → `autonomous-loops` 統合 | 30 分 | 統合後に skill 削除 |
| 3 | `e2e-testing` → `browser-verification-harness` 統合 | 60 分 | Playwright 雛形を吸収 |
| 4 | `continuous-learning` の frontmatter に deprecation 追加 | 5 分 | 残置で OK |
| 5 | `mcp-server-patterns` の SDK バージョン明記 | 30–60 分 | Context7 で最新仕様を再確認 |
| 6 | `enterprise-agent-ops` を 150–200 行に拡充 | 2–4 時間 | 単独タスク化推奨 |
| 7 | `post-commit-asset-capture` に例示追加 | 1–2 時間 | CLAUDE.md 吸収案も検討 |
| 8 | `visa-doc-translate` 利用実態の確認 | 5 分 | ユーザーへ確認 |
| 9 | `~/.claude/commands/` の棚卸し | 1–2 時間 | 別タスク |

## アーティファクト

- 集計済み JSON: `~/.claude/skills/skill-stocktake/results.json`
- バッチ評価: `/tmp/stocktake/batch_{1..4}_results.json`
