/**
 * Tests for harness/scripts/lib/harness-status.js
 *
 * Run with: node harness/tests/lib/harness-status.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// harness/data/runs/ は git 追跡なので、テストが実リポジトリの run 記録に
// フィクスチャを混ぜないようにする（harness/scripts/lib/run-record.js）。
process.env.CLAUDE_DISABLE_RUN_RECORD = '1';

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
  writeFile(repo, 'verification-summary.md', [
    '# Verification Summary',
    '',
    '## Scope',
    '- harness status',
    '',
    '## Commands Run',
    '- node harness/tests/lib/harness-status.test.js: pass',
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
    '## Design Compliance',
    '- matches the design doc',
    '',
    '## Security',
    '- no decision boundary touched',
    '',
    '## Comment Adequacy',
    '- unchanged',
    '',
    '## Code Quality',
    '- acceptable',
    '',
    '## Test Adequacy',
    '- covered',
    '',
    '## Findings',
    '- none',
    '',
    '## Residual Risks',
    '- none',
    '',
    '## Guardrail Candidates',
    '- none',
    '',
    '## Next Action',
    `- ${nextAction}`,
    '',
  ].join('\n'));
  // observation is owed whenever verification exists (2026-08-20). plan.md's
  // `observe_required: false` used to opt out of it; that field went with the file.
  writeFile(repo, 'observation-summary.md', [
    '# Observation Summary',
    '',
    '## Behavior Checked',
    '- the status surface output',
    '',
    '## Method',
    '- ran the command and read stdout',
    '',
    '## Evidence',
    '- stdout listed the lifecycle chain',
    '',
    '## Remaining Uncertainty',
    '- none',
    '',
  ].join('\n'));
  commitAll(repo, 'Add lifecycle artifacts');
}

function writeRun(home, repo, runId) {
  const runDir = path.join(home, '.claude', 'harness/data/runs', runId);
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

  if (test('reports READY for a clean verified lifecycle', () => {
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
      // 次の動作は run 記録の review 証拠から読む。フィクスチャは持たないので既定文言に落ちる。
      assert.ok(summary.recommendedAction.includes('Continue with the next'));
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
      // Was `plan.md status=draft`. plan.md is no longer scanned (2026-08-20);
      // an incomplete gate artifact is what blocks now.
      writeFile(repo, 'verification-summary.md', [
        '# Verification Summary',
        '',
        '## Scope',
        '- the change',
        '',
        '## Commands Run',
        '- none yet',
        '',
        '## Verification Outcome',
        '',
        '## Assessment',
        '',
      ].join('\n'));
      commitAll(repo, 'Add incomplete verification');

      const summary = summarizeHarnessStatus({ repoRoot: repo, homeDir: dir });
      assert.strictEqual(summary.status, 'BLOCKED');
      assert.ok(
        summary.lifecycle.blocked.some(entry => entry.startsWith('incomplete verification-summary.md')),
        JSON.stringify(summary.lifecycle.blocked)
      );
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

  if (test('the next action comes from the run record, not SQLite', () => {
    const dir = createTempDir();
    try {
      const repo = initRepo(dir);
      writeCompleteArtifacts(repo);
      writeRun(dir, repo, 'run-ready');

      // run_state.next_action was filled from progress.md, retired 2026-08-17.
      // Every row written since is empty; the last non-empty one is dated
      // 2026-08-17T06:55. review-summary.md's "## Next Action" is written by
      // hand and survives in evidence/review.json.
      const runsDir = path.join(dir, 'harness/data/runs');
      const runDir = path.join(runsDir, '2026-08-20-my-task');
      fs.mkdirSync(path.join(runDir, 'evidence'), { recursive: true });
      fs.writeFileSync(
        path.join(runDir, 'meta.json'),
        `${JSON.stringify({
          run_id: '2026-08-20-my-task',
          repo_root: repo,
          branch: 'worktree-my-task',
          started_at: '2026-08-20T00:00:00.000Z',
          updated_at: '2026-08-20T01:00:00.000Z',
        }, null, 2)}\n`
      );
      fs.writeFileSync(
        path.join(runDir, 'evidence', 'review.json'),
        `${JSON.stringify({
          kind: 'review',
          captured_at: '2026-08-20T01:00:00.000Z',
          body: '# Review\n',
          state: { complete: true, parsedFindings: [], nextAction: 'Merge the branch and remove the worktree.' },
        }, null, 2)}\n`
      );

      const summary = summarizeHarnessStatus({ repoRoot: repo, homeDir: dir, runsDir });
      assert.strictEqual(summary.runtime.present, true);
      assert.strictEqual(summary.runtime.state.runId, '2026-08-20-my-task');
      assert.strictEqual(summary.runtime.state.nextAction, 'Merge the branch and remove the worktree.');
      assert.ok(
        summary.recommendedAction.includes('Merge the branch'),
        `expected the run record's next action, got: ${summary.recommendedAction}`
      );
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('a run record for a different repository is not picked up', () => {
    const dir = createTempDir();
    try {
      const repo = initRepo(dir);
      writeCompleteArtifacts(repo);
      writeRun(dir, repo, 'run-ready');

      const runsDir = path.join(dir, 'harness/data/runs');
      const runDir = path.join(runsDir, '2026-08-20-elsewhere');
      fs.mkdirSync(path.join(runDir, 'evidence'), { recursive: true });
      fs.writeFileSync(
        path.join(runDir, 'meta.json'),
        `${JSON.stringify({ run_id: '2026-08-20-elsewhere', repo_root: '/some/other/repo', started_at: '2026-08-20T00:00:00.000Z' }, null, 2)}\n`
      );
      fs.writeFileSync(
        path.join(runDir, 'evidence', 'review.json'),
        `${JSON.stringify({ kind: 'review', body: '#\n', state: { nextAction: 'Do something in the other repo.' } }, null, 2)}\n`
      );

      const summary = summarizeHarnessStatus({ repoRoot: repo, homeDir: dir, runsDir });
      assert.strictEqual(summary.runtime.present, false);
      assert.ok(!summary.recommendedAction.includes('other repo'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('harness-status does not shell out to sqlite3', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/lib/harness-status.js'),
      'utf8'
    );
    // The old query interpolated repoRoot into SQL and depended on the sqlite3
    // binary being on PATH. Both go away with the column it read. Matching on
    // invocation rather than the word: the comment explaining the removal
    // names sqlite3, and a test that forbids the word forbids the explanation.
    assert.ok(!/spawnSync\(\s*'sqlite3'/.test(source), 'harness-status must not invoke sqlite3');
    assert.ok(!/FROM\s+run_state/i.test(source), 'harness-status must not query run_state');
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
