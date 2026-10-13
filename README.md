# Claude Harness

Claude Code と Codex で使う個人用ハーネスです。`~/.claude` に置き、作業手順、フック、検証の証拠を共通で管理します。

## 編集の入口

| 作業 | 場所 |
|---|---|
| グローバル設定 | `settings.json`、`CLAUDE.md`、`AGENTS.md` |
| エージェントやコマンドの定義 | `agents/`、`commands/`、`rules/`、`skills/` |
| ハーネスの実装と検証 | `harness/scripts/`、`harness/hooks/`、`harness/tests/` |
| 実行フローと成果物の形式 | `harness/workflows/`、`harness/facets/`、`harness/schemas/`、`harness/templates/` |
| 実行記録とハーネスの状態 | `harness/data/` |

全体の構成は [docs/architecture.md](docs/architecture.md)、作業ルールは [CLAUDE.md](CLAUDE.md) にあります。
`projects/` や `plugins/` など Claude 本体が管理するものは、所定の場所に残します。

## 検証

リポジトリのルートから実行します。開発用設定は `harness/` にあり、npm の入口はルートに残しています。

```bash
npm ci
npm test
npm run lint:repo
node harness/scripts/sync-codex-bridge.js --check
```

テストでは一時ホームと使い捨てリポジトリを使います。bridge の検査は現在の稼働環境との整合を確認するもので、
worktree のコードを試す場合は `--claude-root` と `--codex-home` に隔離した配置先を指定します。

## 配置の移行

すでに利用している環境では、[配置変更の切替手順](docs/how-to/2026-09-29-harness-layout-migration.md) を使ってください。
新しい設定を動かす前に既存データを移し、Claude/Codex のセッションを起動し直す必要があります。

```bash
node harness/scripts/layout.js --root ~/.claude --check
```

このコマンドは直下の全項目と、既存データの移動候補を表示します。ファイルの内容は出力しません。
`--apply` はデータを移します。同名の移動先がある場合は上書きせず停止します。

Orca 1.4.215 の「Git無視ファイルを表示」はアプリ全体の設定です。この変更では切り替えません。
ワークスペース限定の表示除外と、その解除を同バージョンで確認できていないため、表示整理は未完了です。

## 元の環境との差分

2026-08-24 の配布時に、外部スキルのシンボリックリンクは実ファイルへ展開されました。
インストーラの lock は同梱されていません。再インストールすると upstream 管理に戻る可能性があるため、
出典と編集時の注意は [AGENTS.md](AGENTS.md) を確認してください。
配布後の変更は Git の履歴に残しています。過去の設計記録は `docs/design/` にあります。

## 派生元と第三者資産

ツリー全体の出発点は [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code)（MIT）。
2026-04-23 に取り込んだ。ライフサイクル・コマンド・ルール・フックは以降すべて書き換えており、
upstream を追従していない。`skills/skill-stocktake` が `origin: ECC` を宣言して残っているため、
同梱の `LICENSE`（MIT / Copyright (c) 2026 Affaan Mustafa）を保持している。

外部リポジトリ由来のスキルは15個ある。10個はプラグインが提供し、5個は `skills/` にある。

| 出典 | スキル |
|---|---|
| [mattpocock/skills](https://github.com/mattpocock/skills) | プラグイン `mattpocock-skills` が提供する10個（`skills/` には無い）: `grilling` `grill-me` `grill-with-docs` `domain-modeling` `to-spec` `to-tickets` `tdd` `implement` `setup-matt-pocock-skills` `code-review` |
| [wshobson/agents](https://github.com/wshobson/agents) | `python-code-style` `sql-optimization-patterns` |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | `sql-code-review` `sql-optimization` |
| [spillwavesolutions/design-doc-mermaid](https://github.com/spillwavesolutions/design-doc-mermaid) | `design-doc-mermaid` |

プラグインの10個は `settings.json` の `enabledPlugins` で有効にしていて、更新はプラグインの更新で入る。
Codex は `node harness/scripts/resolve-managed-skill.js <名前>` が返す `SKILL.md` を読む。
`grill-me` の `SKILL.md` は `Run a /grilling session.` の1行だけで、**これが正しい姿**である
（元の環境で1度これを故障と誤診して上書きした記録が `AGENTS.md` にある）。

`skills/` の5個は**実体を焼き込んであり、lock ファイルは同梱していない**（元はシンボリックリンクで、
zip に入れると壊れるため）。よって編集しても消えないが、**upstream の更新も入ってこない**。

`skills/` に複製を置いている外部由来のスキルの著作権表示は次のとおり。上の表に無い4個も含む。
MIT の許諾文はルートの `LICENSE` と同じ文面である。

| 出典 | ライセンス | 著作権表示 | スキル |
|---|---|---|---|
| [wshobson/agents](https://github.com/wshobson/agents) | MIT | Copyright (c) 2024 Seth Hobson | `python-code-style` `sql-optimization-patterns` `prompt-engineering-patterns` |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | MIT | Copyright GitHub, Inc. | `sql-code-review` `sql-optimization` |
| [vercel-labs/skills](https://github.com/vercel-labs/skills) | MIT | Copyright (c) 2026 Vercel, Inc. | `find-skills` |
| [iKora128/stop-ai-slop-jp](https://github.com/iKora128/stop-ai-slop-jp) | MIT | Copyright (c) 2026 Daichi Nagashima | `stop-ai-slop-jp`（全文をフォルダに同梱） |
| [spillwavesolutions/design-doc-mermaid](https://github.com/spillwavesolutions/design-doc-mermaid) | MIT（upstream の README の記述。LICENSE ファイルは無い） | upstream に記載が無い | `design-doc-mermaid` |
| [anthropics/skills](https://github.com/anthropics/skills) | Apache-2.0 | 全文をフォルダに同梱（`LICENSE.txt`） | `frontend-design` |

upstream 由来の `SKILL.md` を書き換えない。足りない要素は upstream ではなく `commands/` か `rules/` に置く。
自動選択から外したいだけなら `settings.json` の `skillOverrides` を使う。

```json
"skillOverrides": { "<name>": "user-invocable-only" }
```

`user-invocable-only` はモデルから隠して `/name` は残す。`off` は両方から隠す。反映は次の新規セッションから。

### ハーネス本体が名指ししているスキル

以下は `CLAUDE.md` / `rules/` / `docs/how-to/run-a-task.md` が手順の中で名指ししている。
消すと手順書が指す先を失う。プラグインの2個は、プラグインを無効にしても同じことが起きる。

| スキル | 役割 |
|---|---|
| `grilling`（プラグイン。入口は `grill-me`） | 着手前の尋問。決定を固める |
| `tdd`（プラグイン） | RED -> 最小 GREEN。refactor はループの外（review 段の仕事） |
| `design-doc-mermaid` | design doc の図。再発明せず委譲する |
| `writing-reference-docs` | doc を書くべきかの判定 |
