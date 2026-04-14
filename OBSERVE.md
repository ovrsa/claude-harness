# Observation Requirements

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

Use `observe` when the task needs runtime evidence that those checks do not fully prove.

- `verify` answers: "did the programmed checks pass?"
- `observe` answers: "what concrete runtime signal showed the changed behavior?"

The two phases compose, but neither substitutes for the other on behavior-changing work.
