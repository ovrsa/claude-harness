# Research Report: Private GitHub Sync For Claude Harness

## Goal

- Prepare this `~/.claude` harness for a private GitHub repository so it can be reused from other devices.
- Keep the reusable control plane in Git while excluding runtime state, secrets, telemetry, local caches, and device-specific transient data.

## Existing Code

- `CLAUDE.md`, `AGENTS.md`, `OPERATING_MODEL.md`, and `HARNESS.md` define the local harness authority and lifecycle model.
- `docs/device-migration.md` already separates portable harness files from runtime state.
- `.gitignore` already excludes local runtime state:
  - `telemetry/`
  - `sessions/`
  - `session-env/`
  - `tasks/`
  - `todos/`
  - `projects/`
  - `file-history/`
  - `plugins/`
  - `policy-limits.json`
  - `session-aliases.json`
  - `stats-cache.json`
  - `history.jsonl`
  - lifecycle artifacts such as `research.md`, `plan.md`, `progress.md`, `review-summary.md`, `verification-summary.md`, and `observation-summary.md`
- `git ls-files` currently reports no tracked runtime-state directories from that forbidden set.
- Tracked files that need explicit review before push:
  - `settings.json`
  - `mcp-configs/mcp-servers.json`

## Similar Patterns

- `docs/device-migration.md` recommends moving the harness design and command surface, not old sessions or telemetry.
- `mcp-configs/mcp-servers.json` currently uses placeholder values such as `YOUR_GITHUB_PAT_HERE`, `YOUR_FIRECRAWL_KEY_HERE`, and `YOUR_EXA_API_KEY_HERE` rather than live secrets.
- `settings.json` uses `$HOME` and `${CLAUDE_PLUGIN_ROOT:-$HOME/.claude}` for most paths, which is portable across devices with the same home-based install layout.

## Prior Art

- Existing migration doc supports three classes:
  - required copy: harness source files and package metadata
  - conditional copy: settings, aliases, MCP configs, learned skills, local plugins
  - do not copy: runtime state, telemetry, sessions, caches, task state
- Existing test scripts include `scripts/ci/validate-no-personal-paths.js`, which should be part of the pre-push check.

## Technical Options / Tradeoffs

- Option A: Private repo with current tracked files.
  - Lowest setup cost.
  - Still requires review of `settings.json` and MCP placeholders.
- Option B: Private repo plus template split for settings and MCP.
  - Safer for future sharing and accidental public exposure.
  - Requires deciding which local files stay ignored and which examples are tracked.
- Option C: Treat repo as sync-only and include more local state.
  - Better continuity between devices.
  - Higher risk of stale sessions, telemetry confusion, and accidental secret exposure.

Recommended direction: Option B for MCP and any future credential-adjacent config, while allowing `settings.json` to remain tracked if the user wants identical Claude Code behavior across private devices.

## Constraints

- The repository is private, per user decision.
- Private does not mean safe to commit credentials; private repos can still be cloned, backed up, shared, or accidentally made public later.
- Do not push, create remote, rewrite history, or alter credential-bearing config without explicit approval.
- Keep `~/.claude` as the source of truth; do not create a second Codex lifecycle.
- Runtime state must remain local and regenerated per device.

## Risks

- `settings.json` includes macOS-specific commands:
  - `afplay /System/Library/Sounds/Ping.aiff`
  - `afplay /System/Library/Sounds/Pop.aiff`
  These are fine for macOS-to-macOS sync but not portable to Linux or Windows.
- `settings.json` enables high-autonomy behavior:
  - `skipDangerousModePermissionPrompt`
  - `skipAutoPermissionPrompt`
  This is configuration, not a secret, but should be intentional on every device.
- `mcp-configs/mcp-servers.json` is safe only while placeholders remain placeholders.
- Git history still needs a separate secret-history scan before first push.
- Large ignored local directories exist in the workspace; they are not tracked, but they should not be force-added.

## Open Questions for Plan

- Should `settings.json` remain tracked as the private sync source, or should it become `settings.example.json` plus a local ignored `settings.json`?
- Should `mcp-configs/mcp-servers.json` remain tracked with placeholders, or be renamed to an example/template file?
- Should this private repo be a new GitHub repo under the user account, or connected to an existing remote?
- Should we add a dedicated `docs/github-sync.md`, or extend `docs/device-migration.md` only?
- Do we need a pre-push script that checks forbidden tracked paths and obvious secret patterns?

