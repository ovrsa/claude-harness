# Claude Harness

Claude CodeとCodexで共有する個人用control plane。開発の入口はmanaged Grill、実行履歴はJSON Experience、権限境界はPermissionRequestに限定する。

## Active Model

```text
nontrivial request
  -> managed grilling
  -> final understanding confirmation
  -> explicit next action
  -> optional spec or implementation
  -> checks needed by the change
```

canonical entrypoints:

- [CLAUDE.md](CLAUDE.md)
- [AGENTS.md](AGENTS.md)
- [docs/harness-operating-loop.md](docs/harness-operating-loop.md)
- [docs/harness-structure-and-ownership.md](docs/harness-structure-and-ownership.md)

## Managed Skills

Claude CodeはMatt Pocock skillsをuser-scoped managed pluginとして利用する。

```bash
claude plugin marketplace add https://github.com/mattpocock/skills.git
claude plugin install mattpocock-skills@mattpocock --scope user
```

Codexは `scripts/resolve-managed-skill.js` で同じinstall pathを解決する。plugin cacheは編集しない。

## Repository Layout

- `hooks/`, `scripts/hooks/`: 最小hook surface
- `scripts/lib/experience-*.js`: sanitizationとJSON Experience
- `schemas/experience/`: persisted JSON contract
- `commands/`: managed skillsを補完する少数のlocal utilities
- `rules/`: frameworkやsecurityなど必要時に読むreference
- `docs/`: architecture、operation、ADR
- `CONTEXT.md`: 共有domain language

Local Markdownは `.scratch/<feature>/`、runtime履歴は `experience/`、明示的なharness改善は `experiments/` に置き、Gitでは追跡しない。

## Setup And Verification

```bash
npm install
node scripts/resolve-managed-skill.js grilling
npm test
```

credentials、plugin cache、Experience、experiment、archiveはlocalに保つ。hookは観測失敗時も作業を継続し、PermissionRequestだけが独立した安全判断を返す。
