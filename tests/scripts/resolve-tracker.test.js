'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const script = path.resolve(__dirname, '../../scripts/resolve-tracker.js');
const roots = [];
let passed = 0;

function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
function git(dir, ...args) {
  const result = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function repo(remotes = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-tracker-'));
  roots.push(dir);
  git(dir, 'init', '-q');
  for (const [name, url] of Object.entries(remotes)) git(dir, 'remote', 'add', name, url);
  return dir;
}
function writeConfig(dir, value) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'tracker.json'), typeof value === 'string' ? value : JSON.stringify(value));
}
function run(dir) {
  const result = spawnSync(process.execPath, [script, '--repo', dir], { encoding: 'utf8' });
  let json = null;
  try { json = JSON.parse(result.stdout); } catch { /* asserted by the caller */ }
  return { status: result.status, json, stdout: result.stdout, stderr: result.stderr };
}

try {
  test('a declared GitHub tracker puts the design doc in the parent issue', () => {
    const dir = repo({ origin: 'git@github.com:acme/widgets.git' });
    writeConfig(dir, { kind: 'github', repo: 'acme/specs' });
    const result = run(dir);
    assert.strictEqual(result.status, 0, result.stdout + result.stderr);
    assert.strictEqual(result.json.status, 'configured');
    assert.deepStrictEqual(result.json.tracker, { kind: 'github', repo: 'acme/specs' });
    assert.strictEqual(result.json.design_doc, 'parent-issue');
  });

  test('a project without a tracker keeps the design doc in docs/design', () => {
    const dir = repo({ origin: 'https://github.com/acme/widgets.git' });
    writeConfig(dir, { kind: 'none' });
    const result = run(dir);
    assert.strictEqual(result.status, 0, result.stdout + result.stderr);
    assert.strictEqual(result.json.status, 'none');
    assert.strictEqual(result.json.design_doc, 'docs/design');
  });

  test('an undeclared tracker is not guessed: remotes become candidates and exit 2 waits for a person', () => {
    const dir = repo({
      origin: 'git@github.com:acme/widgets.git',
      mirror: 'https://gitlab.com/acme/infra/widgets.git',
      backup: 'ssh://git@github.com/acme/widgets',
    });
    const result = run(dir);
    assert.strictEqual(result.status, 2, result.stdout + result.stderr);
    assert.strictEqual(result.json.status, 'unconfigured');
    assert.strictEqual(result.json.design_doc, null);
    assert.deepStrictEqual(result.json.candidates, [
      { kind: 'github', repo: 'acme/widgets' },
      { kind: 'gitlab', project: 'acme/infra/widgets' },
      { kind: 'none' },
    ]);
    assert.strictEqual(fs.realpathSync(path.dirname(path.dirname(result.json.expected_path))), fs.realpathSync(dir));

    const bare = run(repo());
    assert.strictEqual(bare.status, 2);
    assert.deepStrictEqual(bare.json.candidates, [{ kind: 'none' }]);
  });

  test('a broken declaration is reported as invalid instead of falling back to a guess', () => {
    const dir = repo({ origin: 'git@github.com:acme/widgets.git' });
    for (const [value, reason] of [
      ['{not json', /JSON/],
      ['[]', /object/],
      [{}, /kind/],
      [{ kind: 'GitHub Enterprise' }, /kind/],
      [{ kind: 'github', repo: 'widgets' }, /repo/],
    ]) {
      writeConfig(dir, value);
      const result = run(dir);
      assert.strictEqual(result.status, 1, `${JSON.stringify(value)}: ${result.stdout}${result.stderr}`);
      assert.strictEqual(result.json.status, 'invalid');
      assert.strictEqual(result.json.design_doc, null);
      assert.match(result.json.error, reason);
    }
  });

  test('a GitHub declaration without repo takes it from the GitHub remote, and fails without one', () => {
    const dir = repo({ fork: 'git@github.com:someone/widgets.git', origin: 'https://github.com/acme/widgets.git' });
    writeConfig(dir, { kind: 'github' });
    const result = run(dir);
    assert.strictEqual(result.status, 0, result.stdout + result.stderr);
    assert.deepStrictEqual(result.json.tracker, { kind: 'github', repo: 'acme/widgets' });

    const local = repo({ origin: 'https://example.com/acme/widgets.git' });
    writeConfig(local, { kind: 'github' });
    const missing = run(local);
    assert.strictEqual(missing.status, 1);
    assert.match(missing.json.error, /repo/);
  });

  test('a non-GitHub declaration is passed through unchanged for whatever access the runtime has', () => {
    const dir = repo({ origin: 'git@github.com:acme/widgets.git' });
    writeConfig(dir, { kind: 'linear', team: 'PRI', project: 'Genba' });
    const result = run(dir);
    assert.strictEqual(result.status, 0, result.stdout + result.stderr);
    assert.strictEqual(result.json.status, 'configured');
    assert.deepStrictEqual(result.json.tracker, { kind: 'linear', team: 'PRI', project: 'Genba' });
    assert.strictEqual(result.json.design_doc, 'parent-issue');
  });

  test('a linked worktree reads the main checkout declaration unless it has its own', () => {
    const main = repo({ origin: 'git@github.com:acme/widgets.git' });
    fs.writeFileSync(path.join(main, 'README.md'), 'widgets\n');
    git(main, 'add', 'README.md');
    git(main, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'init');
    writeConfig(main, { kind: 'github', repo: 'acme/widgets' });
    const worktree = `${main}-wt`;
    roots.push(worktree);
    git(main, 'worktree', 'add', '-q', '-b', 'topic', worktree);

    const inherited = run(worktree);
    assert.strictEqual(inherited.status, 0, inherited.stdout + inherited.stderr);
    assert.strictEqual(fs.realpathSync(inherited.json.source), fs.realpathSync(path.join(main, '.claude', 'tracker.json')));

    writeConfig(worktree, { kind: 'none' });
    const own = run(worktree);
    assert.strictEqual(own.json.status, 'none');
    assert.strictEqual(fs.realpathSync(own.json.source), fs.realpathSync(path.join(worktree, '.claude', 'tracker.json')));
  });
} finally {
  for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`Results: Passed: ${passed}, Failed: 0`);
