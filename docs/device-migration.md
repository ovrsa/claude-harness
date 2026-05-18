# `.claude` Device Migration Guide

他のデバイスでもこの `~/.claude` を使いたいときの運搬ガイド。

目的は `全部コピーする` ことではなく、`再利用すべき control plane` と `持ち運ばない runtime state` を分けること。

private GitHub repo で同期する場合は、追加で `docs/github-sync.md` を使う。

## 結論

通常は次の3分類で考えるのが安全です。

### 1. コピー必須

この harness の本体。別デバイスでも基本的に持っていく。

- `CLAUDE.md`
- `AUTONOMY_POLICY.md`
- `HARNESS.md`
- `OBSERVE.md`
- `OPERATING_MODEL.md`
- `SESSION.md`
- `commands/`
- `hooks/`
- `scripts/`
- `templates/`
- `rules/`
- `schemas/`
- `contexts/`
- `docs/`
- `mcp-configs/`
- `.claude-plugin/`
- tracked `skills/continuous-learning*` hook dependencies
- `package.json`
- `package-lock.json`
- `eslint.config.js`
- `knip.json`
- `.dependency-cruiser.js`

### 2. 状況次第でコピー

設定や個人状態。別デバイスでも同じ挙動にしたいなら持っていく。

- `settings.json`
  - ただし今の内容には `afplay` と `statusline.sh` があり、macOS 前提
- `session-aliases.json`
  - session alias を引き継ぎたい場合のみ
- `mcp-configs/`
  - 同じ MCP 構成を使いたい場合
- `skills/learned/`
  - 学習済み skill を引き継ぎたい場合
- `plugins/`
  - ローカル plugin の状態も持ち込みたい場合
- `agents/`
  - ローカル agent pack を引き継ぎたい場合のみ
- optional `skills/`
  - GitHub 管理外の skill pack を引き継ぎたい場合のみ

### 3. 通常はコピーしない

runtime state、ログ、キャッシュ、作業途中データ。新しいデバイスで再生成させる方が安全。

- `.git/`
- `backups/`
- `cache/`
- `debug/`
- `file-history/`
- `history.jsonl`
- `paste-cache/`
- `plans/`
- `projects/`
- `session-env/`
- `sessions/`
- `shell-snapshots/`
- `statsig/`
- `stats-cache.json`
- `tasks/`
- `telemetry/`
- `todos/`
- `policy-limits.json`
- `.codex-global-write-test`
- optional skill packs under `skills/`

## おすすめの持ち運び方

### 最小セット

新しいデバイスに clean に入れたいとき。

- core docs
- `commands/`
- `hooks/`
- `scripts/`
- `templates/`
- `rules/`
- `schemas/`
- `contexts/`
- `mcp-configs/`
- `package.json`
- `package-lock.json`
- tracked `skills/continuous-learning*` hook dependencies

### 実用セット

普段の使い勝手までほぼ同じにしたいとき。

最小セットに加えて:

- `settings.json`
- `session-aliases.json`
- `skills/learned/`

### フル移行に近いセット

よほど continuity を重視する場合だけ。

実用セットに加えて:

- `plugins/`

ただし `telemetry/` や `sessions/` まで持ち運ぶのはあまり勧めません。
古い runtime state が混ざるので、改善ループや session continuity の解釈が汚れやすいです。

## `settings.json` の注意

今の `settings.json` には環境依存要素があります。

- `afplay /System/Library/Sounds/...`
- `bash $HOME/.claude/statusline.sh`

つまり:

- macOS 同士ならそのまま動きやすい
- Linux や Windows ではそのままだと壊れる可能性が高い

別 OS に持っていくなら、まず `settings.json` の hook と statusline を見直す方がいいです。

## 新しいデバイスで最低限やること

1. `~/.claude` に必要ファイルを配置する
2. Claude Code 側で再ログインする
3. `settings.json` の OS 依存部分を確認する
4. 必要なら dependency を入れる
5. `npm test` で harness が壊れていないか確認する

## 実用的なコピー例

`rsync` で runtime state を除いて持っていくなら、こういう考え方になります。

```bash
rsync -av \
  --exclude '.git' \
  --exclude 'backups' \
  --exclude 'cache' \
  --exclude 'debug' \
  --exclude 'file-history' \
  --exclude 'history.jsonl' \
  --exclude 'paste-cache' \
  --exclude 'plans' \
  --exclude 'projects' \
  --exclude 'session-env' \
  --exclude 'sessions' \
  --exclude 'shell-snapshots' \
  --exclude 'statsig' \
  --exclude 'stats-cache.json' \
  --exclude 'tasks' \
  --exclude 'telemetry' \
  --exclude 'todos' \
  --exclude 'policy-limits.json' \
  --exclude '.codex-global-write-test' \
  ~/.claude/ <target>~/.claude/
```

## 一言でいうと

持ち運ぶべきなのは `harness の設計と command surface` であって、`古い session や telemetry` ではない。

この repo なら、まずは `core files + commands/hooks/scripts/templates/rules` と tracked hook dependencies を持っていけば十分です。

private GitHub sync では、`skills/` と `agents/` は原則 optional/local pack として扱い、tracked されている最小 hook dependency だけを持っていく方針です。
