# Codex Bridge

このworkspaceのcanonical lifecycleは [CLAUDE.md](CLAUDE.md) にある。Codex側に別の手順を定義せず、同じmanaged skillsとJSON Experienceへ接続する。

## Session

各Codex sessionの開始時と終了時に実行する。

```bash
node ~/.claude/scripts/hooks/runtime-session-start.js
node ~/.claude/scripts/hooks/runtime-session-end.js
```

どちらも観測専用で、stdoutや作業gateを持たない。

## Managed Grill

非自明な変更では、最初に次でmanaged `grilling` のpathを解決し、返された `SKILL.md` を最後まで読む。

```bash
node ~/.claude/scripts/resolve-managed-skill.js grilling
```

skillはClaude管理cacheからread-onlyで利用する。コピーやruntime固有の派生版は作らない。以後の判断とstop conditionは [CLAUDE.md](CLAUDE.md) に従う。

## Pointers

- Experience: [docs/experience-store.md](docs/experience-store.md)
- Local Markdown: [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)
- domain language: [docs/agents/domain.md](docs/agents/domain.md)
