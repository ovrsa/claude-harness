'use strict';
// The pre-edit hook's advice to draft an issue first, through its public entrypoint: stdin in,
// exit code and stdout out. Each case builds a throwaway repository, and TMPDIR points into the
// test root so the once-per-session marker never touches the real temp directory.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const hook = path.resolve(__dirname, '../../hooks/lifecycle-pre-edit.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'draft-issue-advisory-'));
const tmp = path.join(root, 'tmp');
const home = path.join(root, 'home');
fs.mkdirSync(tmp);
fs.mkdirSync(home);
let passed = 0;
let session = 0;

const env = { ...process.env, TMPDIR: tmp, HOME: home, USERPROFILE: home };
for (const name of ['CLAUDE_SESSION_ID', 'CLAUDE_CODE_SESSION_ID', 'CODEX_SESSION_ID', 'CODEX_THREAD_ID']) delete env[name];

function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
function git(dir, ...args) {
  const result = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function repo({ branch = 'main', tracker = { kind: 'github', repo: 'acme/widgets' } } = {}) {
  const dir = fs.mkdtempSync(path.join(root, 'repo-'));
  git(dir, 'init', '-q', '-b', branch);
  if (tracker) {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', 'tracker.json'), JSON.stringify(tracker));
  }
  return dir;
}
function newSession() { return `session-${++session}`; }
function input(file, sessionId) {
  return JSON.stringify({ session_id: sessionId, cwd: path.dirname(file), hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: file, content: 'x' } });
}
function write(file, sessionId) {
  const result = spawnSync(process.execPath, [hook], { input: input(file, sessionId), encoding: 'utf8', env, cwd: root });
  assert.strictEqual(result.status, 0, `a write is never stopped: ${result.stderr}`);
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}
function assertAdvised(output, branch) {
  assert.ok(output, 'expected the draft-issue advisory');
  const context = output.hookSpecificOutput?.additionalContext || '';
  assert.strictEqual(output.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.ok(context.includes('draft-issue'), context);
  assert.ok(context.includes(branch), context);
  assert.strictEqual(output.hookSpecificOutput.permissionDecision, undefined, 'the advisory must not decide the permission');
  assert.strictEqual(output.decision, undefined, 'the advisory must not block');
}

try {
  test('the first write on a branch without an issue number advises draft-issue, the second in that session does not', () => {
    const dir = repo();
    const id = newSession();
    assertAdvised(write(path.join(dir, 'a.md'), id), 'main');
    assert.strictEqual(write(path.join(dir, 'b.js'), id), null);
    assert.strictEqual(write(path.join(dir, 'a.md'), id), null);
  });

  test('the once-per-session limit spans repositories, and a new session is advised again', () => {
    const first = repo();
    const second = repo({ branch: 'feature-x' });
    const id = newSession();
    assertAdvised(write(path.join(first, 'a.md'), id), 'main');
    assert.strictEqual(write(path.join(second, 'a.md'), id), null);
    assertAdvised(write(path.join(second, 'a.md'), newSession()), 'feature-x');
  });

  test('a branch that names an issue is not advised', () => {
    const github = ['issue-18', 'worktree-issue-18', 'ovrsa/issue-13', 'feat/issue-9-graph-contract', 'issue18', '18-draft-issue', 'kyo/18-draft-issue'];
    for (const branch of github) assert.strictEqual(write(path.join(repo({ branch }), 'a.md'), newSession()), null, branch);
    const linear = repo({ branch: 'kyo/pri-251-draft', tracker: { kind: 'linear' } });
    assert.strictEqual(write(path.join(linear, 'a.md'), newSession()), null, 'a Linear identifier names the issue');
  });

  test('a number that is not an issue reference still gets the advisory', () => {
    const dir = repo({ branch: 'fix/trace-entry-20260924' });
    assertAdvised(write(path.join(dir, 'a.md'), newSession()), 'fix/trace-entry-20260924');
  });

  test('a repository without a declared tracker, or declared as none, is not advised', () => {
    const undeclared = repo({ tracker: null });
    const none = repo({ tracker: { kind: 'none' } });
    const broken = repo({ tracker: { kind: 'Not A Kind' } });
    const id = newSession();
    assert.strictEqual(write(path.join(undeclared, 'a.md'), id), null);
    assert.strictEqual(write(path.join(none, 'a.md'), id), null);
    assert.strictEqual(write(path.join(broken, 'a.md'), id), null);
    assertAdvised(write(path.join(repo(), 'a.md'), id), 'main');
  });

  test('a linked worktree without its own declaration reads the main checkout and is advised', () => {
    const main = repo();
    fs.writeFileSync(path.join(main, '.gitignore'), '.claude/\n');
    git(main, 'add', '.gitignore');
    git(main, '-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'init');
    const worktree = path.join(root, `worktree-${session}`);
    git(main, 'worktree', 'add', '-q', worktree, '-b', 'lifecycle-test');
    assert.ok(!fs.existsSync(path.join(worktree, '.claude', 'tracker.json')));
    assertAdvised(write(path.join(worktree, 'src', 'new', 'a.js'), newSession()), 'lifecycle-test');
  });

  test('ignored files and files outside a repository neither advise nor use up the session', () => {
    const dir = repo();
    fs.writeFileSync(path.join(dir, '.gitignore'), 'scratch/\n');
    const outside = fs.mkdtempSync(path.join(root, 'plain-'));
    const id = newSession();
    assert.strictEqual(write(path.join(dir, 'scratch', 'notes.md'), id), null);
    assert.strictEqual(write(path.join(outside, 'notes.md'), id), null);
    assertAdvised(write(path.join(dir, 'a.md'), id), 'main');
  });

  test('a detached HEAD is not advised', () => {
    const dir = repo();
    git(dir, '-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
    git(dir, 'checkout', '-q', '--detach');
    assert.strictEqual(write(path.join(dir, 'a.md'), newSession()), null);
  });
} catch (error) {
  console.error(`  ✗ ${error.message}`);
  fs.rmSync(root, { recursive: true, force: true });
  process.exit(1);
}

// Parallel Edit calls start the hook concurrently; only one of them may carry the advisory.
const dir = repo();
const id = newSession();
Promise.all(Array.from({ length: 6 }, () => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [hook], { env, cwd: root });
  let stdout = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.on('error', reject);
  child.on('close', code => resolve({ code, stdout }));
  child.stdin.end(input(path.join(dir, 'a.md'), id));
}))).then(results => {
  assert.ok(results.every(result => result.code === 0));
  assert.strictEqual(results.filter(result => result.stdout.includes('draft-issue')).length, 1);
  passed++;
  console.log('  ✓ concurrent writes in one session produce exactly one advisory');
  console.log(`\nResults: Passed: ${passed}, Failed: 0`);
}).catch(error => {
  console.error(`  ✗ ${error.message}`);
  process.exitCode = 1;
}).finally(() => fs.rmSync(root, { recursive: true, force: true }));
