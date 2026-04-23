# Pilot Report: Superpowers primary engine with thin .claude

Use this report after the docs/commands migration to compare real task outcomes.

## Goal

- Confirm whether option C reduces token cost, human intervention, and rework while preserving implementation quality.

## Variants

- A: previous `.claude` lifecycle
- B: Superpowers-only
- C: Superpowers + thin `.claude`

## Metrics

| Task | Variant | Track | Tokens | Wall Time | Human Interventions | Verification Failures | Review Findings | Rework Count | Accepted | Resume Quality |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| README track sentence | C | trivial | not exposed | <1 min | 0 | 0 unexpected | none | 0 | yes | good |
| clamp bug fix | C | standard | not exposed | <2 min | 0 | 2 expected RED failures, 0 unexpected | none | 0 | yes | good |
| permission boundary | C | heavy-risky | not exposed | <2 min | 0 after approved plan | 1 expected RED failure, 0 unexpected | residual risk only | 0 | yes | good |

## Notes

- Record only comparable tasks.
- Count human interventions when the agent asks for steering beyond strategy, scope, residual risk, or release authorization.
- Count resume quality as `good`, `mixed`, or `poor` based on whether the next session can continue from telemetry/artifacts without transcript archaeology.
- Pilot sandbox: `/tmp/superpowers-thin-harness-pilot`.
- Superpowers plan used: `/tmp/superpowers-thin-harness-pilot/docs/superpowers/plans/2026-04-23-c-only-pilot.md`.
- Final sandbox verification: `npm test` passed with `7` tests passing and `0` failing.
- Token usage was not directly exposed by the current Codex runtime during the pilot. The thin harness now records runtime token payloads when present and marks missing payloads as a coverage gap for later runner/eval work.
- Trivial task finding: broad `npm test` was too heavy while standard/heavy tasks were intentionally red. Changed-surface verification was a better track-appropriate check.

## Decision

- Preferred operating mode: C-only pilot is acceptable for the next real-task trial.
- Reasons: zero steering interventions after plan approval, expected RED failures only, final verification passed, and track-based verification avoided unnecessary artifact weight.
- Follow-up guardrail candidates:
  - failure_pattern: token usage is not directly captured by current runtime
    source: pilot measurement
    recommended_layer: runtime token coverage metrics first, runner/eval pipeline later
    confidence: medium
  - failure_pattern: trivial task verification can be over-broad if it runs the whole suite while later tasks are intentionally red
    source: pilot measurement
    recommended_layer: command/docs
    confidence: high
