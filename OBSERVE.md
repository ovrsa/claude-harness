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
- metrics or timing evidence

## Not Sufficient On Its Own

- build success
- lint success
- test success
- code inspection
- agent self-report

## Minimum Structure

`observation-summary.md` should include:

- what behavior was observed
- how it was observed
- what evidence was seen
- any remaining uncertainty
