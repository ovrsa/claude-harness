# Superpowers Adoption Boundary

`~/.claude` is the parent harness. Superpowers may be installed as an external implementation plugin, but it is not the canonical lifecycle.

## Division Of Responsibility

- `~/.claude` owns business lifecycle, approval, artifact chain, worktree gates, review, verify, observe, commit gates, Linear integration, and SQLite tracing.
- Superpowers owns implementation discipline during approved execution: small tasks, RED/GREEN/REFACTOR, plan execution, checkpoints, and review habits.

## Recommended Flow

1. Use local `/research-task` and `/plan-task` to produce repository artifacts.
2. Get human approval in `plan.md`.
3. Use local `/worktree-start` for non-trivial work.
4. During `/implement-task`, apply `superpowers-implementation-discipline`.
5. Return to local `/review-task`, `/verify`, `/eval`, and observation gates before commit.

## Installation Preference

Install Superpowers as a plugin. Do not clone or copy the Superpowers repository into `~/.claude`.

Keep any local clone outside the harness, for example:

```text
/Users/kyo/development/references/superpowers
```

Use local clones only for reading, comparison, and selective adaptation.

## Guardrails

- Do not duplicate lifecycle rules from Superpowers into `CLAUDE.md`.
- Do not allow Superpowers to bypass `plan.md` approval.
- Do not allow Superpowers to bypass `worktree_required: true`.
- Do not replace local review, verification, observation, or SQLite trace gates.
- Promote borrowed patterns only when they are stable and useful in local work.
