/**
 * Tests for scripts/lib/harness-status.js
 *
 * Run with: node tests/lib/harness-status.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  summarizeHarnessStatus,
  formatHarnessStatus,
  summarizeTaskQueue,
} = require('../../scripts/lib/harness-status');

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-status-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function git(repo, args) {
  return execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function initRepo(dir) {
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ['init']);
  fs.writeFileSync(path.join(repo, 'README.md'), '# Test\n');
  git(repo, ['add', 'README.md']);
  git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'Initial commit']);
  return repo;
}

function commitAll(repo, message) {
  git(repo, ['add', '.']);
  git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', message]);
}

function writeFile(repo, name, content) {
  fs.writeFileSync(path.join(repo, name), content);
}

function writeCompleteArtifacts(repo, nextAction = 'Observe warning frequency before tightening enforcement.') {
  writeFile(repo, 'research.md', '# Research\n\n- done\n');
  writeFile(repo, 'plan.md', [
    '---',
    'status: approved',
    'task_type: non_trivial',
    'worktree_required: true',
    'review_required: true',
    'observe_required: false',
    '---',
    '',
    '# Plan',
    '',
    '## Summary',
    '- Build a status surface.',
    '',
    '## Acceptance Criteria',
    '- Reports next action.',
    '',
    '## Touched Files',
    '- scripts/lib/harness-status.js',
    '',
    '## Behavior Spec',
    '- Given a clean verified lifecycle',
    '- When status is requested',
    '- Then it reports the next action',
    '- normal: clean verified lifecycle',
    '- boundary: missing remote',
    '- abnormal: lifecycle blocker',
    '',
    '## Verify',
    '- node tests/lib/harness-status.test.js',
    '',
    '## Test Evidence Plan',
    '- RED command: node tests/lib/harness-status.test.js',
    '- expected failure: status surface missing',
    '- GREEN command: node tests/lib/harness-status.test.js',
    '',
    '## Evaluate',
    '- Review output priority.',
    '',
    '## Observe',
    '- required: no',
    '',
    '## Execution Todo',
    '- [x] implement',
    '',
  ].join('\n'));
  writeFile(repo, 'progress.md', [
    '# Progress',
    '',
    '## Current Phase',
    '- Ready to continue',
    '',
    '## Last Completed Step',
    '- Completed verification and review',
    '',
    '## Next Action',
    `- ${nextAction}`,
    '',
    '## Blockers',
    '- none',
    '',
    '## Delegated Work',
    '- none',
    '',
  ].join('\n'));
  writeFile(repo, 'verification-summary.md', [
    '# Verification Summary',
    '',
    '## Scope',
    '- harness status',
    '',
    '## Commands Run',
    '- node tests/lib/harness-status.test.js: pass',
    '',
    '## Verification Outcome',
    '- pass',
    '',
    '## Assessment',
    '- verified',
    '',
  ].join('\n'));
  writeFile(repo, 'review-summary.md', [
    '# Review Summary',
    '',
    '## Review Scope',
    '- harness status behavior',
    '',
    '## Findings',
    '- none',
    '',
    '## Residual Risks',
    '- none',
    '',
    '## Next Action',
    '- none',
    '',
  ].join('\n'));
  commitAll(repo, 'Add lifecycle artifacts');
}

function writeRun(home, repo, runId) {
  const runDir = path.join(home, '.claude', 'runs', runId);
  fs.mkdirSync(path.join(runDir, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'meta.json'), `${JSON.stringify({
    run_id: runId,
    repo_root: repo,
    status: 'done',
    workflow: 'standard-development',
    current_step: 'verify',
    updated_at: '2026-05-14T01:00:00.000Z',
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(runDir, 'logs', 'events.ndjson'), `${JSON.stringify({ type: 'pipeline_started' })}\n`);
}

function runTests() {
  console.log('\n=== Testing harness-status.js library ===\n');

  let passed = 0;
  let failed = 0;

  if (test('recommends progress next action for clean verified lifecycle', () => {
    const dir = createTempDir();
    try {
      const repo = initRepo(dir);
      writeCompleteArtifacts(repo, 'Tighten the next guardrail after observation.');
      writeRun(dir, repo, 'run-ready');

      const summary = summarizeHarnessStatus({ repoRoot: repo, homeDir: dir });
      assert.strictEqual(summary.status, 'READY');
      assert.strictEqual(summary.repo.workingTree, 'clean');
      assert.strictEqual(summary.lifecycle.currentStepId, 'complete');
      assert.strictEqual(summary.pipeline.found, true);
      assert.ok(summary.recommendedAction.includes('Tighten the next guardrail'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('dirty working tree takes priority over other recommendations', () => {
    const dir = createTempDir();
    try {
      const repo = initRepo(dir);
      writeCompleteArtifacts(repo);
      fs.writeFileSync(path.join(repo, 'dirty.txt'), 'changed\n');

      const summary = summarizeHarnessStatus({ repoRoot: repo, homeDir: dir });
      assert.strictEqual(summary.status, 'NEEDS_ACTION');
      assert.strictEqual(summary.repo.workingTree, 'dirty');
      assert.ok(summary.recommendedAction.includes('Review the current working tree'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('lifecycle blockers report blocked status', () => {
    const dir = createTempDir();
    try {
      const repo = initRepo(dir);
      writeFile(repo, 'plan.md', [
        '---',
        'status: draft',
        'task_type: non_trivial',
        '---',
        '',
        '# Plan',
      ].join('\n'));
      commitAll(repo, 'Add draft plan');

      const summary = summarizeHarnessStatus({ repoRoot: repo, homeDir: dir });
      assert.strictEqual(summary.status, 'BLOCKED');
      assert.ok(summary.lifecycle.blocked.includes('plan.md status=draft'));
      assert.ok(summary.recommendedAction.includes('Resolve lifecycle blocker'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('task queue blocked state is surfaced before new work', () => {
    const dir = createTempDir();
    try {
      const repo = initRepo(dir);
      writeCompleteArtifacts(repo);
      writeRun(dir, repo, 'run-ready');
      const claudeDir = path.join(dir, '.claude');
      fs.mkdirSync(path.join(claudeDir, 'tasks'), { recursive: true });
      fs.writeFileSync(path.join(claudeDir, 'tasks', 'index.json'), `${JSON.stringify({
        version: 1,
        tasks: [
          { task_id: 'task-1', title: 'Fix blocked run', status: 'blocked', current_run_id: 'run-1' },
        ],
      }, null, 2)}\n`);

      const summary = summarizeHarnessStatus({ repoRoot: repo, homeDir: dir });
      assert.strictEqual(summary.status, 'BLOCKED');
      assert.strictEqual(summary.taskQueue.blocked.length, 1);
      assert.ok(summary.recommendedAction.includes('Inspect blocked task task-1'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('missing task queue index is non-fatal', () => {
    const dir = createTempDir();
    try {
      const queue = summarizeTaskQueue({ homeDir: dir });
      assert.strictEqual(queue.present, false);
      assert.strictEqual(queue.total, 0);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('formats concise text output', () => {
    const dir = createTempDir();
    try {
      const repo = initRepo(dir);
      writeCompleteArtifacts(repo);
      const output = formatHarnessStatus(summarizeHarnessStatus({ repoRoot: repo, homeDir: dir }));
      assert.ok(output.includes('HARNESS STATUS: READY'));
      assert.ok(output.includes('Recommended next action:'));
      assert.ok(output.includes('Secondary actions:'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
