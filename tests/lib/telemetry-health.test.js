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
  recordSessionEvent,
} = require('../../scripts/lib/session-trace');
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

function runTests() {
  console.log('\n=== Testing telemetry-health.js ===\n');

  let passed = 0;
  let failed = 0;

  if (test('returns no candidates when telemetry db is missing', () => {
    const dir = createTempDir();
    try {
      const rows = loadTelemetryHealthCandidates({ dbPath: path.join(dir, 'missing.db') });
      assert.deepStrictEqual(rows, []);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('derives telemetry-backed health candidates from session events and runs', () => {
    const dir = createTempDir();
    try {
      const dbPath = path.join(dir, 'telemetry.db');

      recordSessionEvent({
        sessionId: 'session-a',
        runId: 'run-resume-failed',
        occurredAt: '2026-04-17T00:00:00.000Z',
        eventType: 'session_started',
        status: 'started',
        repoRoot: '/tmp/repo',
        cwd: '/tmp/repo',
        metadata: { resume_success: false, resume_reason: 'missing-context' },
      }, { dbPath });

      recordSessionEvent({
        sessionId: 'session-b',
        runId: 'run-plan-missing',
        occurredAt: '2026-04-17T01:00:00.000Z',
        eventType: 'session_started',
        status: 'started',
        repoRoot: '/tmp/repo',
        cwd: '/tmp/repo',
        metadata: { resume_success: true },
      }, { dbPath });
      recordSessionEvent({
        sessionId: 'session-b',
        runId: 'run-plan-missing',
        occurredAt: '2026-04-17T01:05:00.000Z',
        eventType: 'session_ended',
        status: 'blocked',
        repoRoot: '/tmp/repo',
        cwd: '/tmp/repo',
        metadata: { final_status: 'blocked_before_plan', human_intervention_count: 0 },
      }, { dbPath });

      recordSessionEvent({
        sessionId: 'session-c',
        runId: 'run-verify-missing',
        occurredAt: '2026-04-17T02:00:00.000Z',
        eventType: 'session_started',
        status: 'started',
        repoRoot: '/tmp/repo',
        cwd: '/tmp/repo',
        metadata: { resume_success: true },
      }, { dbPath });
      recordSessionEvent({
        sessionId: 'session-c',
        runId: 'run-verify-missing',
        occurredAt: '2026-04-17T02:03:00.000Z',
        eventType: 'plan_status_observed',
        status: 'approved',
        repoRoot: '/tmp/repo',
        cwd: '/tmp/repo',
        metadata: { plan_status: 'approved' },
      }, { dbPath });
      recordSessionEvent({
        sessionId: 'session-c',
        runId: 'run-verify-missing',
        occurredAt: '2026-04-17T02:10:00.000Z',
        eventType: 'session_ended',
        status: 'blocked',
        repoRoot: '/tmp/repo',
        cwd: '/tmp/repo',
        metadata: { final_status: 'blocked_after_plan', human_intervention_count: 0 },
      }, { dbPath });

      recordSessionEvent({
        sessionId: 'session-d',
        runId: 'run-high-intervention',
        occurredAt: '2026-04-17T03:00:00.000Z',
        eventType: 'session_started',
        status: 'started',
        repoRoot: '/tmp/repo',
        cwd: '/tmp/repo',
        metadata: { resume_success: true },
      }, { dbPath });
      recordSessionEvent({
        sessionId: 'session-d',
        runId: 'run-high-intervention',
        occurredAt: '2026-04-17T03:02:00.000Z',
        eventType: 'plan_status_observed',
        status: 'approved',
        repoRoot: '/tmp/repo',
        cwd: '/tmp/repo',
        metadata: { plan_status: 'approved' },
      }, { dbPath });
      recordSessionEvent({
        sessionId: 'session-d',
        runId: 'run-high-intervention',
        occurredAt: '2026-04-17T03:08:00.000Z',
        eventType: 'verification_completed',
        status: 'complete',
        repoRoot: '/tmp/repo',
        cwd: '/tmp/repo',
        metadata: {},
      }, { dbPath });
      recordSessionEvent({
        sessionId: 'session-d',
        runId: 'run-high-intervention',
        occurredAt: '2026-04-17T03:12:00.000Z',
        eventType: 'session_ended',
        status: 'complete',
        repoRoot: '/tmp/repo',
        cwd: '/tmp/repo',
        metadata: { final_status: 'completed_with_intervention', human_intervention_count: 3 },
      }, { dbPath });

      const rows = loadTelemetryHealthCandidates({ dbPath });
      const byPattern = new Map(rows.map(row => [row.failure_pattern, row]));

      assert.ok(byPattern.has('resume_failed'));
      assert.ok(byPattern.has('plan_missing_or_skipped'));
      assert.ok(byPattern.has('verification_missing_before_completion'));
      assert.ok(byPattern.has('high_human_intervention_run'));
      assert.strictEqual(byPattern.get('resume_failed').recommended_layer, 'hook');
      assert.strictEqual(byPattern.get('high_human_intervention_run').recommended_layer, 'docs');
      assert.ok(byPattern.get('resume_failed').candidate_key.includes('resume_failed'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
