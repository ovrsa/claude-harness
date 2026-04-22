# Health And Improvement Operations

Use this runbook when you want the harness to improve itself without background automation.

## Core Rule

Improvement is request-driven.

- do not wait for a scheduler
- do not auto-promote recurring candidates
- use one explicit operator request to review the current failure landscape

## Preferred Entry Point

Use `/improve-harness` by default.

It should:

1. read the current grouped candidate landscape
2. reuse `health-summary.md` and `triage-summary.md` when they are still useful
3. identify at most `1-3` improvements worth acting on now
4. recommend the narrowest durable destination:
   - `docs`
   - `command`
   - `hook`
   - `skill`
5. stop before implementation unless the operator explicitly asks to continue

## Supporting Commands

Use the lower-level commands when you want to inspect the intermediate state directly.

- `/health-status`
  - summarize the current grouped landscape
  - useful when you want visibility without recommendations
- `/triage-loop`
  - turn the grouped landscape into next-task candidates
  - useful when you want to inspect recommendations separately before asking for changes

## Recommended Operating Sequence

For the shortest path:

1. run `/improve-harness`
2. review the `1-3` proposed improvements
3. pick only one low-risk item to implement
4. after implementation, let normal artifact capture feed the next improvement cycle

For a more explicit pass:

1. run `/health-status`
2. inspect `health-summary.md`
3. run `/triage-loop`
4. inspect `triage-summary.md`
5. run `/improve-harness` only if you still want a narrowed recommendation set

## Selection Heuristics

Prefer the narrowest durable destination that reliably prevents recurrence.

- missing explanation or checklist gap -> `docs`
- recurring operator judgment workflow -> `command`
- high-confidence machine-detectable failure -> `hook`
- stable reusable multi-repo pattern -> `skill`

When confidence is mixed, choose `docs` or `command` first.

## What Not To Do

- do not batch-promote many items in one pass
- do not treat every candidate as actionable
- do not jump to `hook` or `skill` when `docs` or `command` would be enough
- do not implement improvements until the operator confirms the selected item
