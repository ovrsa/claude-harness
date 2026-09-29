/**
 * Tests for harness/scripts/lib/triage-loop.js
 *
 * Run with: node harness/tests/lib/triage-loop.test.js
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
          provenance: 'artifact',
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
          provenance: 'artifact',
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
          provenance: 'telemetry',
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
          provenance: 'telemetry',
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
      const registryPath = path.join(dir, 'guardrail-candidates.jsonl');

      writeRegistry(registryPath, [
        {
          candidate_key: 'registry::recurring::hook',
          failure_pattern: 'example_registry_pattern',
          recommended_layer: 'hook',
          source_artifact: 'docs/how-to/run-a-task.md',
          promotion_hint: 'enforce the recurring fix at the narrowest layer',
          captured_at: '2026-04-16T00:00:00.000Z',
        },
        {
          candidate_key: 'registry::recurring::hook',
          failure_pattern: 'example_registry_pattern',
          recommended_layer: 'hook',
          source_artifact: 'docs/how-to/run-a-task.md',
          promotion_hint: 'enforce the recurring fix at the narrowest layer',
          captured_at: '2026-04-17T00:00:00.000Z',
        },
      ]);

      // One genuine resume failure. Both harness/data/runs/ and the transcripts must be
      // sandboxed: telemetry-health reads harness/data/runs/ directly, and leaving it unset
      // lets the suite assert against the developer's real history.
      const runsDir = path.join(dir, 'harness/data/runs');
      const transcriptDir = path.join(dir, 'projects');
      const runDir = path.join(runsDir, '2026-04-17-triage');
      fs.mkdirSync(path.join(runDir, 'logs'), { recursive: true });
      fs.writeFileSync(
        path.join(runDir, 'meta.json'),
        `${JSON.stringify({ run_id: '2026-04-17-triage', started_at: '2026-04-17T00:00:00.000Z' })}\n`
      );
      fs.writeFileSync(
        path.join(runDir, 'logs', 'events.ndjson'),
        `${JSON.stringify({
          occurred_at: '2026-04-17T01:00:00.000Z',
          type: 'session_started',
          session_id: 'session-triage',
          resume_expected: true,
          resume_success: false,
        })}\n`
      );

      fs.mkdirSync(transcriptDir, { recursive: true });

      const summary = summarizeCurrentTriage({
        registryPath,
        runsDir,
        transcriptDir,
        promotionThreshold: 3,
        recurringThreshold: 2,
        now: '2026-04-18T00:00:00.000Z',
      });

      assert.strictEqual(summary.recommendedNextTasks.length, 1);
      // plan_missing_or_skipped went 2026-08-19; the bridge observability pair
      // and high_session_turn_count went 2026-08-20. resume_failed is the only
      // telemetry detector left, and it is the only one that names a fault.
      assert.strictEqual(summary.monitorOnly.length, 1);

      const formatted = formatTriageStatus(summary, { limit: 5 });
      assert.ok(formatted.includes('Triage Loop'));
      assert.ok(formatted.includes('Recommended Next Tasks:'));
      assert.ok(formatted.includes('Monitor Only:'));
      assert.ok(formatted.includes('example_registry_pattern'));
      assert.ok(formatted.includes('resume_failed'));
      assert.ok(formatted.includes('provenance=telemetry'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
