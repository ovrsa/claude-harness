/**
 * Tests for harness/scripts/harness-status.js
 *
 * Run with: node harness/tests/scripts/harness-status.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// harness/data/runs/ は git 追跡なので、テストが実リポジトリの run 記録に
// フィクスチャを混ぜないようにする（harness/scripts/lib/run-record.js）。
process.env.CLAUDE_DISABLE_RUN_RECORD = '1';

const SCRIPT = path.join(__dirname, '../../scripts/harness-status.js');

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    return true;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-status-cli-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function git(repo, args) {
  return execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function initRepo(dir) {
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ['init']);
  fs.writeFileSync(path.join(repo, 'README.md'), '# Test\n');
  git(repo, ['add', 'README.md']);
  git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'Initial commit']);
  return repo;
}

function run(args = []) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      code: err.status || 1,
      stdout: err.stdout || '',
      stderr: err.stderr || '',
    };
  }
}

function runTests() {
  console.log('\n=== Testing harness-status.js CLI ===\n');

  let passed = 0;
  let failed = 0;

  if (test('prints text status by default', () => {
    const dir = createTempDir();
    try {
      const repo = initRepo(dir);
      const result = run(['--repo', repo, '--home', dir]);
      assert.strictEqual(result.code, 0);
      // 成果物ゼロはブロックではないが READY にもしない。
      assert.ok(result.stdout.includes('HARNESS STATUS: NEEDS_ACTION'));
      assert.ok(result.stdout.includes('Repo:'));
      assert.ok(result.stdout.includes('Recommended next action:'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('prints json with --format json', () => {
    const dir = createTempDir();
    try {
      const repo = initRepo(dir);
      const result = run(['--repo', repo, '--home', dir, '--format', 'json']);
      assert.strictEqual(result.code, 0);
      const parsed = JSON.parse(result.stdout);
      assert.strictEqual(parsed.status, 'NEEDS_ACTION');
      assert.strictEqual(parsed.repo.root, repo);
      assert.ok(parsed.recommendedAction.includes('docs/design/'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('rejects unsupported output format', () => {
    const result = run(['--format', 'yaml']);
    assert.strictEqual(result.code, 1);
    assert.ok(result.stderr.includes('Unsupported format'));
  })) passed++; else failed++;

  if (test('shows help', () => {
    const result = run(['--help']);
    assert.strictEqual(result.code, 0);
    assert.ok(result.stdout.includes('Harness Status'));
    assert.ok(result.stdout.includes('--format'));
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
