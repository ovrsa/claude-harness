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
| **Dev server blocker** | `Bash` | Blocks `npm run dev` etc. outside tmux — ensures log access | 2 (blocks) |
| **Tmux reminder** | `Bash` | Suggests tmux for long-running commands (npm test, cargo build, docker) | 0 (warns) |
| **Git push reminder** | `Bash` | Reminds to review changes before `git push` | 0 (warns) |
| **Doc file warning** | `Write` | Warns about non-standard `.md`/`.txt` files (allows README, CLAUDE, CONTRIBUTING, CHANGELOG, LICENSE, SKILL, docs/, skills/); cross-platform path handling | 0 (warns) |
| **Strategic compact** | `Edit\|Write` | Suggests manual `/compact` at logical intervals (every ~50 tool calls) | 0 (warns) |

### PermissionRequest Hooks

| Hook | Matcher | Behavior |
|------|---------|----------|
| **Personal permission boundary** | `Bash` | Classifies requests as `auto-allow`, `ask-with-justification`, `hard-deny`, or `audit-only` |

### PostToolUse Hooks

| Hook | Matcher | What It Does |
|------|---------|-------------|
| **PR logger** | `Bash` | Logs PR URL and review command after `gh pr create` |
| **Build analysis** | `Bash` | Background analysis after build commands (async, non-blocking) |
| **Quality gate** | `Edit\|Write\|MultiEdit` | Runs fast quality checks after edits |
| **Prettier format** | `Edit` | Auto-formats JS/TS files with Prettier after edits |
| **TypeScript check** | `Edit` | Runs `tsc --noEmit` after editing `.ts`/`.tsx` files |
| **console.log warning** | `Edit` | Warns about `console.log` statements in edited files |

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
# minimal | standard | strict (default: standard)
export ECC_HOOK_PROFILE=standard

# Disable specific hook IDs (comma-separated)
export ECC_DISABLED_HOOKS="pre:bash:tmux-reminder,post:edit:typecheck"
```

Profiles:
- `minimal` — keep essential lifecycle and safety hooks only.
- `standard` — default; balanced quality + safety checks.
- `strict` — enables additional reminders and stricter guardrails.

### Artifact-First Continuity

The lifecycle hooks now prefer repository task artifacts over raw transcript recall when available.

Expected files for non-trivial work:

- `research.md`
- `plan.md`
- `review-summary.md`
- `verification-summary.md`
- `observation-summary.md`
- `progress.md` for multi-session work

Optional sections for promotion-worthy failures:

- `Guardrail Candidates` in `review-summary.md`
- `Guardrail Candidates` in `verification-summary.md`
- `Guardrail Candidates` in `observation-summary.md`

`SessionStart` will surface these artifacts first, and `PreCompact` will snapshot their presence into the active session file before context is summarized.

For interrupted or multi-session work, `progress.md` is the durable session log.

Minimum recommended sections:

- `Current Phase`
- `Last Completed Step`
- `Next Action`
- `Blockers`
- `Delegated Work`
- `Latest Checkpoint`
- `Latest Delegated Handoff`

See `~/.claude/SESSION.md` for the canonical session model.

### Autonomy Policy

The permission boundary is intentionally narrower than the rest of the harness.

- `auto-allow` is for clearly safe read-only inspection
- `ask-with-justification` is for legitimate but side-effectful commands
- `hard-deny` is for clearly destructive actions
- `audit-only` is for low-risk metadata commands that should still leave a trace

See `~/.claude/AUTONOMY_POLICY.md` for the canonical policy.

### Progress-Aware Guardrails

For non-trivial implementation work, lifecycle guardrails now treat `progress.md` as part of the required operating state.

- code edits are blocked if `progress.md` is missing for non-trivial implementation work
- commits are blocked if `progress.md` still declares active blockers
- commits warn if `Next Action` still contains active follow-up work
- behavior-changing commits are blocked if `review-summary.md` is missing or incomplete
- behavior-changing commits are blocked if `review-summary.md` still has unresolved findings
- observation-required commits are blocked if `observation-summary.md` is missing or incomplete
- observation-required commits are blocked if `observation-summary.md` has no concrete evidence source such as `browser`, `logs`, `stderr/stdout`, `trace`, `runtime health`, `metrics`, or `process state`

Hooks may update only the machine-managed `Latest Checkpoint` and `Latest Delegated Handoff` sections. Operator-owned progress fields remain the source of truth when they are populated.

See `~/.claude/SESSION.md` for the durable session schema.

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

Hook logic is implemented in Node.js scripts for cross-platform behavior on Windows, macOS, and Linux. A small number of shell wrappers are retained for continuous-learning observer hooks; those wrappers are profile-gated and have Windows-safe fallback behavior.

## Related

- [rules/common/hooks.md](../rules/common/hooks.md) — Hook architecture guidelines
- [skills/strategic-compact/](../skills/strategic-compact/) — Strategic compaction skill
- [scripts/hooks/](../scripts/hooks/) — Hook script implementations
