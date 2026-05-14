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
const CODEX_PROVIDER_ADAPTER = path.join(__dirname, '..', '..', 'scripts', 'provider-adapters', 'codex.js');

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

function writeAdapter(filePath, options = {}) {
  const exitCode = options.exitCode ?? 0;
  const markerPath = options.markerPath || '';
  const stdoutJson = options.stdoutJson || null;
  const content = [
    '#!/usr/bin/env node',
    "const fs = require('fs');",
    `const markerPath = ${JSON.stringify(markerPath)};`,
    'if (markerPath) {',
    '  fs.writeFileSync(markerPath, JSON.stringify({',
    '    argv: process.argv.slice(2),',
    '    env: {',
    '      repo: process.env.PIPELINE_RUNNER_REPO,',
    '      plan: process.env.PIPELINE_RUNNER_PLAN,',
    '      track: process.env.PIPELINE_RUNNER_TRACK,',
    '      runtime: process.env.PIPELINE_RUNNER_RUNTIME,',
    '      taskId: process.env.PIPELINE_RUNNER_TASK_ID,',
    '    },',
    '  }, null, 2));',
    '}',
    stdoutJson ? `console.log(${JSON.stringify(JSON.stringify(stdoutJson))});` : '',
    `process.exit(${exitCode});`,
    '',
  ].join('\n');
  fs.writeFileSync(filePath, content);
  fs.chmodSync(filePath, 0o755);
}

function writeSequenceAdapter(filePath, options = {}) {
  const markerPath = options.markerPath || '';
  const responses = options.responses || {};
  const exitByStep = options.exitByStep || {};
  const defaultResponse = options.defaultResponse || { condition: 'blocked' };
  const content = [
    '#!/usr/bin/env node',
    "const fs = require('fs');",
    `const markerPath = ${JSON.stringify(markerPath)};`,
    `const responses = ${JSON.stringify(responses)};`,
    `const exitByStep = ${JSON.stringify(exitByStep)};`,
    `const defaultResponse = ${JSON.stringify(defaultResponse)};`,
    "const step = process.env.PIPELINE_RUNNER_STEP || 'unknown';",
    'const invocation = {',
    '  step,',
    '  argv: process.argv.slice(2),',
    '  env: {',
    '    workflow: process.env.PIPELINE_RUNNER_WORKFLOW,',
    '    step: process.env.PIPELINE_RUNNER_STEP,',
    '    stepIndex: process.env.PIPELINE_RUNNER_STEP_INDEX,',
    '    runId: process.env.PIPELINE_RUNNER_RUN_ID,',
    '    runDir: process.env.PIPELINE_RUNNER_RUN_DIR,',
    '  },',
    '};',
    'if (markerPath) {',
    '  fs.writeFileSync(`${markerPath}.${step}.json`, JSON.stringify(invocation, null, 2));',
    '}',
    'const countPath = `${markerPath}.${step}.count`;',
    'const count = markerPath && fs.existsSync(countPath) ? Number(fs.readFileSync(countPath, "utf8")) : 0;',
    'if (markerPath) fs.writeFileSync(countPath, String(count + 1));',
    'const stepResponses = Array.isArray(responses[step]) ? responses[step] : [responses[step] || defaultResponse];',
    'const response = stepResponses[Math.min(count, stepResponses.length - 1)];',
    'if (response !== null) console.log(JSON.stringify(response));',
    'process.exit(exitByStep[step] === undefined ? 0 : exitByStep[step]);',
    '',
  ].join('\n');
  fs.writeFileSync(filePath, content);
  fs.chmodSync(filePath, 0o755);
}

function writeParallelReviewWorkflow(filePath, options = {}) {
  const architectureMode = options.architectureMode || 'readonly';
  fs.writeFileSync(filePath, [
    'name: parallel-review-test',
    'initial_step: implement',
    'max_steps: 6',
    'steps:',
    '  - name: implement',
    '    mode: edit',
    '    rules:',
    '      - condition: implementation_complete',
    '        next: review',
    '  - name: review',
    '    mode: readonly',
    '    parallel:',
    '      - name: architecture_review',
    `        mode: ${architectureMode}`,
    '        facets:',
    '          persona: reviewer',
    '          instruction: review-task',
    '          output_contract: review-summary',
    '        output_contracts:',
    '          report:',
    '            - name: architecture-review.md',
    '              format: review-summary',
    '        rules:',
    '          - condition: approved',
    '            next: COMPLETE',
    '          - condition: needs_fix',
    '            next: COMPLETE',
    '          - condition: blocked',
    '            next: ABORT',
    '      - name: security_review',
    '        mode: readonly',
    '        facets:',
    '          persona: reviewer',
    '          instruction: review-task',
    '          output_contract: review-summary',
    '        output_contracts:',
    '          report:',
    '            - name: security-review.md',
    '              format: review-summary',
    '        rules:',
    '          - condition: approved',
    '            next: COMPLETE',
    '          - condition: needs_fix',
    '            next: COMPLETE',
    '          - condition: blocked',
    '            next: ABORT',
    '    output_contracts:',
    '      report:',
    '        - name: review-summary.md',
    '          format: review-summary',
    '    rules:',
    '      - condition: approved',
    '        next: verify',
    '      - condition: needs_fix',
    '        next: implement',
    '      - condition: blocked',
    '        next: ABORT',
    '  - name: verify',
    '    mode: readonly',
    '    rules:',
    '      - condition: verified',
    '        next: COMPLETE',
    '',
  ].join('\n'));
}

function writeLegacyReviewWorkflow(filePath) {
  fs.writeFileSync(filePath, [
    'name: legacy-review-test',
    'initial_step: review',
    'max_steps: 3',
    'steps:',
    '  - name: review',
    '    mode: readonly',
    '    parallel:',
    '      - architecture_review',
    '      - security_review',
    '    rules:',
    '      - condition: approved',
    '        next: verify',
    '      - condition: needs_fix',
    '        next: implement',
    '      - condition: blocked',
    '        next: ABORT',
    '  - name: implement',
    '    mode: edit',
    '    rules:',
    '      - condition: implementation_complete',
    '        next: review',
    '  - name: verify',
    '    mode: readonly',
    '    rules:',
    '      - condition: verified',
    '        next: COMPLETE',
    '',
  ].join('\n'));
}

function writeProviderCommand(filePath, response) {
  const content = [
    '#!/usr/bin/env node',
    'process.stdin.resume();',
    `process.stdout.write(JSON.stringify(${JSON.stringify(response)}) + "\\n");`,
    '',
  ].join('\n');
  fs.writeFileSync(filePath, content);
  fs.chmodSync(filePath, 0o755);
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
      assert.ok(result.stdout.includes('Permission:  full (source=plan_text)'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('does not execute adapter when permission resolver requires authorization', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const adapter = path.join(dir, 'adapter.js');
      const marker = path.join(dir, 'adapter-marker.json');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'), {
        extra: [
          '',
          '## Release',
          '- deploy after verification',
        ].join('\n'),
      });
      writeAdapter(adapter, { markerPath: marker });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--workflow', path.join(__dirname, '..', '..', 'workflows', 'standard-development.yaml'),
        '--step', 'implement',
        '--execute',
        '--engine-command', adapter,
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-permission-block' });

      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: NEEDS_DECISION'));
      assert.ok(result.stdout.includes('Permission:  full (source=plan_text)'));
      assert.ok(result.stdout.includes('permission-sensitive action requires authorization: deploy'));
      assert.ok(!fs.existsSync(marker));
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
      assert.strictEqual(events[1].metadata.permission.mode, 'edit');
      assert.strictEqual(events[1].metadata.permission.source, 'track_policy');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('executes adapter when execute flag and preflight is ready', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const home = path.join(dir, 'home');
      const adapter = path.join(dir, 'adapter.js');
      const marker = path.join(dir, 'adapter-marker.json');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));
      writeAdapter(adapter, { markerPath: marker });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--task-id', 'execute-success',
        '--execute',
        '--engine-command', adapter,
      ], { HOME: home, CLAUDE_SESSION_ID: 'runner-execute-success' });

      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: DONE'));
      assert.ok(result.stdout.includes('Execution:   complete'));
      const markerContent = JSON.parse(fs.readFileSync(marker, 'utf8'));
      const expectedRepoRoot = fs.realpathSync(repo);
      assert.deepStrictEqual(markerContent.argv, [
        '--repo', expectedRepoRoot,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--task-id', 'execute-success',
      ]);
      assert.strictEqual(markerContent.env.repo, expectedRepoRoot);
      assert.strictEqual(markerContent.env.track, 'standard');
      assert.strictEqual(markerContent.env.taskId, 'execute-success');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('requires engine command when execute flag is set', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--task-id', 'missing-engine',
        '--execute',
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-missing-engine' });

      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: NEEDS_DECISION'));
      assert.ok(result.stdout.includes('engine command is required for execution'));
      assert.ok(result.stdout.includes('Execution:   not-run'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('maps adapter exit 2 to needs decision', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const adapter = path.join(dir, 'adapter.js');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));
      writeAdapter(adapter, { exitCode: 2 });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--execute',
        '--engine-command', adapter,
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-adapter-blocked' });

      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: NEEDS_DECISION'));
      assert.ok(result.stdout.includes('Execution:   blocked'));
      assert.ok(result.stdout.includes('engine command requested a decision'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('maps adapter nonzero exit to blocked', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const adapter = path.join(dir, 'adapter.js');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));
      writeAdapter(adapter, { exitCode: 1 });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--execute',
        '--engine-command', adapter,
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-adapter-failed' });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: BLOCKED'));
      assert.ok(result.stdout.includes('Execution:   failed'));
      assert.ok(result.stdout.includes('engine command failed with exit code 1'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('does not execute adapter when preflight blocks', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const adapter = path.join(dir, 'adapter.js');
      const marker = path.join(dir, 'adapter-marker.json');
      initRepo(repo);
      writeAdapter(adapter, { markerPath: marker });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'missing-plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--execute',
        '--engine-command', adapter,
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-preflight-blocked' });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: BLOCKED'));
      assert.ok(!fs.existsSync(marker));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('does not execute adapter when permission-sensitive plan needs decision', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const adapter = path.join(dir, 'adapter.js');
      const marker = path.join(dir, 'adapter-marker.json');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'), {
        extra: [
          '',
          '## Release',
          '- deploy after verification',
        ].join('\n'),
      });
      writeAdapter(adapter, { markerPath: marker });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--execute',
        '--engine-command', adapter,
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-sensitive-execute' });

      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: NEEDS_DECISION'));
      assert.ok(!fs.existsSync(marker));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('records execution telemetry events', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const home = path.join(dir, 'home');
      const adapter = path.join(dir, 'adapter.js');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));
      writeAdapter(adapter);

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--task-id', 'execution-telemetry',
        '--execute',
        '--engine-command', adapter,
      ], { HOME: home, CLAUDE_SESSION_ID: 'runner-execution-telemetry' });

      assert.strictEqual(result.code, 0);
      const events = readTelemetryEvents(home);
      assert.deepStrictEqual(events.map(event => event.event_type), [
        'pipeline_started',
        'pipeline_preflight_completed',
        'pipeline_execution_started',
        'pipeline_execution_completed',
      ]);
      assert.strictEqual(events[3].status, 'completed');
      assert.strictEqual(events[3].metadata.task_id, 'execution-telemetry');
      assert.strictEqual(events[3].metadata.engine_command, adapter);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('routes workflow step by adapter condition', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const adapter = path.join(dir, 'adapter.js');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));
      writeAdapter(adapter, { stdoutJson: { condition: 'research_complete', status: 'complete' } });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--workflow', path.join(__dirname, '..', '..', 'workflows', 'standard-development.yaml'),
        '--step', 'research',
        '--execute',
        '--engine-command', adapter,
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-workflow-route' });

      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: READY'));
      assert.ok(result.stdout.includes('Workflow:    research -> plan'));
      assert.ok(result.stdout.includes('condition=research_complete'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('executes codex provider adapter through runner and records provider response snapshot', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const home = path.join(dir, 'home');
      const provider = path.join(dir, 'fake-provider.js');
      const workflow = path.join(dir, 'provider-workflow.yaml');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));
      fs.writeFileSync(workflow, [
        'name: provider-test',
        'initial_step: research',
        'max_steps: 2',
        'steps:',
        '  - name: research',
        '    mode: readonly',
        '    facets:',
        '      persona: researcher',
        '      instruction: research-task',
        '      output_contract: research-summary',
        '    rules:',
        '      - condition: research_complete',
        '        next: COMPLETE',
        '',
      ].join('\n'));
      writeProviderCommand(provider, {
        condition: 'research_complete',
        status: 'complete',
        summary: 'provider completed research',
        artifacts: ['research.md'],
      });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--task-id', 'provider-runner',
        '--run-id', 'run-provider-runner',
        '--workflow', workflow,
        '--step', 'research',
        '--execute',
        '--loop',
        '--engine-command', CODEX_PROVIDER_ADAPTER,
      ], {
        HOME: home,
        CLAUDE_SESSION_ID: 'runner-provider-adapter',
        PROVIDER_ADAPTER_COMMAND: `"${process.execPath}" "${provider}"`,
      });

      assert.strictEqual(result.code, 0, result.stdout);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: DONE'));
      const runDir = path.join(home, '.claude', 'runs', 'run-provider-runner');
      assert.deepStrictEqual(readJson(path.join(runDir, 'context', 'previous-response.research.json')), {
        condition: 'research_complete',
        status: 'complete',
        summary: 'provider completed research',
        artifacts: ['research.md'],
      });
      assert.ok(fs.existsSync(path.join(runDir, 'context', 'provider-prompt.research.md')));
      assert.ok(fs.readFileSync(path.join(runDir, 'context', 'provider-stdout.research.txt'), 'utf8').includes('research_complete'));
      const events = readNdjson(path.join(runDir, 'logs', 'events.ndjson'));
      assert.ok(events.some(event => event.type === 'previous_response_written' && event.step === 'research'));
      assert.ok(events.some(event => event.type === 'artifact_written' && event.artifact === 'research.md'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('blocks when workflow condition has no matching rule', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const adapter = path.join(dir, 'adapter.js');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));
      writeAdapter(adapter, { stdoutJson: { condition: 'unexpected', status: 'complete' } });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--workflow', path.join(__dirname, '..', '..', 'workflows', 'standard-development.yaml'),
        '--step', 'research',
        '--execute',
        '--engine-command', adapter,
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-workflow-no-rule' });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: BLOCKED'));
      assert.ok(result.stdout.includes('no workflow rule matched condition: unexpected'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('routes clean review aggregation to verify', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const adapter = path.join(dir, 'adapter.js');
      const workflow = path.join(dir, 'legacy-review.yaml');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));
      writeLegacyReviewWorkflow(workflow);
      writeAdapter(adapter, {
        stdoutJson: {
          condition: 'approved',
          reviewers: [
            { name: 'architecture_review', status: 'approved', findings: [], residual_risks: [] },
            { name: 'security_review', status: 'approved', findings: [], residual_risks: [] },
          ],
        },
      });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--workflow', workflow,
        '--step', 'review',
        '--execute',
        '--engine-command', adapter,
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-review-clean' });

      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: READY'));
      assert.ok(result.stdout.includes('Workflow:    review -> verify'));
      assert.ok(result.stdout.includes('Review:      approved (reviewers=2 findings=0)'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('routes review findings back to implement', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const adapter = path.join(dir, 'adapter.js');
      const workflow = path.join(dir, 'legacy-review.yaml');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));
      writeLegacyReviewWorkflow(workflow);
      writeAdapter(adapter, {
        stdoutJson: {
          condition: 'approved',
          reviewers: [
            { name: 'security_review', status: 'needs_fix', findings: ['HIGH: permission escalation is not checked'], residual_risks: [] },
          ],
        },
      });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--workflow', workflow,
        '--step', 'review',
        '--execute',
        '--engine-command', adapter,
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-review-finding' });

      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: READY'));
      assert.ok(result.stdout.includes('Workflow:    review -> implement'));
      assert.ok(result.stdout.includes('Review:      needs_fix (reviewers=1 findings=1)'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('blocks when review aggregation is blocked', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const adapter = path.join(dir, 'adapter.js');
      const workflow = path.join(dir, 'legacy-review.yaml');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));
      writeLegacyReviewWorkflow(workflow);
      writeAdapter(adapter, {
        stdoutJson: {
          condition: 'approved',
          reviewers: [
            { name: 'harness_review', status: 'blocked', findings: [], residual_risks: [] },
          ],
        },
      });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--workflow', workflow,
        '--step', 'review',
        '--execute',
        '--engine-command', adapter,
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-review-blocked' });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: BLOCKED'));
      assert.ok(result.stdout.includes('Workflow:    review -> ABORT'));
      assert.ok(result.stdout.includes('review aggregation blocked'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('blocks malformed review payload conservatively', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const adapter = path.join(dir, 'adapter.js');
      const workflow = path.join(dir, 'legacy-review.yaml');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));
      writeLegacyReviewWorkflow(workflow);
      writeAdapter(adapter, {
        stdoutJson: {
          condition: 'approved',
          reviewers: 'not-an-array',
        },
      });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--workflow', workflow,
        '--step', 'review',
        '--execute',
        '--engine-command', adapter,
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-review-malformed' });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: BLOCKED'));
      assert.ok(result.stdout.includes('review aggregation payload is malformed'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('runs object-form parallel reviewers and aggregates clean approval', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const home = path.join(dir, 'home');
      const workflow = path.join(dir, 'parallel-review.yaml');
      const adapter = path.join(dir, 'adapter.js');
      const marker = path.join(dir, 'adapter-marker.json');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));
      writeParallelReviewWorkflow(workflow);
      writeSequenceAdapter(adapter, {
        markerPath: marker,
        responses: {
          architecture_review: {
            condition: 'approved',
            status: 'approved',
            summary: 'architecture clean',
            findings: [],
            residual_risks: [],
            artifacts: ['architecture-review.md'],
          },
          security_review: {
            condition: 'approved',
            status: 'approved',
            summary: 'security clean',
            findings: [],
            residual_risks: [],
            artifacts: ['security-review.md'],
          },
        },
      });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--run-id', 'run-parallel-review-clean',
        '--workflow', workflow,
        '--step', 'review',
        '--execute',
        '--engine-command', adapter,
      ], { HOME: home, CLAUDE_SESSION_ID: 'runner-parallel-review-clean' });

      assert.strictEqual(result.code, 0, result.stdout);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: READY'));
      assert.ok(result.stdout.includes('Workflow:    review -> verify'));
      assert.ok(result.stdout.includes('Review:      approved (reviewers=2 findings=0)'));
      const architectureInvocation = readJson(`${marker}.architecture_review.json`);
      const securityInvocation = readJson(`${marker}.security_review.json`);
      assert.deepStrictEqual([architectureInvocation.step, securityInvocation.step], ['architecture_review', 'security_review']);
      assert.ok(architectureInvocation.argv.includes('--run-id'));
      assert.ok(securityInvocation.argv.includes('--run-id'));
      assert.ok(architectureInvocation.argv.includes('run-parallel-review-clean'));
      assert.ok(securityInvocation.argv.includes('run-parallel-review-clean'));
      const runDir = path.join(home, '.claude', 'runs', 'run-parallel-review-clean');
      assert.deepStrictEqual(readJson(path.join(runDir, 'context', 'previous-response.architecture_review.json')).condition, 'approved');
      assert.deepStrictEqual(readJson(path.join(runDir, 'context', 'previous-response.security_review.json')).condition, 'approved');
      assert.ok(fs.readFileSync(path.join(runDir, 'reports', 'architecture-review.md'), 'utf8').includes('step: architecture_review'));
      assert.ok(fs.readFileSync(path.join(runDir, 'reports', 'security-review.md'), 'utf8').includes('step: security_review'));
      const events = readNdjson(path.join(runDir, 'logs', 'events.ndjson'));
      assert.deepStrictEqual(events.filter(event => event.type === 'reviewer_started').map(event => event.reviewer), ['architecture_review', 'security_review']);
      assert.deepStrictEqual(events.filter(event => event.type === 'reviewer_completed').map(event => event.reviewer), ['architecture_review', 'security_review']);
      assert.ok(events.some(event => event.type === 'review_aggregated' && event.reviewer_count === 2 && event.finding_count === 0));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('routes object-form reviewer findings back to implement', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const workflow = path.join(dir, 'parallel-review.yaml');
      const adapter = path.join(dir, 'adapter.js');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));
      writeParallelReviewWorkflow(workflow);
      writeSequenceAdapter(adapter, {
        responses: {
          architecture_review: { condition: 'approved', status: 'approved', findings: [], residual_risks: [] },
          security_review: { condition: 'needs_fix', status: 'needs_fix', findings: ['HIGH: missing permission check'], residual_risks: [] },
        },
      });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--workflow', workflow,
        '--step', 'review',
        '--execute',
        '--engine-command', adapter,
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-parallel-review-finding' });

      assert.strictEqual(result.code, 0, result.stdout);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: READY'));
      assert.ok(result.stdout.includes('Workflow:    review -> implement'));
      assert.ok(result.stdout.includes('Review:      needs_fix (reviewers=2 findings=1)'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('blocks object-form parallel review when a reviewer is blocked', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const workflow = path.join(dir, 'parallel-review.yaml');
      const adapter = path.join(dir, 'adapter.js');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));
      writeParallelReviewWorkflow(workflow);
      writeSequenceAdapter(adapter, {
        responses: {
          architecture_review: { condition: 'approved', status: 'approved', findings: [], residual_risks: [] },
          security_review: { condition: 'blocked', status: 'blocked', findings: [], residual_risks: [] },
        },
      });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--workflow', workflow,
        '--step', 'review',
        '--execute',
        '--engine-command', adapter,
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-parallel-review-blocked' });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: BLOCKED'));
      assert.ok(result.stdout.includes('Workflow:    review -> ABORT'));
      assert.ok(result.stdout.includes('review aggregation blocked'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('blocks object-form parallel review on malformed reviewer output', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const workflow = path.join(dir, 'parallel-review.yaml');
      const adapter = path.join(dir, 'adapter.js');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));
      writeParallelReviewWorkflow(workflow);
      writeSequenceAdapter(adapter, {
        responses: {
          architecture_review: null,
          security_review: { condition: 'approved', status: 'approved', findings: [], residual_risks: [] },
        },
      });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--workflow', workflow,
        '--step', 'review',
        '--execute',
        '--engine-command', adapter,
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-parallel-review-malformed' });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: BLOCKED'));
      assert.ok(result.stdout.includes('review aggregation blocked'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('blocks object-form parallel review on reviewer adapter failure', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const workflow = path.join(dir, 'parallel-review.yaml');
      const adapter = path.join(dir, 'adapter.js');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));
      writeParallelReviewWorkflow(workflow);
      writeSequenceAdapter(adapter, {
        responses: {
          architecture_review: { condition: 'approved', status: 'approved', findings: [], residual_risks: [] },
          security_review: { condition: 'approved', status: 'approved', findings: [], residual_risks: [] },
        },
        exitByStep: { security_review: 1 },
      });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--workflow', workflow,
        '--step', 'review',
        '--execute',
        '--engine-command', adapter,
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-parallel-review-adapter-failure' });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: BLOCKED'));
      assert.ok(result.stdout.includes('review aggregation blocked'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('loops through workflow steps to complete dry-run workflow', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const home = path.join(dir, 'home');
      const adapter = path.join(dir, 'adapter.js');
      const marker = path.join(dir, 'adapter-marker.json');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));
      writeSequenceAdapter(adapter, {
        markerPath: marker,
        responses: {
          research: { condition: 'research_complete', artifacts: ['research.md'] },
          plan: { condition: 'approved', artifacts: ['plan.md'] },
          implement: { condition: 'implementation_complete' },
          architecture_review: { condition: 'approved', status: 'approved', findings: [], residual_risks: [] },
          security_review: { condition: 'approved', status: 'approved', findings: [], residual_risks: [] },
          harness_review: { condition: 'approved', status: 'approved', findings: [], residual_risks: [] },
          verify: { condition: 'verified', artifacts: ['verification-summary.md'] },
        },
      });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--task-id', 'loop-complete',
        '--run-id', 'run-loop-complete',
        '--workflow', path.join(__dirname, '..', '..', 'workflows', 'standard-development.yaml'),
        '--execute',
        '--loop',
        '--engine-command', adapter,
      ], { HOME: home, CLAUDE_SESSION_ID: 'runner-loop-complete' });

      assert.strictEqual(result.code, 0, result.stdout);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: DONE'));
      assert.ok(result.stdout.includes('Workflow:    research -> COMPLETE'));
      assert.ok(result.stdout.includes('Steps:       5'));
      const researchInvocation = readJson(`${marker}.research.json`);
      assert.strictEqual(researchInvocation.env.workflow, 'standard-development');
      assert.strictEqual(researchInvocation.env.stepIndex, '0');
      assert.strictEqual(researchInvocation.env.runId, 'run-loop-complete');
      assert.ok(researchInvocation.env.runDir.endsWith(path.join('.claude', 'runs', 'run-loop-complete')));
      assert.ok(researchInvocation.argv.includes('--workflow'));
      assert.ok(researchInvocation.argv.includes('--step'));
      assert.ok(researchInvocation.argv.includes('research'));
      assert.ok(researchInvocation.argv.includes('--run-id'));
      assert.ok(researchInvocation.argv.includes('run-loop-complete'));
      for (const stepName of ['research', 'plan', 'implement', 'architecture_review', 'security_review', 'harness_review', 'verify']) {
        assert.strictEqual(fs.readFileSync(`${marker}.${stepName}.count`, 'utf8'), '1');
      }

      const runDir = path.join(home, '.claude', 'runs', 'run-loop-complete');
      const meta = readJson(path.join(runDir, 'meta.json'));
      assert.strictEqual(meta.status, 'done');
      assert.strictEqual(meta.workflow, 'standard-development');
      assert.strictEqual(meta.step_count, 5);
      assert.strictEqual(meta.final_step, 'verify');
      const events = readNdjson(path.join(runDir, 'logs', 'events.ndjson'));
      assert.ok(fs.existsSync(path.join(runDir, 'context', 'prompt-preview.research.md')));
      assert.ok(fs.existsSync(path.join(runDir, 'context', 'prompt-preview.verify.md')));
      assert.deepStrictEqual(readJson(path.join(runDir, 'context', 'previous-response.research.json')), {
        condition: 'research_complete',
        artifacts: ['research.md'],
      });
      assert.ok(fs.existsSync(path.join(runDir, 'context', 'previous-response.architecture_review.json')));
      assert.ok(fs.existsSync(path.join(runDir, 'reports', 'review-summary.md')));
      assert.ok(fs.existsSync(path.join(runDir, 'reports', 'architecture-review.md')));
      assert.ok(fs.readFileSync(path.join(runDir, 'reports', 'verification-summary.md'), 'utf8').includes('step: verify'));
      assert.ok(events.some(event => event.type === 'permission_resolved' && event.step === 'research'));
      assert.ok(events.some(event => event.type === 'prompt_snapshot_written' && event.step === 'research'));
      assert.ok(events.some(event => event.type === 'previous_response_written' && event.step === 'research'));
      assert.ok(events.some(event => event.type === 'artifact_written' && event.step === 'research' && event.artifact === 'research.md'));
      assert.ok(events.some(event => event.type === 'review_aggregated' && event.step === 'review' && event.reviewer_count === 3));
      assert.ok(events.some(event => event.type === 'verification_run' && event.step === 'verify' && event.condition === 'verified'));
      assert.ok(events.some(event => event.type === 'step_started' && event.step === 'research'));
      assert.ok(events.some(event => event.type === 'rule_matched' && event.from === 'verify' && event.to === 'COMPLETE'));
      assert.ok(events.some(event => event.type === 'run_completed'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('loop logs prompt snapshot failure without crashing run', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const home = path.join(dir, 'home');
      const adapter = path.join(dir, 'adapter.js');
      const workflow = path.join(dir, 'workflow.yaml');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));
      fs.writeFileSync(workflow, [
        'name: missing-facet-workflow',
        'initial_step: research',
        'max_steps: 1',
        'steps:',
        '  - name: research',
        '    mode: readonly',
        '    facets:',
        '      persona: definitely-missing-facet',
        '    rules:',
        '      - condition: research_complete',
        '        next: COMPLETE',
        '',
      ].join('\n'));
      writeSequenceAdapter(adapter, {
        responses: {
          research: { condition: 'research_complete' },
        },
      });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--run-id', 'run-prompt-failure',
        '--workflow', workflow,
        '--execute',
        '--loop',
        '--engine-command', adapter,
      ], { HOME: home, CLAUDE_SESSION_ID: 'runner-loop-prompt-failure' });

      assert.strictEqual(result.code, 0, result.stdout);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: DONE'));
      const events = readNdjson(path.join(home, '.claude', 'runs', 'run-prompt-failure', 'logs', 'events.ndjson'));
      assert.ok(events.some(event => event.type === 'prompt_snapshot_failed' && event.step === 'research' && event.error.includes('missing facet')));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('loops review findings back to implement before clean review verifies', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const adapter = path.join(dir, 'adapter.js');
      const marker = path.join(dir, 'adapter-marker.json');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));
      writeSequenceAdapter(adapter, {
        markerPath: marker,
        responses: {
          research: { condition: 'research_complete' },
          plan: { condition: 'approved' },
          implement: { condition: 'implementation_complete' },
          architecture_review: { condition: 'approved', status: 'approved', findings: [], residual_risks: [] },
          security_review: [
            { condition: 'needs_fix', status: 'needs_fix', findings: ['HIGH: missing permission check'], residual_risks: [] },
            { condition: 'approved', status: 'approved', findings: [], residual_risks: [] },
          ],
          harness_review: { condition: 'approved', status: 'approved', findings: [], residual_risks: [] },
          verify: { condition: 'verified' },
        },
      });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--workflow', path.join(__dirname, '..', '..', 'workflows', 'standard-development.yaml'),
        '--execute',
        '--loop',
        '--engine-command', adapter,
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-loop-fix' });

      assert.strictEqual(result.code, 0, result.stdout);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: DONE'));
      assert.ok(result.stdout.includes('Steps:       7'));
      assert.strictEqual(fs.readFileSync(`${marker}.research.count`, 'utf8'), '1');
      assert.strictEqual(fs.readFileSync(`${marker}.plan.count`, 'utf8'), '1');
      assert.strictEqual(fs.readFileSync(`${marker}.implement.count`, 'utf8'), '2');
      assert.strictEqual(fs.readFileSync(`${marker}.architecture_review.count`, 'utf8'), '2');
      assert.strictEqual(fs.readFileSync(`${marker}.security_review.count`, 'utf8'), '2');
      assert.strictEqual(fs.readFileSync(`${marker}.harness_review.count`, 'utf8'), '2');
      assert.strictEqual(fs.readFileSync(`${marker}.verify.count`, 'utf8'), '1');
      assert.ok(result.stdout.includes('Review:      approved (reviewers=3 findings=0)'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('blocks endless loop at workflow max steps', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const adapter = path.join(dir, 'adapter.js');
      const workflow = path.join(dir, 'loop.yaml');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));
      fs.writeFileSync(workflow, [
        'name: endless',
        'initial_step: implement',
        'max_steps: 2',
        'steps:',
        '  - name: implement',
        '    mode: edit',
        '    rules:',
        '      - condition: implementation_complete',
        '        next: review',
        '  - name: review',
        '    mode: readonly',
        '    rules:',
        '      - condition: needs_fix',
        '        next: implement',
        '',
      ].join('\n'));
      writeSequenceAdapter(adapter, {
        responses: {
          implement: { condition: 'implementation_complete' },
          review: {
            condition: 'approved',
            reviewers: [
              { name: 'security_review', status: 'needs_fix', findings: ['HIGH: still failing'], residual_risks: [] },
            ],
          },
        },
      });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--workflow', workflow,
        '--execute',
        '--loop',
        '--engine-command', adapter,
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-loop-max' });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: BLOCKED'));
      assert.ok(result.stdout.includes('workflow max steps exceeded: 2'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('loop blocks when adapter omits condition', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const adapter = path.join(dir, 'adapter.js');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));
      writeSequenceAdapter(adapter, {
        responses: {
          research: { summary: 'missing condition' },
        },
      });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--workflow', path.join(__dirname, '..', '..', 'workflows', 'standard-development.yaml'),
        '--execute',
        '--loop',
        '--engine-command', adapter,
      ], { HOME: path.join(dir, 'home'), CLAUDE_SESSION_ID: 'runner-loop-missing-condition' });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: BLOCKED'));
      assert.ok(result.stdout.includes('workflow adapter result must include condition'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('loop stops when adapter exits nonzero and records run_blocked', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const home = path.join(dir, 'home');
      const adapter = path.join(dir, 'adapter.js');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'));
      writeSequenceAdapter(adapter, {
        responses: {
          research: { condition: 'research_complete' },
        },
        exitByStep: { research: 1 },
      });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--run-id', 'run-loop-failed',
        '--workflow', path.join(__dirname, '..', '..', 'workflows', 'standard-development.yaml'),
        '--execute',
        '--loop',
        '--engine-command', adapter,
      ], { HOME: home, CLAUDE_SESSION_ID: 'runner-loop-adapter-failed' });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: BLOCKED'));
      assert.ok(result.stdout.includes('engine command failed with exit code 1'));
      const events = readNdjson(path.join(home, '.claude', 'runs', 'run-loop-failed', 'logs', 'events.ndjson'));
      assert.ok(events.some(event => event.type === 'run_blocked' && event.step === 'research'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('loop records permission_requested and stops before adapter when authorization is missing', () => {
    const dir = createTempDir();
    try {
      const repo = path.join(dir, 'repo');
      const home = path.join(dir, 'home');
      const adapter = path.join(dir, 'adapter.js');
      const marker = path.join(dir, 'adapter-marker.json');
      initRepo(repo);
      writePlan(path.join(repo, 'plan.md'), {
        extra: [
          '',
          '## Release',
          '- push after verification',
        ].join('\n'),
      });
      writeSequenceAdapter(adapter, {
        markerPath: marker,
        responses: {
          research: { condition: 'research_complete' },
        },
      });

      const result = run([
        '--repo', repo,
        '--plan', path.join(repo, 'plan.md'),
        '--track', 'standard',
        '--runtime', 'codex',
        '--run-id', 'run-loop-permission',
        '--workflow', path.join(__dirname, '..', '..', 'workflows', 'standard-development.yaml'),
        '--execute',
        '--loop',
        '--engine-command', adapter,
      ], { HOME: home, CLAUDE_SESSION_ID: 'runner-loop-permission' });

      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('PIPELINE RUNNER: NEEDS_DECISION'));
      assert.ok(result.stdout.includes('Permission:  full (source=plan_text)'));
      assert.ok(!fs.existsSync(marker));
      const events = readNdjson(path.join(home, '.claude', 'runs', 'run-loop-permission', 'logs', 'events.ndjson'));
      assert.ok(events.some(event => event.type === 'permission_requested' && event.step === 'research'));
      assert.ok(events.some(event => event.type === 'run_blocked' && event.blocker.includes('permission-sensitive action requires authorization: push')));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
