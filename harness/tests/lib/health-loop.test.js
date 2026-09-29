/**
 * Tests for harness/scripts/lib/health-loop.js
 *
 * Run with: node harness/tests/lib/health-loop.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  getDefaultGuardrailRegistryPath,
  loadHealthCandidates,
  groupHealthCandidates,
  classifyHealthGroup,
  summarizeHealthLoop,
  summarizeCurrentHealth,
  formatHealthStatus,
} = require('../../scripts/lib/health-loop');

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'health-loop-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeRegistry(registryPath, rows) {
  fs.writeFileSync(registryPath, rows.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8');
}

/**
 * A run record holding one genuine resume failure, plus an empty transcript
 * directory. Both paths must be sandboxed: telemetry-health reads harness/data/runs/ and the
 * transcripts, so passing only one lets the suite read the developer's real
 * history and assert against whatever happens to be there.
 */
function seedJsonLogs(dir) {
  const runsDir = path.join(dir, 'harness/data/runs');
  const transcriptDir = path.join(dir, 'projects');
  const runDir = path.join(runsDir, '2026-04-17-health');
  fs.mkdirSync(path.join(runDir, 'logs'), { recursive: true });
  fs.mkdirSync(transcriptDir, { recursive: true });
  fs.writeFileSync(
    path.join(runDir, 'meta.json'),
    `${JSON.stringify({ run_id: '2026-04-17-health', started_at: '2026-04-17T00:00:00.000Z' })}\n`
  );
  fs.writeFileSync(
    path.join(runDir, 'logs', 'events.ndjson'),
    `${JSON.stringify({
      occurred_at: '2026-04-17T00:00:00.000Z',
      type: 'session_started',
      session_id: 'session-health',
      resume_expected: true,
      resume_success: false,
    })}\n`
  );
  return { runsDir, transcriptDir };
}

function runTests() {
  console.log('\n=== Testing health-loop.js ===\n');

  let passed = 0;
  let failed = 0;

  console.log('loadHealthCandidates:');

  if (test('returns empty array for missing registry', () => {
    const dir = createTempDir();
    try {
      const rows = loadHealthCandidates(path.join(dir, 'missing.jsonl'));
      assert.deepStrictEqual(rows, []);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('ignores malformed rows gracefully', () => {
    const dir = createTempDir();
    try {
      const registryPath = path.join(dir, 'guardrail-candidates.jsonl');
      fs.writeFileSync(registryPath, '{"candidate_key":"a"}\nnot-json\n', 'utf8');
      const rows = loadHealthCandidates(registryPath);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].candidate_key, 'a');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('optionally merges telemetry-derived candidates', () => {
    const dir = createTempDir();
    try {
      const registryPath = path.join(dir, 'guardrail-candidates.jsonl');
      writeRegistry(registryPath, [{
        candidate_key: 'registry::candidate',
        failure_pattern: 'manual_registry_pattern',
        recommended_layer: 'docs',
        captured_at: '2026-04-15T00:00:00.000Z',
      }]);

      const jsonLogs = seedJsonLogs(dir);

      const rows = loadHealthCandidates(registryPath, {
        includeTelemetry: true,
        ...jsonLogs,
      });
      // plan_missing_or_skipped was retired 2026-08-19, and the two bridge
      // observability detectors 2026-08-20 (see telemetry-health.js).
      assert.strictEqual(rows.length, 2);
      assert.ok(rows.some(row => row.failure_pattern === 'manual_registry_pattern'));
      assert.ok(rows.some(row => row.failure_pattern === 'resume_failed'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  console.log('\ngroupHealthCandidates:');

  if (test('groups repeated candidate keys', () => {
    const groups = groupHealthCandidates([
      { candidate_key: 'a', captured_at: '2026-04-14T00:00:00.000Z' },
      { candidate_key: 'a', captured_at: '2026-04-15T00:00:00.000Z' },
      { candidate_key: 'b', captured_at: '2026-04-15T01:00:00.000Z' },
    ]);
    assert.strictEqual(groups.length, 2);
    assert.strictEqual(groups[0].count, 2);
    assert.strictEqual(groups[0].candidate_key, 'a');
    assert.strictEqual(groups[0].first_seen, '2026-04-14T00:00:00.000Z');
    assert.strictEqual(groups[0].last_seen, '2026-04-15T00:00:00.000Z');
    assert.strictEqual(groups[0].provenance, 'artifact');
  })) passed++; else failed++;

  if (test('marks telemetry-derived groups with telemetry provenance', () => {
    const groups = groupHealthCandidates([
      {
        candidate_key: 'telemetry::a',
        source: 'telemetry:session_started',
        captured_at: '2026-04-15T00:00:00.000Z',
      },
    ]);
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].provenance, 'telemetry');
  })) passed++; else failed++;

  console.log('\nclassifyHealthGroup:');

  if (test('classifies a single recent sighting as new', () => {
    const state = classifyHealthGroup({
      count: 1,
      first_seen: '2026-04-15T00:00:00.000Z',
      last_seen: '2026-04-15T00:00:00.000Z',
      entries: [],
    }, { now: '2026-04-15T12:00:00.000Z' });
    assert.strictEqual(state, 'new');
  })) passed++; else failed++;

  if (test('classifies a recent repeated group as recurring', () => {
    const state = classifyHealthGroup({
      count: 2,
      first_seen: '2026-04-14T00:00:00.000Z',
      last_seen: '2026-04-15T00:00:00.000Z',
      entries: [],
    }, { now: '2026-04-15T12:00:00.000Z' });
    assert.strictEqual(state, 'recurring');
  })) passed++; else failed++;

  if (test('classifies a frequent recent group as promotion-ready', () => {
    const state = classifyHealthGroup({
      count: 3,
      first_seen: '2026-04-13T00:00:00.000Z',
      last_seen: '2026-04-15T00:00:00.000Z',
      entries: [],
    }, { now: '2026-04-15T12:00:00.000Z' });
    assert.strictEqual(state, 'promotion-ready');
  })) passed++; else failed++;

  if (test('classifies an old untouched group as stale', () => {
    const state = classifyHealthGroup({
      count: 2,
      first_seen: '2026-03-20T00:00:00.000Z',
      last_seen: '2026-03-25T00:00:00.000Z',
      entries: [],
    }, { now: '2026-04-15T12:00:00.000Z' });
    assert.strictEqual(state, 'stale');
  })) passed++; else failed++;

  if (test('classifies a group with explicit resolution metadata as resolved', () => {
    const state = classifyHealthGroup({
      count: 2,
      first_seen: '2026-04-10T00:00:00.000Z',
      last_seen: '2026-04-12T00:00:00.000Z',
      entries: [{ status: 'resolved' }],
    }, { now: '2026-04-15T12:00:00.000Z' });
    assert.strictEqual(state, 'resolved');
  })) passed++; else failed++;

  console.log('\nsummarizeHealthLoop:');

  if (test('summarizes groups ordered by recency and frequency', () => {
    const summary = summarizeHealthLoop([
      { candidate_key: 'alpha', captured_at: '2026-04-15T02:00:00.000Z' },
      { candidate_key: 'alpha', captured_at: '2026-04-15T03:00:00.000Z' },
      { candidate_key: 'beta', captured_at: '2026-04-15T04:00:00.000Z' },
      { candidate_key: 'gamma', captured_at: '2026-04-01T00:00:00.000Z' },
      { candidate_key: 'gamma', captured_at: '2026-04-02T00:00:00.000Z' },
      { candidate_key: 'gamma', captured_at: '2026-04-03T00:00:00.000Z' },
    ], { now: '2026-04-15T12:00:00.000Z' });

    assert.strictEqual(summary.totalEntries, 6);
    assert.strictEqual(summary.totalGroups, 3);
    assert.ok(summary.byState['promotion-ready'] >= 1);
    assert.strictEqual(summary.groups[0].candidate_key, 'beta');
    assert.strictEqual(summary.groups[1].candidate_key, 'alpha');
  })) passed++; else failed++;

  console.log('\nsummarizeCurrentHealth / formatHealthStatus:');

  if (test('returns summarized health from registry and telemetry', () => {
    const dir = createTempDir();
    try {
      const registryPath = path.join(dir, 'guardrail-candidates.jsonl');
      writeRegistry(registryPath, [{
        candidate_key: 'registry::candidate',
        failure_pattern: 'manual_registry_pattern',
        recommended_layer: 'docs',
        captured_at: '2026-04-15T00:00:00.000Z',
      }]);

      const summary = summarizeCurrentHealth({
        registryPath,
        ...seedJsonLogs(dir),
      });
      assert.strictEqual(summary.totalEntries, 2);
      assert.ok(summary.totalGroups >= 2);

      const formatted = formatHealthStatus(summary, { limit: 2 });
      assert.ok(formatted.includes('Health Status'));
      assert.ok(formatted.includes('total_entries=2'));
      assert.ok(formatted.includes('Top groups:'));
      assert.ok(formatted.includes('provenance='));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  // The two bridge observability detectors were retired 2026-08-20 rather than
  // moved to JSON. bridge_mode='manual' was never recorded once in the whole
  // telemetry history, and the companion branch needed plan_present=1 (retired
  // 2026-08-17) plus zero tool_executions -- which Phase 1 made permanently
  // true, so it fired on runs where all three gates were present.

  if (test('telemetry candidates carry their provenance', () => {
    const dir = createTempDir();
    try {
      const summary = summarizeCurrentHealth({
        registryPath: path.join(dir, 'guardrail-candidates.jsonl'),
        ...seedJsonLogs(dir),
      });
      assert.ok(summary.groups.some(group => group.failure_pattern === 'resume_failed'));
      const formatted = formatHealthStatus(summary, { limit: 5 });
      assert.ok(formatted.includes('provenance=telemetry'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('default guardrail registry path points under ~/.claude/.state', () => {
    const registryPath = getDefaultGuardrailRegistryPath();
    assert.ok(registryPath.endsWith(path.join('.claude', 'harness/data/state', 'guardrail-candidates.jsonl')));
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
