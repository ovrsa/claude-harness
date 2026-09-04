'use strict';

/**
 * `/trace-status`: what the harness has actually recorded.
 *
 * Reads runs/ and the JSONL transcripts. Lived in session-trace.js until
 * 2026-08-20, reading session_runs and session_events; it moved out when the
 * last of those reads went away, so the CLI no longer loads the SQLite layer to
 * report on data that is not in it.
 *
 * Four KPIs were retired rather than moved
 * (docs/design/2026-08-20-json-readers-and-dead-metrics.md):
 *
 *   time_to_plan_approval_minutes  plan_status_observed needs plan.md, retired
 *                                  2026-08-17.
 *   countsByStatus                 computeFinalStatus returns
 *                                  blocked_before_plan whenever planStatus is
 *                                  'missing', which it now always is.
 *   token_data_coverage_rate       all 3,113 token_usage_observed rows carried
 *                                  input_tokens=null, so coverage was 0% for
 *                                  the metric's whole life. The transcript has
 *                                  the numbers, so there is no gap to measure.
 *   estimated_cost_usd             needs a unit-price table, which would be a
 *                                  maintained value in the harness.
 *
 * No side effects. No console output.
 */

const { resumeStats, gateCoverage, reviewSeverityHistogram } = require('./run-log');
const { tokenUsage, sessionTurnCounts } = require('./transcript-log');

function truncate(value, limit) {
  const text = value === null || value === undefined ? '' : String(value);
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

// No time_to_verified_completion_minutes. meta.started_at is when the run record
// was created, and the record is created by the first gate capture: measured on
// both real records, started_at and every captured_at land within 1ms of each
// other. The duration is structurally zero, which is the same defect as the
// metrics retired above. A real task start would need a timestamp nothing
// currently writes -- the worktree is often created mid-session, so neither the
// session start nor the first transcript line marks it.

function summarizeTraceStatus(options = {}) {
  const limit = Math.max(1, Number(options.limit) || 10);

  const coverage = gateCoverage(options);
  const resume = resumeStats(options);
  const findings = reviewSeverityHistogram(options);
  const tokens = tokenUsage(options);
  const turns = sessionTurnCounts(options);

  const sessions = Object.values(turns.bySession);
  const multiTurn = sessions.filter(entry => entry.turns > 1).length;

  return {
    totalRuns: coverage.totals.runs,
    gateCoverage: {
      verification: coverage.totals.verification,
      review: coverage.totals.review,
      observation: coverage.totals.observation,
    },
    kpis: {
      resume_success_rate: resume.successRate,
      resume_attempts: resume.expected,
      review_findings_per_run: findings.reviewsRead > 0
        ? round2(findings.total / findings.reviewsRead)
        : null,
      sessions_observed: sessions.length,
      multi_turn_session_rate: sessions.length > 0
        ? round2((multiTurn / sessions.length) * 100)
        : null,
      turns_with_usage: tokens.totals.records,
      total_input_tokens: tokens.totals.records > 0 ? tokens.totals.input_tokens : null,
      total_output_tokens: tokens.totals.records > 0 ? tokens.totals.output_tokens : null,
      total_cache_read_tokens: tokens.totals.records > 0 ? tokens.totals.cache_read_input_tokens : null,
    },
    modelUsage: tokens.ranked,
    findingsHistogram: findings.histogram,
    recentRuns: coverage.runs.slice(0, limit).map(run => ({
      run_id: run.runId,
      branch: run.branch,
      session_ids: run.sessionIds,
      started_at: run.startedAt,
      updated_at: run.updatedAt,
      verify_present: run.verification,
      review_present: run.review,
      observe_present: run.observation,
      verify_complete: run.verificationComplete,
      review_complete: run.reviewComplete,
      observe_complete: run.observationComplete,
    })),
  };
}

function formatTraceStatus(summary = summarizeTraceStatus()) {
  const lines = ['Trace Status'];
  lines.push(`- total_runs=${summary.totalRuns}`);
  lines.push(`- gates=verify:${summary.gateCoverage.verification} review:${summary.gateCoverage.review} observe:${summary.gateCoverage.observation}`);
  lines.push('KPIs:');
  for (const [key, value] of Object.entries(summary.kpis)) {
    lines.push(`- ${key}=${value ?? 'n/a'}`);
  }

  if (summary.modelUsage.length > 0) {
    lines.push('Models:');
    for (const model of summary.modelUsage.slice(0, 5)) {
      lines.push(`- ${truncate(model.model, 32)} | turns=${model.records} | output=${model.output_tokens}`);
    }
  }

  if (summary.recentRuns.length > 0) {
    lines.push('Recent runs:');
    for (const run of summary.recentRuns) {
      lines.push(`- ${truncate(run.run_id, 40)} | verify=${run.verify_present} | review=${run.review_present} | observe=${run.observe_present} | sessions=${run.session_ids.length}`);
    }
  }

  return lines.join('\n');
}

module.exports = {
  summarizeTraceStatus,
  formatTraceStatus,
};
