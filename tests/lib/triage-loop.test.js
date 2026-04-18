/**
 * Tests for scripts/lib/triage-loop.js
 *
 * Run with: node tests/lib/triage-loop.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  summarizeTriage,
  summarizeCurrentTriage,
  formatTriageStatus,
} = require('../../scripts/lib/triage-loop');
const { recordSessionEvent } = require('../../scripts/lib/session-trace');

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    return true;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'triage-loop-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeRegistry(registryPath, rows) {
  fs.writeFileSync(registryPath, rows.map(row => `${JSON.stringify(row)}\n`).join(''), 'utf8');
}

function runTests() {
  console.log('\n=== Testing triage-loop.js ===\n');

  let passed = 0;
  let failed = 0;

  console.log('summarizeTriage:');

  if (test('routes groups into recommended, monitor, and resolved buckets', () => {
    const summary = summarizeTriage({
      totalEntries: 8,
      totalGroups: 4,
      byState: { 'promotion-ready': 1, recurring: 1, new: 1, stale: 1 },
      groups: [
        {
          candidate_key: 'hook::plan',
          state: 'promotion-ready',
          count: 3,
          last_seen: '2026-04-17T10:00:00.000Z',
          recommended_layer: 'hook',
          failure_pattern: 'plan_missing_or_skipped',
          source_artifact: 'plan.md',
          entries: [{ promotion_hint: 'enforce approved plan before execution' }],
        },
        {
          candidate_key: 'docs::intervention',
          state: 'recurring',
          count: 2,
          last_seen: '2026-04-17T09:00:00.000Z',
          recommended_layer: 'docs',
          failure_pattern: 'high_human_intervention_run',
          source_artifact: 'progress.md',
          entries: [{ promotion_hint: 'clarify task and recovery guidance before execution' }],
        },
        {
          candidate_key: 'hook::resume',
          state: 'new',
          count: 1,
          last_seen: '2026-04-17T08:00:00.000Z',
          recommended_layer: 'hook',
          failure_pattern: 'resume_failed',
          source_artifact: 'progress.md',
          entries: [],
        },
        {
          candidate_key: 'hook::verification',
          state: 'stale',
          count: 2,
          last_seen: '2026-03-01T00:00:00.000Z',
          recommended_layer: 'hook',
          failure_pattern: 'verification_missing_before_completion',
          source_artifact: 'verification-summary.md',
          entries: [],
        },
      ],
    });

    assert.strictEqual(summary.recommendedNextTasks.length, 2);
    assert.strictEqual(summary.monitorOnly.length, 1);
    assert.strictEqual(summary.resolvedOrStale.length, 1);
    assert.strictEqual(summary.recommendedNextTasks[0].priority, 'high');
    assert.strictEqual(summary.recommendedNextTasks[0].suggested_task, 'enforce approved plan before execution');
  })) passed++; else failed++;

  console.log('\nsummarizeCurrentTriage / formatTriageStatus:');

  if (test('summarizes registry and telemetry-backed health into triage output', () => {
    const dir = createTempDir();
    try {
      const dbPath = path.join(dir, 'telemetry.db');
      const registryPath = path.join(dir, 'guardrail-candidates.jsonl');

      writeRegistry(registryPath, [
        {
          candidate_key: 'plan::missing::hook',
          failure_pattern: 'plan_missing_or_skipped',
          recommended_layer: 'hook',
          source_artifact: 'plan.md',
          promotion_hint: 'enforce approved plan before execution',
          captured_at: '2026-04-16T00:00:00.000Z',
        },
        {
          candidate_key: 'plan::missing::hook',
          failure_pattern: 'plan_missing_or_skipped',
          recommended_layer: 'hook',
          source_artifact: 'plan.md',
          promotion_hint: 'enforce approved plan before execution',
          captured_at: '2026-04-17T00:00:00.000Z',
        },
      ]);

      recordSessionEvent({
        sessionId: 'session-triage',
        runId: 'run-triage',
        occurredAt: '2026-04-17T01:00:00.000Z',
        eventType: 'session_started',
        status: 'started',
        repoRoot: '/tmp/repo',
        cwd: '/tmp/repo',
        metadata: { resume_success: false },
      }, { dbPath });

      const summary = summarizeCurrentTriage({
        registryPath,
        dbPath,
        promotionThreshold: 3,
        recurringThreshold: 2,
      });

      assert.strictEqual(summary.recommendedNextTasks.length, 1);
      assert.strictEqual(summary.monitorOnly.length, 2);

      const formatted = formatTriageStatus(summary, { limit: 5 });
      assert.ok(formatted.includes('Triage Loop'));
      assert.ok(formatted.includes('Recommended Next Tasks:'));
      assert.ok(formatted.includes('Monitor Only:'));
      assert.ok(formatted.includes('plan_missing_or_skipped'));
      assert.ok(formatted.includes('resume_failed'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
