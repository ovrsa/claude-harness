# Harness Structure And Ownership

## Source Of Truth

`~/.claude` が唯一のlocal authorityで、[CLAUDE.md](../CLAUDE.md) が唯一のlifecycle definitionである。runtime bridgeはこの定義へ接続し、複製しない。

## Components

| Component | Ownership |
|---|---|
| managed read-only plugin | Grill、spec、implementation discipline |
| `CLAUDE.md` | lifecycleとauthority boundary |
| `AGENTS.md` | Codexからcanonical lifecycleへのbridge |
| `settings.json`, `hooks/hooks.json` | minimal observationとpermission registration |
| `scripts/lib/experience-*.js` | redaction、JSON/JSONL persistence、outcome |
| `experience/` | 通常runのlocal observation |
| `experiments/` | 明示的なharness improvement |
| `.scratch/<feature>/` | userが選んだLocal Markdown |
| `CONTEXT.md`, `docs/adr/` | domain languageとdurable decisions |

## Runtime Integration

Claude Codeはpluginを直接読み込む。Codexは `scripts/resolve-managed-skill.js` でuser-scoped registry entryとplugin manifestを検証し、同じskill fileをread-onlyで読む。

hookはSessionStart、UserPromptSubmit、PreToolUse、PostToolUse、Stop、SessionEndをExperienceへ接続する。PermissionRequestは独立した安全境界で、通知音はuser preferenceとして残る。

## Mutation Boundary

plugin cache、Experience、experiment、archiveはtracked sourceと分離する。subagentやGit publishingを含む外部作用は、ユーザーがその作用を選んだときだけ行う。
