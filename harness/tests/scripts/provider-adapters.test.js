/**
 * Tests for harness/scripts/provider-adapters/*.js
 *
 * Run with: node harness/tests/scripts/provider-adapters.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CODEX_ADAPTER = path.join(__dirname, '../../scripts/provider-adapters/codex.js');
const CLAUDE_ADAPTER = path.join(__dirname, '../../scripts/provider-adapters/claude-code.js');
const WORKFLOW = path.join(__dirname, '../../workflows/standard-development.yaml');

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'provider-adapter-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeApprovedPlan(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, [
    '---',
    'title: provider adapter test plan',
    'status: approved',
    'task_type: non_trivial',
    'review_required: true',
    'observe_required: false',
    '---',
    '',
    '# Plan',
    '',
    '## Summary',
    '- Test provider adapters.',
    '',
  ].join('\n'));
}

function shellQuote(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function writeFakeProvider(filePath, options = {}) {
  const response = options.response === undefined
    ? { condition: 'research_complete', status: 'complete', summary: 'provider done', artifacts: ['research.md'] }
    : options.response;
  const exitCode = options.exitCode ?? 0;
  const markerPath = options.markerPath || '';
  const content = [
    '#!/usr/bin/env node',
    "const fs = require('fs');",
    'let input = "";',
    'process.stdin.setEncoding("utf8");',
    'process.stdin.on("data", chunk => { input += chunk; });',
    'process.stdin.on("end", () => {',
    `  const markerPath = ${JSON.stringify(markerPath)};`,
    '  if (markerPath) {',
    '    fs.writeFileSync(markerPath, JSON.stringify({',
    '      argv: process.argv.slice(2),',
    '      cwd: process.cwd(),',
    '      input,',
    '      env: {',
    '        step: process.env.PIPELINE_RUNNER_STEP,',
    '        runDir: process.env.PIPELINE_RUNNER_RUN_DIR,',
    '      },',
    '    }, null, 2));',
    '  }',
    response === null
      ? '  process.stdout.write("provider prose without json\\n");'
      : `  process.stdout.write(JSON.stringify(${JSON.stringify(response)}) + "\\n");`,
    '  process.stderr.write("provider stderr evidence\\n");',
    `  process.exit(${exitCode});`,
    '});',
    '',
  ].join('\n');
  fs.writeFileSync(filePath, content);
  fs.chmodSync(filePath, 0o755);
}

function runAdapter(adapterPath, args, env = {}) {
  const result = spawnSync(process.execPath, [adapterPath, ...args], {
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

function baseArgs(dir) {
  const planPath = path.join(dir, 'plan.md');
  writeApprovedPlan(planPath);
  return [
    '--repo', dir,
    '--plan', planPath,
    '--track', 'standard',
    '--runtime', 'codex',
    '--task-id', 'provider-adapter-test',
    '--workflow', WORKFLOW,
    '--step', 'research',
    '--run-id', 'run-provider-adapter',
  ];
}

function parseFirstJsonLine(stdout) {
  return JSON.parse(String(stdout).trim().split(/\r?\n/).find(Boolean));
}

function runTests() {
  console.log('\n=== Testing provider adapters ===\n');

  let passed = 0;
  let failed = 0;

  if (test('codex adapter sends assembled prompt to configured provider command and writes raw evidence', () => {
    const dir = createTempDir();
    try {
      const provider = path.join(dir, 'fake-provider.js');
      const marker = path.join(dir, 'provider-marker.json');
      const runDir = path.join(dir, 'harness/data/runs', 'run-provider-adapter');
      fs.mkdirSync(path.join(runDir, 'context'), { recursive: true });
      writeFakeProvider(provider, { markerPath: marker });

      const result = runAdapter(CODEX_ADAPTER, baseArgs(dir), {
        PROVIDER_ADAPTER_COMMAND: `${shellQuote(process.execPath)} ${shellQuote(provider)}`,
        PIPELINE_RUNNER_STEP: 'research',
        PIPELINE_RUNNER_RUN_DIR: runDir,
      });

      assert.strictEqual(result.code, 0, result.stderr);
      const output = parseFirstJsonLine(result.stdout);
      assert.strictEqual(output.condition, 'research_complete');
      assert.strictEqual(output.status, 'complete');
      assert.deepStrictEqual(output.artifacts, ['research.md']);

      const markerContent = JSON.parse(fs.readFileSync(marker, 'utf8'));
      assert.ok(markerContent.input.includes('SYSTEM PROMPT'));
      assert.ok(markerContent.input.includes('USER MESSAGE'));
      assert.ok(markerContent.input.includes('Test provider adapters.'));
      assert.ok(markerContent.input.includes('"condition"'));
      assert.ok(markerContent.input.includes('"status"'));
      assert.strictEqual(markerContent.env.step, 'research');
      assert.strictEqual(markerContent.env.runDir, runDir);

      assert.ok(fs.existsSync(path.join(runDir, 'context', 'provider-prompt.research.md')));
      assert.ok(fs.readFileSync(path.join(runDir, 'context', 'provider-stdout.research.txt'), 'utf8').includes('research_complete'));
      assert.ok(fs.readFileSync(path.join(runDir, 'context', 'provider-stderr.research.txt'), 'utf8').includes('provider stderr evidence'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('adapter blocks conservatively when provider output is not step-result JSON', () => {
    const dir = createTempDir();
    try {
      const provider = path.join(dir, 'fake-provider.js');
      writeFakeProvider(provider, { response: null });

      const result = runAdapter(CODEX_ADAPTER, baseArgs(dir), {
        PROVIDER_ADAPTER_COMMAND: `${shellQuote(process.execPath)} ${shellQuote(provider)}`,
        PIPELINE_RUNNER_STEP: 'research',
      });

      assert.strictEqual(result.code, 1);
      const output = parseFirstJsonLine(result.stdout);
      assert.strictEqual(output.condition, 'blocked');
      assert.strictEqual(output.status, 'blocked');
      assert.ok(output.blockers[0].includes('provider output did not include step-result JSON'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('codex adapter defaults to codex exec dash', () => {
    const dir = createTempDir();
    try {
      const binDir = path.join(dir, 'bin');
      const marker = path.join(dir, 'codex-marker.json');
      fs.mkdirSync(binDir, { recursive: true });
      writeFakeProvider(path.join(binDir, 'codex'), { markerPath: marker });

      const result = runAdapter(CODEX_ADAPTER, baseArgs(dir), {
        PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
        PIPELINE_RUNNER_STEP: 'research',
      });

      assert.strictEqual(result.code, 0, result.stderr);
      const markerContent = JSON.parse(fs.readFileSync(marker, 'utf8'));
      assert.deepStrictEqual(markerContent.argv, ['exec', '-']);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('claude-code adapter defaults to claude print mode', () => {
    const dir = createTempDir();
    try {
      const binDir = path.join(dir, 'bin');
      const marker = path.join(dir, 'claude-marker.json');
      fs.mkdirSync(binDir, { recursive: true });
      writeFakeProvider(path.join(binDir, 'claude'), {
        markerPath: marker,
        response: { condition: 'verified', status: 'complete', summary: 'verified' },
      });

      const result = runAdapter(CLAUDE_ADAPTER, [
        ...baseArgs(dir).map(value => value === 'codex' ? 'claude' : value),
        '--step', 'verify',
      ], {
        PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
        PIPELINE_RUNNER_STEP: 'verify',
      });

      assert.strictEqual(result.code, 0, result.stderr);
      const output = parseFirstJsonLine(result.stdout);
      assert.strictEqual(output.condition, 'verified');
      const markerContent = JSON.parse(fs.readFileSync(marker, 'utf8'));
      assert.deepStrictEqual(markerContent.argv, ['-p']);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
