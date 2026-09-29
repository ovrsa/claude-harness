/**
 * Tests for harness/hooks/git-push-guard.js
 *
 * The guard blocks pushes that target main/master. It must catch the implicit
 * form (`git push` while standing on main), not just the explicit refspec,
 * because the implicit form is the common one and a command-string regex
 * cannot see the branch name at all.
 *
 * Run with: node harness/tests/hooks/git-push-guard.test.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');

const guardScript = path.join(__dirname, '../../hooks/git-push-guard.js');

function test(name, fn) {
  try {
    fn();
    console.log(` ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(` ✗ ${name}`);
    console.log(` Error: ${err.message}`);
    return false;
  }
}

/**
 * Run the guard with a command and a working directory.
 * Returns { code, stderr }.
 */
function runGuard(command, cwd) {
  const result = spawnSync('node', [guardScript], {
    encoding: 'utf8',
    input: JSON.stringify({ tool_input: { command } }),
    timeout: 10000,
    cwd,
  });
  return {
    code: typeof result.status === 'number' ? result.status : 0,
    stderr: result.stderr || '',
  };
}

const BLOCKED = 2;
const ALLOWED = 0;

function makeRepo(branch) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'push-guard-'));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  git('config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(dir, 'f.txt'), 'x');
  git('add', 'f.txt');
  git('commit', '-q', '-m', 'init');
  git('checkout', '-q', '-B', branch);
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function runTests() {
  console.log('\n=== Testing git-push-guard.js ===\n');

  let passed = 0;
  let failed = 0;
  const record = ok => { if (ok) passed++; else failed++; };

  const onMain = makeRepo('main');
  const onMaster = makeRepo('master');
  const onFeature = makeRepo('feature/x');
  const onMaintenance = makeRepo('maintenance');
  const notARepo = fs.mkdtempSync(path.join(os.tmpdir(), 'push-guard-plain-'));

  try {
    console.log('implicit push (no refspec):');

    record(test('blocks bare `git push` while on main', () => {
      const { code, stderr } = runGuard('git push', onMain);
      assert.strictEqual(code, BLOCKED);
      assert.ok(/main/.test(stderr), 'stderr should name the branch');
    }));

    record(test('blocks bare `git push` while on master', () => {
      assert.strictEqual(runGuard('git push', onMaster).code, BLOCKED);
    }));

    record(test('blocks `git push -u origin` while on main', () => {
      assert.strictEqual(runGuard('git push -u origin', onMain).code, BLOCKED);
    }));

    record(test('allows bare `git push` on a feature branch', () => {
      assert.strictEqual(runGuard('git push', onFeature).code, ALLOWED);
    }));

    console.log('\nexplicit refspec:');

    record(test('blocks `git push origin main`', () => {
      assert.strictEqual(runGuard('git push origin main', onFeature).code, BLOCKED);
    }));

    record(test('blocks `git push origin master`', () => {
      assert.strictEqual(runGuard('git push origin master', onFeature).code, BLOCKED);
    }));

    record(test('blocks `git push origin HEAD:main`', () => {
      assert.strictEqual(runGuard('git push origin HEAD:main', onFeature).code, BLOCKED);
    }));

    record(test('blocks `git push origin HEAD:refs/heads/main`', () => {
      assert.strictEqual(runGuard('git push origin HEAD:refs/heads/main', onFeature).code, BLOCKED);
    }));

    record(test('blocks force push to main', () => {
      assert.strictEqual(runGuard('git push --force origin main', onFeature).code, BLOCKED);
    }));

    record(test('blocks branch deletion of main', () => {
      assert.strictEqual(runGuard('git push origin :main', onFeature).code, BLOCKED);
    }));

    record(test('blocks `git push --delete origin main`', () => {
      assert.strictEqual(runGuard('git push --delete origin main', onFeature).code, BLOCKED);
    }));

    record(test('allows `git push origin feature/x`', () => {
      assert.strictEqual(runGuard('git push origin feature/x', onFeature).code, ALLOWED);
    }));

    record(test('allows deleting a non-protected branch', () => {
      assert.strictEqual(runGuard('git push origin :feature/x', onFeature).code, ALLOWED);
    }));

    console.log('\nsubstring traps (must not over-block):');

    record(test('allows bare push while on `maintenance`', () => {
      assert.strictEqual(runGuard('git push', onMaintenance).code, ALLOWED);
    }));

    record(test('allows `git push origin mainline`', () => {
      assert.strictEqual(runGuard('git push origin mainline', onFeature).code, ALLOWED);
    }));

    record(test('allows `git push origin feature/main-menu`', () => {
      assert.strictEqual(runGuard('git push origin feature/main-menu', onFeature).code, ALLOWED);
    }));

    console.log('\nnot actually a push:');

    record(test('allows a commit whose message contains "git push origin main"', () => {
      assert.strictEqual(runGuard('git commit -m "git push origin main"', onMain).code, ALLOWED);
    }));

    record(test('allows echoing the words', () => {
      assert.strictEqual(runGuard('echo "git push origin main"', onMain).code, ALLOWED);
    }));

    record(test('allows `git status`', () => {
      assert.strictEqual(runGuard('git status', onMain).code, ALLOWED);
    }));

    console.log('\ndry runs are not pushes:');

    record(test('allows `git push --dry-run origin main`', () => {
      assert.strictEqual(runGuard('git push --dry-run origin main', onFeature).code, ALLOWED);
    }));

    record(test('allows `git push -n` while on main', () => {
      assert.strictEqual(runGuard('git push -n', onMain).code, ALLOWED);
    }));

    console.log('\ncompound and prefixed commands:');

    record(test('blocks a push hidden after &&', () => {
      assert.strictEqual(runGuard('cd /tmp && git push origin main', onFeature).code, BLOCKED);
    }));

    record(test('blocks `git -C <path> push origin main`', () => {
      assert.strictEqual(runGuard(`git -C ${onFeature} push origin main`, onFeature).code, BLOCKED);
    }));

    record(test('resolves the implicit branch from -C, not from cwd', () => {
      assert.strictEqual(runGuard(`git -C ${onMain} push`, onFeature).code, BLOCKED);
    }));

    record(test('allows implicit push from -C when that repo is not on main', () => {
      assert.strictEqual(runGuard(`git -C ${onFeature} push`, onMain).code, ALLOWED);
    }));

    record(test('blocks a push after a semicolon', () => {
      assert.strictEqual(runGuard('echo hi; git push origin main', onFeature).code, BLOCKED);
    }));

    console.log('\nfailure modes stay open:');

    record(test('allows push when cwd is not a git repository', () => {
      assert.strictEqual(runGuard('git push', notARepo).code, ALLOWED);
    }));

    record(test('allows malformed hook input', () => {
      const result = spawnSync('node', [guardScript], {
        encoding: 'utf8',
        input: 'not json',
        timeout: 10000,
        cwd: onMain,
      });
      assert.strictEqual(typeof result.status === 'number' ? result.status : 0, ALLOWED);
    }));

    record(test('allows empty hook input', () => {
      const result = spawnSync('node', [guardScript], {
        encoding: 'utf8',
        input: '',
        timeout: 10000,
        cwd: onMain,
      });
      assert.strictEqual(typeof result.status === 'number' ? result.status : 0, ALLOWED);
    }));

    console.log('\nnot disableable by hook profile:');

    record(test('blocks even when every hook profile flag is set to disable it', () => {
      const result = spawnSync('node', [guardScript], {
        encoding: 'utf8',
        input: JSON.stringify({ tool_input: { command: 'git push origin main' } }),
        timeout: 10000,
        cwd: onFeature,
        env: {
          ...process.env,
          ECC_HOOK_PROFILE: 'minimal',
          ECC_DISABLED_HOOKS: 'pre:bash:git-push-guard,git-push-guard',
        },
      });
      assert.strictEqual(result.status, BLOCKED);
    }));
  } finally {
    [onMain, onMaster, onFeature, onMaintenance, notARepo].forEach(cleanup);
  }

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}\n`);
  return failed === 0;
}

if (require.main === module) {
  process.exit(runTests() ? 0 : 1);
}

module.exports = { runTests };
