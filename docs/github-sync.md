# Private GitHub Sync

This runbook prepares this `~/.claude` harness for private GitHub sync.

Repository:

- `https://github.com/ovrsa/claude-harness.git`

## Goal

- Sync the reusable harness control plane across devices.
- Keep runtime state local to each device.
- Keep credentials out of Git even though the repository is private.

## Track

Commit these categories:

- core docs: `CLAUDE.md`, `AGENTS.md`, `OPERATING_MODEL.md`, `HARNESS.md`, `AUTONOMY_POLICY.md`, `OBSERVE.md`, `SESSION.md`
- command surface: `commands/`
- hook surface: `hooks/`, `scripts/hooks/`
- shared implementation: `scripts/`, `schemas/`, `workflows/`, `facets/`, `contexts/`
- guidance: `docs/`, `rules/`, `templates/`
- package metadata: `package.json`, `package-lock.json`, `eslint.config.js`, `knip.json`
- private sync config after review: `settings.json`, `mcp-configs/`
- task-scoped planning artifacts when intentionally useful: `plan/<task-name>/`

## Do Not Track

These must remain local:

- `telemetry/`
- `sessions/`
- `session-env/`
- `tasks/`
- `todos/`
- `projects/`
- `file-history/`
- `cache/`
- `backups/`
- `plugins/`
- `policy-limits.json`
- `session-aliases.json`
- `stats-cache.json`
- `history.jsonl`
- API keys, tokens, passwords, private keys, OAuth credentials

## Config Review

Before committing, review:

- `settings.json`
  - ok for private macOS-to-macOS sync
  - contains macOS-specific `afplay` hooks
  - contains high-autonomy settings that should be intentional on every device
- `mcp-configs/mcp-servers.json`
  - safe only while API keys remain placeholders
  - do not replace placeholders with live credentials in tracked files

## Pre-Push Checks

Run these before commit or push:

```bash
git remote -v
git status --short --untracked-files=all
git ls-files | rg '(^|/)(telemetry|sessions|session-env|tasks|todos|projects|file-history|cache|backups|plugins)(/|$)|policy-limits\.json|session-aliases\.json|stats-cache\.json|history\.jsonl|\.env|\.pem|\.key|\.db$'
node scripts/ci/validate-no-personal-paths.js
npm test
```

The `git ls-files | rg ...` command should print nothing. If it prints a path, stop and remove that path from Git before pushing.

## New Device Setup

On another Mac:

```bash
git clone https://github.com/ovrsa/claude-harness.git ~/.claude
cd ~/.claude
npm install
npm test
node ~/.claude/scripts/hooks/runtime-session-start.js
node ~/.claude/scripts/hooks/runtime-session-end.js
```

Then confirm local credentials and MCP setup outside tracked files.

## Push Gate

Do not push until:

- checks pass
- diff is reviewed
- runtime/private state is absent from tracked files
- commit scope is clear
- the user explicitly approves the push
