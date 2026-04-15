---
description: Review captured guardrail candidates and decide whether they belong in docs, commands, hooks, or skills.
---

# Guardrail Status

Use this command to inspect the local guardrail candidate registry and decide what should be promoted next.

## Required behavior

1. Read `~/.claude/.state/guardrail-candidates.jsonl` if it exists.
2. Summarize:
   - total candidates
   - newest candidates
   - most frequent candidates
   - candidates grouped by `recommended_layer`
3. Highlight promotion-ready candidates first.
4. Treat candidates as promotion-ready only when:
   - recurrence is clear, or
   - severity is high and false-positive risk is low.
5. Recommend the narrowest durable destination:
   - `docs`
   - `command`
   - `hook`
   - `skill`

## Hard guardrails

- Do not treat capture as promotion.
- Do not promote a one-off candidate into a global rule without evidence.
- Do not default to hooks when a docs or command fix would prevent the same failure with less noise.
- Do not globalize project-specific workflow unless the pattern is stable across multiple tasks or repos.
