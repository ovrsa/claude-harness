'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-session-'));
const repo = path.join(tmp, 'repo');
const env = { ...process.env, HOME: tmp };
for (const key of ['CLAUDE_SESSION_ID', 'CLAUDE_CODE_SESSION_ID', 'CODEX_SESSION_ID', 'CODEX_THREAD_ID', 'CLAUDE_DISABLE_RUN_RECORD']) delete env[key];
function run(file, args, input, extra = {}) {
  return spawnSync(process.execPath, [path.join(root, file), ...args], { cwd: repo, env: { ...env, ...extra }, input, encoding: 'utf8' });
}
try {
  fs.mkdirSync(repo);
  spawnSync('git', ['init', '-q', '-b', 'task-test', repo]);
  fs.writeFileSync(path.join(repo, 'verification-summary.md'), '# Verification Summary\n\n## Scope\nfixture\n\n## Commands Run\nnode test\n\n## RED Evidence\nfailed\n\n## Verification Outcome\npassed\n');
  const payload = { session_id: 'native-id', cwd: repo, hook_event_name: 'SessionStart' };
  let result = run('scripts/hooks/runtime-session.js', ['--runtime', 'codex'], JSON.stringify(payload), { CLAUDE_SESSION_ID: 'inherited-parent' });
  assert.strictEqual(result.status, 0, result.stderr);
  let list = run('scripts/runs-cli.js', ['list'], '');
  const id = list.stdout.split(/\s/)[0];
  let record = JSON.parse(run('scripts/runs-cli.js', ['show', id, '--json'], '').stdout);
  assert.deepStrictEqual(record.session_ids, ['codex-session-native-id']);
  result = run('scripts/hooks/runtime-session.js', ['--runtime', 'claude'], JSON.stringify({ ...payload, session_id: 'claude-native', hook_event_name: 'SessionEnd' }));
  assert.strictEqual(result.status, 0, result.stderr);
  record = JSON.parse(run('scripts/runs-cli.js', ['show', id, '--json'], '').stdout);
  assert.deepStrictEqual([...record.session_ids].sort(), ['claude-native', 'codex-session-native-id']);
  const before = JSON.stringify(record);
  for (const input of ['{', 'null', '[]', JSON.stringify({ ...payload, session_id: '../wrong' }), JSON.stringify({ ...payload, cwd: 'relative' }), 'x'.repeat(1024 * 1024 + 1)]) {
    const bad = run('scripts/hooks/runtime-session.js', ['--runtime', 'codex'], input);
    assert.strictEqual(bad.status, 0);
    assert.strictEqual(JSON.stringify(JSON.parse(run('scripts/runs-cli.js', ['show', id, '--json'], '').stdout)), before);
  }
  result = run('scripts/hooks/session-end-marker.js', [], JSON.stringify({ ...payload, session_id: 'legacy-native' }));
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(result.stdout, JSON.stringify({ ...payload, session_id: 'legacy-native' }));
  result = run('scripts/hooks/session-start.js', [], JSON.stringify({ ...payload, session_id: 'legacy-start' }));
  assert.strictEqual(result.status, 0, result.stderr);
  result = run('scripts/hooks/runtime-session-end.js', [], '', { CLAUDE_CODE_SESSION_ID: 'manual-claude' });
  assert.strictEqual(result.status, 0, result.stderr);
  record = JSON.parse(run('scripts/runs-cli.js', ['show', id, '--json'], '').stdout);
  for (const expected of ['legacy-native', 'legacy-start', 'manual-claude']) assert.ok(record.session_ids.includes(expected), expected);
  console.log('Passed: native hook identities share one Run without inheriting another runtime id');
  console.log('Results: Passed: 1, Failed: 0');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
