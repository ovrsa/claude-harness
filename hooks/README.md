# Hooks

このharnessのhookは、JSON Experienceの観測とPermissionRequestの安全境界だけに絞る。
品質確認、format、typecheck、commit、subagent、作業手順はhookで強制しない。

## Active Surface

| Event | Script | Role |
|---|---|---|
| SessionStart | `experience-session-start.js` | runを開始する |
| UserPromptSubmit | `experience-user-prompt.js` | raw promptを保存せずfeedback signalだけ分類する |
| PreToolUse | `experience-pre-tool.js` | sanitized tool inputを追記する |
| PostToolUse | `experience-post-tool.js` | sanitized tool resultを追記する |
| Stop | `experience-stop.js` | response完了を追記する |
| SessionEnd | `experience-session-end.js` | structured outcomeとindexを確定する |
| PermissionRequest | `permission-request.js` | destructive Bashを独立判定する |

通知音はユーザー設定として保持する。

## Failure Semantics

Experienceは観測でありgateではない。書き込み、JSON parse、権限、容量の問題が起きてもexit 0で継続し、bounded stderrだけを返す。観測hookはstdoutへ何も出さない。

PermissionRequestだけは安全境界であり、判断結果があるときにClaude Code所定のJSONをstdoutへ返す。raw commandの独自ログは残さない。

## Data

既定の保存先は `~/.claude/experience/`。

- `runs/<run-id>/manifest.json`
- `runs/<run-id>/trace.jsonl`
- `runs/<run-id>/outcome.json`
- `runs/<run-id>/refs.json`
- `index.jsonl`

入力はcredential-shaped keys、Bearer token、opaque tokenをredactする。multiline commandとtool resultはbounded summaryに変換し、raw promptやtranscript本文は保存しない。

## Runtime Bridge

Codexはsession開始時と終了時に次を実行し、同じExperience storeへ接続する。

```bash
node ~/.claude/scripts/hooks/runtime-session-start.js
node ~/.claude/scripts/hooks/runtime-session-end.js
```

どちらもstdoutを出さず、SQLiteやtask artifactを参照しない。
