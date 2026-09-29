'use strict';

/**
 * Weekly aggregates over the JSON logs.
 *
 * Two sources, no database:
 *   - Claude Code's JSONL transcripts: tool failures, token usage, turn counts
 *   - harness/data/runs/<id>/: which gates left evidence, and what review found
 *
 * Three metrics were retired rather than moved, each because the column it read
 * stopped carrying signal (docs/design/2026-08-20-json-readers-and-dead-metrics.md):
 *
 *   successRate      final_status='completed_clean' became unreachable when
 *                    plan.md was retired 2026-08-17 -- computeFinalStatus
 *                    returns blocked_before_plan first. One row in the whole
 *                    history carried it, dated 2026-04-17, so the rate read 0%
 *                    for every window it was ever asked about.
 *   pipelineEvents   pipeline_* was never recorded once; engine_adapter_* only
 *                    in 2026-04.
 *   estimated_cost   token_usage_observed carried input_tokens=null in all
 *                    3,113 rows. Reviving the number needs a unit-price table,
 *                    which would be a maintained value in the harness.
 *
 * gateCoverage replaces successRate: it measures whether the lifecycle produced
 * evidence, which is what the gates are for, from data that exists.
 *
 * No side effects. No console output.
 */

const { toolFailureRate, tokenUsage, sessionTurnCounts } = require('./transcript-log');
const { gateCoverage, reviewSeverityHistogram } = require('./run-log');

const DEFAULT_HIGH_TURN_THRESHOLD = 2;

function isoNow() {
  return new Date().toISOString();
}

function isoDaysAgo(days, base = new Date()) {
  const d = new Date(base.getTime() - days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

function isoWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function defaultWindow(daysBack = 7, base = new Date()) {
  const end = base.toISOString();
  const start = isoDaysAgo(daysBack, base);
  return { start, end };
}

function previousWindow(window) {
  const startMs = Date.parse(window.start);
  const endMs = Date.parse(window.end);
  const span = endMs - startMs;
  return {
    start: new Date(startMs - span).toISOString(),
    end: window.start,
  };
}

function aggregateAll(options = {}) {
  const base = options.base ? new Date(options.base) : new Date();
  const window = options.window || defaultWindow(7, base);
  const prevWindow = previousWindow(window);
  const threshold = Number.isFinite(Number(options.highTurnThreshold))
    ? Number(options.highTurnThreshold)
    : DEFAULT_HIGH_TURN_THRESHOLD;

  // Where to read from, shared by every aggregate below.
  const sources = {
    transcriptDir: options.transcriptDir,
    runsDir: options.runsDir,
    homeDir: options.homeDir,
    repoRoot: options.repoRoot,
  };

  return {
    week: isoWeekKey(base),
    generatedAt: isoNow(),
    window,
    previousWindow: prevWindow,
    gateCoverage: {
      current: gateCoverage({ ...sources, window }),
      previous: gateCoverage({ ...sources, window: prevWindow }),
    },
    findingsHistogram: {
      current: reviewSeverityHistogram({ ...sources, window }),
      previous: reviewSeverityHistogram({ ...sources, window: prevWindow }),
    },
    toolFailureRate: toolFailureRate({ ...sources, window }),
    tokenUsage: tokenUsage({ ...sources, window }),
    highTurnSessions: sessionTurnCounts({ ...sources, window, threshold }).ranked,
  };
}

module.exports = {
  aggregateAll,
  defaultWindow,
  previousWindow,
  isoWeekKey,
  isoDaysAgo,
};
