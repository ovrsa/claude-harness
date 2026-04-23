/**
 * Tests for scripts/pipeline-runner.js
 *
 * Run with: node tests/scripts/pipeline-runner.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'pipeline-runner.js');
const SESSION_TRACE_PATH = path.join(__dirname, '..', '..', 'scripts', 'lib', 'session-trace');

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runner-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function initRepo(repoRoot) {
  fs.mkdirSync(repoRoot, { recursive: true });
  spawnSync('git', ['init'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'ignore', 'ignore'],
  });
}

function writePlan(filePath, options = {}) {
  const status = options.status || 'approved';
  const extra = options.extra || '';
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, [
    '---',
    `title: ${options.title || 'runner test plan'}`,
    `status: ${status}`,
    'task_type: non_trivial',
    'review_required: true',
    'observe_required: false',
    '---',
    '',
    '# Plan',
    '',
    '## Summary',
    '- implement runner preflight',
    '',
    '## Acceptance Criteria',
    '- runner reports status',
    '',
    '## Touched Files',
    '- scripts/pipeline-runner.js',
    '',
    '## Behavior Spec',
    '- Given an approved plan',
    '- When the runner is invoked',
    '- Then it reports readiness',
    '- normal: approved plan',
    '- boundary: heavy-risky approval',
    '- abnormal: missing plan',
    '',
    '## Verify',
    '- node tests/scripts/pipeline-runner.test.js',
    '',
    '## Test Evidence Plan',
    '- RED command: node tests/scripts/pipeline-runner.test.js',
    '- expected failure: runner missing',
    '- GREEN command: node tests/scripts/pipeline-runner.test.js',
    '',
    '## Evaluate',
    '- review summary exists',
    '',
    '## Observe',
    '- required: no',
    '',
    '## Execution Todo',
    '- [ ] add runner',
    extra,
  ].join('\n'));
}

function run(args = [], env = {}) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });
  return {
    code: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function readTelemetryEvents(homeDir) {
  const dbPath = path.join(homeDir, '.claude', 'telemetry', 'telemetry.db');
  const { createDatabase } = require(SESSION_TRACE_PATH);
  const db = createDatabase(dbPath);
  const rows = db.prepare(`
    SELECT event_type, status, metadata_json
    FROM session_events
    WHERE event_type LIKE 'pipeline_%'
    ORDER BY id ASC
  `).all();
  db.close();
  return rows.map(row => ({
    ...row,
    metadata: JSON.parse(row.metadata_json),
  }));
}

function runTests() {
  console.log('\n=== Testing pipeline-runner.js ===\n');

  let passed = 0;
  let failed = 0;

  if (test('reports READY for approved standard plan', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const home = path.join(dir, 'home');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--task-id', 'runner-ready',
      ], { HOME: home, CLAUDE_SESSION_ID: 'runner-ready-session' });

      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: READY'));
      assert.ok(result.stdout.includes('Track:       standard'));
      assert.ok(result.stdout.includes('Engine:      Superpowers'));
      assert.ok(result.stdout.includes('Preflight:   pass'));
      assert.ok(result.stdout.includes('Execution:   not-run'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('blocks when plan file is missing', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      initRepo(repo);

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'missing-plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-missing-plan' });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: BLOCKED'));
      assert.ok(result.stdout.includes('plan file is missing'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('blocks when plan is not approved', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'), { status: 'draft' });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-draft-plan' });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: BLOCKED'));
      assert.ok(result.stdout.includes('plan is not approved'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('blocks invalid track', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'medium',
        '--runtime', 'codex',
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-invalid-track' });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: BLOCKED'));
      assert.ok(result.stdout.includes('invalid track'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('requires explicit approval for heavy-risky track', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'heavy-risky',
        '--runtime', 'codex',
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-heavy' });

      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: NEEDS_DECISION'));
      assert.ok(result.stdout.includes('heavy-risky work requires explicit approval'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('requires decision for permission-sensitive plan text', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'), {
        extra: [
          '',
          '## Release',
          '- push the branch and create PR after verification',
        ].join('\n'),
      });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-sensitive' });

      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: NEEDS_DECISION'));
      assert.ok(result.stdout.includes('permission-sensitive action requires authorization'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('records pipeline telemetry events', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const home = path.join(dir, 'home');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--task-id', 'telemetry-task',
      ], { HOME: home, CLAUDE_SESSION_ID: 'runner-telemetry' });

      assert.strictEqual(result.code, 0);
      const events = readTelemetryEvents(home);
      assert.deepStrictEqual(events.map(event => event.event_type), [
        'pipeline_started',
        'pipeline_preflight_completed',
      ]);
      assert.strictEqual(events[0].metadata.task_id, 'telemetry-task');
      assert.strictEqual(events[1].status, 'ready');
      assert.strictEqual(events[1].metadata.track, 'standard');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
