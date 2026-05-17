# Research Report: Harness Repo Cleanup

## Goal

- Reframe this private repository as `ovrsa/claude-harness`, a personal Claude Code harness sync repo.
- Remove or rewrite upstream Everything Claude Code / public distribution content that does not match the repo's purpose.
- Identify unnecessary tracked files and configuration before deleting anything.

## Current State

- The repo has already been pushed to `https://github.com/ovrsa/claude-harness.git`.
- Local `main` is aligned with `origin/main` at:
  - `120c03d Remove unused harness commands`
- The root `README.md` still describes Everything Claude Code as a public project:
  - upstream stars/forks/contributors badges
  - sponsor links
  - public marketplace and npm distribution information
  - release notes for ECC versions
  - broad docs for multiple runtimes
- `package.json` still has upstream package metadata:
  - `name: ecc-universal`
  - upstream author
  - upstream repository/homepage/bugs URLs
  - npm package distribution framing
- `llms.txt` is OpenCode documentation, not a local Claude Code harness sync guide.
- `.claude-plugin/plugin.json` is already local-oriented:
  - `name: everything-claude-code-local`
  - description says local canonical `~/.claude` control plane.

## Tracked Surface Snapshot

Tracked top-level surface includes:

- core harness docs:
  - `CLAUDE.md`
  - `AGENTS.md`
  - `OPERATING_MODEL.md`
  - `HARNESS.md`
  - `AUTONOMY_POLICY.md`
  - `OBSERVE.md`
  - `SESSION.md`
- command surface:
  - `commands/` currently has 61 tracked files after the Go command removal commit.
- automation and runtime code:
  - `hooks/`
  - `scripts/`
  - `schemas/`
  - `workflows/`
  - `facets/`
- guidance and policy:
  - `docs/`
  - `rules/`
  - `templates/`
  - `contexts/`
- config/package:
  - `settings.json`
  - `mcp-configs/mcp-servers.json`
  - `package.json`
  - `package-lock.json`
  - `eslint.config.js`
  - `knip.json`
  - `.dependency-cruiser.js`
  - `commitlint.config.js`
- likely cleanup candidates:
  - `README.md`
  - `package.json`
  - `llms.txt`
  - `install.sh`
  - `.claude-plugin/plugin.json`
  - `agents/`
  - `rules/golang/`
  - `rules/swift/`
  - broad ECC docs that are not part of the local harness operating model

## Initial Classification

### Must Keep

- `CLAUDE.md`
- `AGENTS.md`
- `OPERATING_MODEL.md`
- `HARNESS.md`
- `AUTONOMY_POLICY.md`
- `OBSERVE.md`
- `SESSION.md`
- `commands/` for local command surface, pending pruning
- `hooks/`
- `scripts/hooks/`
- `scripts/lib/`
- `settings.json`, with explicit private-device warning
- `mcp-configs/mcp-servers.json`, only while placeholders remain placeholders
- `.gitignore`
- `docs/device-migration.md`
- `docs/github-sync.md`

### Keep Unless Dependency Research Says Otherwise

- `scripts/ci/`
- `tests/`
- `schemas/`
- `templates/`
- `facets/`
- `contexts/`
- `rules/common/`
- `rules/typescript/`
- `rules/python/`
- `package-lock.json`
- `eslint.config.js`
- `knip.json`
- `.dependency-cruiser.js`

### Rewrite Candidates

- `README.md`
  - Replace with private `claude-harness` purpose, install/sync steps, what is not tracked, verification commands, and repo map.
- `package.json`
  - Change package name/description/repository metadata away from upstream ECC public package.
  - Keep scripts if tests/lint still use them.
- `.claude-plugin/plugin.json`
  - Review references before any rename; this may be consumed as a Claude Code plugin manifest.
- `docs/github-sync.md`
  - Keep, possibly tighten after cleanup.
- `docs/device-migration.md`
  - Keep, possibly align with final repo shape.

### Delete Candidates

- `llms.txt`
  - OpenCode documentation unrelated to private Claude Code harness sync.
- `install.sh`
  - Likely upstream package installer; inspect contents and references before deletion because it may affect new-device setup.
- `pipeline-runner-v0-review-summary.md`
- `pipeline-runner-v0-verification-summary.md`
  - Looks like stale task artifacts at root.
- broad release/marketing content currently only in `README.md`
  - Delete by rewriting README.

### Needs Dependency Check Before Deleting

- `agents/`
  - Some command docs or validators may reference agent files.
- `rules/golang/`, `rules/swift/`
  - May be unused locally, but validators expect rule files to be valid if tracked.
- `skills/continuous-learning-v2/`
  - Referenced from `settings.json` hooks.
- `skills/continuous-learning/config.json`
  - Possibly used by `evaluate-session.js`.
- `.claude-plugin/`
  - May be useful if Claude Code plugin packaging remains part of the harness; reference check required before rename or deletion.

## Risks

- Removing files can break validators in `npm test`.
- Removing scripts or schemas can break local hooks.
- `settings.json` references `skills/continuous-learning-v2/hooks/observe.sh`; deleting that skill path would break hooks.
- `package.json` metadata can be safely rewritten, but scripts should be preserved until a test alternative exists.
- The cleanup plan should assume `120c03d` is already pushed and should create a separate cleanup commit.

## Recommended Cleanup Strategy

Use a two-phase cleanup rather than a broad delete:

1. Identity cleanup:
   - Rewrite `README.md`.
   - Rewrite package metadata while preserving scripts.
   - Leave the already-pushed `120c03d` unchanged.
2. Surface pruning:
   - Run reference checks for each delete candidate.
   - Delete only files with no local dependency or explicit user approval.
   - Treat low-risk deletion in the first pass as limited to `llms.txt` and root `pipeline-runner-v0-*.md` unless research proves more.
   - Run `npm test`.

## Open Questions For Plan

- Should cleanup be one commit for identity cleanup, followed by a second commit for low-risk pruning?
- Should `package.json` keep npm package fields at all, or become private-only with `"private": true`?
- Should this repo keep `agents/` as part of the harness, or prune unused agents?
- Which language rules should remain: TypeScript/Python only, or keep all current language rules?
- Should `.claude-plugin/plugin.json` be renamed to `claude-harness` after reference checks?
