# Codex Telemetry Bridge

`Codex` は現時点で Claude Code のような hook parity を持っていません。
そのため、この harness ではセッション境界での記録を `manual bridge` で補います。

## 目的

- `Codex` 実行でもゲートの証拠を `runs/<date>-<slug>/` に残す
- 復帰時に読む対象を Claude Code と揃える（成果物ファイル → `runs/` の証拠）
- `/trace-status` を Claude/Codex 横断の可視化入口として使う

## 使い方

セッション開始時:

```bash
node ~/.claude/scripts/hooks/runtime-session-start.js
```

セッション終了時:

```bash
node ~/.claude/scripts/hooks/runtime-session-end.js
```

確認:

```bash
node ~/.claude/scripts/trace-status.js
```

日常運用の最小手順は [codex-operations-runbook.md](./codex-operations-runbook.md) を参照。

## いま出来ること

- `CODEX_THREAD_ID` または `CODEX_SESSION_ID` を session id に変換する
  （実体は `scripts/lib/utils.js` の `getRuntimeSessionId`。`codex-thread-<id>` の形になる）
- `session_started` を `runs/<id>/logs/events.ndjson` に記録する。
  `resume_expected` / `resume_success` を持つので、復帰失敗が健全性の候補として上がる
- ゲートの成果物3種を `runs/<id>/evidence/` に本文ごと退避する
- `trace-status` で recent runs とゲートの有無を確認する

## まだ出来ないこと

- Claude Code の `PreToolUse` / `PostToolUse` と同等の自動 per-tool tracing
- Codex 内蔵 tool 呼び出しの完全自動 capture
- 記録だけで Claude Code と同等の review / verification / observation 判断を再現すること

つまり、現状の Codex parity は `session-level parity` です。
`tool-level parity` は Codex 側に hook surface が来るまで未解決です。

**Claude Code 側は tool-level を持っています。** ただしそれは harness が記録しているのではなく、
Claude Code 自身が `projects/**/*.jsonl` に書いているものを読んでいるだけです
（`scripts/lib/transcript-log.js`）。Codex にこれに相当する出力が無いのが差の実体です。

## Improvement Loop との関係

- ゲートの証拠は artifact ベースで評価する。Codex 経由でも `runs/` に本文が残るので、
  worktree を消した後でも `runs-cli show <run-id>` で引ける
- 復帰失敗（`resume_expected=true` かつ `resume_success=false`）だけが
  `provenance=telemetry` の候補として health/triage に現れる

## 2026-08-20 の変更

この文書は 2026-08-20 まで、記録先を `~/.claude/telemetry/telemetry.db` として説明し、
`session_runs` / `session_events` / `run_state` を「Claude Code と同じ SQLite 面」と書いていました。
**その SQLite 面は撤去しました**（`docs/design/2026-08-20-retire-sqlite.md`）。撤去時点で
全テーブルが write-only だったためです。アーカイブは
`runs/_archive/telemetry-sqlite-2026-08-20.json`。

同時に、この文書が「manual bridge の構造制約の可視化」として説明していた健全性の候補
（`manual_bridge_session_level_only` / `session_level_observability_only`）も撤去しました。
理由は実測です:

- `bridge_mode='manual'` は**テレメトリの全履歴で一度も記録されていなかった**。
  この値を書くのは `runtime-session-end.js` だけで、検出器は `session_started` を読んでいた
- もう一方は `plan_present=1`（`plan.md` 撤去で成立しない）かつ `tool_executions` が0件を
  条件にしていた。`tool_executions` の書き込みを止めた結果、後者が**常に真**になり、
  検出器は「ゲートが3つ揃った run」で発火していた。意味が逆だった
