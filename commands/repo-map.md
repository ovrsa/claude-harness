---
name: repo-map
description: Create or refresh a thin repo-local map in root AGENTS.md without duplicating the global lifecycle.
command: true
---

# Repo Map

Use this command to create or refresh a repo-local map for the current repository.

The preferred target is root `AGENTS.md`.

## Required behavior

1. Read the existing root `AGENTS.md` if it exists.
2. Read the repository `README.md` and only the highest-signal local docs needed for orientation.
3. Use `~/.claude/templates/repo-map-template.md` as the default structure.
4. Keep the file short and readable by default.
5. Point to the real truth sources instead of duplicating them.
6. Link to codemaps or deeper architecture docs only when they exist and matter.
7. Preserve the bridge to `~/.claude` as the lifecycle authority.

## Hard guardrails

- do not copy the entire global lifecycle into the repo-local map
- do not turn the repo-local map into a codemap
- do not duplicate long architecture prose when a link to the source doc is enough
- do not bury repo-specific risks or boundaries under generic workflow text

## Default sections

- `Repository Purpose`
- `Read First`
- `Source Of Truth`
- `Artifact Expectations`
- `Verify And Observe`
- `Local Boundaries`
