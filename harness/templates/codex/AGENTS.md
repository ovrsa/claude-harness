<!-- shared-harness:begin -->
# Shared personal harness

Read `{{CLAUDE_ROOT}}/CLAUDE.md` and the applicable rules under
`{{CLAUDE_ROOT}}/rules/` before starting work. The common rules apply to every task;
language-specific rules apply when that language is involved.
These files are the authority for lifecycle, review, verification, and completion.
Follow the current repository's AGENTS.md as well. Do not maintain a second lifecycle here.

Shared skills are available under `skills/claude-imported` in this Codex home.
Read command procedures directly from `{{CLAUDE_ROOT}}/commands/` when applicable;
a directory link alone does not register a native Codex slash command or agent.

Session recording uses the shared harness hooks. When native hooks are unavailable or awaiting
trust review, run `node "{{CLAUDE_ROOT}}/harness/scripts/hooks/runtime-session-start.js"` at the start
and `node "{{CLAUDE_ROOT}}/harness/scripts/hooks/runtime-session-end.js"` before ending the session.
Inspect traces with `node "{{CLAUDE_ROOT}}/harness/scripts/runs-cli.js" trace <run-id>`.
Check this bridge with `node "{{CLAUDE_ROOT}}/harness/scripts/sync-codex-bridge.js" --check`.
<!-- shared-harness:end -->
