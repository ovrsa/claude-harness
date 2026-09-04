/**
 * Tests for scripts/lib/pipeline-evidence.js
 *
 * Run with: node tests/lib/pipeline-evidence.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  findLatestPipelineEvidence,
} = require('../../scripts/lib/pipeline-evidence');

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-evidence-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeRun(home, runId, meta, events = []) {
  const runDir = path.join(home, '.claude', 'runs', runId);
  fs.mkdirSync(path.join(runDir, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'meta.json'), `${JSON.stringify({ run_id: runId, ...meta }, null, 2)}\n`);
  fs.writeFileSync(
    path.join(runDir, 'logs', 'events.ndjson'),
    events.map(event => JSON.stringify(event)).join('\n')
  );
}

function runTests() {
  console.log('\n=== Testing pipeline-evidence.js ===\n');

  let passed = 0;
  let failed = 0;

  if (test('returns missing when no run evidence exists', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      fs.mkdirSync(repo, { recursive: true });
      const result = findLatestPipelineEvidence(repo, { homeDir: dir });
      assert.strictEqual(result.found, false);
      assert.ok(result.reason.includes('pipeline evidence'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('detects matching repo run evidence', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      fs.mkdirSync(repo, { recursive: true });
      writeRun(dir, 'run-001', {
        repo_root: repo,
        status: 'done',
        workflow: 'standard-development',
        current_step: 'verify',
        updated_at: '2026-05-14T01:00:00.000Z',
      }, [
        { type: 'run_started', occurred_at: '2026-05-14T00:59:00.000Z' },
      ]);

      const result = findLatestPipelineEvidence(repo, { homeDir: dir });
      assert.strictEqual(result.found, true);
      assert.strictEqual(result.run.run_id, 'run-001');
      assert.strictEqual(result.run.status, 'done');
      assert.strictEqual(result.run.workflow, 'standard-development');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('ignores run evidence for other repos', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const otherRepo = path.join(dir, 'other');
      fs.mkdirSync(repo, { recursive: true });
      fs.mkdirSync(otherRepo, { recursive: true });
      writeRun(dir, 'run-other', {
        repo_root: otherRepo,
        status: 'done',
        updated_at: '2026-05-14T01:00:00.000Z',
      }, [
        { type: 'run_started' },
      ]);

      const result = findLatestPipelineEvidence(repo, { homeDir: dir });
      assert.strictEqual(result.found, false);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('ignores malformed metadata and event files', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      fs.mkdirSync(repo, { recursive: true });
      const badRunDir = path.join(dir, '.claude', 'runs', 'bad-run');
      fs.mkdirSync(path.join(badRunDir, 'logs'), { recursive: true });
      fs.writeFileSync(path.join(badRunDir, 'meta.json'), '{not json');
      fs.writeFileSync(path.join(badRunDir, 'logs', 'events.ndjson'), 'not json\n');
      writeRun(dir, 'run-good', {
        repo_root: repo,
        status: 'running',
        updated_at: '2026-05-14T02:00:00.000Z',
      }, [
        { type: 'run_started' },
      ]);

      const result = findLatestPipelineEvidence(repo, { homeDir: dir });
      assert.strictEqual(result.found, true);
      assert.strictEqual(result.run.run_id, 'run-good');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('selects the newest matching run by updated_at', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      fs.mkdirSync(repo, { recursive: true });
      writeRun(dir, 'run-old', {
        repo_root: repo,
        status: 'blocked',
        updated_at: '2026-05-14T01:00:00.000Z',
      }, [
        { type: 'run_started' },
      ]);
      writeRun(dir, 'run-new', {
        repo_root: repo,
        status: 'done',
        current_step: 'verify',
        updated_at: '2026-05-14T03:00:00.000Z',
      }, [
        { type: 'run_started' },
      ]);

      const result = findLatestPipelineEvidence(repo, { homeDir: dir });
      assert.strictEqual(result.found, true);
      assert.strictEqual(result.run.run_id, 'run-new');
      assert.strictEqual(result.run.status, 'done');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
