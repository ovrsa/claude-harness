#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');

function run(script, args = [], options = {}) {
  return spawnSync(process.execPath, [path.join(ROOT, script), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    ...options,
    env: { ...process.env, ...(options.env || {}) },
  });
}

function main() {
  const grill = run('scripts/resolve-managed-skill.js', ['grilling']);
  assert.strictEqual(grill.status, 0, grill.stderr);
  assert.match(grill.stdout, /\/grilling\/SKILL\.md\s*$/);
  assert.ok(fs.realpathSync(grill.stdout.trim()).startsWith(fs.realpathSync(path.join(ROOT, 'plugins', 'cache'))));

  const contract = run('scripts/ci/audit-harness-contract.js');
  assert.strictEqual(contract.status, 0, contract.stderr);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grill-harness-smoke-'));
  const env = { CLAUDE_EXPERIENCE_ROOT: tempRoot, CODEX_THREAD_ID: 'smoke', CLAUDE_SESSION_ID: '' };
  const start = run('scripts/hooks/runtime-session-start.js', [], { env });
  const end = run('scripts/hooks/runtime-session-end.js', [], { env });
  assert.strictEqual(start.status, 0);
  assert.strictEqual(end.status, 0);
  assert.strictEqual(start.stdout, '');
  assert.strictEqual(end.stdout, '');

  const runPath = path.join(tempRoot, 'runs', 'codex-codex-thread-smoke');
  assert.ok(fs.existsSync(path.join(runPath, 'manifest.json')));
  assert.ok(fs.existsSync(path.join(runPath, 'trace.jsonl')));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(runPath, 'outcome.json'), 'utf8')).outcome, 'unknown');

  const permission = run('scripts/hooks/permission-request.js', [], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'rm -rf /tmp/smoke-fixture' } }),
  });
  assert.strictEqual(permission.status, 0);
  assert.strictEqual(JSON.parse(permission.stdout).hookSpecificOutput.decision.behavior, 'deny');

  console.log('PASS: Grill harness smoke');
}

try {
  main();
} catch (error) {
  console.error('FAIL: ' + error.message);
  process.exit(1);
}
