'use strict';

/**
 * Health candidates derived from the JSON logs.
 *
 * Sources: harness/data/runs/<id>/logs/events.ndjson for lifecycle outcomes, and Claude
 * Code's own transcripts for session shape. SQLite is not consulted.
 *
 * Four detectors were retired rather than moved, because each read a column
 * that no longer carries signal (see docs/design/2026-08-20-json-readers-and-
 * dead-metrics.md). A detector that cannot stop firing is not a detector.
 */

const { resumeStats } = require('./run-log');
const { normalizeGuardrailCandidate } = require('./guardrail-candidates');

function buildTelemetryCandidate(candidate, options = {}) {
  return normalizeGuardrailCandidate(candidate, {
    capturedAt: options.capturedAt,
    sourceArtifact: options.sourceArtifact,
  });
}

/**
 * Sessions that had state available and did not restore it.
 *
 * `resume_expected` is what makes this a failure rather than a fresh start.
 * Without it, resume_success === false alone counted every new worktree, which
 * is how 382 of 471 candidates came to be new worktrees.
 */
function getResumeFailedCandidates(options = {}) {
  const stats = resumeStats(options);

  return stats.failures.map(failure => buildTelemetryCandidate({
    failure_pattern: 'resume_failed',
    source: 'runs:session_started',
    // progress.md was the resume source until 2026-08-17. Pointing at it would
    // send the operator to a file the harness no longer creates.
    source_artifact: 'docs/design/2026-08-17-lifecycle-five-steps.md',
    example: `run_id=${failure.runId}; session_id=${failure.sessionId}; resume_reason=${failure.reason}`,
    recommended_layer: 'hook',
    severity: 'high',
    confidence: 'high',
    false_positive_risk: 'low',
    promotion_hint: 'improve session resume and artifact rehydration',
  }, {
    capturedAt: failure.occurredAt,
    sourceArtifact: 'docs/design/2026-08-17-lifecycle-five-steps.md',
  }));
}

// Retired 2026-08-20, with the measurement that killed each one:
//
//   plan_missing_or_skipped            plan.md retired 2026-08-17, so it fires
//                                      on every run and recommends recreating a
//                                      retired artifact. 45 historical hits.
//   verification_missing_before_...    requires plan_present=1, which can no
//                                      longer happen. 6 historical hits.
//   manual_bridge_session_level_only   bridge_mode='manual' was never recorded
//                                      once in the entire telemetry history.
//   session_level_observability_only   requires plan_present=1 AND zero
//                                      tool_executions. Phase 1 stopped writing
//                                      tool_executions, so the second condition
//                                      is now permanently true and the detector
//                                      fired on runs where all three gates were
//                                      present -- the opposite of its intent.
//   high_session_turn_count            not a fault at all. Over 245 sessions:
//                                      median 1 human turn, p75 = 2, p90 = 7,
//                                      max 128. At its threshold of 2 it fired
//                                      on 40% of every session ever recorded,
//                                      always recommending the same generic
//                                      docs change. It was measuring session
//                                      length. Correcting the turn count (see
//                                      transcript-log.js) made the reading
//                                      honest and the detector no more useful:
//                                      98 candidates out of 127 total entries.
//
// What is left is one detector, and it names an actual malfunction: state was
// available and the session did not load it.

function loadTelemetryHealthCandidates(options = {}) {
  try {
    return getResumeFailedCandidates(options);
  } catch {
    return [];
  }
}

module.exports = {
  loadTelemetryHealthCandidates,
};
