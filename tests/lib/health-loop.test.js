/**
 * Tests for scripts/lib/health-loop.js
 *
 * Run with: node tests/lib/health-loop.test.js
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
const {
  recordSessionEvent,
} = require('../../scripts/lib/session-trace');

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
      const dbPath = path.join(dir, 'telemetry.db');
      const registryPath = path.join(dir, 'guardrail-candidates.jsonl');
      writeRegistry(registryPath, [{
        candidate_key: 'registry::candidate',
        failure_pattern: 'manual_registry_pattern',
        recommended_layer: 'docs',
        captured_at: '2026-04-15T00:00:00.000Z',
      }]);

      recordSessionEvent({
        sessionId: 'session-telemetry',
        runId: 'run-telemetry',
        occurredAt: '2026-04-17T00:00:00.000Z',
        eventType: 'session_started',
        status: 'started',
        repoRoot: '/tmp/repo',
        cwd: '/tmp/repo',
        metadata: { resume_success: false },
      }, { dbPath });

      const rows = loadHealthCandidates(registryPath, {
        includeTelemetry: true,
        dbPath,
      });
      assert.strictEqual(rows.length, 3);
      assert.ok(rows.some(row => row.failure_pattern === 'manual_registry_pattern'));
      assert.ok(rows.some(row => row.failure_pattern === 'resume_failed'));
      assert.ok(rows.some(row => row.failure_pattern === 'plan_missing_or_skipped'));
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
      const dbPath = path.join(dir, 'telemetry.db');
      const registryPath = path.join(dir, 'guardrail-candidates.jsonl');
      writeRegistry(registryPath, [{
        candidate_key: 'registry::candidate',
        failure_pattern: 'manual_registry_pattern',
        recommended_layer: 'docs',
        captured_at: '2026-04-15T00:00:00.000Z',
      }]);

      recordSessionEvent({
        sessionId: 'session-health',
        runId: 'run-health',
        occurredAt: '2026-04-17T00:00:00.000Z',
        eventType: 'session_started',
        status: 'started',
        repoRoot: '/tmp/repo',
        cwd: '/tmp/repo',
        metadata: { resume_success: false },
      }, { dbPath });

      const summary = summarizeCurrentHealth({
        registryPath,
        dbPath,
      });
      assert.strictEqual(summary.totalEntries, 3);
      assert.ok(summary.totalGroups >= 2);

      const formatted = formatHealthStatus(summary, { limit: 2 });
      assert.ok(formatted.includes('Health Status'));
      assert.ok(formatted.includes('total_entries=3'));
      assert.ok(formatted.includes('Top groups:'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('default guardrail registry path points under ~/.claude/.state', () => {
    const registryPath = getDefaultGuardrailRegistryPath();
    assert.ok(registryPath.endsWith(path.join('.claude', '.state', 'guardrail-candidates.jsonl')));
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
