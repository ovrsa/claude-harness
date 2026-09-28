'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-bridge-'));
const codex = path.join(tmp, 'codex');
fs.mkdirSync(codex);
const original = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo existing' }] }] } };
fs.writeFileSync(path.join(codex, 'hooks.json'), JSON.stringify(original));
fs.writeFileSync(path.join(codex, 'AGENTS.md'), '# My instructions\n');
fs.writeFileSync(path.join(codex, 'config.toml'), '[features]\nhooks = true\n');
function run(mode) {
  return spawnSync(process.execPath, [path.join(root, 'scripts/sync-codex-bridge.js'), mode, '--claude-root', root, '--codex-home', codex], { encoding: 'utf8' });
}
try {
  assert.strictEqual(run('--check').status, 2);
  const applied = run('--apply');
  assert.strictEqual(applied.status, 0, applied.stderr);
  assert.strictEqual(run('--check').status, 0);
  const hooks = fs.readFileSync(path.join(codex, 'hooks.json'), 'utf8');
  assert.deepStrictEqual(JSON.parse(hooks).hooks.Stop[0], original.hooks.Stop[0]);
  assert.ok(fs.readFileSync(path.join(codex, 'AGENTS.md'), 'utf8').startsWith('# My instructions\n'));
  assert.strictEqual(fs.realpathSync(path.join(codex, 'skills/claude-imported')), fs.realpathSync(path.join(root, 'skills')));
  assert.strictEqual(run('--apply').status, 0);
  assert.strictEqual(fs.readFileSync(path.join(codex, 'hooks.json'), 'utf8'), hooks);
  assert.strictEqual(fs.readFileSync(path.join(codex, 'config.toml'), 'utf8'), '[features]\nhooks = true\n');
  const agents = fs.readFileSync(path.join(codex, 'AGENTS.md'), 'utf8');
  fs.writeFileSync(path.join(codex, 'AGENTS.override.md'), 'custom override');
  assert.strictEqual(run('--apply').status, 1);
  assert.strictEqual(fs.readFileSync(path.join(codex, 'AGENTS.md'), 'utf8'), agents);
  fs.unlinkSync(path.join(codex, 'AGENTS.override.md'));
  fs.writeFileSync(path.join(codex, 'AGENTS.md'), agents.replace('Read `', 'Do not read `'));
  assert.strictEqual(run('--check').status, 2);
  assert.strictEqual(run('--apply').status, 0);
  assert.strictEqual(fs.readFileSync(path.join(codex, 'AGENTS.md'), 'utf8'), agents);
  const link = path.join(codex, 'skills/claude-imported');
  fs.unlinkSync(link);
  fs.mkdirSync(link);
  fs.writeFileSync(path.join(link, 'keep'), 'user-owned');
  assert.strictEqual(run('--apply').status, 1);
  assert.strictEqual(fs.readFileSync(path.join(link, 'keep'), 'utf8'), 'user-owned');
  console.log('Passed: check/apply detects drift, preserves custom settings, and is idempotent');
  console.log('Results: Passed: 1, Failed: 0');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
