'use strict';

/**
 * Reads the JSON run records that run-record.js writes.
 *
 *   runs/<YYYY-MM-DD>-<slug>/
 *     meta.json               task identity, session ids, branch
 *     logs/events.ndjson      lifecycle events, one JSON object per line
 *     evidence/<kind>.json    gate artifact bodies, verbatim, plus parsed state
 *
 * This is the read side of what SQLite's session_events / session_runs /
 * run_state / review_findings held. Two things differ, both deliberate:
 *
 *   - Granularity is one record per task, not per session. A task that spans
 *     several sessions keeps one record; meta.session_ids resolves to the
 *     transcripts (see transcript-log.js).
 *   - Gate results carry their body. SQLite kept a two-line extract plus an
 *     evidence_ref pointing at a path inside a worktree that ExitWorktree had
 *     already deleted.
 *
 * No side effects. No console output.
 */

const fs = require('fs');
const path = require('path');

const { getRunsDir, listRunRecords } = require('./run-record');
const { inWindow } = require('./log-window');
const { buildArtifactContext } = require('./task-artifacts');

const EVIDENCE_KINDS = ['verification', 'review', 'observation'];

function readJson(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Run directories in scope, newest first. Filters on meta.started_at, which is
 * when the task began — not when the record was last touched, so a long task
 * does not drop out of the window by being idle.
 */
function listRuns(options = {}) {
  const runs = listRunRecords(options);
  if (!options.window) return runs;
  return runs.filter(run => inWindow(String(run.started_at || ''), options.window));
}

/**
 * Every lifecycle event across every run record, each tagged with its run id.
 * The window filters on the event timestamp, so an old task's recent events are
 * still in scope.
 */
function readRunEvents(options = {}) {
  const runsDir = getRunsDir(options);
  let entries;
  try {
    entries = fs.readdirSync(runsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const events = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    let raw;
    try {
      raw = fs.readFileSync(path.join(runsDir, entry.name, 'logs', 'events.ndjson'), 'utf8');
    } catch {
      continue;
    }
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== 'object') continue;
      if (!inWindow(String(parsed.occurred_at || ''), options.window)) continue;
      events.push({ runId: entry.name, ...parsed });
    }
  }

  return events.sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)));
}

/**
 * Resume outcomes, counted only over sessions that had state available.
 *
 * `resume_expected` is the whole point of the pair. Counting resume_success ===
 * false on its own conflated "nothing to resume" with "failed to resume", and a
 * fresh worktree legitimately has neither run state nor task artifacts: that
 * reading produced 382 of 471 health candidates, every one a new worktree.
 */
function resumeStats(options = {}) {
  const events = readRunEvents(options).filter(event => event.type === 'session_started');

  let expected = 0;
  let succeeded = 0;
  const failures = [];

  for (const event of events) {
    if (event.resume_expected !== true) continue;
    expected += 1;
    if (event.resume_success === true) {
      succeeded += 1;
      continue;
    }
    failures.push({
      runId: event.runId,
      sessionId: String(event.session_id || ''),
      occurredAt: String(event.occurred_at || ''),
      reason: String(event.resume_reason || 'unknown'),
    });
  }

  return {
    expected,
    succeeded,
    failures,
    // null, not 0: nothing was asked of resume, so there is no rate to report.
    // 0% would read as a broken subsystem.
    successRate: expected > 0 ? Math.round((succeeded / expected) * 10000) / 100 : null,
  };
}

function readEvidence(runPath, kind) {
  return readJson(path.join(runPath, 'evidence', `${kind}.json`));
}

/**
 * Which gates left evidence, per run.
 *
 * Presence and completeness are separate fields on purpose. An artifact that is
 * missing its canonical sections has not passed the gate it claims to record,
 * and collapsing the two would let an incomplete summary read as a pass.
 */
function gateCoverage(options = {}) {
  const runs = listRuns(options);
  const totals = { runs: 0, verification: 0, review: 0, observation: 0 };
  const rows = [];

  for (const run of runs) {
    const row = {
      runId: String(run.run_id || ''),
      branch: String(run.branch || ''),
      repoRoot: String(run.repo_root || ''),
      startedAt: String(run.started_at || ''),
      updatedAt: String(run.updated_at || ''),
      sessionIds: Array.isArray(run.session_ids) ? run.session_ids : [],
      path: run.path,
    };

    for (const kind of EVIDENCE_KINDS) {
      const record = readEvidence(run.path, kind);
      row[kind] = Boolean(record);
      row[`${kind}Complete`] = Boolean(record && record.state && record.state.complete === true);
      // When the gate produced its evidence. recordGateEvidence rewrites this on
      // every snapshot, so it is the last capture, not the first -- which is the
      // only timestamp anything records.
      row[`${kind}CapturedAt`] = String((record && record.captured_at) || '');
      if (record) totals[kind] += 1;
    }

    totals.runs += 1;
    rows.push(row);
  }

  return { runs: rows, totals };
}

/**
 * Review findings by severity, from the captured review bodies.
 *
 * `reviewsRead` is the denominator: a review that found nothing is still a
 * review that ran, and without it a quiet window is indistinguishable from a
 * window where review never happened.
 */
function reviewSeverityHistogram(options = {}) {
  // Null-prototype: severity is read back from evidence/review.json, a file on
  // disk, so REVIEW_FINDING_PATTERN no longer constrains it. `.toUpperCase()`
  // happens to turn __proto__ into a harmless key, which makes the invariant
  // hold by accident; this makes it hold on purpose.
  const histogram = Object.create(null);
  let total = 0;
  let reviewsRead = 0;

  for (const run of listRuns(options)) {
    const record = readEvidence(run.path, 'review');
    if (!record) continue;
    reviewsRead += 1;
    const findings = record.state && Array.isArray(record.state.parsedFindings)
      ? record.state.parsedFindings
      : [];
    for (const finding of findings) {
      const severity = String((finding && finding.severity) || 'UNKNOWN').toUpperCase();
      histogram[severity] = (histogram[severity] || 0) + 1;
      total += 1;
    }
  }

  return { histogram, total, reviewsRead };
}

/**
 * The newest run record for one repository.
 *
 * No cross-repository fallback. session-start.js removed `getLatestRunState({
 * repoRoot }) || getLatestRunState()` as a contract violation: with no row for
 * this repository it reached for whichever repository was touched last.
 */
function latestRunForRepo(options = {}) {
  const repoRoot = String(options.repoRoot || '');
  if (!repoRoot) return null;

  const candidates = gateCoverage(options).runs
    .filter(run => run.repoRoot === repoRoot)
    .sort((a, b) => String(b.updatedAt || b.startedAt).localeCompare(String(a.updatedAt || a.startedAt)));

  return candidates[0] || null;
}

/**
 * What there is to resume for this repository, and whether it loaded.
 *
 * Replaces getLatestRunState + isRunStateStale + formatResumeState. Measured
 * 2026-08-20 with all three gate artifacts present: every non-empty field
 * formatResumeState printed already appeared in buildArtifactContext, which
 * additionally carried next_required_action and detail. current_phase,
 * current_step, next_action, blockers and delegated_work were empty (they came
 * from progress.md, retired 2026-08-17) and final_status was the constant
 * blocked_before_plan. run_state was a degraded copy of the files on disk.
 *
 * `expected` answers "was there state to restore" and is what separates a fresh
 * worktree from a failed restore. A run record counts only once a gate has left
 * evidence: recordSessionStart creates the record before that, and an empty
 * record is not state.
 */
function resolveResumeState(options = {}) {
  const repoRoot = String(options.repoRoot || '');
  const context = repoRoot ? buildArtifactContext(repoRoot) : null;

  if (context) {
    return { expected: true, success: true, source: 'artifacts', reason: '', runId: '', context };
  }

  const run = latestRunForRepo(options);
  const hadEvidence = Boolean(run && (run.verification || run.review || run.observation));
  if (!hadEvidence) {
    return { expected: false, success: false, source: 'none', reason: '', runId: '', context: null };
  }

  // Evidence exists for this repository but the artifacts are gone -- the
  // worktree was removed. Injecting the record's claims would describe a task
  // that is over; nothing is the honest output. The run record still holds the
  // bodies for `runs-cli show`.
  return {
    expected: true,
    success: false,
    source: 'none',
    reason: 'artifacts-missing',
    runId: run.runId,
    context: null,
  };
}

module.exports = {
  listRuns,
  readRunEvents,
  resumeStats,
  gateCoverage,
  reviewSeverityHistogram,
  latestRunForRepo,
  resolveResumeState,
};
