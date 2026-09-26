# Hooks

Hooks are event-driven automations that fire before or after Claude Code tool executions. They enforce code quality, catch mistakes early, and automate repetitive checks.

## How Hooks Work

```
User request → Claude picks a tool → PreToolUse hook runs → Tool executes → PostToolUse hook runs
```

- **PreToolUse** hooks run before the tool executes. They can **block** (exit code 2) or **warn** (stderr without blocking).
- **PostToolUse** hooks run after the tool completes. They can analyze output but cannot block.
- **Stop** hooks run after each Claude response.
- **SessionStart/SessionEnd** hooks run at session lifecycle boundaries.
- **PreCompact** hooks run before context compaction, useful for saving state.

## Hooks in This Plugin

### PreToolUse Hooks

| Hook | Matcher | Behavior | Exit Code |
|------|---------|----------|-----------|
| **Telemetry capture** | `*` | Records tool invocation telemetry in the local SQLite memory plane (async) | 0 (never blocks) |
| **Git push guard** | `Bash` | Blocks `git push` when the resolved target is `main`/`master`, including a bare `git push` with no refspec | 2 (blocks) |
| **Doc file warning** | `Write` | Warns about non-standard `.md`/`.txt` files (allows README, CLAUDE, CONTRIBUTING, CHANGELOG, LICENSE, SKILL, docs/, skills/); cross-platform path handling | 0 (warns) |
| **Strategic compact** | `Edit\|Write` | Suggests manual `/compact` at logical intervals (every ~50 tool calls) | 0 (warns) |
| **Continuous learning observe** | `*` | Captures tool-use observations for continuous learning (async) | 0 (never blocks) |
| **Lifecycle pre-edit** | `Edit\|Write` | Advisory only: warns when a linked worktree has no recent pipeline run evidence. Once per session, points the agent to `draft-issue` when a repository with a declared tracker is written on a branch without an issue number (sent as `additionalContext`) | 0 (warns) |
| **Lifecycle pre-commit** | `Bash` (on `git commit`) | Advisory only: warns about missing or incomplete verification/review/observation evidence; captures guardrail candidates | 0 (warns) |

### PermissionRequest Hooks

| Hook | Matcher | Behavior |
|------|---------|----------|
| **Personal permission boundary** | `Bash` | Classifies requests as `auto-allow`, `ask-with-justification`, `hard-deny`, or `audit-only` |

### PostToolUse Hooks

| Hook | Matcher | What It Does |
|------|---------|-------------|
| **Telemetry capture** | `*` | Records tool completion telemetry in the local SQLite memory plane (async) |
| **PR logger** | `Bash` | Logs PR URL and review command after `gh pr create` |
| **Build analysis** | `Bash` | Background analysis after build commands (async, non-blocking) |
| **Quality gate** | `Edit\|Write` | Runs fast quality checks after edits |
| **Prettier format** | `Edit\|Write` | Auto-formats JS/TS files with Prettier after edits |
| **TypeScript check** | `Edit\|Write` | Runs `tsc --noEmit` after editing `.ts`/`.tsx` files |
| **console.log warning** | `Edit\|Write` | Warns about `console.log` statements in edited files |
| **Continuous learning observe** | `*` | Captures tool-use results for continuous learning (async) |

### Lifecycle Hooks

| Hook | Event | What It Does |
|------|-------|-------------|
| **Session start** | `SessionStart` | Loads previous context and detects package manager |
| **Pre-compact** | `PreCompact` | Saves state before context compaction |
| **Subagent stop** | `SubagentStop` | Persists a short subagent completion note for session continuity |
| **Console.log audit** | `Stop` | Checks all modified files for `console.log` after each response |
| **Session summary** | `Stop` | Persists session state when transcript path is available |
| **Pattern extraction** | `Stop` | Evaluates session for extractable patterns (continuous learning) |
| **Cost tracker** | `Stop` | Emits lightweight run-cost telemetry markers |
| **Session end marker** | `SessionEnd` | Lifecycle marker and cleanup log |

## Customizing Hooks

### Disabling a Hook

Remove or comment out the hook entry in `hooks.json`. If installed as a plugin, override in your `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write",
        "hooks": [],
        "description": "Override: allow all .md file creation"
      }
    ]
  }
}
```

### Runtime Hook Controls (Recommended)

Use environment variables to control hook behavior without editing `hooks.json`:

```bash
# minimal | standard (default: standard)
export ECC_HOOK_PROFILE=standard

# Disable specific hook IDs (comma-separated)
export ECC_DISABLED_HOOKS="post:edit:typecheck,post:quality-gate"
```

Profiles:
- `minimal` — keep essential lifecycle and safety hooks only.
- `standard` — default; balanced quality + safety checks.

The git push guard is wired directly rather than through `run-with-flags.js`, so neither
`ECC_HOOK_PROFILE` nor `ECC_DISABLED_HOOKS` can switch it off.

A `strict` tier existed until 2026-08-12. It gated exactly two hooks, nothing ever set
`ECC_HOOK_PROFILE`, and the default is `standard` — so those hooks never ran while this
table described them as active. `ECC_HOOK_PROFILE=strict` now falls back to `standard`.

### Artifact-First Continuity

The lifecycle hooks read the repository task artifacts, and fall back to raw transcript recall.

Runtime source of truth:

- git (branch, log, diff) — what actually happened
- the task artifacts on disk (`verification-summary.md` / `review-summary.md` / `observation-summary.md`)
- `runs/<date>-<slug>/` — the same artifact bodies, captured so they survive `ExitWorktree`

The SQLite plane (`telemetry.db`, `run_state`, lifecycle telemetry) was retired on 2026-08-20.
It had become write-only, and `run_state` turned out to be a degraded copy of the artifact files:
every non-empty field it carried was already in the artifacts, which also had two the row lacked.

Expected files for non-trivial work:

- `docs/design/YYYY-MM-DD-<slug>.md` (the decisions; written before implementation)
- `review-summary.md`
- `verification-summary.md`
- `observation-summary.md` when behavior changed

Optional sections for promotion-worthy failures:

- `Guardrail Candidates` in `review-summary.md`
- `Guardrail Candidates` in `verification-summary.md`
- `Guardrail Candidates` in `observation-summary.md`

`SessionStart` surfaces the repository artifacts, and `PreCompact` snapshots their presence into the active session file before context is summarized.

For interrupted or multi-session work the durable state is git plus the latest `docs/design/` entry.
The gate evidence is in `runs/<date>-<slug>/`, which survives `ExitWorktree(action: "remove")`.
**Nothing persists a state summary across a compact** — commit before compacting.

状態をどの順で読むかは `~/.claude/docs/architecture.md` が正本。

### Autonomy Policy

The permission boundary is intentionally narrower than the rest of the harness.

- `auto-allow` is for clearly safe read-only inspection
- `ask-with-justification` is for legitimate but side-effectful commands
- `hard-deny` is for clearly destructive actions
- `audit-only` is for low-risk metadata commands that should still leave a trace

分類の正本は `~/.claude/scripts/lib/permission-resolver.js`。文書ではなくコードが持つ。

### What The Lifecycle Hooks Actually Do

**Nothing here blocks.** The only blocking hook in the harness is `git-push-guard.js`.

- `lifecycle-pre-edit.js` warns when a linked worktree has no recent pipeline run evidence
- `lifecycle-pre-commit.js` warns about missing or incomplete
  `verification-summary.md` / `review-summary.md`, checks `observation-summary.md` for a concrete
  evidence source when it exists, and captures guardrail candidates
- The weight signal is **whether this is a linked worktree**, not a frontmatter field. It cannot be
  satisfied by writing a file

2026-08-17 まで、この節は7項目を「blocked」と書いていた。実際はどれも助言で、しかも
verify / review / observe の助言は `plan.md` が存在する場合の `else` 節に入っていたので、
`plan.md` の無い30/42セッションでは一度も出ていなかった。`lifecycle-progress-complete.js`
（唯一のブロックと書かれていたもの）は `progress.md` を完了状態に書き換える時しか発火せず、
`progress.md` を作るコードがハーネス内に無かったため一度も発火していない。フックは撤去した。

`plan.md` と `progress.md` も同日に撤去した。経緯は
`~/.claude/docs/design/2026-08-17-lifecycle-five-steps.md`。

### Guardrail Candidate Capture

The lifecycle hooks may capture `guardrail candidates` as a non-blocking side effect once task artifacts are complete enough to parse.

Use this for recurring failures only. A candidate should explain:

- the failure pattern
- where it showed up
- the recommended destination:
  - `docs`
  - `command`
  - `hook`
  - `skill`

Capture does not mean promotion. In this phase, promotion remains an explicit follow-up decision.

### Writing Your Own Hook

Hooks are shell commands that receive tool input as JSON on stdin and must output JSON on stdout.

**Basic structure:**

```javascript
// my-hook.js
let data = '';
process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
  const input = JSON.parse(data);

  // Access tool info
  const toolName = input.tool_name;        // "Edit", "Bash", "Write", etc.
  const toolInput = input.tool_input;      // Tool-specific parameters
  const toolOutput = input.tool_output;    // Only available in PostToolUse

  // Warn (non-blocking): write to stderr
  console.error('[Hook] Warning message shown to Claude');

  // Block (PreToolUse only): exit with code 2
  // process.exit(2);

  // Always output the original data to stdout
  console.log(data);
});
```

**Exit codes:**
- `0` — Success (continue execution)
- `2` — Block the tool call (PreToolUse only)
- Other non-zero — Error (logged but does not block)

### Hook Input Schema

```typescript
interface HookInput {
  tool_name: string;          // "Bash", "Edit", "Write", "Read", etc.
  tool_input: {
    command?: string;         // Bash: the command being run
    file_path?: string;       // Edit/Write/Read: target file
    old_string?: string;      // Edit: text being replaced
    new_string?: string;      // Edit: replacement text
    content?: string;         // Write: file content
  };
  tool_output?: {             // PostToolUse only
    output?: string;          // Command/tool output
  };
}
```

### Async Hooks

For hooks that should not block the main flow (e.g., background analysis):

```json
{
  "type": "command",
  "command": "node my-slow-hook.js",
  "async": true,
  "timeout": 30
}
```

Async hooks run in the background. They cannot block tool execution.

## Common Hook Recipes

### Warn about TODO comments

```json
{
  "matcher": "Edit",
  "hooks": [{
    "type": "command",
    "command": "node -e \"let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const i=JSON.parse(d);const ns=i.tool_input?.new_string||'';if(/TODO|FIXME|HACK/.test(ns)){console.error('[Hook] New TODO/FIXME added - consider creating an issue')}console.log(d)})\""
  }],
  "description": "Warn when adding TODO/FIXME comments"
}
```

### Block large file creation

```json
{
  "matcher": "Write",
  "hooks": [{
    "type": "command",
    "command": "node -e \"let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const i=JSON.parse(d);const c=i.tool_input?.content||'';const lines=c.split('\\n').length;if(lines>800){console.error('[Hook] BLOCKED: File exceeds 800 lines ('+lines+' lines)');console.error('[Hook] Split into smaller, focused modules');process.exit(2)}console.log(d)})\""
  }],
  "description": "Block creation of files larger than 800 lines"
}
```

### Auto-format Python files with ruff

```json
{
  "matcher": "Edit",
  "hooks": [{
    "type": "command",
    "command": "node -e \"let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const i=JSON.parse(d);const p=i.tool_input?.file_path||'';if(/\\.py$/.test(p)){const{execFileSync}=require('child_process');try{execFileSync('ruff',['format',p],{stdio:'pipe'})}catch(e){}}console.log(d)})\""
  }],
  "description": "Auto-format Python files with ruff after edits"
}
```

### Require test files alongside new source files

```json
{
  "matcher": "Write",
  "hooks": [{
    "type": "command",
    "command": "node -e \"const fs=require('fs');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const i=JSON.parse(d);const p=i.tool_input?.file_path||'';if(/src\\/.*\\.(ts|js)$/.test(p)&&!/\\.test\\.|\\.spec\\./.test(p)){const testPath=p.replace(/\\.(ts|js)$/,'.test.$1');if(!fs.existsSync(testPath)){console.error('[Hook] No test file found for: '+p);console.error('[Hook] Expected: '+testPath);console.error('[Hook] Consider writing tests first (/tdd)')}}console.log(d)})\""
  }],
  "description": "Remind to create tests when adding new source files"
}
```

## Cross-Platform Notes

Hook logic is implemented in Node.js scripts for cross-platform behavior on Windows, macOS, and Linux.

## Related

- [scripts/hooks/](../scripts/hooks/) — Hook script implementations
