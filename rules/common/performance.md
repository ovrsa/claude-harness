# Performance Optimization

## Model Selection Strategy

Current models: **Fable 5** (`claude-fable-5`), **Opus 5** (`claude-opus-5`),
**Sonnet 5** (`claude-sonnet-5`), **Haiku 4.5** (`claude-haiku-4-5-20251001`).
This harness runs `opus[1m]` by default (see `settings.json`).

Roles, not benchmarks:

- **Opus 5** — main loop. Deep reasoning, architecture, ambiguous tasks
- **Sonnet 5** — high-volume or well-specified work where the shape is already decided
- **Haiku 4.5** — mechanical transforms with a checkable output

Do not assume the old "route to a cheaper model to save cost" default. When the
main loop is Opus 5, handing judgment work to a weaker subagent lowers the quality
of that judgment. Delegation is worth it for **context isolation** (keeping a bulky
search out of the main window) and **independent verification** — not as a
reflexive cost move.

> Per-agent model assignment in `agents/` predates Opus 5 and is under review.
> Do not treat the current assignments as an endorsed policy.

## Context Window Management

Judge headroom against the **actual window of the model in use**, not a fixed
token count. A session that is "long" on a 200K model is still early on a 1M one.

With a 1M window, prefer **continuity over compaction**: keeping a whole task in
one unbroken context is the advantage being paid for, and compacting early spends
it. Reserve compaction for genuine phase boundaries: a design is settled, an
implementation is verified, or the next step needs none of the detail behind it.
Nothing persists a state summary for you. Since 2026-08-17 the durable record is
git (branch, log, diff) plus the latest `docs/design/` entry — so commit before
compacting, and make sure the decisions are written down. The count-based compaction nag is off by
default for this reason.

Leave headroom near the real limit before starting work that needs to hold a lot
at once (large-scale refactoring, changes spanning many files, debugging tangled
interactions). Single-file edits, isolated utilities, docs, and small fixes can
run close to the limit safely.

## Reasoning Effort + Plan Mode

Reasoning depth is controlled per session rather than by a hardcoded token budget.
Do not record a specific thinking-token figure here — it goes stale and gets
injected into every session as fact.

Controls:
- **`/effort`** — set reasoning effort for the session
- **Toggle**: Option+T (macOS) / Alt+T (Windows/Linux)
- **Config**: `alwaysThinkingEnabled` in `~/.claude/settings.json`
- **Verbose mode**: Ctrl+O to see thinking output

For complex tasks requiring deep reasoning:
1. Raise effort before starting, not after getting a shallow answer
2. Enable **Plan Mode** for structured approach
3. Use multiple critique rounds for thorough analysis
4. Use split-role subagents when the perspectives are genuinely independent —
   not to subdivide work the main loop can hold at once

## Build Troubleshooting

If build fails:
1. Use `/build-fix`
2. Analyze error messages
3. Fix incrementally
4. Verify after each fix
