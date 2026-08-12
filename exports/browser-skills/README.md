# Browser Skills Export

claude.ai の**ブラウザ・チャット画面**用に変換した Agent Skills の置き場。

- ここは Claude Code が読む `~/.claude/skills/` `~/.claude/commands/` とは別。**Claude Code には一切影響しない。**
- ローカルの commands/skills を、チャットで動く形（ローカル連携を外した版)に変換して置く。

## アップロード手順

1. claude.ai を開く（Web またはデスクトップ)
2. Settings → Capabilities → Skills（メニュー名は変わることあり。「Skills」を探す)
3. `shape-task.zip` をアップロード、または `shape-task/` フォルダを指定
4. チャットで「タスクをシェイプして」等と言うと発火する

※ Skills 機能はプランにより利用可否が異なる。

## 持っていけないもの（チャットの制約)

- hook / `telemetry.db` / `progress.md` の永続化 / `/chain-status` などローカル連携
- subagent 委譲、リポジトリ変更
- 持っていけるのは「思考フレーム・手順」としてのスキルのみ

## 既存ファイル

- `shape-task/SKILL.md` — commands/shape-task.md をチャット用に変換したもの
- `shape-task.zip` — アップロード用
