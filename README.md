# Claude Harness

Private Claude Code harness for syncing my local `~/.claude` control plane across devices.

This repository is not the upstream Everything Claude Code distribution. It is the local harness source of truth for commands, hooks, rules, scripts, docs, and runtime bridge behavior used on my machines.

## Purpose

- keep the reusable Claude Code harness in Git
- make new-device setup repeatable
- keep runtime state and credentials out of Git
- preserve the local operating model in one place

Canonical operating references:

- `CLAUDE.md`
- `AGENTS.md`
- `docs/harness-operating-loop.md`
- `docs/harness-structure-and-ownership.md`
- `commands/COMMANDS.md`
- `docs/command-permission-policy.md`
- `docs/runtime-evidence-requirements.md`
- `docs/session-resume-state.md`

Root Markdown files are reserved for entrypoints only. Policy, architecture,
session, observation, and other explanatory documents should live under `docs/`.

## What Is Tracked

- `commands/` for slash-command behavior
- `hooks/` and `scripts/hooks/` for Claude Code lifecycle hooks
- `scripts/` and `schemas/` for harness automation and validation
- `rules/`, `templates/`, `contexts/`, and `facets/` for reusable guidance
- `docs/` for local operations, migration, and sync runbooks
- `settings.json` for private macOS-to-macOS Claude Code behavior
- `mcp-configs/` with placeholders only
- `package.json` and `package-lock.json` for local verification tooling
- `.claude-plugin/` as the local `claude-harness` manifest
- minimal tracked `continuous-learning` hook dependencies referenced by `settings.json`

Task-specific planning artifacts should live under:

```text
plan/<task-name>/
```

Do not place `plan.md`, `research.md`, or verification/review artifacts at repository root.

## What Is Not Tracked

Runtime state stays local to each device:

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
- optional skill packs under `skills/`, except the minimal tracked hook dependencies
- `policy-limits.json`
- `session-aliases.json`
- `stats-cache.json`
- `history.jsonl`

Credentials also stay out of Git. Do not commit API keys, tokens, passwords, private keys, OAuth material, or live MCP credentials.

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

Then review local credentials and MCP configuration outside tracked files.

## Verification

For normal harness changes, run the lightweight required check:

```bash
git status --short --branch
git ls-files | rg '(^|/)(telemetry|sessions|session-env|tasks|todos|projects|file-history|cache|backups|plugins)(/|$)|policy-limits\.json|session-aliases\.json|stats-cache\.json|history\.jsonl|\.env|\.pem|\.key|\.db$'
npm test
```

The `git ls-files | rg ...` command should print nothing.

Use the narrower suites when touching a specific subsystem:

```bash
npm run test:hooks
npm run test:pipeline
npm run test:regression
```

Use the full regression suite before broad cleanup, release-like sync work, or
changes to shared test infrastructure:

```bash
npm run test:full
```

## Config Notes

- `settings.json` is intended for private macOS-to-macOS sync.
- `settings.json` includes macOS sound hooks and high-autonomy settings; review them before using the harness on a new device.
- `settings.json` resolves hooks from this local harness, not from the upstream Everything Claude Code plugin.
- `continuous-learning-v2` remains a tracked hook dependency for now; do not delete it without first removing the observe hooks and related commands.
- `mcp-configs/mcp-servers.json` is a placeholder catalog. Keep actual keys in local environment-specific configuration.

## Repo-Local Maps

Repositories that use this harness should keep their root `AGENTS.md` thin:

- point to the repository's real operating docs
- avoid duplicating this global lifecycle
- link to codemaps or architecture docs only when they add value

This keeps project-local context small while preserving `~/.claude` as the harness authority.

## Triage And Health Loop

Use the local health and triage commands when deciding what to improve next:

- `/health-status` summarizes current local harness health without making promotion decisions.
- `/triage-loop` turns grouped patterns into next follow-up tasks without auto-promoting docs, commands, hooks, or skills.

Recurring failures should first be captured as guardrail candidates, then promoted deliberately through a separate improvement pass.

## GitHub Sync

See `docs/github-sync.md` for the private sync runbook.

Commit and push intentionally:

```bash
git status --short
npm test
git add <approved-files>
git commit -m "<message>"
git push
```

Keep identity/docs cleanup separate from risky file pruning when possible.
