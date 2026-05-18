# Runtime Evidence Requirements

Observation is required when a task changes runtime behavior, user-visible behavior, or system interactions that tests alone do not fully prove.

## `observation-summary.md` Is Required When

- UI behavior changed
- runtime flows changed
- background processes, hooks, or agents changed behavior
- logs, screenshots, traces, or metrics are the only way to confirm the outcome

## Acceptable Evidence

- browser screenshots
- browser-driven flow checks
- server logs
- hook stderr/stdout evidence
- test traces
- runtime health or process-state checks
- metrics or timing evidence

Observation is evidence-first, not prose-first.

- `Method` must say how the behavior was inspected.
- `Evidence` must say what concrete artifact or signal was observed.
- at least one line in `Method` or `Evidence` must name a concrete evidence source:
  - `browser`
  - `screenshot`
  - `logs`
  - `stderr` / `stdout`
  - `trace`
  - `runtime health`
  - `process state`
  - `metrics`

Generic statements such as `looks good`, `manual check`, or `ran verification` are not enough on their own.

## Not Sufficient On Its Own

- build success
- lint success
- test success
- code inspection
- agent self-report

## Minimum Structure

`observation-summary.md` should include:

- `Behavior Checked`
- `Method`
- `Evidence`
- `Remaining Uncertainty`

## Verify vs Observe

Use `verify` for reproducible checks such as build, lint, tests, smoke, and contract audit.

Use `evaluate` to decide whether implementation or bug-fix work is acceptable to accept after review findings, residual risks, and acceptance criteria are considered.

Use `observe` when the task needs runtime evidence that those checks do not fully prove.

- `verify` answers: "did the programmed checks pass?"
- `evaluate` answers: "should this change be accepted?"
- `observe` answers: "what concrete runtime signal showed the changed behavior?"

The three gates compose, but none substitutes for the others:

- passing `verify` does not settle acceptance
- passing `evaluate` does not invent runtime evidence
- passing `observe` does not remove unresolved review findings
