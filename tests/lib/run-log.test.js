/**
 * Tests for scripts/lib/run-log.js
 *
 * Run with: node tests/lib/run-log.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  readRunEvents,
  resumeStats,
  gateCoverage,
  reviewSeverityHistogram,
  latestRunForRepo,
  resolveResumeState,
} = require('../../scripts/lib/run-log');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'run-log-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Write a run record the way run-record.js lays it out. */
function seedRun(runsDir, runId, { meta = {}, events = [], evidence = {} } = {}) {
  const runDir = path.join(runsDir, runId);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(
    path.join(runDir, 'meta.json'),
    `${JSON.stringify({ run_id: runId, started_at: '2026-08-10T00:00:00.000Z', ...meta }, null, 2)}\n`
  );
  if (events.length > 0) {
    fs.mkdirSync(path.join(runDir, 'logs'), { recursive: true });
    fs.writeFileSync(
      path.join(runDir, 'logs', 'events.ndjson'),
      `${events.map(e => JSON.stringify(e)).join('\n')}\n`
    );
  }
  for (const [kind, record] of Object.entries(evidence)) {
    fs.mkdirSync(path.join(runDir, 'evidence'), { recursive: true });
    fs.writeFileSync(
      path.join(runDir, 'evidence', `${kind}.json`),
      `${JSON.stringify({ kind, captured_at: '2026-08-10T01:00:00.000Z', body: 'x', ...record }, null, 2)}\n`
    );
  }
  return runDir;
}

function runTests() {
  console.log('\n=== Testing run-log.js ===\n');
  let passed = 0;
  let failed = 0;

  if (test('readRunEvents reads events across runs and tags each with its run id', () => {
    const dir = createTempDir();
    try {
      seedRun(dir, '2026-08-10-alpha', {
        events: [
          { occurred_at: '2026-08-10T00:00:01.000Z', type: 'session_started', status: 'started' },
          { occurred_at: '2026-08-10T00:00:02.000Z', type: 'verification_completed', status: 'complete' },
        ],
      });
      seedRun(dir, '2026-08-11-beta', {
        events: [{ occurred_at: '2026-08-11T00:00:01.000Z', type: 'review_completed', status: 'complete' }],
      });
      const events = readRunEvents({ runsDir: dir });
      assert.strictEqual(events.length, 3);
      const alpha = events.filter(e => e.runId === '2026-08-10-alpha');
      assert.strictEqual(alpha.length, 2);
      assert.deepStrictEqual(
        events.map(e => e.type).sort(),
        ['review_completed', 'session_started', 'verification_completed']
      );
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('readRunEvents skips malformed ndjson lines without throwing', () => {
    const dir = createTempDir();
    try {
      const runDir = seedRun(dir, '2026-08-10-alpha', {});
      fs.mkdirSync(path.join(runDir, 'logs'), { recursive: true });
      fs.writeFileSync(
        path.join(runDir, 'logs', 'events.ndjson'),
        '{ not json\n\n{"occurred_at":"2026-08-10T00:00:01.000Z","type":"session_started"}\nnull\n'
      );
      const events = readRunEvents({ runsDir: dir });
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].type, 'session_started');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('readRunEvents filters on the event timestamp', () => {
    const dir = createTempDir();
    try {
      seedRun(dir, '2026-08-10-alpha', {
        events: [
          { occurred_at: '2026-07-01T00:00:00.000Z', type: 'session_started' },
          { occurred_at: '2026-08-10T00:00:00.000Z', type: 'session_started' },
        ],
      });
      const events = readRunEvents({
        runsDir: dir,
        window: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
      });
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].occurred_at, '2026-08-10T00:00:00.000Z');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('a missing runs directory yields no events instead of throwing', () => {
    const events = readRunEvents({ runsDir: path.join(os.tmpdir(), 'run-log-absent-4321') });
    assert.deepStrictEqual(events, []);
  })) passed++; else failed++;

  // --- resumeStats -----------------------------------------------------------

  if (test('resumeStats counts only sessions that had state available', () => {
    const dir = createTempDir();
    try {
      seedRun(dir, '2026-08-10-alpha', {
        events: [
          // Nothing to resume: a fresh worktree. Not a failure. Counting these
          // produced 382 of 471 health candidates before 2026-08-19.
          { occurred_at: '2026-08-10T00:00:00.000Z', type: 'session_started', resume_expected: false, resume_success: false, session_id: 's1' },
          // State was there and did not load. This is the real failure.
          { occurred_at: '2026-08-10T01:00:00.000Z', type: 'session_started', resume_expected: true, resume_success: false, session_id: 's2', resume_reason: 'artifacts-missing' },
          { occurred_at: '2026-08-10T02:00:00.000Z', type: 'session_started', resume_expected: true, resume_success: true, session_id: 's3' },
        ],
      });
      const stats = resumeStats({ runsDir: dir });
      assert.strictEqual(stats.expected, 2);
      assert.strictEqual(stats.succeeded, 1);
      assert.strictEqual(stats.failures.length, 1);
      assert.strictEqual(stats.failures[0].sessionId, 's2');
      assert.strictEqual(stats.failures[0].reason, 'artifacts-missing');
      assert.strictEqual(stats.failures[0].runId, '2026-08-10-alpha');
      assert.strictEqual(stats.successRate, 50);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('resumeStats reports a null rate rather than 0 when nothing was expected', () => {
    const dir = createTempDir();
    try {
      seedRun(dir, '2026-08-10-alpha', {
        events: [{ occurred_at: '2026-08-10T00:00:00.000Z', type: 'session_started', resume_expected: false, resume_success: false }],
      });
      const stats = resumeStats({ runsDir: dir });
      assert.strictEqual(stats.expected, 0);
      // 0% would read as "resume is broken" when in fact nothing was asked of it.
      assert.strictEqual(stats.successRate, null);
      assert.deepStrictEqual(stats.failures, []);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  // --- gateCoverage ----------------------------------------------------------

  if (test('gateCoverage reports which gates left evidence, per run', () => {
    const dir = createTempDir();
    try {
      seedRun(dir, '2026-08-10-alpha', {
        meta: { branch: 'worktree-alpha', repo_root: '/repo' },
        evidence: {
          verification: { state: { complete: true } },
          review: { state: { complete: true, parsedFindings: [] } },
        },
      });
      seedRun(dir, '2026-08-11-beta', {
        meta: { branch: 'worktree-beta', repo_root: '/repo' },
        evidence: { verification: { state: { complete: false } } },
      });
      const coverage = gateCoverage({ runsDir: dir });
      const byRun = new Map(coverage.runs.map(r => [r.runId, r]));
      assert.strictEqual(byRun.get('2026-08-10-alpha').verification, true);
      assert.strictEqual(byRun.get('2026-08-10-alpha').review, true);
      assert.strictEqual(byRun.get('2026-08-10-alpha').observation, false);
      assert.strictEqual(byRun.get('2026-08-11-beta').review, false);
      assert.strictEqual(coverage.totals.runs, 2);
      assert.strictEqual(coverage.totals.verification, 2);
      assert.strictEqual(coverage.totals.review, 1);
      assert.strictEqual(coverage.totals.observation, 0);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('an incomplete artifact is present but not complete', () => {
    const dir = createTempDir();
    try {
      seedRun(dir, '2026-08-10-alpha', {
        evidence: { verification: { state: { complete: false, missingSections: ['Assessment'] } } },
      });
      const coverage = gateCoverage({ runsDir: dir });
      const run = coverage.runs[0];
      assert.strictEqual(run.verification, true, 'evidence exists');
      // Presence is not acceptance: a summary missing its canonical sections
      // has not passed the gate it claims to record.
      assert.strictEqual(run.verificationComplete, false);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('gateCoverage carries when each gate was captured', () => {
    const dir = createTempDir();
    try {
      seedRun(dir, '2026-08-10-alpha', {
        meta: { started_at: '2026-08-10T00:00:00.000Z' },
        evidence: {
          verification: { captured_at: '2026-08-10T00:30:00.000Z', state: { complete: true } },
        },
      });
      const coverage = gateCoverage({ runsDir: dir });
      const run = coverage.runs[0];
      // Needed to measure time-to-verification without a separate event log.
      assert.strictEqual(run.verificationCapturedAt, '2026-08-10T00:30:00.000Z');
      assert.strictEqual(run.reviewCapturedAt, '');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('gateCoverage filters runs by started_at', () => {
    const dir = createTempDir();
    try {
      seedRun(dir, '2026-07-01-old', {
        meta: { started_at: '2026-07-01T00:00:00.000Z' },
        evidence: { verification: {} },
      });
      seedRun(dir, '2026-08-10-new', {
        meta: { started_at: '2026-08-10T00:00:00.000Z' },
        evidence: { verification: {} },
      });
      const coverage = gateCoverage({
        runsDir: dir,
        window: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
      });
      assert.deepStrictEqual(coverage.runs.map(r => r.runId), ['2026-08-10-new']);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  // --- reviewSeverityHistogram ----------------------------------------------

  if (test('reviewSeverityHistogram counts findings from the captured review body', () => {
    const dir = createTempDir();
    try {
      seedRun(dir, '2026-08-10-alpha', {
        evidence: {
          review: {
            state: {
              parsedFindings: [
                { severity: 'HIGH', message: 'a' },
                { severity: 'HIGH', message: 'b' },
                { severity: 'INFO', message: 'c' },
              ],
            },
          },
        },
      });
      seedRun(dir, '2026-08-11-beta', {
        evidence: { review: { state: { parsedFindings: [{ severity: 'CRITICAL', message: 'd' }] } } },
      });
      const hist = reviewSeverityHistogram({ runsDir: dir });
      assert.strictEqual(hist.total, 4);
      assert.strictEqual(hist.histogram.HIGH, 2);
      assert.strictEqual(hist.histogram.INFO, 1);
      assert.strictEqual(hist.histogram.CRITICAL, 1);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('a severity named __proto__ is counted, not silently dropped', () => {
    const dir = createTempDir();
    try {
      seedRun(dir, '2026-08-10-alpha', {
        evidence: {
          review: {
            state: {
              parsedFindings: [
                { severity: '__proto__', message: 'a' },
                { severity: 'constructor', message: 'b' },
                { severity: 'HIGH', message: 'c' },
              ],
            },
          },
        },
      });
      const hist = reviewSeverityHistogram({ runsDir: dir });
      // evidence/review.json is a file on disk, so severity is not constrained
      // by REVIEW_FINDING_PATTERN by the time it is read back. Uppercasing
      // happens to turn __proto__ into a harmless key, which means the
      // invariant currently holds by accident -- state it instead.
      assert.strictEqual(hist.total, 3);
      assert.strictEqual(Object.getPrototypeOf(hist.histogram), null, 'histogram must not be prototype-mutable');
      assert.strictEqual(Object.keys(hist.histogram).length, 3);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('a review with no findings is zero, not absent', () => {
    const dir = createTempDir();
    try {
      seedRun(dir, '2026-08-10-alpha', {
        evidence: { review: { state: { parsedFindings: [] } } },
      });
      const hist = reviewSeverityHistogram({ runsDir: dir });
      assert.strictEqual(hist.total, 0);
      // Own keys, not deepStrictEqual({}) — histogram has a null prototype by design.
      assert.deepStrictEqual(Object.keys(hist.histogram), []);
      // A clean review is still a review that ran.
      assert.strictEqual(hist.reviewsRead, 1);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  // --- latestRunForRepo ------------------------------------------------------

  if (test('latestRunForRepo returns the newest run for that repository only', () => {
    const dir = createTempDir();
    try {
      seedRun(dir, '2026-08-10-mine', {
        meta: { repo_root: '/repo/a', started_at: '2026-08-10T00:00:00.000Z', updated_at: '2026-08-10T05:00:00.000Z' },
      });
      seedRun(dir, '2026-08-12-other', {
        meta: { repo_root: '/repo/b', started_at: '2026-08-12T00:00:00.000Z', updated_at: '2026-08-12T00:00:00.000Z' },
      });
      const mine = latestRunForRepo({ runsDir: dir, repoRoot: '/repo/a' });
      assert.strictEqual(mine.runId, '2026-08-10-mine');
      // No cross-repository fallback: session-start.js removed exactly this
      // as a contract violation, so reaching for /repo/b here would restore it.
      const none = latestRunForRepo({ runsDir: dir, repoRoot: '/repo/c' });
      assert.strictEqual(none, null);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  // --- resolveResumeState ----------------------------------------------------
  // Replaces getLatestRunState + isRunStateStale. Measured 2026-08-20: with all
  // three gate artifacts present, every non-empty field formatResumeState
  // printed was already in buildArtifactContext, which additionally had
  // next_required_action and detail. run_state was a degraded copy of the files.

  if (test('resolveResumeState: nothing recorded and no artifacts is not a failure', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      fs.mkdirSync(repo, { recursive: true });
      const state = resolveResumeState({ repoRoot: repo, runsDir: dir });
      // A fresh worktree. Reporting this as a failed resume is how 382 of 471
      // health candidates came to be new worktrees.
      assert.strictEqual(state.expected, false);
      assert.strictEqual(state.success, false);
      assert.strictEqual(state.source, 'none');
      assert.strictEqual(state.context, null);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('resolveResumeState: artifacts on disk are the resume source', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      fs.mkdirSync(repo, { recursive: true });
      fs.writeFileSync(path.join(repo, 'verification-summary.md'),
        '# Verification Summary\n\n## Scope\n\n- x\n\n## Commands Run\n\n- `true`\n\n## Verification Outcome\n\n- ok\n\n## Assessment\n\n- ok\n');
      const state = resolveResumeState({ repoRoot: repo, runsDir: dir });
      assert.strictEqual(state.expected, true);
      assert.strictEqual(state.success, true);
      assert.strictEqual(state.source, 'artifacts');
      assert.ok(state.context.includes('verification-summary.md'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('resolveResumeState: a run record whose artifacts are gone is a real failure', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      fs.mkdirSync(repo, { recursive: true });
      // Evidence was captured for this repository, so a task ran here; the
      // artifacts are gone because the worktree was removed.
      seedRun(dir, '2026-08-20-gone', {
        meta: { repo_root: repo, branch: 'worktree-gone' },
        evidence: { verification: { state: { complete: true } } },
      });
      const state = resolveResumeState({ repoRoot: repo, runsDir: dir });
      assert.strictEqual(state.expected, true, 'a run record with evidence means state was available');
      assert.strictEqual(state.success, false);
      assert.strictEqual(state.reason, 'artifacts-missing');
      // Nothing to inject: the honest answer is nothing, not a stale claim.
      assert.strictEqual(state.context, null);
      assert.strictEqual(state.runId, '2026-08-20-gone');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('resolveResumeState: another repository\'s run record is not consulted', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      fs.mkdirSync(repo, { recursive: true });
      seedRun(dir, '2026-08-20-elsewhere', {
        meta: { repo_root: '/some/other/repo' },
        evidence: { verification: { state: { complete: true } } },
      });
      const state = resolveResumeState({ repoRoot: repo, runsDir: dir });
      assert.strictEqual(state.expected, false, 'must not treat another repo as this one');
      assert.strictEqual(state.source, 'none');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('resolveResumeState: a run record with no gate evidence expects nothing', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      fs.mkdirSync(repo, { recursive: true });
      // recordSessionStart creates a record on a continuing task before any
      // gate has fired. That is not state to restore.
      seedRun(dir, '2026-08-20-early', { meta: { repo_root: repo } });
      const state = resolveResumeState({ repoRoot: repo, runsDir: dir });
      assert.strictEqual(state.expected, false);
      assert.strictEqual(state.success, false);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
