# Codex Telemetry Bridge

`Codex` は現時点で Claude Code のような hook parity を持っていません。
そのため、この harness では `SQLite telemetry` への記録を `manual bridge` で補います。

## 目的

- `Codex` 実行でも `~/.claude/telemetry/telemetry.db` を共通利用する
- `session_runs` と `session_events` を Claude Code と同じ SQLite 面で確認できるようにする
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

日常運用の最小手順は [docs/codex-operations-runbook.md](/Users/kyo/.claude/docs/codex-operations-runbook.md:1) を参照。

## いま出来ること

- `CODEX_THREAD_ID` または `CODEX_SESSION_ID` を shared SQLite run/session ID に変換する
- `session_started` / `session_ended` を `session_events` に記録する
- `run_state` と artifact snapshot を同じ DB に載せる
- `trace-status` で recent runs を確認する
- `health-status` / `triage-loop` で manual bridge の session-level 制約を telemetry 候補として可視化できる

## まだ出来ないこと

- Claude Code の `PreToolUse` / `PostToolUse` と同等の自動 per-tool tracing
- Codex 内蔵 tool 呼び出しの完全自動 capture
- telemetry だけで Claude Code と同等の review / verification / observation 判断を再現すること

つまり、現状の Codex parity は `session-level parity` です。
`tool-level parity` は Codex 側に hook surface が来るまで未解決です。

## Improvement Loop との関係

- artifact に `Guardrail Candidates` が無い場合でも、manual bridge + `tool_executions=0` の run は `provenance=telemetry` の候補として health/triage に現れる
- この候補は「manual bridge では session-level までしか見えていない」という構造制約の可視化であり、失敗と同義ではない
- operator はこれを使って、autonomy を増やす前に docs / command 層の改善を優先できる
