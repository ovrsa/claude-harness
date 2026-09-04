# LLM / Coding Agent Daily Digest — Setup

毎朝 08:00 に LLM/Coding Agent の最新動向を 8 ソースから収集し、日本語ダイジェスト Markdown を 1 本生成する Skill。

## 構成

- **fetch.py** — Python 標準ライブラリのみで 8 ソースを並行に取得し、raw JSON を出力。
- **system-prompt.md** — Claude に渡す編集者ロール定義。日本語要約と出力フォーマットを規定。
- **run.sh** — `fetch.py` → `claude -p` の orchestration。launchd と手動の両方から呼べる。
- **config.json** — 出力先パス、ソース ON/OFF、キーワード、対象 repo の編集ポイント。
- **com.kyo.llm-daily-digest.plist** — launchd 用サンプル plist (毎日 08:00 起動)。
- **SKILL.md** — `/llm-daily-digest` でアドホック起動するための Skill 定義。

## 必須セットアップ (1 回だけ)

### 1. 出力先を指定

```bash
# 例: Obsidian Vault 内のサブディレクトリ
nano ~/.claude/skills/llm-daily-digest/config.json
# "output_dir": "PLEASE_SET_OUTPUT_DIR" を実パスに書き換え
# 例: "output_dir": "~/Documents/obsidian_main/llm-digest"
```

### 2. 動作確認 (まず手動で 1 回)

```bash
~/.claude/skills/llm-daily-digest/run.sh
```

ログ: `~/Library/Logs/llm-daily-digest/run-YYYY-MM-DD.log`
成功すれば `output_dir/YYYY-MM-DD.md` が生成される。

### 3. launchd に登録

```bash
# plist を LaunchAgents へコピー
cp ~/.claude/skills/llm-daily-digest/com.kyo.llm-daily-digest.plist \
   ~/Library/LaunchAgents/

# 登録
launchctl load ~/Library/LaunchAgents/com.kyo.llm-daily-digest.plist

# 即時テスト実行
launchctl start com.kyo.llm-daily-digest

# 登録確認
launchctl list | grep llm-daily-digest
```

### アンロード (止めたいとき)

```bash
launchctl unload ~/Library/LaunchAgents/com.kyo.llm-daily-digest.plist
rm ~/Library/LaunchAgents/com.kyo.llm-daily-digest.plist
```

## 動作モード

| モード | 起動方法 | 用途 |
|---|---|---|
| **scheduled** | launchd 08:00 | 日次自動実行 |
| **manual cli** | `~/.claude/skills/llm-daily-digest/run.sh` | 任意のタイミングで再生成 |
| **interactive skill** | Claude Code で `/llm-daily-digest` | 編集者ステップだけ Claude セッション内で実行 |

## トラブルシュート

### output_dir が "PLEASE_SET_OUTPUT_DIR" のまま

→ `config.json` を編集してください。

### `python3` が見つからない (launchd 環境)

launchd は最小 PATH で起動します。plist の `EnvironmentVariables` の PATH に `which python3` の親ディレクトリが含まれているか確認:

```bash
which python3   # 例: /opt/homebrew/bin/python3
```

含まれていない場合は plist の PATH を編集。

### `claude` コマンドが見つからない

```bash
which claude    # 例: /opt/homebrew/bin/claude
```

plist の PATH に追加されているか確認。

### Mac がスリープしていて 08:00 を逃した

launchd は次のスケジュール時刻まで待ちません。スリープ中に逃した場合は wake 直後に実行されます (StartCalendarInterval の仕様)。

### ある程度の Claude セッションが必要

`claude -p --bare` はログイン済みセッションの認証情報を使います。`claude login` が完了していることを確認。

## カスタマイズ

### ソースの ON/OFF

```json
"sources": {
  "simonw": true,
  "ai_news_smol": true,
  "latent_space": false,   ← 切りたいソースを false に
  ...
}
```

### HN キーワード追加

```json
"hackernews_keywords": [
  "llm", "claude", "coding agent", "cursor",
  "your-new-keyword"
]
```

### Subreddit 追加

```json
"reddit_subs": ["LocalLLaMA", "ClaudeAI", "cursor", "MachineLearning", "your-sub"]
```

### 監視 repo 追加 (Coding Agent 新興 OSS など)

```json
"gh_repos": [
  "anthropics/claude-code",
  "Aider-AI/aider",
  "your-org/your-repo"
]
```

### 起動時刻の変更

`com.kyo.llm-daily-digest.plist` の `StartCalendarInterval` を編集 → `launchctl unload` → `launchctl load`。

### 要約モデルの変更

`config.json` の `summary_model`:

- `claude-sonnet-4-6` (デフォルト) — 品質重視
- `claude-haiku-4-5` — 速さ・コスト重視

## 出力ファイル例

```markdown
---
date: 2026-06-02
generated_at: 2026-06-02T23:00:00Z
type: llm-daily-digest
---

# LLM / Coding Agent Daily Digest — 2026-06-02

## TL;DR (今日の3行)

- ...

## 🔥 Coding Agent / 開発者向け
...
```

Obsidian Vault に置けば自動的に Daily Note として扱える。
