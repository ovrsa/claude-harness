# Claude Code と Codex の共通ハーネス（2026-09-26）

作業ルールの正本は `~/.claude/CLAUDE.md` と `rules/`。
Codex の `AGENTS.md` には正本を読む入口だけを置く。
モデル、権限、MCP、プラグイン接続はランタイム固有の設定として個別に管理する。

## 導入と差分検査

```bash
node ~/.claude/scripts/sync-codex-bridge.js --check
node ~/.claude/scripts/sync-codex-bridge.js --apply
node ~/.claude/scripts/sync-codex-bridge.js --check
```

正本にこの変更を反映してから実行する。`--claude-root` と `--codex-home` は隔離検証用にも使える。
`--check` は読み取りのみ。差分ありは終了コード2、競合や壊れた設定は1、管理対象の一致は0。
検査対象は次の3つ。設定全体の同一性や、フックが実際に発火することを保証するものではない。

- Codex `AGENTS.md` 内の管理ブロック（雛形は `templates/codex/AGENTS.md`）
- `skills/claude-imported` が正本の `skills/` を指すリンク
- Codex `SessionStart` / `Stop` の共通記録処理への配線

既存の AGENTS 本文と他のフックは保持する。既存ファイルの更新前には
Codex home の `backups/shared-harness-*/` に退避する。2回目の適用は変更しない。
リンク先が違う、実ディレクトリがある、管理ブロックが壊れている、`AGENTS.override.md` が
ある場合は上書きしない。`~/bin/sync-ai-configs.sh` の資産リンクと併用できる。
`commands/` や `agents/` のリンクだけでは Codex のネイティブ機能への登録を意味しない。
スキル本文は共有するが、自動選択の制御は各ランタイムの設定として確認する。

## フックの有効化と観測

Codex のフック機能を有効にし、`/hooks` で追加された2件の定義を確認して信頼する。
同期スクリプトは信頼ハッシュや権限設定を書き換えない。
`SessionStart` は開始・復帰時、`Stop` はターン終了時の証拠退避に使う。
Stop はセッション終了ではない。記録は助言的で、操作を止める判定を返さない。
既存の Orca / herdr フックはそのまま残る。

フックが未承認、無効、または非対応のランタイムでは手動の入口を使う。

```bash
node ~/.claude/scripts/hooks/runtime-session-start.js
# 作業と必要な証拠成果物の作成
node ~/.claude/scripts/hooks/runtime-session-end.js
node ~/.claude/scripts/runs-cli.js list
node ~/.claude/scripts/runs-cli.js trace <run-id>
```

記録対象はゲート成果物または既存Runのあるタスク。成果物のない新しい会話では
空のRunを作らない。フックの `session_id` はランタイムを指定して正規化し、手動経路は
環境変数からIDを読む。過去のIDがないRunを、日時の近さだけで推測補完しない。

作業の順序と完了条件は [CLAUDE.md](../../CLAUDE.md) と
[タスク運用](run-a-task.md) に従う。改善の依頼がある時だけ `/improve-harness` を使う。

## 戻し方

Codexを閉じ、退避した `AGENTS.md` / `hooks.json` を元の場所へ戻す。
新規作成した入口だけを取り消す場合は管理ブロックと追加した記録フックを取り除く。
他のフック、スキルの実体、セッションログは削除しない。正本側の変更は作業コミット単位で戻す。

参考: [Codex hooks](https://learn.chatgpt.com/docs/hooks)、
[AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)。

## 記録の接続

Claudeの既存開始・終了フック、Codexのnative adapter、手動入口は
`scripts/lib/runtime-session.js` を呼ぶ。フックstdinのセッションIDを優先し、
Codexでは接頭辞を付けて他ランタイムと区別する。生ログは元の場所に保持する。
`runs-cli trace` はClaudeのprojectsとCodexのsessions/archived_sessionsを解決する。
