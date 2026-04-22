# Local Operations Baseline

Use the harness as a local-first control plane.

The goal is not to depend on GitHub, Docker, or any single repo host. The goal
is to keep `~/.claude` portable across projects while reusing standard CLI
tools instead of inventing custom infrastructure.

## Core Principle

Treat remote platforms as optional adapters.

- `~/.claude` owns lifecycle, hooks, telemetry, health, and triage
- each repo supplies only thin local maps and project-specific verify commands
- CLI analyzers provide mechanical checks
- explicit operator commands drive recurring improvement review

## Recommended Local Stack

- lifecycle enforcement:
  `CLAUDE.md`, task artifacts, hooks, SQLite telemetry
- structure analyzers:
  `eslint`, `knip`, `dependency-cruiser`
- optional security/policy analyzers:
  `semgrep`
- improvement entrypoints:
  `/health-status`, `/triage-loop`, `/improve-harness`
- Codex runtime runbook:
  `docs/codex-operations-runbook.md`

Recommended local commands:

- `npm run lint`
- `npm run lint:unused`
- `npm run lint:architecture`
- `npm run lint:repo`
- `npm test`

## Improvement Loop

Improvement should stay local, human-directed, and explicitly requested.

1. run repository verification when the latest state is stale
2. run `npm run lint:repo`
3. run `/improve-harness`
4. review the recommended `1-3` candidates
5. promote only one low-risk recurring fix at a time

## Host Adapters

Adapters are optional.

- GitHub Actions can mirror local checks
- GitLab CI can mirror local checks
- no remote CI is also acceptable when local discipline is sufficient

The important rule is that the local scripts remain canonical. Remote systems
should call local scripts, not redefine the policy.
