/**
 * Tests for scripts/task-queue.js
 *
 * Run with: node tests/scripts/task-queue.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'task-queue.js');

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'task-queue-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readNdjson(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

// readTaskRun is gone with the task_runs table (2026-08-20). Nothing read that
// table: the queue's own tasks/index.json is the state, and every assertion
// below already checks it.

function initGitRepo(repo) {
  fs.mkdirSync(repo, { recursive: true });
  spawnSync('git', ['init'], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  fs.writeFileSync(path.join(repo, 'README.md'), '# test repo\n');
  spawnSync('git', ['add', 'README.md'], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  spawnSync('git', ['-c', 'user.name=Test User', '-c', 'user.email=test@example.com', 'commit', '-m', 'initial'], {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function writeApprovedPlan(dir) {
  const planPath = path.join(dir, 'plan.md');
  fs.writeFileSync(planPath, [
    '---',
    'title: task queue test plan',
    'status: approved',
    'task_type: non_trivial',
    'review_required: true',
    'observe_required: false',
    '---',
    '',
    '# Plan',
    '',
    '## Summary',
    '- run queued task',
    '',
    '## Acceptance Criteria',
    '- task queue reports final status',
    '',
    '## Touched Files',
    '- scripts/task-queue.js',
    '',
    '## Behavior Spec',
    '- Given an approved queued task',
    '- When the queue runner executes it',
    '- Then the task status is synchronized',
    '- normal: completed task',
    '- boundary: retry from step',
    '- abnormal: blocked workflow',
    '',
    '## Verify',
    '- node tests/scripts/task-queue.test.js',
    '',
    '## Test Evidence Plan',
    '- RED command: node tests/scripts/task-queue.test.js',
    '- expected failure: queue command missing',
    '- GREEN command: node tests/scripts/task-queue.test.js',
    '',
    '## Evaluate',
    '- task run status synced',
    '',
    '## Observe',
    '- required: no',
    '',
    '## Execution Todo',
    '- [ ] implement queue runner',
    '',
  ].join('\n'));
  return planPath;
}

function writeWorkflow(dir, finalCondition = 'verified') {
  const workflowPath = path.join(dir, 'workflow.yaml');
  fs.writeFileSync(workflowPath, [
    'name: queue-test',
    'initial_step: verify',
    'max_steps: 2',
    'steps:',
    '  - name: verify',
    '    mode: readonly',
    '    rules:',
    `      - condition: ${finalCondition}`,
    '        next: COMPLETE',
    '      - condition: blocked',
    '        next: ABORT',
    '',
  ].join('\n'));
  return workflowPath;
}

function writeAdapter(dir, condition = 'verified', exitCode = 0) {
  const adapterPath = path.join(dir, 'adapter.js');
  fs.writeFileSync(adapterPath, [
    '#!/usr/bin/env node',
    `process.stdout.write(JSON.stringify({ condition: ${JSON.stringify(condition)}, status: "complete", summary: "adapter done" }) + "\\n");`,
    `process.exit(${exitCode});`,
    '',
  ].join('\n'));
  fs.chmodSync(adapterPath, 0o755);
  return adapterPath;
}

function writeEnvAdapter(dir, condition = '') {
  const adapterPath = path.join(dir, 'env-adapter.js');
  fs.mkdirSync(path.dirname(adapterPath), { recursive: true });
  fs.writeFileSync(adapterPath, [
    '#!/usr/bin/env node',
    'const fs = require("fs");',
    'const path = require("path");',
    'const marker = process.env.MARKER_PATH;',
    'if (marker) fs.writeFileSync(marker, process.cwd() + "\\n");',
    'const step = process.env.PIPELINE_RUNNER_STEP || "";',
    `if (step === 'evaluate') require(${JSON.stringify(path.resolve(__dirname, '../fixtures/task-finishing.js'))}).writeFinishingEvidence(process.env.PIPELINE_RUNNER_REPO);`,
    'const defaults = { research: "research_complete", plan: "approved", implement: "implementation_complete", review: "approved", finish: "finished", verify: "verified", evaluate: "accepted" };',
    `const condition = ${JSON.stringify(condition)} || defaults[step] || (step.endsWith("_review") ? "approved" : "verified");`,
    'process.stdout.write(JSON.stringify({ condition, status: "complete", summary: "env adapter done" }) + "\\n");',
    '',
  ].join('\n'));
  fs.chmodSync(adapterPath, 0o755);
  return adapterPath;
}

function writeMutatingAdapter(dir) {
  const adapterPath = path.join(dir, 'mutating-adapter.js');
  fs.writeFileSync(adapterPath, [
    '#!/usr/bin/env node',
    'const fs = require("fs");',
    'const path = require("path");',
    'fs.writeFileSync(path.join(process.cwd(), "adapter-output.txt"), "clone write\\n");',
    'process.stdout.write(JSON.stringify({ condition: "verified", status: "complete", summary: process.cwd() }) + "\\n");',
    '',
  ].join('\n'));
  fs.chmodSync(adapterPath, 0o755);
  return adapterPath;
}

function createIsolatedRun({ dir, home, repo, taskId = 'task-managed', runId = 'run-managed' }) {
  const planPath = writeApprovedPlan(dir);
  const workflowPath = writeWorkflow(dir);
  const adapterPath = writeMutatingAdapter(dir);
  run(['add', '--task-id', taskId, '--title', 'Managed task', '--order', 'Run this task'], { HOME: home });
  const result = run([
    'run',
    '--task-id', taskId,
    '--run-id', runId,
    '--repo', repo,
    '--plan', planPath,
    '--workflow', workflowPath,
    '--track', 'standard',
    '--runtime', 'codex',
    '--adapter-command', adapterPath,
  ], { HOME: home });
  assert.strictEqual(result.code, 0, result.stderr);
  return readJson(path.join(home, '.claude', 'runs', runId, 'meta.json'));
}

function runTests() {
  console.log('\n=== Testing task-queue.js ===\n');

  let passed = 0;
  let failed = 0;

  if (test('adds a task into the centralized .claude task index', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const result = run([
        'add',
        '--task-id', 'task-alpha',
        '--title', 'Import TAKT workflow schema',
        '--order', 'Create lifecycle workflow schema and doctor',
      ], { HOME: home });

      assert.strictEqual(result.code, 0, result.stderr);
      assert.ok(result.stdout.includes('TASK QUEUE: ADDED'));

      const claudeDir = path.join(home, '.claude');
      const index = readJson(path.join(claudeDir, 'tasks', 'index.json'));
      assert.strictEqual(index.version, 1);
      assert.strictEqual(index.tasks.length, 1);
      assert.strictEqual(index.tasks[0].task_id, 'task-alpha');
      assert.strictEqual(index.tasks[0].status, 'pending');

      const order = fs.readFileSync(path.join(claudeDir, 'tasks', 'task-alpha', 'order.md'), 'utf8');
      assert.ok(order.includes('Create lifecycle workflow schema and doctor'));
      assert.ok(fs.existsSync(path.join(claudeDir, 'tasks', 'task-alpha', 'attachments')));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('lists queued tasks', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      run(['add', '--task-id', 'task-list', '--title', 'List task', '--order', 'List this task'], { HOME: home });

      const result = run(['list'], { HOME: home });

      assert.strictEqual(result.code, 0, result.stderr);
      assert.ok(result.stdout.includes('TASK QUEUE'));
      assert.ok(result.stdout.includes('task-list'));
      assert.ok(result.stdout.includes('pending'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('lists queued tasks as json', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      run(['add', '--task-id', 'task-json', '--title', 'JSON task', '--order', 'List as json'], { HOME: home });

      const result = run(['list', '--format', 'json'], { HOME: home });

      assert.strictEqual(result.code, 0, result.stderr);
      const parsed = JSON.parse(result.stdout);
      assert.strictEqual(parsed.status, 'LIST');
      assert.strictEqual(parsed.tasks.length, 1);
      assert.strictEqual(parsed.tasks[0].task_id, 'task-json');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('starts a task run and links it to SQLite task_runs', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      fs.mkdirSync(repo, { recursive: true });
      run(['add', '--task-id', 'task-run', '--title', 'Run task', '--order', 'Start this task'], { HOME: home });

      const result = run([
        'start',
        '--task-id', 'task-run',
        '--run-id', 'run-001',
        '--repo', repo,
      ], { HOME: home });

      assert.strictEqual(result.code, 0, result.stderr);
      assert.ok(result.stdout.includes('TASK QUEUE: RUN_CREATED'));

      const claudeDir = path.join(home, '.claude');
      const meta = readJson(path.join(claudeDir, 'runs', 'run-001', 'meta.json'));
      assert.strictEqual(meta.task_id, 'task-run');
      assert.strictEqual(meta.run_id, 'run-001');
      assert.strictEqual(meta.status, 'running');
      assert.ok(fs.existsSync(path.join(claudeDir, 'runs', 'run-001', 'logs', 'events.ndjson')));
      assert.ok(fs.existsSync(path.join(claudeDir, 'runs', 'run-001', 'reports')));
      assert.ok(fs.existsSync(path.join(claudeDir, 'runs', 'run-001', 'context')));

      const index = readJson(path.join(claudeDir, 'tasks', 'index.json'));
      assert.strictEqual(index.tasks[0].status, 'running');
      assert.strictEqual(index.tasks[0].current_run_id, 'run-001');

      assert.strictEqual(index.tasks[0].title, 'Run task');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('runs a pending task through pipeline-runner and marks task/run done', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      const planPath = writeApprovedPlan(dir);
      const workflowPath = writeWorkflow(dir);
      const adapterPath = writeAdapter(dir);
      run(['add', '--task-id', 'task-done', '--title', 'Done task', '--order', 'Run this task'], { HOME: home });

      const result = run([
        'run',
        '--task-id', 'task-done',
        '--run-id', 'run-done',
        '--repo', repo,
        '--plan', planPath,
        '--workflow', workflowPath,
        '--track', 'standard',
        '--runtime', 'codex',
        '--engine-command', adapterPath,
      ], { HOME: home });

      assert.strictEqual(result.code, 0, result.stderr);
      assert.ok(result.stdout.includes('TASK QUEUE: DONE'));

      const claudeDir = path.join(home, '.claude');
      const index = readJson(path.join(claudeDir, 'tasks', 'index.json'));
      assert.strictEqual(index.tasks[0].status, 'done');
      assert.strictEqual(index.tasks[0].current_run_id, 'run-done');

      const meta = readJson(path.join(claudeDir, 'runs', 'run-done', 'meta.json'));
      assert.strictEqual(meta.status, 'done');
      assert.ok(meta.ended_at);
      assert.strictEqual(meta.last_condition, 'verified');
      assert.strictEqual(meta.source_repo_root, fs.realpathSync(repo));
      assert.ok(meta.clone_path.endsWith(path.join('runs', 'run-done', 'workspace')));
      assert.strictEqual(meta.repo_root, meta.clone_path);
      assert.ok(meta.branch.includes('task-done'));
      assert.ok(meta.base_branch);
      assert.ok(meta.base_commit);
      assert.strictEqual(meta.isolation.mode, 'shared-clone');

    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('run resolves default workflow and runtime adapter when omitted', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      const planPath = writeApprovedPlan(dir);
      const fakeCodex = writeEnvAdapter(dir);
      run(['add', '--task-id', 'task-defaults', '--title', 'Defaults task', '--order', 'Run with defaults'], { HOME: home });

      const result = run([
        'run',
        '--task-id', 'task-defaults',
        '--run-id', 'run-defaults',
        '--repo', repo,
        '--plan', planPath,
        '--runtime', 'codex',
      ], {
        HOME: home,
        PROVIDER_ADAPTER_COMMAND: fakeCodex,
      });

      assert.strictEqual(result.code, 0, result.stderr);
      assert.ok(result.stdout.includes('TASK QUEUE: DONE'));
      const meta = readJson(path.join(home, '.claude', 'runs', 'run-defaults', 'meta.json'));
      assert.strictEqual(meta.workflow, 'standard-development');
      assert.strictEqual(meta.status, 'done');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('explicit adapter command takes precedence over runtime adapter default', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      const planPath = writeApprovedPlan(dir);
      const explicitMarker = path.join(dir, 'explicit-marker.txt');
      const defaultMarker = path.join(dir, 'default-marker.txt');
      const explicitAdapter = writeEnvAdapter(dir);
      const defaultAdapter = writeEnvAdapter(path.join(dir, 'default'));
      run(['add', '--task-id', 'task-explicit-adapter', '--title', 'Explicit adapter', '--order', 'Run with explicit adapter'], { HOME: home });

      const result = run([
        'run',
        '--task-id', 'task-explicit-adapter',
        '--run-id', 'run-explicit-adapter',
        '--repo', repo,
        '--plan', planPath,
        '--runtime', 'codex',
        '--adapter-command', explicitAdapter,
      ], {
        HOME: home,
        PROVIDER_ADAPTER_COMMAND: defaultAdapter,
        MARKER_PATH: explicitMarker,
      });

      assert.strictEqual(result.code, 0, result.stderr);
      assert.ok(fs.existsSync(explicitMarker), 'explicit adapter should run');
      assert.ok(!fs.existsSync(defaultMarker), 'default adapter should not run');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('watch resolves default workflow and runtime adapter when omitted', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      const planPath = writeApprovedPlan(dir);
      const fakeCodex = writeEnvAdapter(dir);
      run(['add', '--task-id', 'task-watch-defaults', '--title', 'Watch defaults', '--order', 'Watch with defaults'], { HOME: home });

      const result = run([
        'watch',
        '--repo', repo,
        '--plan', planPath,
        '--runtime', 'codex',
        '--max-tasks', '1',
      ], {
        HOME: home,
        PROVIDER_ADAPTER_COMMAND: fakeCodex,
      });

      assert.strictEqual(result.code, 0, result.stderr);
      assert.ok(result.stdout.includes('TASK QUEUE WATCH'));
      assert.ok(result.stdout.includes('executed=1'));
      const index = readJson(path.join(home, '.claude', 'tasks', 'index.json'));
      assert.strictEqual(index.tasks[0].status, 'done');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('missing adapter blocks unsupported runtime', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      const planPath = writeApprovedPlan(dir);
      run(['add', '--task-id', 'task-unsupported-runtime', '--title', 'Unsupported runtime', '--order', 'Run unsupported'], { HOME: home });

      const result = run([
        'run',
        '--task-id', 'task-unsupported-runtime',
        '--run-id', 'run-unsupported-runtime',
        '--repo', repo,
        '--plan', planPath,
        '--runtime', 'sdk',
      ], { HOME: home });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('TASK QUEUE: BLOCKED'));
      assert.ok(result.stdout.includes('adapter-command is required'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('plan omission uses task order only and does not fall back to root plan', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      writeApprovedPlan(repo);
      const fakeCodex = writeEnvAdapter(dir);
      run(['add', '--task-id', 'task-order-only', '--title', 'Order only', '--order', 'This is not an approved plan'], { HOME: home });

      const result = run([
        'run',
        '--task-id', 'task-order-only',
        '--run-id', 'run-order-only',
        '--repo', repo,
        '--runtime', 'codex',
        '--no-isolate',
      ], {
        HOME: home,
        PROVIDER_ADAPTER_COMMAND: fakeCodex,
      });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('TASK QUEUE: BLOCKED'));
      const meta = readJson(path.join(home, '.claude', 'runs', 'run-order-only', 'meta.json'));
      assert.strictEqual(meta.status, 'blocked');
      assert.strictEqual(meta.last_condition, '');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('watch executes pending tasks through pipeline-runner', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      const planPath = writeApprovedPlan(dir);
      const workflowPath = writeWorkflow(dir);
      const adapterPath = writeAdapter(dir);
      run(['add', '--task-id', 'task-watch', '--title', 'Watch task', '--order', 'Run from watch'], { HOME: home });

      const result = run([
        'watch',
        '--repo', repo,
        '--plan', planPath,
        '--workflow', workflowPath,
        '--track', 'standard',
        '--runtime', 'codex',
        '--engine-command', adapterPath,
        '--max-tasks', '1',
      ], { HOME: home });

      assert.strictEqual(result.code, 0, result.stderr);
      assert.ok(result.stdout.includes('TASK QUEUE WATCH'));
      assert.ok(result.stdout.includes('executed=1'));

      const index = readJson(path.join(home, '.claude', 'tasks', 'index.json'));
      assert.strictEqual(index.tasks[0].status, 'done');
      assert.ok(index.tasks[0].current_run_id);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('watch max-tasks bounds pending task execution', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      const planPath = writeApprovedPlan(dir);
      const workflowPath = writeWorkflow(dir);
      const adapterPath = writeAdapter(dir);
      run(['add', '--task-id', 'task-watch-one', '--title', 'Watch one', '--order', 'Run first'], { HOME: home });
      run(['add', '--task-id', 'task-watch-two', '--title', 'Watch two', '--order', 'Run second'], { HOME: home });

      const result = run([
        'watch',
        '--repo', repo,
        '--plan', planPath,
        '--workflow', workflowPath,
        '--track', 'standard',
        '--runtime', 'codex',
        '--engine-command', adapterPath,
        '--max-tasks', '1',
      ], { HOME: home });

      assert.strictEqual(result.code, 0, result.stderr);
      const index = readJson(path.join(home, '.claude', 'tasks', 'index.json'));
      assert.strictEqual(index.tasks.find(task => task.task_id === 'task-watch-one').status, 'done');
      assert.strictEqual(index.tasks.find(task => task.task_id === 'task-watch-two').status, 'pending');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('watch supports json output', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      const planPath = writeApprovedPlan(dir);
      const workflowPath = writeWorkflow(dir);
      const adapterPath = writeAdapter(dir);
      run(['add', '--task-id', 'task-watch-json', '--title', 'Watch JSON', '--order', 'Run as json'], { HOME: home });

      const result = run([
        'watch',
        '--repo', repo,
        '--plan', planPath,
        '--workflow', workflowPath,
        '--track', 'standard',
        '--runtime', 'codex',
        '--engine-command', adapterPath,
        '--max-tasks', '1',
        '--format', 'json',
      ], { HOME: home });

      assert.strictEqual(result.code, 0, result.stderr);
      const parsed = JSON.parse(result.stdout);
      assert.strictEqual(parsed.status, 'WATCH');
      assert.strictEqual(parsed.executed, 1);
      assert.strictEqual(parsed.results.length, 1);
      assert.strictEqual(parsed.results[0].task_id, 'task-watch-json');
      assert.strictEqual(parsed.results[0].status, 'DONE');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('standard queued run executes adapter writes inside clone without mutating source repo', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      const planPath = writeApprovedPlan(dir);
      const workflowPath = writeWorkflow(dir);
      const adapterPath = writeMutatingAdapter(dir);
      run(['add', '--task-id', 'task-isolated', '--title', 'Isolated task', '--order', 'Run this task'], { HOME: home });

      const result = run([
        'run',
        '--task-id', 'task-isolated',
        '--run-id', 'run-isolated',
        '--repo', repo,
        '--plan', planPath,
        '--workflow', workflowPath,
        '--track', 'standard',
        '--runtime', 'codex',
        '--engine-command', adapterPath,
      ], { HOME: home });

      assert.strictEqual(result.code, 0, result.stderr);
      const meta = readJson(path.join(home, '.claude', 'runs', 'run-isolated', 'meta.json'));
      assert.ok(fs.existsSync(path.join(meta.clone_path, 'adapter-output.txt')));
      assert.ok(!fs.existsSync(path.join(repo, 'adapter-output.txt')), 'source repo should remain unchanged');
      const events = readNdjson(path.join(home, '.claude', 'runs', 'run-isolated', 'logs', 'events.ndjson'));
      assert.ok(events.some(event => event.type === 'clone_created'));

      const list = run(['list-clones'], { HOME: home });
      assert.strictEqual(list.code, 0, list.stderr);
      assert.ok(list.stdout.includes('TASK CLONES'));
      assert.ok(list.stdout.includes('run-isolated'));
      assert.ok(list.stdout.includes('task-isolated'));

      const diff = run(['diff', '--run-id', 'run-isolated'], { HOME: home });
      assert.strictEqual(diff.code, 0, diff.stderr);
      assert.ok(diff.stdout.includes('TASK CLONE DIFF'));
      assert.ok(diff.stdout.includes('adapter-output.txt'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('trivial queued run stays in source repo unless isolate is requested', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      const planPath = writeApprovedPlan(dir);
      const workflowPath = writeWorkflow(dir);
      const adapterPath = writeMutatingAdapter(dir);
      run(['add', '--task-id', 'task-trivial', '--title', 'Trivial task', '--order', 'Run this task'], { HOME: home });

      const result = run([
        'run',
        '--task-id', 'task-trivial',
        '--run-id', 'run-trivial',
        '--repo', repo,
        '--plan', planPath,
        '--workflow', workflowPath,
        '--track', 'trivial',
        '--runtime', 'codex',
        '--engine-command', adapterPath,
      ], { HOME: home });

      assert.strictEqual(result.code, 0, result.stderr);
      assert.ok(fs.existsSync(path.join(repo, 'adapter-output.txt')));
      const meta = readJson(path.join(home, '.claude', 'runs', 'run-trivial', 'meta.json'));
      assert.strictEqual(meta.clone_path, undefined);
      assert.strictEqual(meta.repo_root, repo);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('isolate flag forces clone execution for trivial runs', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      const planPath = writeApprovedPlan(dir);
      const workflowPath = writeWorkflow(dir);
      const adapterPath = writeMutatingAdapter(dir);
      run(['add', '--task-id', 'task-force-isolate', '--title', 'Force isolate task', '--order', 'Run this task'], { HOME: home });

      const result = run([
        'run',
        '--task-id', 'task-force-isolate',
        '--run-id', 'run-force-isolate',
        '--repo', repo,
        '--plan', planPath,
        '--workflow', workflowPath,
        '--track', 'trivial',
        '--runtime', 'codex',
        '--engine-command', adapterPath,
        '--isolate',
      ], { HOME: home });

      assert.strictEqual(result.code, 0, result.stderr);
      const meta = readJson(path.join(home, '.claude', 'runs', 'run-force-isolate', 'meta.json'));
      assert.ok(fs.existsSync(path.join(meta.clone_path, 'adapter-output.txt')));
      assert.ok(!fs.existsSync(path.join(repo, 'adapter-output.txt')));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('clone setup failure blocks standard run with clone_failed evidence', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'not-a-git-repo');
      fs.mkdirSync(repo, { recursive: true });
      const planPath = writeApprovedPlan(dir);
      const workflowPath = writeWorkflow(dir);
      const adapterPath = writeAdapter(dir);
      run(['add', '--task-id', 'task-clone-fail', '--title', 'Clone fail task', '--order', 'Run this task'], { HOME: home });

      const result = run([
        'run',
        '--task-id', 'task-clone-fail',
        '--run-id', 'run-clone-fail',
        '--repo', repo,
        '--plan', planPath,
        '--workflow', workflowPath,
        '--track', 'standard',
        '--runtime', 'codex',
        '--engine-command', adapterPath,
      ], { HOME: home });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('TASK QUEUE: BLOCKED'));
      const meta = readJson(path.join(home, '.claude', 'runs', 'run-clone-fail', 'meta.json'));
      assert.strictEqual(meta.status, 'blocked');
      assert.strictEqual(meta.last_condition, 'clone_failed');
      const events = readNdjson(path.join(home, '.claude', 'runs', 'run-clone-fail', 'logs', 'events.ndjson'));
      assert.ok(events.some(event => event.type === 'clone_failed'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('standard queued run honors no-isolate opt-out', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      const planPath = writeApprovedPlan(dir);
      const workflowPath = writeWorkflow(dir);
      const adapterPath = writeMutatingAdapter(dir);
      run(['add', '--task-id', 'task-no-isolate', '--title', 'No isolate task', '--order', 'Run this task'], { HOME: home });

      const result = run([
        'run',
        '--task-id', 'task-no-isolate',
        '--run-id', 'run-no-isolate',
        '--repo', repo,
        '--plan', planPath,
        '--workflow', workflowPath,
        '--track', 'standard',
        '--runtime', 'codex',
        '--engine-command', adapterPath,
        '--no-isolate',
      ], { HOME: home });

      assert.strictEqual(result.code, 0, result.stderr);
      assert.ok(fs.existsSync(path.join(repo, 'adapter-output.txt')));
      const meta = readJson(path.join(home, '.claude', 'runs', 'run-no-isolate', 'meta.json'));
      assert.strictEqual(meta.clone_path, undefined);
      assert.strictEqual(meta.repo_root, repo);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('lists clones as json', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      createIsolatedRun({ dir, home, repo, taskId: 'task-json-clone', runId: 'run-json-clone' });

      const result = run(['list-clones', '--format', 'json'], { HOME: home });

      assert.strictEqual(result.code, 0, result.stderr);
      const parsed = JSON.parse(result.stdout);
      assert.strictEqual(parsed.status, 'CLONES');
      assert.strictEqual(parsed.clones.length, 1);
      assert.strictEqual(parsed.clones[0].run_id, 'run-json-clone');
      assert.strictEqual(parsed.clones[0].task_id, 'task-json-clone');
      assert.ok(parsed.clones[0].clone_path.endsWith(path.join('runs', 'run-json-clone', 'workspace')));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('try-merge checks clone diff without mutating source repo', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      createIsolatedRun({ dir, home, repo, taskId: 'task-try-merge', runId: 'run-try-merge' });

      const result = run(['try-merge', '--run-id', 'run-try-merge'], { HOME: home });

      assert.strictEqual(result.code, 0, result.stderr);
      assert.ok(result.stdout.includes('TASK CLONE MERGE CHECK'));
      assert.ok(result.stdout.includes('mergeable'));
      assert.ok(!fs.existsSync(path.join(repo, 'adapter-output.txt')));
      const meta = readJson(path.join(home, '.claude', 'runs', 'run-try-merge', 'meta.json'));
      assert.strictEqual(meta.merge_status, 'mergeable');
      const events = readNdjson(path.join(home, '.claude', 'runs', 'run-try-merge', 'logs', 'events.ndjson'));
      assert.ok(events.some(event => event.type === 'clone_merge_checked' && event.status === 'mergeable'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('try-merge blocks when clone path is missing', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      const meta = createIsolatedRun({ dir, home, repo, taskId: 'task-missing-clone', runId: 'run-missing-clone' });
      fs.rmSync(meta.clone_path, { recursive: true, force: true });

      const result = run(['try-merge', '--run-id', 'run-missing-clone'], { HOME: home });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('TASK QUEUE: BLOCKED'));
      assert.ok(result.stdout.includes('clone path is missing'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('merge-cleanup requires explicit confirmation', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      createIsolatedRun({ dir, home, repo, taskId: 'task-merge-confirm', runId: 'run-merge-confirm' });

      const result = run(['merge-cleanup', '--run-id', 'run-merge-confirm'], { HOME: home });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('TASK QUEUE: BLOCKED'));
      assert.ok(result.stdout.includes('--confirm-merge-cleanup'));
      assert.ok(!fs.existsSync(path.join(repo, 'adapter-output.txt')));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('confirmed merge-cleanup applies clone diff and records evidence', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      const meta = createIsolatedRun({ dir, home, repo, taskId: 'task-merge', runId: 'run-merge' });

      const result = run(['merge-cleanup', '--run-id', 'run-merge', '--confirm-merge-cleanup'], { HOME: home });

      assert.strictEqual(result.code, 0, result.stderr);
      assert.ok(result.stdout.includes('TASK CLONE MERGED'));
      assert.strictEqual(fs.readFileSync(path.join(repo, 'adapter-output.txt'), 'utf8'), 'clone write\n');
      assert.ok(fs.existsSync(meta.clone_path), 'merge-cleanup should not delete clone workspace');
      const updatedMeta = readJson(path.join(home, '.claude', 'runs', 'run-merge', 'meta.json'));
      assert.strictEqual(updatedMeta.merge_status, 'merged');
      assert.ok(updatedMeta.merged_at);
      const events = readNdjson(path.join(home, '.claude', 'runs', 'run-merge', 'logs', 'events.ndjson'));
      assert.ok(events.some(event => event.type === 'clone_merged'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('confirmed merge-cleanup blocks on merge conflicts', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      const meta = createIsolatedRun({ dir, home, repo, taskId: 'task-conflict', runId: 'run-conflict' });
      fs.writeFileSync(path.join(repo, 'adapter-output.txt'), 'source conflict\n');

      const result = run(['merge-cleanup', '--run-id', 'run-conflict', '--confirm-merge-cleanup'], { HOME: home });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('TASK QUEUE: BLOCKED'));
      assert.strictEqual(fs.readFileSync(path.join(repo, 'adapter-output.txt'), 'utf8'), 'source conflict\n');
      assert.ok(fs.existsSync(meta.clone_path));
      const updatedMeta = readJson(path.join(home, '.claude', 'runs', 'run-conflict', 'meta.json'));
      assert.strictEqual(updatedMeta.merge_status, 'blocked');
      const events = readNdjson(path.join(home, '.claude', 'runs', 'run-conflict', 'logs', 'events.ndjson'));
      assert.ok(events.some(event => event.type === 'clone_merge_blocked'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('delete-clone requires explicit confirmation', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      const meta = createIsolatedRun({ dir, home, repo, taskId: 'task-delete-confirm', runId: 'run-delete-confirm' });

      const result = run(['delete-clone', '--run-id', 'run-delete-confirm'], { HOME: home });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('TASK QUEUE: BLOCKED'));
      assert.ok(result.stdout.includes('--confirm-delete-clone'));
      assert.ok(fs.existsSync(meta.clone_path));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('confirmed delete-clone removes only workspace and preserves run evidence', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      const meta = createIsolatedRun({ dir, home, repo, taskId: 'task-delete', runId: 'run-delete' });

      const result = run(['delete-clone', '--run-id', 'run-delete', '--confirm-delete-clone'], { HOME: home });

      assert.strictEqual(result.code, 0, result.stderr);
      assert.ok(result.stdout.includes('TASK CLONE DELETED'));
      assert.ok(!fs.existsSync(meta.clone_path));
      assert.ok(fs.existsSync(path.join(home, '.claude', 'runs', 'run-delete', 'meta.json')));
      assert.ok(fs.existsSync(path.join(home, '.claude', 'runs', 'run-delete', 'logs', 'events.ndjson')));
      const updatedMeta = readJson(path.join(home, '.claude', 'runs', 'run-delete', 'meta.json'));
      assert.strictEqual(updatedMeta.clone_delete_status, 'deleted');
      assert.ok(updatedMeta.clone_deleted_at);
      const events = readNdjson(path.join(home, '.claude', 'runs', 'run-delete', 'logs', 'events.ndjson'));
      assert.ok(events.some(event => event.type === 'clone_deleted'));

      const repeated = run(['delete-clone', '--run-id', 'run-delete', '--confirm-delete-clone'], { HOME: home });
      assert.strictEqual(repeated.code, 0, repeated.stderr);
      assert.ok(repeated.stdout.includes('already-deleted'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('marks task/run blocked when pipeline-runner blocks', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      const planPath = writeApprovedPlan(dir);
      const workflowPath = writeWorkflow(dir, 'verified');
      const adapterPath = writeAdapter(dir, 'unexpected');
      run(['add', '--task-id', 'task-blocked', '--title', 'Blocked task', '--order', 'Run this task'], { HOME: home });

      const result = run([
        'run',
        '--task-id', 'task-blocked',
        '--run-id', 'run-blocked',
        '--repo', repo,
        '--plan', planPath,
        '--workflow', workflowPath,
        '--track', 'standard',
        '--runtime', 'codex',
        '--engine-command', adapterPath,
      ], { HOME: home });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('TASK QUEUE: BLOCKED'));

      const claudeDir = path.join(home, '.claude');
      const index = readJson(path.join(claudeDir, 'tasks', 'index.json'));
      assert.strictEqual(index.tasks[0].status, 'blocked');
      const meta = readJson(path.join(claudeDir, 'runs', 'run-blocked', 'meta.json'));
      assert.strictEqual(meta.status, 'blocked');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('retry creates a new run and appends retry note', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      initGitRepo(repo);
      const planPath = writeApprovedPlan(dir);
      const workflowPath = writeWorkflow(dir);
      const adapterPath = writeAdapter(dir);
      run(['add', '--task-id', 'task-retry', '--title', 'Retry task', '--order', 'Retry this task'], { HOME: home });
      run(['start', '--task-id', 'task-retry', '--run-id', 'run-old', '--repo', repo], { HOME: home });

      const result = run([
        'retry',
        '--task-id', 'task-retry',
        '--run-id', 'run-new',
        '--repo', repo,
        '--plan', planPath,
        '--workflow', workflowPath,
        '--track', 'standard',
        '--runtime', 'codex',
        '--engine-command', adapterPath,
        '--from-step', 'verify',
        '--note', 'Retry from verify',
      ], { HOME: home });

      assert.strictEqual(result.code, 0, result.stderr);
      assert.ok(result.stdout.includes('TASK QUEUE: DONE'));
      const claudeDir = path.join(home, '.claude');
      assert.ok(fs.existsSync(path.join(claudeDir, 'runs', 'run-old', 'meta.json')));
      assert.ok(fs.existsSync(path.join(claudeDir, 'runs', 'run-new', 'meta.json')));
      const notes = fs.readFileSync(path.join(claudeDir, 'tasks', 'task-retry', 'retry-notes.md'), 'utf8');
      assert.ok(notes.includes('Retry from verify'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('instruct appends timestamped task instruction', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      run(['add', '--task-id', 'task-instruct', '--title', 'Instruct task', '--order', 'Follow instructions'], { HOME: home });

      const result = run(['instruct', '--task-id', 'task-instruct', '--note', 'Prefer narrow changes'], { HOME: home });

      assert.strictEqual(result.code, 0, result.stderr);
      assert.ok(result.stdout.includes('TASK QUEUE: INSTRUCTED'));
      const claudeDir = path.join(home, '.claude');
      const instructions = fs.readFileSync(path.join(claudeDir, 'tasks', 'task-instruct', 'instructions.md'), 'utf8');
      assert.ok(instructions.includes('Prefer narrow changes'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('recover-running returns orphaned running task to pending', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      fs.mkdirSync(repo, { recursive: true });
      run(['add', '--task-id', 'task-recover', '--title', 'Recover task', '--order', 'Recover this task'], { HOME: home });
      run(['start', '--task-id', 'task-recover', '--run-id', 'run-recover', '--repo', repo], { HOME: home });
      fs.rmSync(path.join(home, '.claude', 'runs', 'run-recover'), { recursive: true, force: true });

      const result = run(['recover-running'], { HOME: home });

      assert.strictEqual(result.code, 0, result.stderr);
      assert.ok(result.stdout.includes('TASK QUEUE: RECOVERED'));
      const index = readJson(path.join(home, '.claude', 'tasks', 'index.json'));
      assert.strictEqual(index.tasks[0].status, 'pending');
      assert.strictEqual(index.tasks[0].current_run_id, '');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('recover-running syncs running task from final run meta', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      fs.mkdirSync(repo, { recursive: true });
      run(['add', '--task-id', 'task-sync', '--title', 'Sync task', '--order', 'Sync this task'], { HOME: home });
      run(['start', '--task-id', 'task-sync', '--run-id', 'run-sync', '--repo', repo], { HOME: home });
      const metaPath = path.join(home, '.claude', 'runs', 'run-sync', 'meta.json');
      const meta = readJson(metaPath);
      meta.status = 'done';
      fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

      const result = run(['recover-running'], { HOME: home });

      assert.strictEqual(result.code, 0, result.stderr);
      const index = readJson(path.join(home, '.claude', 'tasks', 'index.json'));
      assert.strictEqual(index.tasks[0].status, 'done');
      assert.strictEqual(index.tasks[0].current_run_id, 'run-sync');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('reconcile-runs syncs task index and SQLite from final run meta', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      fs.mkdirSync(repo, { recursive: true });
      run(['add', '--task-id', 'task-reconcile', '--title', 'Reconcile task', '--order', 'Sync this task'], { HOME: home });
      run(['start', '--task-id', 'task-reconcile', '--run-id', 'run-reconcile', '--repo', repo], { HOME: home });
      const metaPath = path.join(home, '.claude', 'runs', 'run-reconcile', 'meta.json');
      const meta = readJson(metaPath);
      meta.status = 'done';
      fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

      const result = run(['reconcile-runs'], { HOME: home });

      assert.strictEqual(result.code, 0, result.stderr);
      assert.ok(result.stdout.includes('TASK QUEUE: RECONCILED'));
      const index = readJson(path.join(home, '.claude', 'tasks', 'index.json'));
      assert.strictEqual(index.tasks[0].status, 'done');
      assert.strictEqual(index.tasks[0].current_run_id, 'run-reconcile');
      const events = readNdjson(path.join(home, '.claude', 'runs', 'run-reconcile', 'logs', 'events.ndjson'));
      assert.ok(events.some(event => event.type === 'run_reconciled' && event.status === 'done'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('reconcile-runs returns missing running run directory to pending', () => {
    const dir = createTempDir();
    try {
      const home = path.join(dir, 'home');
      const repo = path.join(dir, 'repo');
      fs.mkdirSync(repo, { recursive: true });
      run(['add', '--task-id', 'task-missing-run', '--title', 'Missing run', '--order', 'Recover this task'], { HOME: home });
      run(['start', '--task-id', 'task-missing-run', '--run-id', 'run-missing', '--repo', repo], { HOME: home });
      fs.rmSync(path.join(home, '.claude', 'runs', 'run-missing'), { recursive: true, force: true });

      const result = run(['reconcile-runs'], { HOME: home });

      assert.strictEqual(result.code, 0, result.stderr);
      const index = readJson(path.join(home, '.claude', 'tasks', 'index.json'));
      assert.strictEqual(index.tasks[0].status, 'pending');
      assert.strictEqual(index.tasks[0].current_run_id, '');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
