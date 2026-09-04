/**
 * Tests for scripts/lib/telemetry-health.js
 *
 * Run with: node tests/lib/telemetry-health.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  loadTelemetryHealthCandidates,
} = require('../../scripts/lib/telemetry-health');

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-health-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** A run record with a lifecycle event log, as run-record.js writes it. */
function seedRun(runsDir, runId, { meta = {}, events = [] } = {}) {
  const runDir = path.join(runsDir, runId);
  fs.mkdirSync(path.join(runDir, 'logs'), { recursive: true });
  fs.writeFileSync(
    path.join(runDir, 'meta.json'),
    `${JSON.stringify({ run_id: runId, started_at: '2026-08-10T00:00:00.000Z', ...meta }, null, 2)}\n`
  );
  if (events.length > 0) {
    fs.writeFileSync(
      path.join(runDir, 'logs', 'events.ndjson'),
      `${events.map(e => JSON.stringify(e)).join('\n')}\n`
    );
  }
}

function seedTranscript(transcriptDir, slug, sessionId, userTurns) {
  const dir = path.join(transcriptDir, slug);
  fs.mkdirSync(dir, { recursive: true });
  const lines = userTurns.map((text, i) => JSON.stringify({
    type: 'user',
    timestamp: `2026-08-10T00:0${i}:00.000Z`,
    sessionId,
    message: { role: 'user', content: [{ type: 'text', text }] },
  }));
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), `${lines.join('\n')}\n`);
}

function runTests() {
  console.log('\n=== Testing telemetry-health.js ===\n');

  let passed = 0;
  let failed = 0;

  if (test('returns no candidates when there is no run record and no transcript', () => {
    const dir = createTempDir();
    try {
      const rows = loadTelemetryHealthCandidates({
        runsDir: path.join(dir, 'runs'),
        transcriptDir: path.join(dir, 'projects'),
      });
      assert.deepStrictEqual(rows, []);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('resume_failed comes from the run record, only when state was available', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'runs');
      seedRun(runsDir, '2026-08-10-alpha', {
        meta: { branch: 'worktree-alpha' },
        events: [
          // A fresh worktree has nothing to resume. Counting this produced 382
          // of 471 candidates before 2026-08-19, every one a new worktree.
          { occurred_at: '2026-08-10T00:00:00.000Z', type: 'session_started', session_id: 'fresh', resume_expected: false, resume_success: false },
          { occurred_at: '2026-08-10T01:00:00.000Z', type: 'session_started', session_id: 'broken', resume_expected: true, resume_success: false, resume_reason: 'stale-artifacts-missing' },
          { occurred_at: '2026-08-10T02:00:00.000Z', type: 'session_started', session_id: 'fine', resume_expected: true, resume_success: true },
        ],
      });
      const rows = loadTelemetryHealthCandidates({
        runsDir,
        transcriptDir: path.join(dir, 'projects'),
      });
      const resume = rows.filter(r => r.failure_pattern === 'resume_failed');
      assert.strictEqual(resume.length, 1, `expected 1 resume failure, got ${resume.length}`);
      assert.ok(resume[0].example.includes('broken'));
      assert.ok(!resume[0].example.includes('fresh'));
      assert.strictEqual(resume[0].recommended_layer, 'hook');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('session length is not reported as a failure', () => {
    const dir = createTempDir();
    try {
      const transcriptDir = path.join(dir, 'projects');
      seedTranscript(transcriptDir, 'proj-a', 'chatty', ['one', 'two', 'three', 'four']);
      const rows = loadTelemetryHealthCandidates({
        runsDir: path.join(dir, 'runs'),
        transcriptDir,
      });
      // Measured over 245 sessions: median 1 human turn, p75 = 2, p90 = 7,
      // max 128. At the threshold of 2 the detector fired on 40% of all
      // sessions, and its recommendation was the generic "clarify task and
      // recovery guidance". A long session is a long session, not a fault.
      assert.deepStrictEqual(
        rows.filter(r => r.failure_pattern === 'high_session_turn_count'),
        []
      );
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('retired detectors are gone', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'runs');
      const transcriptDir = path.join(dir, 'projects');
      seedRun(runsDir, '2026-08-10-alpha', {
        events: [{ occurred_at: '2026-08-10T00:00:00.000Z', type: 'session_started', session_id: 's', resume_expected: true, resume_success: false }],
      });
      seedTranscript(transcriptDir, 'proj-a', 'sess-1', ['a', 'b', 'c', 'd']);
      const rows = loadTelemetryHealthCandidates({ runsDir, transcriptDir, highInterventionThreshold: 2 });
      const patterns = new Set(rows.map(r => r.failure_pattern));

      // plan.md was retired 2026-08-17: the first fires forever recommending a
      // retired artifact, the second requires plan_present=1 and never fires.
      assert.ok(!patterns.has('plan_missing_or_skipped'));
      assert.ok(!patterns.has('verification_missing_before_completion'));

      // bridge_mode='manual' was never recorded once in the whole telemetry
      // history, and the companion branch needs plan_present=1 plus a zero
      // tool_executions count -- which Phase 1 made permanently true, so it
      // fired on runs where all three gates were present. Backwards.
      assert.ok(!patterns.has('manual_bridge_session_level_only'));
      assert.ok(!patterns.has('session_level_observability_only'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('no candidate points at an artifact the harness no longer creates', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'runs');
      const transcriptDir = path.join(dir, 'projects');
      seedRun(runsDir, '2026-08-10-alpha', {
        events: [{ occurred_at: '2026-08-10T00:00:00.000Z', type: 'session_started', session_id: 's', resume_expected: true, resume_success: false }],
      });
      seedTranscript(transcriptDir, 'proj-a', 'sess-1', ['a', 'b', 'c']);
      const rows = loadTelemetryHealthCandidates({ runsDir, transcriptDir, highInterventionThreshold: 2 });
      assert.ok(rows.length > 0, 'fixture should produce candidates');
      const retired = ['plan.md', 'progress.md', 'docs/how-to/codex-telemetry-bridge.md'];
      for (const row of rows) {
        assert.ok(
          !retired.includes(String(row.source_artifact || '')),
          `candidate ${row.failure_pattern} references retired artifact ${row.source_artifact}`
        );
      }
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('SQLite is not consulted', () => {
    const dir = createTempDir();
    try {
      // A dbPath that would throw if it were opened. The detectors must not
      // care: their inputs are runs/ and the transcripts.
      const rows = loadTelemetryHealthCandidates({
        runsDir: path.join(dir, 'runs'),
        transcriptDir: path.join(dir, 'projects'),
        dbPath: path.join(dir, 'definitely-not-a-database'),
      });
      assert.deepStrictEqual(rows, []);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
