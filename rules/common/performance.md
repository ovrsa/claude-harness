# Performance Optimization

## Model Selection Strategy

- Main loop: the most capable model (deep reasoning, architecture, ambiguous tasks). Lighter
  models: high-volume or well-specified work where the shape is already decided, and mechanical
  transforms with a checkable output
- Do not route to a cheaper model to save cost: a weaker subagent lowers the quality of the
  judgment handed to it. Delegate for context isolation and independent verification
- Do not treat the per-agent model assignments in `agents/` as an endorsed policy
- Do not record model names, versions, or token figures in instructions. They go stale

## Context Window Management

- Judge headroom against the actual window of the model in use, not a fixed token count
- With a large window, prefer continuity over compaction. Reserve compaction for genuine phase
  boundaries: a design is settled, an implementation is verified, or the next step needs none of
  the detail behind it
- Leave headroom before work that needs to hold a lot at once. Small isolated changes can run
  close to the limit
