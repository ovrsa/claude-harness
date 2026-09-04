/**
 * Tests for scripts/lib/trace-status.js
 *
 * Run with: node tests/lib/trace-status.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  summarizeTraceStatus,
  formatTraceStatus,
} = require('../../scripts/lib/trace-status');

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'trace-status-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function seedRun(runsDir, runId, { meta = {}, events = [], evidence = {} } = {}) {
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
  for (const [kind, record] of Object.entries(evidence)) {
    fs.mkdirSync(path.join(runDir, 'evidence'), { recursive: true });
    fs.writeFileSync(
      path.join(runDir, 'evidence', `${kind}.json`),
      `${JSON.stringify({ kind, body: '# x\n', ...record }, null, 2)}\n`
    );
  }
}

function seedTranscript(transcriptDir, slug, sessionId, lines) {
  const dir = path.join(transcriptDir, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), `${lines.join('\n')}\n`);
}

function runTests() {
  console.log('\n=== Testing trace-status.js ===\n');
  let passed = 0;
  let failed = 0;

  if (test('empty sources yield nulls, not zeros', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'runs');
      const transcriptDir = path.join(dir, 'projects');
      fs.mkdirSync(runsDir, { recursive: true });
      fs.mkdirSync(transcriptDir, { recursive: true });
      const summary = summarizeTraceStatus({ runsDir, transcriptDir });
      assert.strictEqual(summary.totalRuns, 0);
      // A rate of 0 reads as "the subsystem is broken". Nothing was measured.
      assert.strictEqual(summary.kpis.resume_success_rate, null);
      assert.strictEqual(summary.kpis.review_findings_per_run, null);
      assert.deepStrictEqual(summary.recentRuns, []);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('token totals come from the transcript', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'runs');
      const transcriptDir = path.join(dir, 'projects');
      fs.mkdirSync(runsDir, { recursive: true });
      seedTranscript(transcriptDir, 'proj-a', 'sess-1', [
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-08-10T00:00:00.000Z',
          sessionId: 'sess-1',
          message: {
            role: 'assistant',
            model: 'claude-opus-5',
            usage: { input_tokens: 100, output_tokens: 25, cache_read_input_tokens: 7000 },
            content: [{ type: 'text', text: 'ok' }],
          },
        }),
      ]);

      const summary = summarizeTraceStatus({ runsDir, transcriptDir });
      assert.strictEqual(summary.kpis.total_input_tokens, 100);
      assert.strictEqual(summary.kpis.total_output_tokens, 25);
      assert.strictEqual(summary.kpis.total_cache_read_tokens, 7000);
      assert.strictEqual(summary.kpis.turns_with_usage, 1);

      const formatted = formatTraceStatus(summary);
      assert.ok(formatted.includes('total_input_tokens=100'));
      assert.ok(formatted.includes('total_output_tokens=25'));
      // SQLite recorded 3,113 of these with input_tokens=null, so coverage was
      // 0% for the metric's whole life. There is nothing left to measure the
      // coverage of.
      assert.ok(!formatted.includes('token_data_coverage_rate'));
      // No unit-price table in the harness, so no cost estimate.
      assert.ok(!formatted.includes('estimated_cost_usd'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('resume rate counts only sessions that had state to restore', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'runs');
      const transcriptDir = path.join(dir, 'projects');
      fs.mkdirSync(transcriptDir, { recursive: true });
      seedRun(runsDir, '2026-08-10-alpha', {
        events: [
          { occurred_at: '2026-08-10T00:00:00.000Z', type: 'session_started', session_id: 'a', resume_expected: true, resume_success: true },
          { occurred_at: '2026-08-10T01:00:00.000Z', type: 'session_started', session_id: 'b', resume_expected: true, resume_success: false },
          { occurred_at: '2026-08-10T02:00:00.000Z', type: 'session_started', session_id: 'c', resume_expected: false, resume_success: false },
        ],
      });
      const summary = summarizeTraceStatus({ runsDir, transcriptDir });
      assert.strictEqual(summary.kpis.resume_success_rate, 50);
      assert.strictEqual(summary.kpis.resume_attempts, 2);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('gate coverage replaces the run status histogram', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'runs');
      const transcriptDir = path.join(dir, 'projects');
      fs.mkdirSync(transcriptDir, { recursive: true });
      seedRun(runsDir, '2026-08-10-alpha', {
        meta: { branch: 'worktree-alpha' },
        evidence: {
          verification: { state: { complete: true } },
          review: { state: { complete: true, parsedFindings: [{ severity: 'HIGH', message: 'a' }] } },
        },
      });
      seedRun(runsDir, '2026-08-11-beta', { meta: { branch: 'worktree-beta' } });

      const summary = summarizeTraceStatus({ runsDir, transcriptDir });
      assert.strictEqual(summary.totalRuns, 2);
      assert.strictEqual(summary.gateCoverage.verification, 1);
      assert.strictEqual(summary.gateCoverage.review, 1);
      assert.strictEqual(summary.gateCoverage.observation, 0);
      assert.strictEqual(summary.kpis.review_findings_per_run, 1);

      // final_status was the old histogram key. computeFinalStatus returns
      // blocked_before_plan whenever planStatus is 'missing', which it always
      // is since plan.md was retired on 2026-08-17.
      assert.strictEqual(summary.countsByStatus, undefined);
      assert.strictEqual(summary.kpis.time_to_plan_approval_minutes, undefined);

      const byRun = new Map(summary.recentRuns.map(r => [r.run_id, r]));
      assert.strictEqual(byRun.get('2026-08-10-alpha').verify_present, true);
      assert.strictEqual(byRun.get('2026-08-11-beta').verify_present, false);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('no duration metric is reported, because none is measurable', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'runs');
      const transcriptDir = path.join(dir, 'projects');
      fs.mkdirSync(transcriptDir, { recursive: true });
      seedRun(runsDir, '2026-08-10-alpha', {
        meta: { started_at: '2026-08-10T00:00:00.000Z' },
        evidence: {
          verification: { captured_at: '2026-08-10T00:30:00.000Z', state: { complete: true } },
        },
      });
      const summary = summarizeTraceStatus({ runsDir, transcriptDir });
      // meta.started_at is when the run record was created, and the record is
      // created by the first gate capture. Measured on the two real records:
      // started_at and every captured_at land within 1ms of each other, so the
      // duration is structurally zero. Reporting it would add exactly the kind
      // of always-constant metric this change removes.
      assert.strictEqual(summary.kpis.time_to_verified_completion_minutes, undefined);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('human turn rate excludes harness-injected turns', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'runs');
      const transcriptDir = path.join(dir, 'projects');
      fs.mkdirSync(runsDir, { recursive: true });
      const userTurn = (at, sessionId, text) => JSON.stringify({
        type: 'user',
        timestamp: at,
        sessionId,
        message: { role: 'user', content: [{ type: 'text', text }] },
      });
      seedTranscript(transcriptDir, 'proj-a', 'busy', [
        userTurn('2026-08-10T00:00:00.000Z', 'busy', 'one'),
        userTurn('2026-08-10T00:01:00.000Z', 'busy', 'two'),
      ]);
      seedTranscript(transcriptDir, 'proj-a', 'quiet', [
        userTurn('2026-08-10T00:00:00.000Z', 'quiet', 'only ask'),
        userTurn('2026-08-10T00:01:00.000Z', 'quiet', '<task-notification>x</task-notification>'),
      ]);

      const summary = summarizeTraceStatus({ runsDir, transcriptDir });
      assert.strictEqual(summary.kpis.sessions_observed, 2);
      // Only 'busy' is above one human turn. 'quiet' would have qualified if
      // the task notification had counted.
      assert.strictEqual(summary.kpis.multi_turn_session_rate, 50);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('trace-status does not depend on the SQLite layer', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'lib', 'trace-status.js'),
      'utf8'
    );
    // Matching the require, not the word: both files explain in a comment that
    // this code used to live in session-trace.js, and a test that forbids the
    // name forbids the explanation.
    const requiresSessionTrace = /require\([^)]*session-trace/;
    assert.ok(!requiresSessionTrace.test(source), 'trace-status must not require session-trace');
    assert.ok(!/\bdb\.prepare\(/.test(source), 'trace-status must not issue SQL');
    const cli = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'trace-status.js'),
      'utf8'
    );
    assert.ok(!requiresSessionTrace.test(cli), 'the trace-status CLI must not require session-trace');
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
