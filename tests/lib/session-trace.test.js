/**
 * Tests for scripts/lib/session-trace.js
 *
 * Run with: node tests/lib/session-trace.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { classifyRunStatus } = require('../../scripts/lib/session-trace');

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'session-trace-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function initRepo(repoRoot) {
  spawnSync('git', ['init'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'ignore', 'ignore'],
  });
}

function runNode(code) {
  const result = spawnSync(process.execPath, ['-e', code], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'node subprocess failed').trim());
  }
  return result.stdout.trim();
}

function runTests() {
  console.log('\n=== Testing session-trace.js ===\n');

  let passed = 0;
  let failed = 0;

  if (test('initializes sqlite schema idempotently with extended tables', () => {
    const dir = createTempDir();
    try {
      const dbPath = path.join(dir, 'telemetry.db');
      const stdout = runNode(`
        const { createDatabase } = require(${JSON.stringify(SESSION_TRACE_PATH)});
        const db = createDatabase(${JSON.stringify(dbPath)});
        db.close();
        const db2 = createDatabase(${JSON.stringify(dbPath)});
        const schema = db2.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get();
        const runState = db2.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='run_state'").get();
        const tools = db2.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tool_executions'").get();
        db2.close();
        console.log(JSON.stringify({ schema, runState, tools }));
      `);
      const payload = JSON.parse(stdout);
      assert.strictEqual(payload.schema.value, '2');
      assert.ok(payload.runState, 'run_state table should exist');
      assert.ok(payload.tools, 'tool_executions table should exist');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('records lifecycle snapshot into run_state and resume query', () => {
    const dir = createTempDir();
    try {
      const repoRoot = path.join(dir, 'repo');
      fs.mkdirSync(repoRoot, { recursive: true });
      initRepo(repoRoot);
      const dbPath = path.join(dir, 'telemetry.db');

      writeFile(path.join(repoRoot, 'plan.md'), [
        '---',
        'title: sqlite memory migration',
        'status: approved',
        'task_type: non_trivial',
        'review_required: true',
        'observe_required: false',
        '---',
        '',
        '# Plan',
      ].join('\n'));
      writeFile(path.join(repoRoot, 'progress.md'), [
        '# Progress',
        '',
        '## Current Phase',
        '- Phase 2: wire the SQLite runtime state',
        '',
        '## Last Completed Step',
        '- Added the session-trace schema',
        '',
        '## Next Action',
        '- Update SessionStart to read persisted state',
        '',
        '## Blockers',
        '- none',
        '',
        '## Delegated Work',
        '- none',
        '',
        '## Latest Checkpoint',
        '- updated_at=2026-04-17 12:00:00',
        '- event=schema-added',
        '- current_phase=Phase 2: wire the SQLite runtime state',
        '- last_completed_step=Added the session-trace schema',
        '- suggested_next_action=Update SessionStart to read persisted state',
        '- blockers=none',
        '- delegated_work=none',
      ].join('\n'));
      writeFile(path.join(repoRoot, 'verification-summary.md'), [
        '# Verification Summary',
        '',
        '## Scope',
        '- session trace',
        '',
        '## Commands Run',
        '- node .claude/tests/lib/session-trace.test.js',
        '',
        '## Verification Outcome',
        '- pass',
        '',
        '## Assessment',
        '- ready',
      ].join('\n'));
      writeFile(path.join(repoRoot, 'review-summary.md'), [
        '# Review Summary',
        '',
        '## Review Scope',
        '- session trace',
        '',
        '## Findings',
        '- none',
        '',
        '## Residual Risks',
        '- none',
        '',
        '## Next Action',
        '- none',
      ].join('\n'));

      const stdout = runNode(`
        const { createDatabase, recordLifecycleSnapshot, getLatestRunState, formatResumeState } = require(${JSON.stringify(SESSION_TRACE_PATH)});
        recordLifecycleSnapshot({
          sessionId: 'session-2',
          runId: 'run-2',
          repoRoot: ${JSON.stringify(repoRoot)},
          cwd: ${JSON.stringify(repoRoot)},
          includeArtifactContextLoaded: true,
          humanInterventionCount: 1,
        }, { dbPath: ${JSON.stringify(dbPath)} });
        const state = getLatestRunState({ repoRoot: ${JSON.stringify(repoRoot)}, dbPath: ${JSON.stringify(dbPath)} });
        const db = createDatabase(${JSON.stringify(dbPath)});
        const runState = db.prepare("SELECT * FROM run_state WHERE run_id = 'run-2'").get();
        const verificationRows = db.prepare("SELECT COUNT(*) AS count FROM verification_results WHERE run_id = 'run-2'").get();
        const reviewRows = db.prepare("SELECT COUNT(*) AS count FROM review_findings WHERE run_id = 'run-2'").get();
        db.close();
        console.log(JSON.stringify({ state, runState, verificationRows, reviewRows, resume: formatResumeState(state) }));
      `);
      const payload = JSON.parse(stdout);
      assert.strictEqual(payload.state.currentPhase, 'Phase 2: wire the SQLite runtime state');
      assert.strictEqual(payload.state.nextAction, 'Update SessionStart to read persisted state');
      assert.strictEqual(payload.runState.plan_status, 'approved');
      assert.ok(payload.verificationRows.count >= 1, 'verification results should be recorded');
      assert.ok(payload.reviewRows.count >= 1, 'review findings should be recorded');
      assert.ok(payload.resume.includes('next_action=Update SessionStart to read persisted state'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('records tool execution rows for pre and post phases', () => {
    const dir = createTempDir();
    try {
      const dbPath = path.join(dir, 'telemetry.db');
      const stdout = runNode(`
        const { createDatabase, recordToolExecution } = require(${JSON.stringify(SESSION_TRACE_PATH)});
        recordToolExecution({
          sessionId: 'session-3',
          runId: 'run-3',
          repoRoot: '/tmp/repo',
          cwd: '/tmp/repo',
          toolName: 'Bash',
          toolInput: { command: 'node .claude/tests/run-all.js' },
          phase: 'started',
          status: 'started',
        }, { dbPath: ${JSON.stringify(dbPath)} });
        recordToolExecution({
          sessionId: 'session-3',
          runId: 'run-3',
          repoRoot: '/tmp/repo',
          cwd: '/tmp/repo',
          toolName: 'Bash',
          toolInput: { command: 'node .claude/tests/run-all.js' },
          phase: 'completed',
          status: 'completed',
        }, { dbPath: ${JSON.stringify(dbPath)} });
        const db = createDatabase(${JSON.stringify(dbPath)});
        const rows = db.prepare("SELECT phase, status, tool_name FROM tool_executions WHERE run_id = 'run-3' ORDER BY id ASC").all();
        db.close();
        console.log(JSON.stringify(rows));
      `);
      const rows = JSON.parse(stdout);
      assert.strictEqual(rows.length, 2);
      assert.strictEqual(rows[0].phase, 'started');
      assert.strictEqual(rows[1].phase, 'completed');
      assert.strictEqual(rows[0].tool_name, 'Bash');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('classifies completed runs conservatively', () => {
    const clean = classifyRunStatus({
      planStatus: 'approved',
      blocked: [],
      hasVerification: true,
      reviewRequired: true,
      hasReview: true,
      observeRequired: false,
      hasObservation: false,
    }, 0);
    const blocked = classifyRunStatus({
      planStatus: 'approved',
      blocked: ['missing verification-summary.md'],
      hasVerification: false,
      reviewRequired: false,
      hasReview: false,
      observeRequired: false,
      hasObservation: false,
    }, 0);

    assert.strictEqual(clean, 'completed_clean');
    assert.strictEqual(blocked, 'blocked_after_plan');
  })) passed++; else failed++;

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
