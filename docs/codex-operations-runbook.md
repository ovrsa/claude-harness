# Codex Operations Runbook

`Codex` で thin `.claude` control layer を使うときの最小運用手順。

目的は 2 つです。

- `telemetry.db` に session を確実に残す
- pipeline 実行を `.claude` の permission / telemetry / guardrail layer から観測する
- 必要な時だけ task artifact と `Guardrail Candidates` を改善ループに流す

## Core Rule

`Codex` は `~/.claude` の bridge であり、第二の local control layer ではありません。

- local control layer の正本は `CLAUDE.md`, `OPERATING_MODEL.md`, `HARNESS.md`
- standard/heavy work の execution spine は local pipeline
- `Codex` 側では local policy を再定義しない
- まず `session capture` を安定させ、その後に improvement を回す

## Session Start

セッション開始時に必ず実行:

```bash
node ~/.claude/scripts/hooks/runtime-session-start.js
```

やること:

- runtime session を shared SQLite ID に解決する
- `session_started` を `telemetry.db` に記録する
- recent run state があれば resume context を出す

## Normal Task Flow

通常の順序はこれです。

1. repo-local `AGENTS.md` を読む
2. task track を選ぶ: `trivial`, `standard`, `heavy-risky`
3. standard/heavy work は local pipeline を通す
4. adapters や discipline packs が execution mechanics を担当する
5. `.claude` は permission, telemetry, session continuity, guardrail capture を担当する
6. 必要な時だけ `review-summary.md`, `verification-summary.md`, `observation-summary.md` を残す

`Codex` でも control layer は Claude Code と同じです。違うのは hook parity だけです。

## Guardrail Capture

次のどれかがあったら、artifact に `Guardrail Candidates` を残します。

- 同じ判断を何度も人間が補正した
- planning / execution の境界不足で手戻りした
- verify や observe の抜け漏れが起きた
- recurring な docs / command / hook 不足が見えた

最初は `docs` か `command` を推奨します。いきなり `hook` や `skill` にしません。

## Session End

セッション終了時に必ず実行:

```bash
node ~/.claude/scripts/hooks/runtime-session-end.js
```

やること:

- `session_ended` を `telemetry.db` に記録する
- run state を閉じる

## Verification And Trace Check

必要に応じて確認:

```bash
node ~/.claude/scripts/trace-status.js
```

期待値:

- recent run が増えている
- `session_started` / `session_ended` が SQLite に載る

## When To Run Improvement

毎回は不要です。

次のどれかが起きたときだけ回します。

- recurring failure が 2 回以上見えた
- 同じ operator judgment を何度も繰り返した
- `Guardrail Candidates` を 1 件以上残した
- harness 自体を改善したいと明示した

入口:

```text
/improve-harness
```

補助:

- `/health-status`
- `/triage-loop`

補足:

- `Guardrail Candidates` が artifact にまだ無くても、`health-status` / `triage-loop` は manual bridge の session telemetry から低ノイズな構造ギャップ候補を出せる
- ただしこれは artifact 由来の候補と同格ではなく、あくまで Codex 側の observability 制約を可視化するための補助信号
- 出力に `provenance=telemetry` が出る項目は、artifact からではなく telemetry から合成された候補

## What Not To Assume

- `Codex` はまだ Claude Code の `PreToolUse` / `PostToolUse` parity を持たない
- 現状の parity は `session-level`
- `tool-level` 自動 tracing はまだ無い
- 自動 promotion もまだ無い
- そのため improvement loop では、artifact 候補に加えて session-level telemetry 由来の候補を使って Codex 固有のギャップを補助的に観測する

## Short Checklist

- start: `runtime-session-start.js`
- task artifacts: selected track に必要な `research / plan / review / verification / observation`
- optional: `Guardrail Candidates`
- end: `runtime-session-end.js`
- improvement request がある時だけ `/improve-harness`
