/**
 * Tests for scripts/prompt-assemble.js
 *
 * Run with: node tests/scripts/prompt-assemble.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'prompt-assemble.js');

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-assemble-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${content.trim()}\n`);
}

function run(args = []) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    code: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function runTests() {
  console.log('\n=== Testing prompt-assemble.js ===\n');

  let passed = 0;
  let failed = 0;

  if (test('assembles deterministic prompts from workflow facets and task file', () => {
    const dir = createTempDir();
    try {
      const workflowPath = path.join(dir, 'workflow.yaml');
      const taskPath = path.join(dir, 'task.md');
      writeFile(workflowPath, `
name: prompt-test
initial_step: research
max_steps: 4
steps:
  - name: research
    mode: readonly
    facets:
      persona: researcher
      policy: local-policy
      knowledge: harness-map
      instruction: research-task
      output_contract: research-summary
    rules:
      - condition: done
        next: COMPLETE
`);
      writeFile(taskPath, '# Task\nInspect the workflow.');
      writeFile(path.join(dir, 'facets', 'personas', 'researcher.md'), 'You are a careful researcher.');
      writeFile(path.join(dir, 'facets', 'policies', 'local-policy.md'), 'Keep .claude authoritative.');
      writeFile(path.join(dir, 'facets', 'knowledge', 'harness-map.md'), 'HARNESS.md is the map.');
      writeFile(path.join(dir, 'facets', 'instructions', 'research-task.md'), 'Research before planning.');
      writeFile(path.join(dir, 'facets', 'output-contracts', 'research-summary.md'), 'Return concise findings.');

      const result = run([
        '--root', dir,
        '--workflow', workflowPath,
        '--step', 'research',
        '--task', taskPath,
      ]);

      assert.strictEqual(result.code, 0, result.stderr);
      assert.ok(result.stdout.includes('SYSTEM PROMPT'));
      assert.ok(result.stdout.includes('You are a careful researcher.'));
      assert.ok(result.stdout.includes('USER MESSAGE'));
      assert.ok(result.stdout.indexOf('## Knowledge') < result.stdout.indexOf('## Task'));
      assert.ok(result.stdout.indexOf('## Task') < result.stdout.indexOf('## Instruction'));
      assert.ok(result.stdout.indexOf('## Instruction') < result.stdout.indexOf('## Output Contract'));
      assert.ok(result.stdout.indexOf('## Output Contract') < result.stdout.indexOf('## Policy'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('fails when a referenced facet is missing', () => {
    const dir = createTempDir();
    try {
      const workflowPath = path.join(dir, 'workflow.yaml');
      writeFile(workflowPath, `
name: prompt-test
initial_step: research
max_steps: 4
steps:
  - name: research
    mode: readonly
    facets:
      persona: missing
    rules:
      - condition: done
        next: COMPLETE
`);

      const result = run(['--root', dir, '--workflow', workflowPath, '--step', 'research']);

      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('missing facet'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('assembles multiple facet references in deterministic order', () => {
    const dir = createTempDir();
    try {
      const workflowPath = path.join(dir, 'workflow.yaml');
      const taskPath = path.join(dir, 'task.md');
      writeFile(workflowPath, `
name: prompt-test
initial_step: implement
max_steps: 4
steps:
  - name: implement
    mode: edit
    facets:
      persona: implementer
      policy: [local-authority, coding]
      knowledge: [harness-map, workflow-map]
      instruction: implement-task
      output_contract: implementation-report
    rules:
      - condition: done
        next: COMPLETE
`);
      writeFile(taskPath, '# Task\nImplement the workflow.');
      writeFile(path.join(dir, 'facets', 'personas', 'implementer.md'), 'You implement carefully.');
      writeFile(path.join(dir, 'facets', 'policies', 'local-authority.md'), 'Keep .claude authoritative.');
      writeFile(path.join(dir, 'facets', 'policies', 'coding.md'), 'Keep code simple.');
      writeFile(path.join(dir, 'facets', 'knowledge', 'harness-map.md'), 'HARNESS.md is the map.');
      writeFile(path.join(dir, 'facets', 'knowledge', 'workflow-map.md'), 'workflows/ contains local workflows.');
      writeFile(path.join(dir, 'facets', 'instructions', 'implement-task.md'), 'Implement in small batches.');
      writeFile(path.join(dir, 'facets', 'output-contracts', 'implementation-report.md'), 'Return implementation evidence.');

      const result = run([
        '--root', dir,
        '--workflow', workflowPath,
        '--step', 'implement',
        '--task', taskPath,
      ]);

      assert.strictEqual(result.code, 0, result.stderr);
      assert.ok(result.stdout.includes('Keep .claude authoritative.\n\n---\n\nKeep code simple.'));
      assert.ok(result.stdout.includes('HARNESS.md is the map.\n\n---\n\nworkflows/ contains local workflows.'));
      assert.ok(result.stdout.indexOf('## Knowledge') < result.stdout.indexOf('## Task'));
      assert.ok(result.stdout.indexOf('## Output Contract') < result.stdout.indexOf('## Policy'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
