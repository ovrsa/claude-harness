# /sync-global — AI Config グローバル同期

Claude Code を正本として、Cursor と Codex にグローバル設定を反映する。

## 使用方法

```bash
/sync-global [target] [--dry-run]
```

| target | 対象 |
|--------|------|
| `all` (省略時) | claude + cursor + codex すべて |
| `claude` | project `.claude/` を `~/.claude/` へ反映 |
| `cursor` | `~/.cursor/` の生成物を更新 |
| `codex` | `~/.codex/` の共有 symlink を更新 |

## 実行手順

まず dry-run で差分確認:

```bash
sync-ai-configs.sh --global --dry-run
```

問題なければ実行:

```bash
sync-ai-configs.sh --global
```

特定ターゲットのみ:

```bash
sync-ai-configs.sh --global cursor
sync-ai-configs.sh --global codex
```

## 同期ルール

- `~/.claude/` が唯一の canonical source
- lifecycle の正本は常に `~/.claude/` に置く
- **Cursor**: `~/.claude/` から `rules` と `agents` を生成
- **Codex**: 以下を共有
  - `~/.codex/agents` -> `~/.claude/agents`
  - `~/.codex/commands` -> `~/.claude/commands`
  - `~/.codex/skills/claude-imported` -> `~/.claude/skills`
- `~/.codex/rules/` は変更しない
- `~/.codex/config.toml` は変更しない
- `~/.codex` で lifecycle guardrail を再定義しない
- Cursor の生成物と Codex の共有領域は手編集しない

## 新マシンセットアップ時

```bash
cd ~/development/tooling/ai-config-sync
./install.sh
./setup-sounds.sh
sync-ai-configs.sh --global --dry-run
sync-ai-configs.sh --global
```
