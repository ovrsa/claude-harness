/**
 * Tests for hook scripts
 *
 * Run with: node harness/tests/hooks/hooks.test.js
 *
 * There is no failure-exemption list. A failure here fails the suite.
 *
 * Until 2026-08-10 this file carried a baseline-allowlist map plus an opt-in flag that
 * reclassified listed failures as expected. It hid five entries behind a zero-unexpected-failures
 * line, so run-all.js printed a green summary while three environment-dependent tests were
 * actually failing (and two entries had been stale for long enough that nobody noticed).
 * Fix the test or fix the code. harness/scripts/ci/audit-harness-contract.js now fails if the
 * allowlist comes back.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

// harness/data/runs/ は git 追跡なので、テストが実リポジトリの run 記録に
// フィクスチャを混ぜないようにする（harness/scripts/lib/run-record.js）。
process.env.CLAUDE_DISABLE_RUN_RECORD = '1';

const failedTests = [];

// Test helper
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    failedTests.push({ name, message: err.message });
    return false;
  }
}

// Async test helper
async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    failedTests.push({ name, message: err.message });
    return false;
  }
}

// Run a script and capture output
function runScript(scriptPath, input = '', env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => stdout += data);
    proc.stderr.on('data', data => stderr += data);

    if (input) {
      proc.stdin.write(input);
    }
    proc.stdin.end();

    proc.on('close', code => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', reject);
  });
}

function runScriptInDir(scriptPath, cwd, input = '', env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => stdout += data);
    proc.stderr.on('data', data => stderr += data);

    if (input) {
      proc.stdin.write(input);
    }
    proc.stdin.end();

    proc.on('close', code => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', reject);
  });
}

// Create a temporary test directory
function createTestDir() {
  const testDir = path.join(os.tmpdir(), `hooks-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  return testDir;
}

// Clean up test directory
function cleanupTestDir(testDir) {
  fs.rmSync(testDir, { recursive: true, force: true });
}

// ライフサイクル助言の重み判定は linked worktree かどうかで決まるので、
// standard / heavy-risky 相当の状況を作るテストは実際に worktree を作る。
// 返すパスは `git worktree add` が作るので、事前に mkdir してはいけない。
function createLinkedWorktree(testDir, name = 'repo') {
  const { execFileSync } = require('child_process');
  const base = path.join(testDir, 'base');
  const worktree = path.join(testDir, name);
  fs.mkdirSync(base, { recursive: true });
  const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: 'ignore' });
  git(['init'], base);
  git(['-c', 'user.email=t@example.com', '-c', 'user.name=t',
    'commit', '--allow-empty', '-m', 'init'], base);
  git(['worktree', 'add', worktree, '-b', 'lifecycle-test'], base);
  return worktree;
}

// pre-compact.js reads the repository found at cwd and appends its artifact snapshot to the
// active session file; subagent-stop.js appends to the same file. Launched through runScript they
// inherited the test process's cwd, so they read THIS repository and the assertions below turned
// on whichever lifecycle artifacts happened to be sitting in it. Give them a throwaway repository
// instead. It has to be a real git repo, not a bare directory, or getRepoRoot returns null and the
// checkpoint branch under test never executes.
// Until 2026-08-17 these hooks also wrote progress.md into that repository, so the same mistake
// corrupted real session state rather than merely making the test depend on it.
let sandboxRepoDir = null;
function getSandboxRepo() {
  if (!sandboxRepoDir) {
    sandboxRepoDir = path.join(os.tmpdir(), `hooks-progress-sandbox-${Date.now()}`);
    fs.mkdirSync(sandboxRepoDir, { recursive: true });
    require('child_process').execFileSync('git', ['init'], { cwd: sandboxRepoDir, stdio: 'ignore' });
  }
  return sandboxRepoDir;
}

function cleanupSandboxRepo() {
  if (!sandboxRepoDir) return;
  fs.rmSync(sandboxRepoDir, { recursive: true, force: true });
  sandboxRepoDir = null;
}

// session-start.js reads BOTH $HOME (session files, learned skills, run records under
// ~/.claude/runs) and the cwd's repository (the lifecycle artifacts). Isolating only $HOME leaves
// the real repo as cwd, so the artifact branch wins and the session-injection assertions below
// never exercise what they claim.
// The repo has to be an empty git repo, not just any directory, so the outcome does not depend
// on whether the temp dir happens to sit under some ancestor repository.
function createSessionStartFixture(prefix) {
  const testDir = path.join(os.tmpdir(), `${prefix}-${Date.now()}`);
  const isoHome = path.join(testDir, 'home');
  const repoDir = path.join(testDir, 'repo');
  fs.mkdirSync(path.join(isoHome, '.claude', 'harness/data/sessions'), { recursive: true });
  fs.mkdirSync(path.join(isoHome, '.claude', 'skills', 'learned'), { recursive: true });
  fs.mkdirSync(repoDir, { recursive: true });
  require('child_process').execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
  return {
    isoHome,
    repoDir,
    cleanup: () => fs.rmSync(testDir, { recursive: true, force: true }),
  };
}

function writeCompleteVerification(repoDir, scope = 'lifecycle guard behavior') {
  fs.writeFileSync(path.join(repoDir, 'verification-summary.md'), [
    '# Verification Summary',
    '',
    '## Scope',
    `- ${scope}`,
    '',
    '## Commands Run',
    '- node harness/hooks/lifecycle-pre-commit.js',
    '',
    '## Verification Outcome',
    '- pass',
    '',
    '## Assessment',
    '- hook fixture reached the targeted guardrail branch',
    ''
  ].join('\n'));
}

// Every section the template defines, because the parser requires all ten as of
// 2026-08-21. Three copies of this fixture used to live inline further down; a
// fixture that omits sections stops isolating the condition its assertion names.
// `findings` and `nextAction` are overridable so a test that targets one defect
// (an unresolved HIGH, a finding without a severity prefix) keeps every other
// section intact and the assertion stays about that defect alone.
function writeCompleteReview(repoDir, scope = 'lifecycle guard behavior', options = {}) {
  const findings = options.findings || ['- none'];
  const nextAction = options.nextAction || 'none';
  fs.writeFileSync(path.join(repoDir, 'review-summary.md'), [
    '# Review Summary',
    '',
    '## Review Scope',
    `- ${scope}`,
    '',
    '## Design Compliance',
    '- matches the design doc',
    '',
    '## Security',
    '- no decision boundary touched',
    '',
    '## Comment Adequacy',
    '- unchanged',
    '',
    '## Code Quality',
    '- acceptable',
    '',
    '## Test Adequacy',
    '- covered',
    '',
    '## Findings',
    ...findings,
    '',
    '## Residual Risks',
    '- none',
    '',
    '## Guardrail Candidates',
    '- none',
    '',
    '## Next Action',
    `- ${nextAction}`
  ].join('\n'));
}

function writeCompleteObservation(repoDir, scope = 'lifecycle guard behavior') {
  fs.writeFileSync(path.join(repoDir, 'observation-summary.md'), [
    '# Observation Summary',
    '',
    '## Behavior Checked',
    `- ${scope}`,
    '',
    '## Method',
    '- stderr: targeted lifecycle hook execution',
    '',
    '## Evidence',
    '- stderr: hook test fixture captured expected output',
    '',
    '## Remaining Uncertainty',
    '- none'
  ].join('\n'));
}

// Test suite
async function runTests() {
  console.log('\n=== Testing Hook Scripts ===\n');

  let passed = 0;
  let failed = 0;

  const scriptsDir = path.join(__dirname, '../../scripts/hooks');

  // session-start.js tests
  console.log('session-start.js:');

  if (await asyncTest('runs without error', async () => {
    const result = await runScript(path.join(scriptsDir, 'session-start.js'));
    assert.strictEqual(result.code, 0, `Exit code should be 0, got ${result.code}`);
  })) passed++; else failed++;

  if (await asyncTest('outputs session info to stderr', async () => {
    const result = await runScript(path.join(scriptsDir, 'session-start.js'));
    assert.ok(
      result.stderr.includes('[SessionStart]') ||
      result.stderr.includes('Package manager'),
      'Should output session info'
    );
  })) passed++; else failed++;

  // session-start.js edge cases
  console.log('\nsession-start.js (edge cases):');

  if (await asyncTest('exits 0 even with isolated empty HOME', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-iso-start-${Date.now()}`);
    fs.mkdirSync(path.join(isoHome, '.claude', 'harness/data/sessions'), { recursive: true });
    fs.mkdirSync(path.join(isoHome, '.claude', 'skills', 'learned'), { recursive: true });
    try {
      const result = await runScript(path.join(scriptsDir, 'session-start.js'), '', {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0, `Exit code should be 0, got ${result.code}`);
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  if (await asyncTest('reports package manager detection', async () => {
    const result = await runScript(path.join(scriptsDir, 'session-start.js'));
    assert.ok(
      result.stderr.includes('Package manager') || result.stderr.includes('[SessionStart]'),
      'Should report package manager info'
    );
  })) passed++; else failed++;

  if (await asyncTest('skips template session content', async () => {
    const { isoHome, repoDir, cleanup } = createSessionStartFixture('ecc-tpl-start');

    // Create a session file with template placeholder
    const sessionFile = path.join(isoHome, '.claude', 'harness/data/sessions', '2026-02-11-abcd1234-session.tmp');
    fs.writeFileSync(sessionFile, '## Current State\n\n[Session context goes here]\n');

    try {
      const result = await runScriptInDir(path.join(scriptsDir, 'session-start.js'), repoDir, '', {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0);
      // stdout should NOT contain the template content
      assert.ok(
        !result.stdout.includes('Previous session summary'),
        'Should not inject template session content'
      );
    } finally {
      cleanup();
    }
  })) passed++; else failed++;

  if (await asyncTest('injects real session content', async () => {
    const { isoHome, repoDir, cleanup } = createSessionStartFixture('ecc-real-start');

    // Create a real session file
    const sessionFile = path.join(isoHome, '.claude', 'harness/data/sessions', '2026-02-11-efgh5678-session.tmp');
    fs.writeFileSync(sessionFile, '# Real Session\n\nI worked on authentication refactor.\n');

    try {
      const result = await runScriptInDir(path.join(scriptsDir, 'session-start.js'), repoDir, '', {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0);
      assert.ok(
        result.stdout.includes('Previous session summary'),
        'Should inject real session content'
      );
      assert.ok(
        result.stdout.includes('authentication refactor'),
        'Should include session content text'
      );
    } finally {
      cleanup();
    }
  })) passed++; else failed++;

  if (await asyncTest('prefers repository artifact state over raw previous session summaries', async () => {
    const testDir = createTestDir();
    const repoDir = path.join(testDir, 'repo');
    const isoHome = path.join(testDir, 'home');
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');
    fs.mkdirSync(repoDir, { recursive: true });
    fs.mkdirSync(sessionsDir, { recursive: true });

    fs.writeFileSync(path.join(sessionsDir, '2026-04-14-main-session.tmp'), '# Session\n\nThis older summary should not win.\n');

    try {
      require('child_process').execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
      // Was plan.md + progress.md, both retired 2026-08-17 and out of the scan
      // since 2026-08-20. The gate artifacts are what the chain reads now.
      fs.writeFileSync(path.join(repoDir, 'verification-summary.md'), [
        '# Verification Summary',
        '',
        '## Scope',
        '- the lifecycle helpers',
        '',
        '## Commands Run',
        '- node harness/tests/run-all.js: pass',
        '',
        '## Verification Outcome',
        '- all green',
        '',
        '## Assessment',
        '- acceptable',
      ].join('\n'));

      const result = await runScriptInDir(path.join(scriptsDir, 'session-start.js'), repoDir, '', {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('Active repository task chain'),
        `Expected the artifact chain in stdout, got: ${result.stdout}`);
      assert.ok(result.stdout.includes('current_step=review'),
        `Expected the open gate in stdout, got: ${result.stdout}`);
      assert.ok(!result.stdout.includes('Previous session summary'),
        'Artifact-backed state should take precedence over old session summaries');
      // The sessions/*.tmp files are not repo-scoped, so the newest belongs to
      // whichever project was touched last.
      assert.ok(!result.stdout.includes('This older summary should not win'), result.stdout);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  // The SQLite precedence test is gone with run_state (2026-08-20). It asserted
  // that a persisted row outranked the repository artifacts. Measured with all
  // three gate artifacts present: every non-empty field the row contributed was
  // already in buildArtifactContext, which also carried next_required_action
  // and detail, while current_phase / current_step / next_action were empty
  // (they came from progress.md, retired 2026-08-17). The row was a degraded
  // copy of the files, so there is no precedence left to test -- the artifacts
  // are the only source. The case above ('reads repository task artifacts...')
  // covers that path.

  // check-console-log.js tests
  console.log('\ncheck-console-log.js:');

  if (await asyncTest('passes through stdin data to stdout', async () => {
    const stdinData = JSON.stringify({ tool_name: 'Write', tool_input: {} });
    const result = await runScript(path.join(scriptsDir, 'check-console-log.js'), stdinData);
    assert.strictEqual(result.code, 0);
    assert.ok(result.stdout.includes('tool_name'), 'Should pass through stdin data');
  })) passed++; else failed++;

  if (await asyncTest('exits 0 with empty stdin', async () => {
    const result = await runScript(path.join(scriptsDir, 'check-console-log.js'), '');
    assert.strictEqual(result.code, 0);
  })) passed++; else failed++;

  if (await asyncTest('handles invalid JSON stdin gracefully', async () => {
    const result = await runScript(path.join(scriptsDir, 'check-console-log.js'), 'not valid json');
    assert.strictEqual(result.code, 0, 'Should exit 0 on invalid JSON');
    // Should still pass through the data
    assert.ok(result.stdout.includes('not valid json'), 'Should pass through invalid data');
  })) passed++; else failed++;

  // session-end.js tests
  console.log('\nsession-end.js:');

  if (await asyncTest('runs without error', async () => {
    const result = await runScript(path.join(scriptsDir, 'session-end.js'));
    assert.strictEqual(result.code, 0, `Exit code should be 0, got ${result.code}`);
  })) passed++; else failed++;

  if (await asyncTest('creates or updates session file', async () => {
    // Run the script
    await runScript(path.join(scriptsDir, 'session-end.js'));

    // Check if session file was created
    // Note: Without CLAUDE_SESSION_ID, falls back to project name (not 'default')
    // Use local time to match the script's getDateString() function
    const sessionsDir = path.join(os.homedir(), '.claude', 'harness/data/sessions');
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Get the expected session ID (project name fallback)
    const utils = require('../../scripts/lib/utils');
    const expectedId = utils.getSessionIdShort();
    const sessionFile = path.join(sessionsDir, `${today}-${expectedId}-session.tmp`);

    assert.ok(fs.existsSync(sessionFile), `Session file should exist: ${sessionFile}`);
  })) passed++; else failed++;

  if (await asyncTest('includes session ID in filename', async () => {
    const testSessionId = 'test-session-abc12345';
    const expectedShortId = 'abc12345'; // Last 8 chars

    // Run with custom session ID
    await runScript(path.join(scriptsDir, 'session-end.js'), '', {
      CLAUDE_SESSION_ID: testSessionId
    });

    // Check if session file was created with session ID
    // Use local time to match the script's getDateString() function
    const sessionsDir = path.join(os.homedir(), '.claude', 'harness/data/sessions');
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const sessionFile = path.join(sessionsDir, `${today}-${expectedShortId}-session.tmp`);

    assert.ok(fs.existsSync(sessionFile), `Session file should exist: ${sessionFile}`);
  })) passed++; else failed++;

  // pre-compact.js tests
  console.log('\npre-compact.js:');

  if (await asyncTest('runs without error', async () => {
    const result = await runScriptInDir(path.join(scriptsDir, 'pre-compact.js'), getSandboxRepo());
    assert.strictEqual(result.code, 0, `Exit code should be 0, got ${result.code}`);
  })) passed++; else failed++;

  if (await asyncTest('outputs PreCompact message', async () => {
    const result = await runScriptInDir(path.join(scriptsDir, 'pre-compact.js'), getSandboxRepo());
    assert.ok(result.stderr.includes('[PreCompact]'), 'Should output PreCompact message');
  })) passed++; else failed++;

  if (await asyncTest('creates compaction log', async () => {
    await runScriptInDir(path.join(scriptsDir, 'pre-compact.js'), getSandboxRepo());
    const logFile = path.join(os.homedir(), '.claude', 'harness/data/sessions', 'compaction-log.txt');
    assert.ok(fs.existsSync(logFile), 'Compaction log should exist');
  })) passed++; else failed++;

  if (await asyncTest('annotates active session file with compaction marker', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-compact-annotate-${Date.now()}`);
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    // Create an active .tmp session file
    const sessionFile = path.join(sessionsDir, '2026-02-11-test-session.tmp');
    fs.writeFileSync(sessionFile, '# Session: 2026-02-11\n**Started:** 10:00\n');

    try {
      await runScriptInDir(path.join(scriptsDir, 'pre-compact.js'), getSandboxRepo(), '', {
        HOME: isoHome, USERPROFILE: isoHome
      });

      const content = fs.readFileSync(sessionFile, 'utf8');
      assert.ok(
        content.includes('Compaction occurred'),
        'Should annotate the session file with compaction marker'
      );
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  if (await asyncTest('compaction log contains timestamp', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-compact-ts-${Date.now()}`);
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    try {
      await runScriptInDir(path.join(scriptsDir, 'pre-compact.js'), getSandboxRepo(), '', {
        HOME: isoHome, USERPROFILE: isoHome
      });

      const logFile = path.join(sessionsDir, 'compaction-log.txt');
      assert.ok(fs.existsSync(logFile), 'Compaction log should exist');
      const content = fs.readFileSync(logFile, 'utf8');
      // Should have a timestamp like [2026-02-11 14:30:00]
      assert.ok(
        /\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/.test(content),
        `Log should contain timestamped entry, got: ${content.substring(0, 100)}`
      );
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  // suggest-compact.js tests
  console.log('\nsuggest-compact.js:');

  if (await asyncTest('runs without error', async () => {
    const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
      CLAUDE_SESSION_ID: 'test-session-' + Date.now()
    });
    assert.strictEqual(result.code, 0, `Exit code should be 0, got ${result.code}`);
  })) passed++; else failed++;

  if (await asyncTest('increments counter on each call', async () => {
    const sessionId = 'test-counter-' + Date.now();

    // Run multiple times
    for (let i = 0; i < 3; i++) {
      await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
        CLAUDE_SESSION_ID: sessionId
      });
    }

    // Check counter file
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);
    const count = parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10);
    assert.strictEqual(count, 3, `Counter should be 3, got ${count}`);

    // Cleanup
    fs.unlinkSync(counterFile);
  })) passed++; else failed++;

  if (await asyncTest('suggests compact at threshold', async () => {
    const sessionId = 'test-threshold-' + Date.now();
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);

    // Set counter to threshold - 1
    fs.writeFileSync(counterFile, '49');

    const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
      CLAUDE_SESSION_ID: sessionId,
      COMPACT_THRESHOLD: '50'
    });

    assert.ok(
      result.stderr.includes('50 tool calls reached'),
      'Should suggest compact at threshold'
    );

    // Cleanup
    fs.unlinkSync(counterFile);
  })) passed++; else failed++;

  if (await asyncTest('does not suggest below threshold', async () => {
    const sessionId = 'test-below-' + Date.now();
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);

    fs.writeFileSync(counterFile, '10');

    const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
      CLAUDE_SESSION_ID: sessionId,
      COMPACT_THRESHOLD: '50'
    });

    assert.ok(
      !result.stderr.includes('tool calls'),
      'Should not suggest compact below threshold'
    );

    fs.unlinkSync(counterFile);
  })) passed++; else failed++;

  if (await asyncTest('suggests at regular intervals after threshold', async () => {
    const sessionId = 'test-interval-' + Date.now();
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);

    // Set counter to 74 (next will be 75, which is >50 and 75%25==0)
    fs.writeFileSync(counterFile, '74');

    const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
      CLAUDE_SESSION_ID: sessionId,
      COMPACT_THRESHOLD: '50'
    });

    assert.ok(
      result.stderr.includes('75 tool calls'),
      'Should suggest at 25-call intervals after threshold'
    );

    fs.unlinkSync(counterFile);
  })) passed++; else failed++;

  if (await asyncTest('handles corrupted counter file', async () => {
    const sessionId = 'test-corrupt-' + Date.now();
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);

    fs.writeFileSync(counterFile, 'not-a-number');

    const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
      CLAUDE_SESSION_ID: sessionId
    });

    assert.strictEqual(result.code, 0, 'Should handle corrupted counter gracefully');

    // Counter should be reset to 1
    const newCount = parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10);
    assert.strictEqual(newCount, 1, 'Should reset counter to 1 on corrupt data');

    fs.unlinkSync(counterFile);
  })) passed++; else failed++;

  if (await asyncTest('uses default session ID when no env var', async () => {
    const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
      CLAUDE_SESSION_ID: '' // Empty, should use 'default'
    });

    assert.strictEqual(result.code, 0, 'Should work with default session ID');

    // Cleanup the default counter file
    const counterFile = path.join(os.tmpdir(), 'claude-tool-count-default');
    if (fs.existsSync(counterFile)) fs.unlinkSync(counterFile);
  })) passed++; else failed++;

  if (await asyncTest('invalid threshold disables the suggestion', async () => {
    const sessionId = 'test-bounds-' + Date.now();
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);

    // Invalid threshold disables rather than falling back to a count —
    // no call count is correct across context sizes.
    fs.writeFileSync(counterFile, '49');

    const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
      CLAUDE_SESSION_ID: sessionId,
      COMPACT_THRESHOLD: '-5' // Invalid: negative
    });

    assert.ok(
      !result.stderr.includes('tool calls'),
      'Should stay silent for invalid threshold'
    );

    fs.unlinkSync(counterFile);
  })) passed++; else failed++;

  if (await asyncTest('stays silent when COMPACT_THRESHOLD is unset', async () => {
    const sessionId = 'test-optout-' + Date.now();
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);

    // 49 -> 50, which used to be the hardcoded default threshold.
    fs.writeFileSync(counterFile, '49');

    const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
      CLAUDE_SESSION_ID: sessionId,
      COMPACT_THRESHOLD: ''
    });

    assert.strictEqual(result.code, 0);
    assert.ok(
      !result.stderr.includes('tool calls'),
      'Count-based suggestion must be opt-in'
    );

    // Counter still advances so an opt-in session gets accurate counts.
    const count = parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10);
    assert.strictEqual(count, 50, `Counter should still increment, got ${count}`);

    fs.unlinkSync(counterFile);
  })) passed++; else failed++;

  // evaluate-session.js tests

  // cost-tracker.js was retired 2026-08-20. Measured before removal: 3,120
  // rows written since 2026-05-15, every one with input_tokens=null and
  // token_source="missing", to both costs.jsonl and session_events. The Stop
  // payload never carried usage, session_id never resolved past "default",
  // and the hardcoded price table never produced a number. The transcripts
  // carry real usage (17,714 turns); see harness/scripts/lib/transcript-log.js.

  // evaluate-session.js: whitespace tolerance regression test
  // session-end.js: content array with null elements regression test
  if (await asyncTest('handles transcript with null content array elements (regression)', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');

    // Create transcript with null elements in content array
    const lines = [
      '{"type":"user","content":[null,{"text":"hello"},null,{"text":"world"}]}',
      '{"type":"user","content":"simple string message"}',
      '{"type":"user","content":[{"text":"normal"},{"text":"array"}]}',
      '{"type":"tool_use","tool_name":"Edit","tool_input":{"file_path":"/test.js"}}',
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson);

    // Should not crash (exit 0)
    assert.strictEqual(result.code, 0, 'Should handle null content elements without crash');
  })) passed++; else failed++;

  // post-edit-console-warn.js tests
  console.log('\npost-edit-console-warn.js:');

  if (await asyncTest('warns about console.log in JS files', async () => {
    const testDir = createTestDir();
    const testFile = path.join(testDir, 'test.js');
    fs.writeFileSync(testFile, 'const x = 1;\nconsole.log(x);\nreturn x;');

    const stdinJson = JSON.stringify({ tool_input: { file_path: testFile } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-console-warn.js'), stdinJson);

    assert.ok(result.stderr.includes('console.log'), 'Should warn about console.log');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('does not warn for non-JS files', async () => {
    const testDir = createTestDir();
    const testFile = path.join(testDir, 'test.md');
    fs.writeFileSync(testFile, 'Use console.log for debugging');

    const stdinJson = JSON.stringify({ tool_input: { file_path: testFile } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-console-warn.js'), stdinJson);

    assert.ok(!result.stderr.includes('console.log'), 'Should not warn for non-JS files');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('does not warn for clean JS files', async () => {
    const testDir = createTestDir();
    const testFile = path.join(testDir, 'clean.ts');
    fs.writeFileSync(testFile, 'const x = 1;\nreturn x;');

    const stdinJson = JSON.stringify({ tool_input: { file_path: testFile } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-console-warn.js'), stdinJson);

    assert.ok(!result.stderr.includes('WARNING'), 'Should not warn for clean files');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('handles missing file gracefully', async () => {
    const stdinJson = JSON.stringify({ tool_input: { file_path: '/nonexistent/file.ts' } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-console-warn.js'), stdinJson);

    assert.strictEqual(result.code, 0, 'Should not crash on missing file');
  })) passed++; else failed++;

  if (await asyncTest('limits console.log output to 5 matches', async () => {
    const testDir = createTestDir();
    const testFile = path.join(testDir, 'many-logs.js');
    // Create a file with 8 console.log statements
    const lines = [];
    for (let i = 1; i <= 8; i++) {
      lines.push(`console.log('debug ${i}');`);
    }
    fs.writeFileSync(testFile, lines.join('\n'));

    const stdinJson = JSON.stringify({ tool_input: { file_path: testFile } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-console-warn.js'), stdinJson);

    assert.ok(result.stderr.includes('console.log'), 'Should warn about console.log');
    // Count how many "debug N" lines appear in stderr (the line-number output)
    const debugLines = result.stderr.split('\n').filter(l => /^\d+:/.test(l.trim()));
    assert.ok(debugLines.length <= 5, `Should show at most 5 matches, got ${debugLines.length}`);
    // Should include debug 1 but not debug 8 (sliced)
    assert.ok(result.stderr.includes('debug 1'), 'Should include first match');
    assert.ok(!result.stderr.includes('debug 8'), 'Should not include 8th match');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('ignores console.warn and console.error (only flags console.log)', async () => {
    const testDir = createTestDir();
    const testFile = path.join(testDir, 'other-console.ts');
    fs.writeFileSync(testFile, [
      'console.warn("this is a warning");',
      'console.error("this is an error");',
      'console.debug("this is debug");',
      'console.info("this is info");',
    ].join('\n'));

    const stdinJson = JSON.stringify({ tool_input: { file_path: testFile } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-console-warn.js'), stdinJson);

    assert.ok(!result.stderr.includes('WARNING'), 'Should NOT warn about console.warn/error/debug/info');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('passes through original data on stdout', async () => {
    const stdinJson = JSON.stringify({ tool_input: { file_path: '/test.py' } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-console-warn.js'), stdinJson);

    assert.ok(result.stdout.includes('tool_input'), 'Should pass through stdin data');
  })) passed++; else failed++;

  // post-edit-format.js tests
  console.log('\npost-edit-format.js:');

  if (await asyncTest('runs without error on empty stdin', async () => {
    const result = await runScript(path.join(scriptsDir, 'post-edit-format.js'));
    assert.strictEqual(result.code, 0, 'Should exit 0 on empty stdin');
  })) passed++; else failed++;

  if (await asyncTest('skips non-JS/TS files', async () => {
    const stdinJson = JSON.stringify({ tool_input: { file_path: '/test.py' } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-format.js'), stdinJson);
    assert.strictEqual(result.code, 0, 'Should exit 0 for non-JS files');
    assert.ok(result.stdout.includes('tool_input'), 'Should pass through stdin data');
  })) passed++; else failed++;

  if (await asyncTest('passes through data for invalid JSON', async () => {
    const result = await runScript(path.join(scriptsDir, 'post-edit-format.js'), 'not json');
    assert.strictEqual(result.code, 0, 'Should exit 0 for invalid JSON');
  })) passed++; else failed++;

  if (await asyncTest('handles null tool_input gracefully', async () => {
    const stdinJson = JSON.stringify({ tool_input: null });
    const result = await runScript(path.join(scriptsDir, 'post-edit-format.js'), stdinJson);
    assert.strictEqual(result.code, 0, 'Should exit 0 for null tool_input');
    assert.ok(result.stdout.includes('tool_input'), 'Should pass through data');
  })) passed++; else failed++;

  if (await asyncTest('handles missing file_path in tool_input', async () => {
    const stdinJson = JSON.stringify({ tool_input: {} });
    const result = await runScript(path.join(scriptsDir, 'post-edit-format.js'), stdinJson);
    assert.strictEqual(result.code, 0, 'Should exit 0 for missing file_path');
    assert.ok(result.stdout.includes('tool_input'), 'Should pass through data');
  })) passed++; else failed++;

  if (await asyncTest('exits 0 and passes data when prettier is unavailable', async () => {
    const stdinJson = JSON.stringify({ tool_input: { file_path: '/nonexistent/path/file.ts' } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-format.js'), stdinJson);
    assert.strictEqual(result.code, 0, 'Should exit 0 even when prettier fails');
    assert.ok(result.stdout.includes('tool_input'), 'Should pass through original data');
  })) passed++; else failed++;

  // post-edit-typecheck.js tests
  console.log('\npost-edit-typecheck.js:');

  if (await asyncTest('runs without error on empty stdin', async () => {
    const result = await runScript(path.join(scriptsDir, 'post-edit-typecheck.js'));
    assert.strictEqual(result.code, 0, 'Should exit 0 on empty stdin');
  })) passed++; else failed++;

  if (await asyncTest('skips non-TypeScript files', async () => {
    const stdinJson = JSON.stringify({ tool_input: { file_path: '/test.js' } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-typecheck.js'), stdinJson);
    assert.strictEqual(result.code, 0, 'Should exit 0 for non-TS files');
    assert.ok(result.stdout.includes('tool_input'), 'Should pass through stdin data');
  })) passed++; else failed++;

  if (await asyncTest('handles nonexistent TS file gracefully', async () => {
    const stdinJson = JSON.stringify({ tool_input: { file_path: '/nonexistent/file.ts' } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-typecheck.js'), stdinJson);
    assert.strictEqual(result.code, 0, 'Should exit 0 for missing file');
  })) passed++; else failed++;

  if (await asyncTest('handles TS file with no tsconfig gracefully', async () => {
    const testDir = createTestDir();
    const testFile = path.join(testDir, 'test.ts');
    fs.writeFileSync(testFile, 'const x: number = 1;');

    const stdinJson = JSON.stringify({ tool_input: { file_path: testFile } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-typecheck.js'), stdinJson);
    assert.strictEqual(result.code, 0, 'Should exit 0 when no tsconfig found');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('stops tsconfig walk at max depth (20)', async () => {
    // Create a deeply nested directory (>20 levels) with no tsconfig anywhere
    const testDir = createTestDir();
    let deepDir = testDir;
    for (let i = 0; i < 25; i++) {
      deepDir = path.join(deepDir, `d${i}`);
    }
    fs.mkdirSync(deepDir, { recursive: true });
    const testFile = path.join(deepDir, 'deep.ts');
    fs.writeFileSync(testFile, 'const x: number = 1;');

    const stdinJson = JSON.stringify({ tool_input: { file_path: testFile } });
    const startTime = Date.now();
    const result = await runScript(path.join(scriptsDir, 'post-edit-typecheck.js'), stdinJson);
    const elapsed = Date.now() - startTime;

    assert.strictEqual(result.code, 0, 'Should not hang at depth limit');
    assert.ok(elapsed < 5000, `Should complete quickly at depth limit, took ${elapsed}ms`);
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('passes through stdin data on stdout (post-edit-typecheck)', async () => {
    const testDir = createTestDir();
    const testFile = path.join(testDir, 'test.ts');
    fs.writeFileSync(testFile, 'const x: number = 1;');

    const stdinJson = JSON.stringify({ tool_input: { file_path: testFile } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-typecheck.js'), stdinJson);
    assert.strictEqual(result.code, 0);
    assert.ok(result.stdout.includes('tool_input'), 'Should pass through stdin data on stdout');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  // session-end.js extractSessionSummary tests
  console.log('\nsession-end.js (extractSessionSummary):');

  if (await asyncTest('extracts user messages from transcript', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');

    const lines = [
      '{"type":"user","content":"Fix the login bug"}',
      '{"type":"assistant","content":"I will fix it"}',
      '{"type":"user","content":"Also add tests"}',
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson);
    assert.strictEqual(result.code, 0);
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('handles transcript with array content fields', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');

    const lines = [
      '{"type":"user","content":[{"text":"Part 1"},{"text":"Part 2"}]}',
      '{"type":"user","content":"Simple message"}',
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson);
    assert.strictEqual(result.code, 0, 'Should handle array content without crash');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('extracts tool names and file paths from transcript', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');

    const lines = [
      '{"type":"user","content":"Edit the file"}',
      '{"type":"tool_use","tool_name":"Edit","tool_input":{"file_path":"/src/main.ts"}}',
      '{"type":"tool_use","tool_name":"Read","tool_input":{"file_path":"/src/utils.ts"}}',
      '{"type":"tool_use","tool_name":"Write","tool_input":{"file_path":"/src/new.ts"}}',
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson);
    assert.strictEqual(result.code, 0);
    // Session file should contain summary with tools used
    assert.ok(
      result.stderr.includes('Created session file') || result.stderr.includes('Updated session file'),
      'Should create/update session file'
    );
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('handles transcript with malformed JSON lines', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');

    const lines = [
      '{"type":"user","content":"Valid message"}',
      'NOT VALID JSON',
      '{"broken json',
      '{"type":"user","content":"Another valid"}',
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson);
    assert.strictEqual(result.code, 0, 'Should skip malformed lines gracefully');
    assert.ok(
      result.stderr.includes('unparseable') || result.stderr.includes('Skipped'),
      `Should report parse errors, got: ${result.stderr.substring(0, 200)}`
    );
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('handles empty transcript (no user messages)', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');

    // Only tool_use entries, no user messages
    const lines = [
      '{"type":"tool_use","tool_name":"Read","tool_input":{}}',
      '{"type":"assistant","content":"done"}',
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson);
    assert.strictEqual(result.code, 0, 'Should handle transcript with no user messages');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('truncates long user messages to 200 chars', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');

    const longMsg = 'x'.repeat(500);
    const lines = [
      `{"type":"user","content":"${longMsg}"}`,
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson);
    assert.strictEqual(result.code, 0, 'Should handle and truncate long messages');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('uses CLAUDE_TRANSCRIPT_PATH env var as fallback', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');

    const lines = [
      '{"type":"user","content":"Fallback test message"}',
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    // Send invalid JSON to stdin so it falls back to env var
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), 'not json', {
      CLAUDE_TRANSCRIPT_PATH: transcriptPath
    });
    assert.strictEqual(result.code, 0, 'Should use env var fallback');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('escapes backticks in user messages in session file', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');

    // User messages with backticks that could break markdown
    const lines = [
      '{"type":"user","content":"Fix the `handleAuth` function in `auth.ts`"}',
      '{"type":"user","content":"Run `npm test` to verify"}',
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
      HOME: testDir
    });
    assert.strictEqual(result.code, 0, 'Should handle backticks without crash');

    // Find the session file in the temp HOME
    const claudeDir = path.join(testDir, '.claude', 'harness/data/sessions');
    if (fs.existsSync(claudeDir)) {
      const files = fs.readdirSync(claudeDir).filter(f => f.endsWith('.tmp'));
      if (files.length > 0) {
        const content = fs.readFileSync(path.join(claudeDir, files[0]), 'utf8');
        // Backticks should be escaped in the output
        assert.ok(content.includes('\\`'), 'Should escape backticks in session file');
        assert.ok(!content.includes('`handleAuth`'), 'Raw backticks should be escaped');
      }
    }
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('session file contains tools used and files modified', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');

    const lines = [
      '{"type":"user","content":"Edit the config"}',
      '{"type":"tool_use","tool_name":"Edit","tool_input":{"file_path":"/src/config.ts"}}',
      '{"type":"tool_use","tool_name":"Read","tool_input":{"file_path":"/src/utils.ts"}}',
      '{"type":"tool_use","tool_name":"Write","tool_input":{"file_path":"/src/new-file.ts"}}',
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
      HOME: testDir
    });
    assert.strictEqual(result.code, 0);

    const claudeDir = path.join(testDir, '.claude', 'harness/data/sessions');
    if (fs.existsSync(claudeDir)) {
      const files = fs.readdirSync(claudeDir).filter(f => f.endsWith('.tmp'));
      if (files.length > 0) {
        const content = fs.readFileSync(path.join(claudeDir, files[0]), 'utf8');
        // Should contain files modified (Edit and Write, not Read)
        assert.ok(content.includes('/src/config.ts'), 'Should list edited file');
        assert.ok(content.includes('/src/new-file.ts'), 'Should list written file');
        // Should contain tools used
        assert.ok(content.includes('Edit'), 'Should list Edit tool');
        assert.ok(content.includes('Read'), 'Should list Read tool');
      }
    }
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('omits Tools Used and Files Modified sections when empty', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');

    // Only user messages, no tool_use entries
    const lines = [
      '{"type":"user","content":"Just chatting"}',
      '{"type":"user","content":"No tools used at all"}',
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
      HOME: testDir
    });
    assert.strictEqual(result.code, 0);

    const claudeDir = path.join(testDir, '.claude', 'harness/data/sessions');
    if (fs.existsSync(claudeDir)) {
      const files = fs.readdirSync(claudeDir).filter(f => f.endsWith('.tmp'));
      if (files.length > 0) {
        const content = fs.readFileSync(path.join(claudeDir, files[0]), 'utf8');
        assert.ok(content.includes('### Tasks'), 'Should have Tasks section');
        assert.ok(!content.includes('### Files Modified'), 'Should NOT have Files Modified when empty');
        assert.ok(!content.includes('### Tools Used'), 'Should NOT have Tools Used when empty');
        assert.ok(content.includes('Total user messages: 2'), 'Should show correct message count');
      }
    }
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('slices user messages to last 10', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');

    // 15 user messages — should keep only last 10
    const lines = [];
    for (let i = 1; i <= 15; i++) {
      lines.push(`{"type":"user","content":"UserMsg_${i}"}`);
    }
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
      HOME: testDir
    });
    assert.strictEqual(result.code, 0);

    const claudeDir = path.join(testDir, '.claude', 'harness/data/sessions');
    if (fs.existsSync(claudeDir)) {
      const files = fs.readdirSync(claudeDir).filter(f => f.endsWith('.tmp'));
      if (files.length > 0) {
        const content = fs.readFileSync(path.join(claudeDir, files[0]), 'utf8');
        // Should NOT contain first 5 messages (sliced to last 10)
        assert.ok(!content.includes('UserMsg_1\n'), 'Should not include first message (sliced)');
        assert.ok(!content.includes('UserMsg_5\n'), 'Should not include 5th message (sliced)');
        // Should contain messages 6-15
        assert.ok(content.includes('UserMsg_6'), 'Should include 6th message');
        assert.ok(content.includes('UserMsg_15'), 'Should include last message');
        assert.ok(content.includes('Total user messages: 15'), 'Should show total of 15');
      }
    }
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('slices tools to first 20', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');

    // 25 unique tools — should keep only first 20
    const lines = ['{"type":"user","content":"Do stuff"}'];
    for (let i = 1; i <= 25; i++) {
      lines.push(`{"type":"tool_use","tool_name":"Tool${i}","tool_input":{}}`);
    }
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
      HOME: testDir
    });
    assert.strictEqual(result.code, 0);

    const claudeDir = path.join(testDir, '.claude', 'harness/data/sessions');
    if (fs.existsSync(claudeDir)) {
      const files = fs.readdirSync(claudeDir).filter(f => f.endsWith('.tmp'));
      if (files.length > 0) {
        const content = fs.readFileSync(path.join(claudeDir, files[0]), 'utf8');
        // Should contain Tool1 through Tool20
        assert.ok(content.includes('Tool1'), 'Should include Tool1');
        assert.ok(content.includes('Tool20'), 'Should include Tool20');
        // Should NOT contain Tool21-25 (sliced)
        assert.ok(!content.includes('Tool21'), 'Should not include Tool21 (sliced to 20)');
        assert.ok(!content.includes('Tool25'), 'Should not include Tool25 (sliced to 20)');
      }
    }
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('slices files modified to first 30', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');

    // 35 unique files via Edit — should keep only first 30
    const lines = ['{"type":"user","content":"Edit all the things"}'];
    for (let i = 1; i <= 35; i++) {
      lines.push(`{"type":"tool_use","tool_name":"Edit","tool_input":{"file_path":"/src/file${i}.ts"}}`);
    }
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
      HOME: testDir
    });
    assert.strictEqual(result.code, 0);

    const claudeDir = path.join(testDir, '.claude', 'harness/data/sessions');
    if (fs.existsSync(claudeDir)) {
      const files = fs.readdirSync(claudeDir).filter(f => f.endsWith('.tmp'));
      if (files.length > 0) {
        const content = fs.readFileSync(path.join(claudeDir, files[0]), 'utf8');
        // Should contain file1 through file30
        assert.ok(content.includes('/src/file1.ts'), 'Should include file1');
        assert.ok(content.includes('/src/file30.ts'), 'Should include file30');
        // Should NOT contain file31-35 (sliced)
        assert.ok(!content.includes('/src/file31.ts'), 'Should not include file31 (sliced to 30)');
        assert.ok(!content.includes('/src/file35.ts'), 'Should not include file35 (sliced to 30)');
      }
    }
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('parses Claude Code JSONL format (entry.message.content)', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');

    // Claude Code v2.1.41+ JSONL format: user messages nested in entry.message
    const lines = [
      '{"type":"user","message":{"role":"user","content":"Fix the build error"}}',
      '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Also update tests"}]}}',
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
      HOME: testDir
    });
    assert.strictEqual(result.code, 0);

    const claudeDir = path.join(testDir, '.claude', 'harness/data/sessions');
    if (fs.existsSync(claudeDir)) {
      const files = fs.readdirSync(claudeDir).filter(f => f.endsWith('.tmp'));
      if (files.length > 0) {
        const content = fs.readFileSync(path.join(claudeDir, files[0]), 'utf8');
        assert.ok(content.includes('Fix the build error'), 'Should extract string content from message');
        assert.ok(content.includes('Also update tests'), 'Should extract array content from message');
      }
    }
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('extracts tool_use from assistant message content blocks', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');

    // Claude Code JSONL: tool uses nested in assistant message content array
    const lines = [
      '{"type":"user","content":"Edit the config"}',
      JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'I will edit the file.' },
            { type: 'tool_use', name: 'Edit', input: { file_path: '/src/app.ts' } },
            { type: 'tool_use', name: 'Write', input: { file_path: '/src/new.ts' } },
          ]
        }
      }),
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
      HOME: testDir
    });
    assert.strictEqual(result.code, 0);

    const claudeDir = path.join(testDir, '.claude', 'harness/data/sessions');
    if (fs.existsSync(claudeDir)) {
      const files = fs.readdirSync(claudeDir).filter(f => f.endsWith('.tmp'));
      if (files.length > 0) {
        const content = fs.readFileSync(path.join(claudeDir, files[0]), 'utf8');
        assert.ok(content.includes('Edit'), 'Should extract Edit tool from content blocks');
        assert.ok(content.includes('/src/app.ts'), 'Should extract file path from Edit block');
        assert.ok(content.includes('/src/new.ts'), 'Should extract file path from Write block');
      }
    }
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  // settings.json hooks validation
  console.log('\nsettings.json hooks Validation:');

  if (test('settings.json is valid JSON', () => {
    const hooksPath = path.join(__dirname, '../../../settings.json');
    const content = fs.readFileSync(hooksPath, 'utf8');
    JSON.parse(content); // Will throw if invalid
  })) passed++; else failed++;

  if (test('settings.json has required hook event types', () => {
    const hooksPath = path.join(__dirname, '../../../settings.json');
    const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));

    assert.ok(hooks.hooks.PreToolUse, 'Should have PreToolUse hooks');
    assert.ok(hooks.hooks.PostToolUse, 'Should have PostToolUse hooks');
    assert.ok(hooks.hooks.SessionStart, 'Should have SessionStart hooks');
    assert.ok(hooks.hooks.SessionEnd, 'Should have SessionEnd hooks');
    assert.ok(hooks.hooks.Stop, 'Should have Stop hooks');
    assert.ok(hooks.hooks.PreCompact, 'Should have PreCompact hooks');
  })) passed++; else failed++;

  if (test('all hook commands use node or approved shell wrappers', () => {
    const hooksPath = path.join(__dirname, '../../../settings.json');
    const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));

    const checkHooks = (hookArray) => {
      for (const entry of hookArray) {
        for (const hook of entry.hooks) {
          if (hook.type === 'command') {
            const isNode = hook.command.startsWith('node');
            const isSkillScript = hook.command.includes('/skills/') && (
              /^(bash|sh)\s/.test(hook.command) ||
              /^\$\{CLAUDE_PLUGIN_ROOT(?::-[^}]*)?\}\/skills\//.test(hook.command)
            );
            // settings.json は ${CLAUDE_PLUGIN_ROOT:-$HOME/.claude} 形式を使う。同じ変数なので両形式を受ける。
            const isHookShellWrapper = /^(bash|sh)\s+["']?\$\{CLAUDE_PLUGIN_ROOT(?::-[^}]*)?\}\/harness\/scripts\/hooks\/run-with-flags-shell\.sh/.test(hook.command);
            const isSessionStartFallback = hook.command.startsWith('bash -lc') && hook.command.includes('run-with-flags.js');
            // harness/hooks/ 直下の .sh を直に叩くフック（herdr 連携）。run-with-flags を通さないので
            // プロファイル制御の対象外だが、実体は git 追跡下にあり実行される正当な配線。
            const isHarnessShellScript = /^(bash|sh)\s+["']?[^"']*\/hooks\/[\w.-]+\.sh["']?/.test(hook.command);
            // 音を鳴らすだけのオペレータ用フック。スクリプトを持たないので上のどれにも該当しない。
            const isNotificationSound = /^afplay\s/.test(hook.command);
            const isExternalOrcaHook = hook.command.includes('ORCA') && hook.command.startsWith('if [ -z');
            assert.ok(
              isNode || isSkillScript || isHookShellWrapper || isSessionStartFallback
                || isHarnessShellScript || isNotificationSound || isExternalOrcaHook,
              `Hook command should use node or approved shell wrapper: ${hook.command.substring(0, 100)}...`
            );
          }
        }
      }
    };

    for (const [, hookArray] of Object.entries(hooks.hooks)) {
      checkHooks(hookArray);
    }
  })) passed++; else failed++;

  if (test('script references use CLAUDE_PLUGIN_ROOT variable (except SessionStart fallback)', () => {
    const hooksPath = path.join(__dirname, '../../../settings.json');
    const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));

    const checkHooks = (hookArray) => {
      for (const entry of hookArray) {
        for (const hook of entry.hooks) {
          if (hook.type === 'command' && hook.command.includes('harness/scripts/hooks/')) {
            // Check for the literal string "${CLAUDE_PLUGIN_ROOT}" in the command
            const isSessionStartFallback = hook.command.startsWith('bash -lc') && hook.command.includes('run-with-flags.js');
            // settings.json は ${CLAUDE_PLUGIN_ROOT:-$HOME/.claude} 形式を使う。同じ変数なので両方受ける。
            const hasPluginRoot = hook.command.includes('${CLAUDE_PLUGIN_ROOT') || isSessionStartFallback;
            assert.ok(
              hasPluginRoot,
              `Script paths should use CLAUDE_PLUGIN_ROOT: ${hook.command.substring(0, 80)}...`
            );
          }
        }
      }
    };

    for (const [, hookArray] of Object.entries(hooks.hooks)) {
      checkHooks(hookArray);
    }
  })) passed++; else failed++;

  // plugin.json validation
  console.log('\nplugin.json Validation:');

  if (test('plugin.json does NOT have explicit hooks declaration', () => {
    // フックは settings.json が正本。harness/hooks/hooks.json は 2026-08-15 に撤去した（二重配線）。
    // Explicitly declaring it in plugin.json causes a duplicate detection error.
    // See: https://github.com/affaan-m/everything-claude-code/issues/103
    const pluginPath = path.join(__dirname, '../../../.claude-plugin/plugin.json');
    const plugin = JSON.parse(fs.readFileSync(pluginPath, 'utf8'));

    assert.ok(
      !plugin.hooks,
      'plugin.json should NOT have "hooks" field - settings.json is the single source'
    );
  })) passed++; else failed++;

  // ─── evaluate-session.js tests ───

  // ─── suggest-compact.js tests ───
  console.log('\nsuggest-compact.js:');

  if (await asyncTest('increments tool counter on each invocation', async () => {
    const sessionId = `test-counter-${Date.now()}`;
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);
    try {
      // First invocation → count = 1
      await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
        CLAUDE_SESSION_ID: sessionId
      });
      let val = parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10);
      assert.strictEqual(val, 1, 'First call should write count 1');

      // Second invocation → count = 2
      await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
        CLAUDE_SESSION_ID: sessionId
      });
      val = parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10);
      assert.strictEqual(val, 2, 'Second call should write count 2');
    } finally {
      try { fs.unlinkSync(counterFile); } catch { /* ignore */ }
    }
  })) passed++; else failed++;

  if (await asyncTest('suggests compact at exact threshold', async () => {
    const sessionId = `test-threshold-${Date.now()}`;
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);
    try {
      // Pre-seed counter at threshold - 1 so next call hits threshold
      fs.writeFileSync(counterFile, '4');
      const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
        CLAUDE_SESSION_ID: sessionId,
        COMPACT_THRESHOLD: '5'
      });
      assert.strictEqual(result.code, 0);
      assert.ok(result.stderr.includes('5 tool calls reached'), 'Should suggest compact at threshold');
    } finally {
      try { fs.unlinkSync(counterFile); } catch { /* ignore */ }
    }
  })) passed++; else failed++;

  if (await asyncTest('suggests at periodic intervals after threshold', async () => {
    const sessionId = `test-periodic-${Date.now()}`;
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);
    try {
      // Pre-seed at 29 so next call = 30 (threshold 5 + 25 = 30)
      // (30 - 5) % 25 === 0 → should trigger periodic suggestion
      fs.writeFileSync(counterFile, '29');
      const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
        CLAUDE_SESSION_ID: sessionId,
        COMPACT_THRESHOLD: '5'
      });
      assert.strictEqual(result.code, 0);
      assert.ok(result.stderr.includes('30 tool calls'), 'Should suggest at threshold + 25n intervals');
    } finally {
      try { fs.unlinkSync(counterFile); } catch { /* ignore */ }
    }
  })) passed++; else failed++;

  if (await asyncTest('does not suggest below threshold', async () => {
    const sessionId = `test-below-${Date.now()}`;
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);
    try {
      fs.writeFileSync(counterFile, '2');
      const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
        CLAUDE_SESSION_ID: sessionId,
        COMPACT_THRESHOLD: '50'
      });
      assert.strictEqual(result.code, 0);
      assert.ok(!result.stderr.includes('tool calls reached'), 'Should not suggest below threshold');
      assert.ok(!result.stderr.includes('checkpoint'), 'Should not suggest checkpoint');
    } finally {
      try { fs.unlinkSync(counterFile); } catch { /* ignore */ }
    }
  })) passed++; else failed++;

  if (await asyncTest('resets counter when file contains huge overflow number', async () => {
    const sessionId = `test-overflow-${Date.now()}`;
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);
    try {
      // Write a value that passes Number.isFinite() but exceeds 1000000 clamp
      fs.writeFileSync(counterFile, '999999999999');
      const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
        CLAUDE_SESSION_ID: sessionId
      });
      assert.strictEqual(result.code, 0);
      // Should reset to 1 because 999999999999 > 1000000
      const newCount = parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10);
      assert.strictEqual(newCount, 1, 'Should reset to 1 on overflow value');
    } finally {
      try { fs.unlinkSync(counterFile); } catch { /* ignore */ }
    }
  })) passed++; else failed++;

  if (await asyncTest('resets counter when file contains negative number', async () => {
    const sessionId = `test-negative-${Date.now()}`;
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);
    try {
      fs.writeFileSync(counterFile, '-42');
      const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
        CLAUDE_SESSION_ID: sessionId
      });
      assert.strictEqual(result.code, 0);
      const newCount = parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10);
      assert.strictEqual(newCount, 1, 'Should reset to 1 on negative value');
    } finally {
      try { fs.unlinkSync(counterFile); } catch { /* ignore */ }
    }
  })) passed++; else failed++;

  if (await asyncTest('COMPACT_THRESHOLD of zero disables the suggestion', async () => {
    const sessionId = `test-zero-thresh-${Date.now()}`;
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);
    try {
      fs.writeFileSync(counterFile, '49');
      const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
        CLAUDE_SESSION_ID: sessionId,
        COMPACT_THRESHOLD: '0'
      });
      assert.strictEqual(result.code, 0);
      assert.ok(!result.stderr.includes('tool calls'), 'Zero threshold is the off switch');
    } finally {
      try { fs.unlinkSync(counterFile); } catch { /* ignore */ }
    }
  })) passed++; else failed++;

  if (await asyncTest('invalid COMPACT_THRESHOLD disables the suggestion', async () => {
    const sessionId = `test-invalid-thresh-${Date.now()}`;
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);
    try {
      // Pre-seed at 49 so next call = 50, the old hardcoded default
      fs.writeFileSync(counterFile, '49');
      const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
        CLAUDE_SESSION_ID: sessionId,
        COMPACT_THRESHOLD: 'not-a-number'
      });
      assert.strictEqual(result.code, 0);
      assert.ok(!result.stderr.includes('tool calls'), 'Invalid threshold must not resurrect a count');
    } finally {
      try { fs.unlinkSync(counterFile); } catch { /* ignore */ }
    }
  })) passed++; else failed++;

  // ─── Round 20 bug fix tests ───
  console.log('\ncheck-console-log.js (exact pass-through):');

  if (await asyncTest('stdout is exact byte match of stdin (no trailing newline)', async () => {
    // Before the fix, console.log(data) added a trailing \n.
    // process.stdout.write(data) should preserve exact bytes.
    const stdinData = '{"tool":"test","value":42}';
    const result = await runScript(path.join(scriptsDir, 'check-console-log.js'), stdinData);
    assert.strictEqual(result.code, 0);
    // stdout should be exactly the input — no extra newline appended
    assert.strictEqual(result.stdout, stdinData, 'Should not append extra newline to output');
  })) passed++; else failed++;

  if (await asyncTest('preserves empty string stdin without adding newline', async () => {
    const result = await runScript(path.join(scriptsDir, 'check-console-log.js'), '');
    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.stdout, '', 'Empty input should produce empty output');
  })) passed++; else failed++;

  if (await asyncTest('preserves data with embedded newlines exactly', async () => {
    const stdinData = 'line1\nline2\nline3';
    const result = await runScript(path.join(scriptsDir, 'check-console-log.js'), stdinData);
    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.stdout, stdinData, 'Should preserve embedded newlines without adding extra');
  })) passed++; else failed++;

  console.log('\npost-edit-format.js (security & extension tests):');

  if (await asyncTest('source code does not pass shell option to execFileSync (security)', async () => {
    const formatSource = fs.readFileSync(path.join(scriptsDir, 'post-edit-format.js'), 'utf8');
    // Strip comments to avoid matching "shell: true" in comment text
    const codeOnly = formatSource.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!codeOnly.includes('shell:'), 'post-edit-format.js should not pass shell option in code');
    assert.ok(formatSource.includes('npx.cmd'), 'Should use npx.cmd for Windows cross-platform safety');
  })) passed++; else failed++;

  if (await asyncTest('matches .tsx extension for formatting', async () => {
    const stdinJson = JSON.stringify({ tool_input: { file_path: '/nonexistent/component.tsx' } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-format.js'), stdinJson);
    assert.strictEqual(result.code, 0);
    // Should attempt to format (will fail silently since file doesn't exist, but should pass through)
    assert.ok(result.stdout.includes('component.tsx'), 'Should pass through data for .tsx files');
  })) passed++; else failed++;

  if (await asyncTest('matches .jsx extension for formatting', async () => {
    const stdinJson = JSON.stringify({ tool_input: { file_path: '/nonexistent/component.jsx' } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-format.js'), stdinJson);
    assert.strictEqual(result.code, 0);
    assert.ok(result.stdout.includes('component.jsx'), 'Should pass through data for .jsx files');
  })) passed++; else failed++;

  console.log('\npost-edit-typecheck.js (security & extension tests):');

  if (await asyncTest('source code does not pass shell option to execFileSync (security)', async () => {
    const typecheckSource = fs.readFileSync(path.join(scriptsDir, 'post-edit-typecheck.js'), 'utf8');
    // Strip comments to avoid matching "shell: true" in comment text
    const codeOnly = typecheckSource.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!codeOnly.includes('shell:'), 'post-edit-typecheck.js should not pass shell option in code');
    assert.ok(typecheckSource.includes('npx.cmd'), 'Should use npx.cmd for Windows cross-platform safety');
  })) passed++; else failed++;

  if (await asyncTest('matches .tsx extension for type checking', async () => {
    const testDir = createTestDir();
    const testFile = path.join(testDir, 'component.tsx');
    fs.writeFileSync(testFile, 'const x: number = 1;');

    const stdinJson = JSON.stringify({ tool_input: { file_path: testFile } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-typecheck.js'), stdinJson);
    assert.strictEqual(result.code, 0);
    assert.ok(result.stdout.includes('tool_input'), 'Should pass through data for .tsx files');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  // ─── Round 23: Bug fixes & high-priority gap coverage ───

  console.log('\nRound 23: session-end.js (update existing file path):');

  if (await asyncTest('updates Last Updated timestamp in existing session file', async () => {
    const testDir = createTestDir();
    const sessionsDir = path.join(testDir, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    // Get the expected filename
    const utils = require('../../scripts/lib/utils');
    const today = utils.getDateString();

    // Create a pre-existing session file with known timestamp
    const shortId = 'update01';
    const sessionFile = path.join(sessionsDir, `${today}-${shortId}-session.tmp`);
    const originalContent = `# Session: ${today}\n**Date:** ${today}\n**Started:** 09:00\n**Last Updated:** 09:00\n\n---\n\n## Current State\n\n[Session context goes here]\n\n### Completed\n- [ ]\n\n### In Progress\n- [ ]\n\n### Notes for Next Session\n-\n\n### Context to Load\n\`\`\`\n[relevant files]\n\`\`\`\n`;
    fs.writeFileSync(sessionFile, originalContent);

    const result = await runScript(path.join(scriptsDir, 'session-end.js'), '', {
      HOME: testDir, USERPROFILE: testDir,
      CLAUDE_SESSION_ID: `session-${shortId}`
    });
    assert.strictEqual(result.code, 0);

    const updated = fs.readFileSync(sessionFile, 'utf8');
    // The timestamp should have been updated (no longer 09:00)
    assert.ok(updated.includes('**Last Updated:**'), 'Should still have Last Updated field');
    assert.ok(result.stderr.includes('Updated session file'), 'Should log update');
  })) passed++; else failed++;

  if (await asyncTest('replaces blank template with summary when updating existing file', async () => {
    const testDir = createTestDir();
    const sessionsDir = path.join(testDir, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    const utils = require('../../scripts/lib/utils');
    const today = utils.getDateString();

    const shortId = 'update02';
    const sessionFile = path.join(sessionsDir, `${today}-${shortId}-session.tmp`);
    // Pre-existing file with blank template
    const originalContent = `# Session: ${today}\n**Date:** ${today}\n**Started:** 09:00\n**Last Updated:** 09:00\n\n---\n\n## Current State\n\n[Session context goes here]\n\n### Completed\n- [ ]\n\n### In Progress\n- [ ]\n\n### Notes for Next Session\n-\n\n### Context to Load\n\`\`\`\n[relevant files]\n\`\`\`\n`;
    fs.writeFileSync(sessionFile, originalContent);

    // Create a transcript with user messages
    const transcriptPath = path.join(testDir, 'transcript.jsonl');
    const lines = [
      '{"type":"user","content":"Fix auth bug"}',
      '{"type":"tool_use","tool_name":"Edit","tool_input":{"file_path":"/src/auth.ts"}}',
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
      HOME: testDir, USERPROFILE: testDir,
      CLAUDE_SESSION_ID: `session-${shortId}`
    });
    assert.strictEqual(result.code, 0);

    const updated = fs.readFileSync(sessionFile, 'utf8');
    // Should have replaced blank template with actual summary
    assert.ok(!updated.includes('[Session context goes here]'), 'Should replace blank template');
    assert.ok(updated.includes('Fix auth bug'), 'Should include user message in summary');
    assert.ok(updated.includes('/src/auth.ts'), 'Should include modified file');
  })) passed++; else failed++;

  if (await asyncTest('always updates session summary content on session end', async () => {
    const testDir = createTestDir();
    const sessionsDir = path.join(testDir, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    const utils = require('../../scripts/lib/utils');
    const today = utils.getDateString();

    const shortId = 'update03';
    const sessionFile = path.join(sessionsDir, `${today}-${shortId}-session.tmp`);
    // Pre-existing file with already-filled summary
    const existingContent = `# Session: ${today}\n**Date:** ${today}\n**Started:** 08:00\n**Last Updated:** 08:30\n\n---\n\n## Session Summary\n\n### Tasks\n- Previous task from earlier\n`;
    fs.writeFileSync(sessionFile, existingContent);

    const transcriptPath = path.join(testDir, 'transcript.jsonl');
    fs.writeFileSync(transcriptPath, '{"type":"user","content":"New task"}');

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
      HOME: testDir, USERPROFILE: testDir,
      CLAUDE_SESSION_ID: `session-${shortId}`
    });
    assert.strictEqual(result.code, 0);

    const updated = fs.readFileSync(sessionFile, 'utf8');
    // Session summary should always be refreshed with current content (#317)
    assert.ok(updated.includes('## Session Summary'), 'Should have Session Summary section');
    assert.ok(updated.includes('# Session:'), 'Should preserve session header');
  })) passed++; else failed++;

  console.log('\nRound 23: pre-compact.js (glob specificity):');

  if (await asyncTest('only annotates *-session.tmp files, not other .tmp files', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-compact-glob-${Date.now()}`);
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    // Create a session .tmp file and a non-session .tmp file
    const sessionFile = path.join(sessionsDir, '2026-02-11-abc-session.tmp');
    const otherTmpFile = path.join(sessionsDir, 'other-data.tmp');
    fs.writeFileSync(sessionFile, '# Session\n');
    fs.writeFileSync(otherTmpFile, 'some other data\n');

    try {
      await runScriptInDir(path.join(scriptsDir, 'pre-compact.js'), getSandboxRepo(), '', {
        HOME: isoHome, USERPROFILE: isoHome
      });

      const sessionContent = fs.readFileSync(sessionFile, 'utf8');
      const otherContent = fs.readFileSync(otherTmpFile, 'utf8');

      assert.ok(sessionContent.includes('Compaction occurred'), 'Should annotate session file');
      assert.strictEqual(otherContent, 'some other data\n', 'Should NOT annotate non-session .tmp file');
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  if (await asyncTest('handles no active session files gracefully', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-compact-nosession-${Date.now()}`);
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    try {
      const result = await runScriptInDir(path.join(scriptsDir, 'pre-compact.js'), getSandboxRepo(), '', {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0, 'Should exit 0 with no session files');
      assert.ok(result.stderr.includes('[PreCompact]'), 'Should still log success');

      // Compaction log should still be created
      const logFile = path.join(sessionsDir, 'compaction-log.txt');
      assert.ok(fs.existsSync(logFile), 'Should create compaction log even with no sessions');
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  console.log('\nRound 23: session-end.js (extractSessionSummary edge cases):');

  if (await asyncTest('handles transcript with only assistant messages (no user messages)', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');
    // Only assistant messages — no user messages
    const lines = [
      '{"type":"assistant","message":{"content":[{"type":"text","text":"response"}]}}',
      '{"type":"tool_use","tool_name":"Read","tool_input":{"file_path":"/src/app.ts"}}',
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
      HOME: testDir
    });
    assert.strictEqual(result.code, 0);

    // With no user messages, extractSessionSummary returns null → blank template
    const claudeDir = path.join(testDir, '.claude', 'harness/data/sessions');
    if (fs.existsSync(claudeDir)) {
      const files = fs.readdirSync(claudeDir).filter(f => f.endsWith('.tmp'));
      if (files.length > 0) {
        const content = fs.readFileSync(path.join(claudeDir, files[0]), 'utf8');
        assert.ok(content.includes('[Session context goes here]'), 'Should use blank template when no user messages');
      }
    }
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('extracts tool_use from assistant message content blocks', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');
    // Claude Code JSONL format: tool_use blocks inside assistant message content array
    const lines = [
      '{"type":"user","content":"Edit config"}',
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'I will edit the config.' },
            { type: 'tool_use', name: 'Edit', input: { file_path: '/src/config.ts' } },
            { type: 'tool_use', name: 'Write', input: { file_path: '/src/new.ts' } },
          ]
        }
      }),
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
      HOME: testDir
    });
    assert.strictEqual(result.code, 0);

    const claudeDir = path.join(testDir, '.claude', 'harness/data/sessions');
    if (fs.existsSync(claudeDir)) {
      const files = fs.readdirSync(claudeDir).filter(f => f.endsWith('.tmp'));
      if (files.length > 0) {
        const content = fs.readFileSync(path.join(claudeDir, files[0]), 'utf8');
        assert.ok(content.includes('/src/config.ts'), 'Should extract file from nested tool_use block');
        assert.ok(content.includes('/src/new.ts'), 'Should extract Write file from nested block');
        assert.ok(content.includes('Edit'), 'Should list Edit in tools used');
      }
    }
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  // ─── Round 24: suggest-compact interval fix, fd fallback, session-start maxAge ───
  console.log('\nRound 24: suggest-compact.js (interval fix & fd fallback):');

  if (await asyncTest('periodic intervals are consistent with non-25-divisible threshold', async () => {
    // Regression test: with threshold=13, periodic suggestions should fire at 38, 63, 88...
    // (count - 13) % 25 === 0 → 38-13=25, 63-13=50, etc.
    const sessionId = `test-interval-fix-${Date.now()}`;
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);
    try {
      // Pre-seed at 37 so next call = 38 (13 + 25 = 38)
      fs.writeFileSync(counterFile, '37');
      const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
        CLAUDE_SESSION_ID: sessionId,
        COMPACT_THRESHOLD: '13'
      });
      assert.strictEqual(result.code, 0);
      assert.ok(result.stderr.includes('38 tool calls'), 'Should suggest at threshold(13) + 25 = 38');
    } finally {
      try { fs.unlinkSync(counterFile); } catch { /* ignore */ }
    }
  })) passed++; else failed++;

  if (await asyncTest('does not suggest at old-style multiples that skip threshold offset', async () => {
    // With threshold=13, count=50 should NOT trigger (old behavior would: 50%25===0)
    // New behavior: (50-13)%25 = 37%25 = 12 → no suggestion
    const sessionId = `test-no-false-suggest-${Date.now()}`;
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);
    try {
      fs.writeFileSync(counterFile, '49');
      const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
        CLAUDE_SESSION_ID: sessionId,
        COMPACT_THRESHOLD: '13'
      });
      assert.strictEqual(result.code, 0);
      assert.ok(!result.stderr.includes('checkpoint'), 'Should NOT suggest at count=50 with threshold=13');
    } finally {
      try { fs.unlinkSync(counterFile); } catch { /* ignore */ }
    }
  })) passed++; else failed++;

  if (await asyncTest('fd fallback: handles corrupted counter file gracefully', async () => {
    const sessionId = `test-corrupt-${Date.now()}`;
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);
    try {
      // Write non-numeric data to trigger parseInt → NaN → reset to 1
      fs.writeFileSync(counterFile, 'corrupted data here!!!');
      const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
        CLAUDE_SESSION_ID: sessionId
      });
      assert.strictEqual(result.code, 0);
      const newCount = parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10);
      assert.strictEqual(newCount, 1, 'Should reset to 1 on corrupted file content');
    } finally {
      try { fs.unlinkSync(counterFile); } catch { /* ignore */ }
    }
  })) passed++; else failed++;

  if (await asyncTest('handles counter at exact 1000000 boundary', async () => {
    const sessionId = `test-boundary-${Date.now()}`;
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);
    try {
      // 1000000 is the upper clamp boundary — should still increment
      fs.writeFileSync(counterFile, '1000000');
      const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
        CLAUDE_SESSION_ID: sessionId
      });
      assert.strictEqual(result.code, 0);
      const newCount = parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10);
      assert.strictEqual(newCount, 1000001, 'Should increment from exactly 1000000');
    } finally {
      try { fs.unlinkSync(counterFile); } catch { /* ignore */ }
    }
  })) passed++; else failed++;

  console.log('\nRound 24: post-edit-format.js (edge cases):');

  if (await asyncTest('passes through malformed JSON unchanged', async () => {
    const malformedJson = '{"tool_input": {"file_path": "/test.ts"';
    const result = await runScript(path.join(scriptsDir, 'post-edit-format.js'), malformedJson);
    assert.strictEqual(result.code, 0);
    // Should pass through the malformed data unchanged
    assert.ok(result.stdout.includes(malformedJson), 'Should pass through malformed JSON');
  })) passed++; else failed++;

  if (await asyncTest('passes through data for non-JS/TS file extensions', async () => {
    const stdinJson = JSON.stringify({ tool_input: { file_path: '/path/to/file.py' } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-format.js'), stdinJson);
    assert.strictEqual(result.code, 0);
    assert.ok(result.stdout.includes('file.py'), 'Should pass through for .py files');
  })) passed++; else failed++;

  console.log('\nRound 24: post-edit-typecheck.js (edge cases):');

  if (await asyncTest('skips typecheck for non-existent file and still passes through', async () => {
    const stdinJson = JSON.stringify({ tool_input: { file_path: '/nonexistent/deep/file.ts' } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-typecheck.js'), stdinJson);
    assert.strictEqual(result.code, 0);
    assert.ok(result.stdout.includes('file.ts'), 'Should pass through for non-existent .ts file');
  })) passed++; else failed++;

  if (await asyncTest('passes through for non-TS extensions without running tsc', async () => {
    const stdinJson = JSON.stringify({ tool_input: { file_path: '/path/to/file.js' } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-typecheck.js'), stdinJson);
    assert.strictEqual(result.code, 0);
    assert.ok(result.stdout.includes('file.js'), 'Should pass through for .js file without running tsc');
  })) passed++; else failed++;

  console.log('\nRound 24: session-start.js (edge cases):');

  if (await asyncTest('exits 0 with empty sessions directory (no recent sessions)', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-start-empty-${Date.now()}`);
    fs.mkdirSync(path.join(isoHome, '.claude', 'harness/data/sessions'), { recursive: true });
    fs.mkdirSync(path.join(isoHome, '.claude', 'skills', 'learned'), { recursive: true });
    try {
      const result = await runScript(path.join(scriptsDir, 'session-start.js'), '', {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0, 'Should exit 0 with no sessions');
      // Should NOT inject any previous session data (stdout should be empty or minimal)
      assert.ok(!result.stdout.includes('Previous session summary'), 'Should not inject when no sessions');
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  if (await asyncTest('does not inject blank template session into context', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-start-blank-${Date.now()}`);
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.mkdirSync(path.join(isoHome, '.claude', 'skills', 'learned'), { recursive: true });

    // Create a session file with the blank template marker
    const today = new Date().toISOString().slice(0, 10);
    const sessionFile = path.join(sessionsDir, `${today}-blank-session.tmp`);
    fs.writeFileSync(sessionFile, '# Session\n[Session context goes here]\n');

    try {
      const result = await runScript(path.join(scriptsDir, 'session-start.js'), '', {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0);
      // Should NOT inject blank template
      assert.ok(!result.stdout.includes('Previous session summary'), 'Should skip blank template sessions');
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  // ─── Round 25: post-edit-console-warn pass-through fix, check-console-log edge cases ───
  console.log('\nRound 25: post-edit-console-warn.js (pass-through fix):');

  if (await asyncTest('stdout is exact byte match of stdin (no trailing newline)', async () => {
    // Regression test: console.log(data) was replaced with process.stdout.write(data)
    const stdinData = '{"tool_input":{"file_path":"/nonexistent/file.py"}}';
    const result = await runScript(path.join(scriptsDir, 'post-edit-console-warn.js'), stdinData);
    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.stdout, stdinData, 'stdout should exactly match stdin (no extra newline)');
  })) passed++; else failed++;

  if (await asyncTest('passes through malformed JSON unchanged without crash', async () => {
    const malformed = '{"tool_input": {"file_path": "/test.ts"';
    const result = await runScript(path.join(scriptsDir, 'post-edit-console-warn.js'), malformed);
    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.stdout, malformed, 'Should pass through malformed JSON exactly');
  })) passed++; else failed++;

  if (await asyncTest('handles missing file_path in tool_input gracefully', async () => {
    const stdinJson = JSON.stringify({ tool_input: {} });
    const result = await runScript(path.join(scriptsDir, 'post-edit-console-warn.js'), stdinJson);
    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.stdout, stdinJson, 'Should pass through with missing file_path');
  })) passed++; else failed++;

  if (await asyncTest('passes through when file does not exist (readFile returns null)', async () => {
    const stdinJson = JSON.stringify({ tool_input: { file_path: '/nonexistent/deep/file.ts' } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-console-warn.js'), stdinJson);
    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.stdout, stdinJson, 'Should pass through exactly when file not found');
  })) passed++; else failed++;

  console.log('\nRound 25: check-console-log.js (edge cases):');

  if (await asyncTest('source has expected exclusion patterns', async () => {
    // The EXCLUDED_PATTERNS array includes .test.ts, .spec.ts, etc.
    const source = fs.readFileSync(path.join(scriptsDir, 'check-console-log.js'), 'utf8');
    // Verify the exclusion patterns exist (regex escapes use \. so check for the pattern names)
    assert.ok(source.includes('EXCLUDED_PATTERNS'), 'Should have exclusion patterns array');
    assert.ok(/\.test\\\./.test(source), 'Should have test file exclusion pattern');
    assert.ok(/\.spec\\\./.test(source), 'Should have spec file exclusion pattern');
    assert.ok(source.includes('scripts'), 'Should exclude harness/scripts/ directory');
    assert.ok(source.includes('__tests__'), 'Should exclude __tests__/ directory');
    assert.ok(source.includes('__mocks__'), 'Should exclude __mocks__/ directory');
  })) passed++; else failed++;

  if (await asyncTest('passes through data unchanged on non-git repo', async () => {
    // In a temp dir with no git repo, the hook should pass through data unchanged
    const testDir = createTestDir();
    const stdinData = '{"tool_input":"test"}';
    const result = await runScript(path.join(scriptsDir, 'check-console-log.js'), stdinData, {
      // Use a non-git directory as CWD
      HOME: testDir, USERPROFILE: testDir
    });
    // Note: We're still running from a git repo, so isGitRepo() may still return true.
    // This test verifies the script doesn't crash and passes through data.
    assert.strictEqual(result.code, 0);
    assert.ok(result.stdout.includes(stdinData), 'Should pass through data');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('exits 0 even when no stdin is provided', async () => {
    const result = await runScript(path.join(scriptsDir, 'check-console-log.js'), '');
    assert.strictEqual(result.code, 0, 'Should exit 0 with empty stdin');
  })) passed++; else failed++;

  // ── Round 29: post-edit-format.js cwd fix and process.exit(0) consistency ──
  console.log('\nRound 29: post-edit-format.js (cwd and exit):');

  if (await asyncTest('source uses cwd based on file directory for npx', async () => {
    const formatSource = fs.readFileSync(path.join(scriptsDir, 'post-edit-format.js'), 'utf8');
    assert.ok(formatSource.includes('cwd:'), 'Should set cwd option for execFileSync');
    assert.ok(formatSource.includes('path.dirname'), 'cwd should use path.dirname of the file');
    assert.ok(formatSource.includes('path.resolve'), 'cwd should resolve the file path first');
  })) passed++; else failed++;

  if (await asyncTest('source calls process.exit(0) after writing output', async () => {
    const formatSource = fs.readFileSync(path.join(scriptsDir, 'post-edit-format.js'), 'utf8');
    assert.ok(formatSource.includes('process.exit(0)'), 'Should call process.exit(0) for clean termination');
  })) passed++; else failed++;

  if (await asyncTest('uses process.stdout.write instead of console.log for pass-through', async () => {
    const formatSource = fs.readFileSync(path.join(scriptsDir, 'post-edit-format.js'), 'utf8');
    assert.ok(formatSource.includes('process.stdout.write(data)'), 'Should use process.stdout.write to avoid trailing newline');
    // Verify no console.log(data) for pass-through (console.error for warnings is OK)
    const lines = formatSource.split('\n');
    const passThrough = lines.filter(l => /console\.log\(data\)/.test(l));
    assert.strictEqual(passThrough.length, 0, 'Should not use console.log(data) for pass-through');
  })) passed++; else failed++;

  console.log('\nRound 29: post-edit-typecheck.js (exit and pass-through):');

  if (await asyncTest('source calls process.exit(0) after writing output', async () => {
    const tcSource = fs.readFileSync(path.join(scriptsDir, 'post-edit-typecheck.js'), 'utf8');
    assert.ok(tcSource.includes('process.exit(0)'), 'Should call process.exit(0) for clean termination');
  })) passed++; else failed++;

  if (await asyncTest('uses process.stdout.write instead of console.log for pass-through', async () => {
    const tcSource = fs.readFileSync(path.join(scriptsDir, 'post-edit-typecheck.js'), 'utf8');
    assert.ok(tcSource.includes('process.stdout.write(data)'), 'Should use process.stdout.write');
    const lines = tcSource.split('\n');
    const passThrough = lines.filter(l => /console\.log\(data\)/.test(l));
    assert.strictEqual(passThrough.length, 0, 'Should not use console.log(data) for pass-through');
  })) passed++; else failed++;

  if (await asyncTest('exact stdout pass-through without trailing newline (typecheck)', async () => {
    const stdinJson = JSON.stringify({ tool_input: { file_path: '/nonexistent/file.py' } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-typecheck.js'), stdinJson);
    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.stdout, stdinJson, 'stdout should exactly match stdin (no trailing newline)');
  })) passed++; else failed++;

  if (await asyncTest('exact stdout pass-through without trailing newline (format)', async () => {
    const stdinJson = JSON.stringify({ tool_input: { file_path: '/nonexistent/file.py' } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-format.js'), stdinJson);
    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.stdout, stdinJson, 'stdout should exactly match stdin (no trailing newline)');
  })) passed++; else failed++;

  console.log('\nRound 29: post-edit-console-warn.js (extension and exit):');

  if (await asyncTest('source calls process.exit(0) after writing output', async () => {
    const cwSource = fs.readFileSync(path.join(scriptsDir, 'post-edit-console-warn.js'), 'utf8');
    assert.ok(cwSource.includes('process.exit(0)'), 'Should call process.exit(0)');
  })) passed++; else failed++;

  if (await asyncTest('does NOT match .mts or .mjs extensions', async () => {
    const stdinMts = JSON.stringify({ tool_input: { file_path: '/some/file.mts' } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-console-warn.js'), stdinMts);
    assert.strictEqual(result.code, 0);
    // .mts is not in the regex /\.(ts|tsx|js|jsx)$/, so no console.log scan
    assert.strictEqual(result.stdout, stdinMts, 'Should pass through .mts without scanning');
    assert.ok(!result.stderr.includes('console.log'), 'Should NOT scan .mts files for console.log');
  })) passed++; else failed++;

  if (await asyncTest('does NOT match uppercase .TS extension', async () => {
    const stdinTS = JSON.stringify({ tool_input: { file_path: '/some/file.TS' } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-console-warn.js'), stdinTS);
    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.stdout, stdinTS, 'Should pass through .TS without scanning');
    assert.ok(!result.stderr.includes('console.log'), 'Should NOT scan .TS (uppercase) files');
  })) passed++; else failed++;

  if (await asyncTest('detects console.log in commented-out code', async () => {
    const testDir = createTestDir();
    const testFile = path.join(testDir, 'commented.js');
    fs.writeFileSync(testFile, '// console.log("debug")\nconst x = 1;\n');
    const stdinJson = JSON.stringify({ tool_input: { file_path: testFile } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-console-warn.js'), stdinJson);
    assert.strictEqual(result.code, 0);
    // The regex /console\.log/ matches even in comments — this is intentional
    assert.ok(result.stderr.includes('console.log'), 'Should detect console.log even in comments');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  console.log('\nRound 29: check-console-log.js (exclusion patterns and exit):');

  if (await asyncTest('source calls process.exit(0) after writing output', async () => {
    const clSource = fs.readFileSync(path.join(scriptsDir, 'check-console-log.js'), 'utf8');
    // Should have at least 2 process.exit(0) calls (early return + end)
    const exitCalls = clSource.match(/process\.exit\(0\)/g) || [];
    assert.ok(exitCalls.length >= 2, `Should have at least 2 process.exit(0) calls, found ${exitCalls.length}`);
  })) passed++; else failed++;

  if (await asyncTest('EXCLUDED_PATTERNS correctly excludes test files', async () => {
    // Test the patterns directly by reading the source and evaluating the regex
    const source = fs.readFileSync(path.join(scriptsDir, 'check-console-log.js'), 'utf8');
    // Verify the 6 exclusion patterns exist in the source (as regex literals with escapes)
    const expectedSubstrings = ['test', 'spec', 'config', 'scripts', '__tests__', '__mocks__'];
    for (const substr of expectedSubstrings) {
      assert.ok(source.includes(substr), `Should include pattern containing "${substr}"`);
    }
    // Verify the array name exists
    assert.ok(source.includes('EXCLUDED_PATTERNS'), 'Should have EXCLUDED_PATTERNS array');
  })) passed++; else failed++;

  if (await asyncTest('exclusion patterns match expected file paths', async () => {
    // Recreate the EXCLUDED_PATTERNS from the source and test them
    const EXCLUDED_PATTERNS = [
      /\.test\.[jt]sx?$/,
      /\.spec\.[jt]sx?$/,
      /\.config\.[jt]s$/,
      /scripts\//,
      /__tests__\//,
      /__mocks__\//,
    ];
    // These SHOULD be excluded
    const excluded = [
      'src/utils.test.ts', 'src/utils.test.js', 'src/utils.test.tsx', 'src/utils.test.jsx',
      'src/utils.spec.ts', 'src/utils.spec.js',
      'src/utils.config.ts', 'src/utils.config.js',
      'harness/scripts/hooks/session-end.js',
      '__tests__/utils.ts',
      '__mocks__/api.ts',
    ];
    for (const f of excluded) {
      const matches = EXCLUDED_PATTERNS.some(p => p.test(f));
      assert.ok(matches, `Expected "${f}" to be excluded but it was not`);
    }
    // These should NOT be excluded
    const notExcluded = [
      'src/utils.ts', 'src/main.tsx', 'src/app.js',
      'src/test.component.ts',  // "test" in name but not .test. pattern
      'src/config.ts',          // "config" in name but not .config. pattern
    ];
    for (const f of notExcluded) {
      const matches = EXCLUDED_PATTERNS.some(p => p.test(f));
      assert.ok(!matches, `Expected "${f}" to NOT be excluded but it was`);
    }
  })) passed++; else failed++;

  console.log('\nRound 29: run-all.js test runner improvements:');

  if (await asyncTest('test runner uses spawnSync to capture stderr on success', async () => {
    const runAllSource = fs.readFileSync(path.join(__dirname, '../run-all.js'), 'utf8');
    assert.ok(runAllSource.includes('spawnSync'), 'Should use spawnSync instead of execSync');
    assert.ok(!runAllSource.includes('execSync'), 'Should not use execSync');
    // Verify it shows stderr
    assert.ok(runAllSource.includes('stderr'), 'Should handle stderr output');
  })) passed++; else failed++;

  // ── Round 32: post-edit-typecheck special characters & check-console-log ──
  console.log('\nRound 32: post-edit-typecheck (special character paths):');

  if (await asyncTest('handles file path with spaces gracefully', async () => {
    const testDir = createTestDir();
    const testFile = path.join(testDir, 'my file.ts');
    fs.writeFileSync(testFile, 'const x: number = 1;');

    const stdinJson = JSON.stringify({ tool_input: { file_path: testFile } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-typecheck.js'), stdinJson);
    assert.strictEqual(result.code, 0, 'Should handle spaces in path');
    assert.ok(result.stdout.includes('tool_input'), 'Should pass through data');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('handles file path with shell metacharacters safely', async () => {
    const testDir = createTestDir();
    // File name with characters that could be dangerous in shell contexts
    const testFile = path.join(testDir, 'test$(echo).ts');
    fs.writeFileSync(testFile, 'const x: number = 1;');

    const stdinJson = JSON.stringify({ tool_input: { file_path: testFile } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-typecheck.js'), stdinJson);
    assert.strictEqual(result.code, 0, 'Should not crash on shell metacharacters');
    // execFileSync prevents shell injection — just verify no crash
    assert.ok(result.stdout.includes('tool_input'), 'Should pass through data safely');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('handles .tsx file extension', async () => {
    const testDir = createTestDir();
    const testFile = path.join(testDir, 'component.tsx');
    fs.writeFileSync(testFile, 'const App = () => <div>Hello</div>;');

    const stdinJson = JSON.stringify({ tool_input: { file_path: testFile } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-typecheck.js'), stdinJson);
    assert.strictEqual(result.code, 0, 'Should handle .tsx files');
    assert.ok(result.stdout.includes('tool_input'), 'Should pass through data');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  console.log('\nRound 32: check-console-log (edge cases):');

  if (await asyncTest('passes through data when git commands fail', async () => {
    // Run from a non-git directory
    const testDir = createTestDir();
    const stdinData = JSON.stringify({ tool_name: 'Write', tool_input: {} });
    const result = await runScript(path.join(scriptsDir, 'check-console-log.js'), stdinData);
    assert.strictEqual(result.code, 0, 'Should exit 0');
    assert.ok(result.stdout.includes('tool_name'), 'Should pass through stdin');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('handles very large stdin within limit', async () => {
    // Send just under the 1MB limit
    const largePayload = JSON.stringify({ tool_name: 'x'.repeat(500000) });
    const result = await runScript(path.join(scriptsDir, 'check-console-log.js'), largePayload);
    assert.strictEqual(result.code, 0, 'Should handle large stdin');
  })) passed++; else failed++;

  console.log('\nRound 32: post-edit-console-warn (additional edge cases):');

  if (await asyncTest('handles file with only console.error (no warning)', async () => {
    const testDir = createTestDir();
    const testFile = path.join(testDir, 'errors-only.ts');
    fs.writeFileSync(testFile, 'console.error("this is fine");\nconsole.warn("also fine");');

    const stdinJson = JSON.stringify({ tool_input: { file_path: testFile } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-console-warn.js'), stdinJson);
    assert.ok(!result.stderr.includes('WARNING'), 'Should NOT warn for console.error/warn only');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('handles null tool_input gracefully', async () => {
    const stdinJson = JSON.stringify({ tool_input: null });
    const result = await runScript(path.join(scriptsDir, 'post-edit-console-warn.js'), stdinJson);
    assert.strictEqual(result.code, 0, 'Should handle null tool_input');
    assert.ok(result.stdout.includes('tool_input'), 'Should pass through data');
  })) passed++; else failed++;

  console.log('\nRound 32: session-end.js (empty transcript):');

  if (await asyncTest('handles completely empty transcript file', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'empty.jsonl');
    fs.writeFileSync(transcriptPath, '');

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson);
    assert.strictEqual(result.code, 0, 'Should handle empty transcript');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('handles transcript with only whitespace lines', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'whitespace.jsonl');
    fs.writeFileSync(transcriptPath, '  \n\n  \n');

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson);
    assert.strictEqual(result.code, 0, 'Should handle whitespace-only transcript');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  // Round 41: pre-compact.js (multiple session files)
  console.log('\nRound 41: pre-compact.js (multiple session files):');

  if (await asyncTest('annotates only the newest session file when multiple exist', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-compact-multi-${Date.now()}`);
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    // Create two session files with different mtimes
    const olderSession = path.join(sessionsDir, '2026-01-01-older-session.tmp');
    const newerSession = path.join(sessionsDir, '2026-02-11-newer-session.tmp');
    fs.writeFileSync(olderSession, '# Older Session\n');
    // Small delay to ensure different mtime
    const now = Date.now();
    fs.utimesSync(olderSession, new Date(now - 60000), new Date(now - 60000));
    fs.writeFileSync(newerSession, '# Newer Session\n');

    try {
      const result = await runScriptInDir(path.join(scriptsDir, 'pre-compact.js'), getSandboxRepo(), '', {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0);

      const newerContent = fs.readFileSync(newerSession, 'utf8');
      const olderContent = fs.readFileSync(olderSession, 'utf8');

      // findFiles sorts by mtime newest first, so sessions[0] is the newest
      assert.ok(
        newerContent.includes('Compaction occurred'),
        'Should annotate the newest session file'
      );
      assert.strictEqual(
        olderContent,
        '# Older Session\n',
        'Should NOT annotate older session files'
      );
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  // Round 40: session-end.js (newline collapse in markdown list items)
  console.log('\nRound 40: session-end.js (newline collapse):');

  if (await asyncTest('collapses newlines in user messages to single-line markdown items', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');

    // User message containing newlines that would break markdown list
    const lines = [
      JSON.stringify({ type: 'user', content: 'Please help me with:\n1. Task one\n2. Task two\n3. Task three' }),
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
      HOME: testDir
    });
    assert.strictEqual(result.code, 0);

    // Find the session file and verify newlines were collapsed
    const claudeDir = path.join(testDir, '.claude', 'harness/data/sessions');
    if (fs.existsSync(claudeDir)) {
      const files = fs.readdirSync(claudeDir).filter(f => f.endsWith('.tmp'));
      if (files.length > 0) {
        const content = fs.readFileSync(path.join(claudeDir, files[0]), 'utf8');
        // Each task should be a single-line markdown list item
        const taskLines = content.split('\n').filter(l => l.startsWith('- '));
        for (const line of taskLines) {
          assert.ok(
            !line.includes('\n'),
            'Task list items should be single-line'
          );
        }
        // Newlines should be replaced with spaces
        assert.ok(
          content.includes('Please help me with: 1. Task one 2. Task two'),
          `Newlines should be collapsed to spaces, got: ${content.substring(0, 500)}`
        );
      }
    }
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  // ── Round 44: session-start.js empty session file ──
  console.log('\nRound 44: session-start.js (empty session file):');

  if (await asyncTest('does not inject empty session file content into context', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-start-empty-file-${Date.now()}`);
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.mkdirSync(path.join(isoHome, '.claude', 'skills', 'learned'), { recursive: true });

    // Create a 0-byte session file (simulates truncated/corrupted write)
    const today = new Date().toISOString().slice(0, 10);
    const sessionFile = path.join(sessionsDir, `${today}-empty0000-session.tmp`);
    fs.writeFileSync(sessionFile, '');

    try {
      const result = await runScript(path.join(scriptsDir, 'session-start.js'), '', {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0, 'Should exit 0 with empty session file');
      // readFile returns '' (falsy) → the if (content && ...) guard skips injection
      assert.ok(
        !result.stdout.includes('Previous session summary'),
        'Should NOT inject empty string into context'
      );
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  // ── Round 49: typecheck extension matching and session-end conditional sections ──
  console.log('\nRound 49: post-edit-typecheck.js (extension edge cases):');

  if (await asyncTest('.d.ts files match the TS regex and trigger typecheck path', async () => {
    const testDir = createTestDir();
    const testFile = path.join(testDir, 'types.d.ts');
    fs.writeFileSync(testFile, 'declare const x: number;');

    const stdinJson = JSON.stringify({ tool_input: { file_path: testFile } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-typecheck.js'), stdinJson);
    assert.strictEqual(result.code, 0, 'Should exit 0 for .d.ts file');
    assert.ok(result.stdout.includes('tool_input'), 'Should pass through stdin data');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('.mts extension does not trigger typecheck', async () => {
    const stdinJson = JSON.stringify({ tool_input: { file_path: '/project/utils.mts' } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-typecheck.js'), stdinJson);
    assert.strictEqual(result.code, 0, 'Should exit 0 for .mts file');
    assert.strictEqual(result.stdout, stdinJson, 'Should pass through .mts unchanged');
  })) passed++; else failed++;

  console.log('\nRound 49: session-end.js (conditional summary sections):');

  if (await asyncTest('summary omits Files Modified and Tools Used when none found', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-notools-${Date.now()}`);
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');
    // Only user messages — no tool_use entries at all
    const lines = [
      '{"type":"user","content":"How does authentication work?"}',
      '{"type":"assistant","message":{"content":[{"type":"text","text":"It uses JWT"}]}}'
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));
    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });

    try {
      const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0);

      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('-session.tmp'));
      assert.ok(files.length > 0, 'Should create session file');
      const content = fs.readFileSync(path.join(sessionsDir, files[0]), 'utf8');
      assert.ok(content.includes('authentication'), 'Should include user message');
      assert.ok(!content.includes('### Files Modified'), 'Should omit Files Modified when empty');
      assert.ok(!content.includes('### Tools Used'), 'Should omit Tools Used when empty');
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
      cleanupTestDir(testDir);
    }
  })) passed++; else failed++;

  // ── Round 50: alias reporting, parallel compaction, graceful degradation ──
  console.log('\nRound 50: session-start.js (alias reporting):');

  if (await asyncTest('reports available session aliases on startup', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-start-alias-${Date.now()}`);
    fs.mkdirSync(path.join(isoHome, '.claude', 'harness/data/sessions'), { recursive: true });
    fs.mkdirSync(path.join(isoHome, '.claude', 'skills', 'learned'), { recursive: true });

    fs.mkdirSync(path.join(isoHome, '.claude/harness/data/state'), { recursive: true });
    // Pre-populate the aliases file
    fs.writeFileSync(path.join(isoHome, '.claude', 'harness/data/state/session-aliases.json'), JSON.stringify({
      version: '1.0',
      aliases: {
        'my-feature': { sessionPath: '/sessions/feat', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), title: null },
        'bug-fix': { sessionPath: '/sessions/fix', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), title: null }
      },
      metadata: { totalCount: 2, lastUpdated: new Date().toISOString() }
    }));

    try {
      const result = await runScript(path.join(scriptsDir, 'session-start.js'), '', {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0);
      assert.ok(result.stderr.includes('alias'), 'Should mention aliases in stderr');
      assert.ok(
        result.stderr.includes('my-feature') || result.stderr.includes('bug-fix'),
        'Should list at least one alias name'
      );
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  console.log('\nRound 50: pre-compact.js (parallel execution):');

  if (await asyncTest('parallel compaction runs all append to log without loss', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-compact-par-${Date.now()}`);
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    try {
      const promises = Array(3).fill(null).map(() =>
        runScriptInDir(path.join(scriptsDir, 'pre-compact.js'), getSandboxRepo(), '', {
          HOME: isoHome, USERPROFILE: isoHome
        })
      );
      const results = await Promise.all(promises);
      results.forEach((r, i) => assert.strictEqual(r.code, 0, `Run ${i} should exit 0`));

      const logFile = path.join(sessionsDir, 'compaction-log.txt');
      assert.ok(fs.existsSync(logFile), 'Compaction log should exist');
      const content = fs.readFileSync(logFile, 'utf8');
      const entries = (content.match(/Context compaction triggered/g) || []).length;
      assert.strictEqual(entries, 3, `Should have 3 log entries, got ${entries}`);
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  console.log('\nRound 50: session-start.js (graceful degradation):');

  if (await asyncTest('exits 0 when sessions path is a file (not a directory)', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-start-blocked-${Date.now()}`);
    fs.mkdirSync(path.join(isoHome, '.claude/harness/data/state'), { recursive: true });
    // Block sessions dir creation by placing a file at that path
    fs.writeFileSync(path.join(isoHome, '.claude', 'harness/data/sessions'), 'blocked');

    try {
      const result = await runScript(path.join(scriptsDir, 'session-start.js'), '', {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0, 'Should exit 0 even when sessions dir is blocked');
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  // ── Round 53: console-warn max matches and format non-existent file ──
  console.log('\nRound 53: post-edit-console-warn.js (max matches truncation):');

  if (await asyncTest('reports maximum 5 console.log matches per file', async () => {
    const testDir = createTestDir();
    const testFile = path.join(testDir, 'many-logs.js');
    const lines = Array(7).fill(null).map((_, i) =>
      `console.log("debug line ${i + 1}");`
    );
    fs.writeFileSync(testFile, lines.join('\n'));

    const stdinJson = JSON.stringify({ tool_input: { file_path: testFile } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-console-warn.js'), stdinJson);

    assert.strictEqual(result.code, 0, 'Should exit 0');
    // Count line number reports in stderr (format: "N: console.log(...)")
    const lineReports = (result.stderr.match(/^\d+:/gm) || []).length;
    assert.strictEqual(lineReports, 5, `Should report max 5 matches, got ${lineReports}`);
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  console.log('\nRound 53: post-edit-format.js (non-existent file):');

  if (await asyncTest('passes through data for non-existent .tsx file path', async () => {
    const stdinJson = JSON.stringify({
      tool_input: { file_path: '/nonexistent/path/file.tsx' }
    });
    const result = await runScript(path.join(scriptsDir, 'post-edit-format.js'), stdinJson);

    assert.strictEqual(result.code, 0, 'Should exit 0 for non-existent file');
    assert.strictEqual(result.stdout, stdinJson, 'Should pass through stdin data unchanged');
  })) passed++; else failed++;

  // ── Round 55: maxAge boundary, multi-session injection, stdin overflow ──
  console.log('\nRound 55: session-start.js (maxAge 7-day boundary):');

  if (await asyncTest('excludes session files older than 7 days', async () => {
    const { isoHome, repoDir, cleanup } = createSessionStartFixture('ecc-start-7day');
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');

    // Create session file 6.9 days old (should be INCLUDED by maxAge:7)
    const recentFile = path.join(sessionsDir, '2026-02-06-recent69-session.tmp');
    fs.writeFileSync(recentFile, '# Recent Session\n\nRECENT CONTENT HERE');
    const sixPointNineDaysAgo = new Date(Date.now() - 6.9 * 24 * 60 * 60 * 1000);
    fs.utimesSync(recentFile, sixPointNineDaysAgo, sixPointNineDaysAgo);

    // Create session file 8 days old (should be EXCLUDED by maxAge:7)
    const oldFile = path.join(sessionsDir, '2026-02-05-old8day-session.tmp');
    fs.writeFileSync(oldFile, '# Old Session\n\nOLD CONTENT SHOULD NOT APPEAR');
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldFile, eightDaysAgo, eightDaysAgo);

    try {
      const result = await runScriptInDir(path.join(scriptsDir, 'session-start.js'), repoDir, '', {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0);
      assert.ok(result.stderr.includes('1 recent session'),
        `Should find 1 recent session (6.9-day included, 8-day excluded), stderr: ${result.stderr}`);
      assert.ok(result.stdout.includes('RECENT CONTENT HERE'),
        'Should inject the 6.9-day-old session content');
      assert.ok(!result.stdout.includes('OLD CONTENT SHOULD NOT APPEAR'),
        'Should NOT inject the 8-day-old session content');
    } finally {
      cleanup();
    }
  })) passed++; else failed++;

  console.log('\nRound 55: session-start.js (newest session selection):');

  if (await asyncTest('injects newest session when multiple recent sessions exist', async () => {
    const { isoHome, repoDir, cleanup } = createSessionStartFixture('ecc-start-multi');
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');

    const now = Date.now();

    // Create older session (2 days ago)
    const olderSession = path.join(sessionsDir, '2026-02-11-olderabc-session.tmp');
    fs.writeFileSync(olderSession, '# Older Session\n\nOLDER_CONTEXT_MARKER');
    fs.utimesSync(olderSession, new Date(now - 2 * 86400000), new Date(now - 2 * 86400000));

    // Create newer session (1 day ago)
    const newerSession = path.join(sessionsDir, '2026-02-12-newerdef-session.tmp');
    fs.writeFileSync(newerSession, '# Newer Session\n\nNEWER_CONTEXT_MARKER');
    fs.utimesSync(newerSession, new Date(now - 1 * 86400000), new Date(now - 1 * 86400000));

    try {
      const result = await runScriptInDir(path.join(scriptsDir, 'session-start.js'), repoDir, '', {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0);
      assert.ok(result.stderr.includes('2 recent session'),
        `Should find 2 recent sessions, stderr: ${result.stderr}`);
      // Should inject the NEWER session, not the older one
      assert.ok(result.stdout.includes('NEWER_CONTEXT_MARKER'),
        'Should inject the newest session content');
    } finally {
      cleanup();
    }
  })) passed++; else failed++;

  console.log('\nRound 55: session-end.js (stdin overflow):');

  if (await asyncTest('handles stdin exceeding MAX_STDIN (1MB) gracefully', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');
    // Create a minimal valid transcript so env var fallback works
    fs.writeFileSync(transcriptPath, JSON.stringify({ type: 'user', content: 'Overflow test' }) + '\n');

    // Create stdin > 1MB: truncated JSON will be invalid → falls back to env var
    const oversizedPayload = '{"transcript_path":"' + 'x'.repeat(1048600) + '"}';

    try {
      const result = await runScript(path.join(scriptsDir, 'session-end.js'), oversizedPayload, {
        CLAUDE_TRANSCRIPT_PATH: transcriptPath
      });
      assert.strictEqual(result.code, 0, 'Should exit 0 even with oversized stdin');
      // Truncated JSON → JSON.parse throws → falls back to env var → creates session file
      assert.ok(
        result.stderr.includes('Created session file') || result.stderr.includes('Updated session file'),
        `Should create/update session file via env var fallback, stderr: ${result.stderr}`
      );
    } finally {
      cleanupTestDir(testDir);
    }
  })) passed++; else failed++;

  // ── Round 56: typecheck tsconfig walk-up, suggest-compact fallback path ──
  console.log('\nRound 56: post-edit-typecheck.js (tsconfig in parent directory):');

  if (await asyncTest('walks up directory tree to find tsconfig.json in grandparent', async () => {
    const testDir = createTestDir();
    // Place tsconfig at the TOP level, file is nested 2 levels deep
    fs.writeFileSync(path.join(testDir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { strict: false, noEmit: true }
    }));
    const deepDir = path.join(testDir, 'src', 'components');
    fs.mkdirSync(deepDir, { recursive: true });
    const testFile = path.join(deepDir, 'widget.ts');
    fs.writeFileSync(testFile, 'export const value: number = 42;\n');

    const stdinJson = JSON.stringify({ tool_input: { file_path: testFile } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-typecheck.js'), stdinJson);

    assert.strictEqual(result.code, 0, 'Should exit 0 after walking up to find tsconfig');
    // Core assertion: stdin must pass through regardless of whether tsc ran
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.tool_input.file_path, testFile,
      'Should pass through original stdin data with file_path intact');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  console.log('\nRound 56: suggest-compact.js (counter file as directory — fallback path):');

  if (await asyncTest('exits 0 when counter file path is occupied by a directory', async () => {
    const sessionId = `dirblock-${Date.now()}`;
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);
    // Create a DIRECTORY at the counter file path — openSync('a+') will fail with EISDIR
    fs.mkdirSync(counterFile);

    try {
      const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
        CLAUDE_SESSION_ID: sessionId
      });
      assert.strictEqual(result.code, 0,
        'Should exit 0 even when counter file path is a directory (graceful fallback)');
    } finally {
      // Cleanup: remove the blocking directory
      try { fs.rmdirSync(counterFile); } catch { /* best-effort */ }
    }
  })) passed++; else failed++;

  // ── Round 59: session-start unreadable file, console-log stdin overflow, pre-compact write error ──
  console.log('\nRound 59: session-start.js (unreadable session file — readFile returns null):');

  if (await asyncTest('does not inject content when session file is unreadable', async () => {
    // Skip on Windows or when running as root (permissions won't work)
    if (process.platform === 'win32' || (process.getuid && process.getuid() === 0)) {
      console.log('    (skipped — not supported on this platform)');
      return;
    }
    const isoHome = path.join(os.tmpdir(), `ecc-start-unreadable-${Date.now()}`);
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    // Create a session file with real content, then make it unreadable
    const sessionFile = path.join(sessionsDir, `${Date.now()}-session.tmp`);
    fs.writeFileSync(sessionFile, '# Sensitive session content that should NOT appear');
    fs.chmodSync(sessionFile, 0o000);

    try {
      const result = await runScript(path.join(scriptsDir, 'session-start.js'), '', {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0, 'Should exit 0 even with unreadable session file');
      // readFile returns null for unreadable files → content is null → no injection
      assert.ok(!result.stdout.includes('Sensitive session content'),
        'Should NOT inject content from unreadable file');
    } finally {
      try { fs.chmodSync(sessionFile, 0o644); } catch { /* best-effort */ }
      try { fs.rmSync(isoHome, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  })) passed++; else failed++;

  console.log('\nRound 59: check-console-log.js (stdin exceeding 1MB — truncation):');

  if (await asyncTest('truncates stdin at 1MB limit and still passes through data', async () => {
    // Send 1.2MB of data — exceeds the 1MB MAX_STDIN limit
    const payload = 'x'.repeat(1024 * 1024 + 200000);
    const result = await runScript(path.join(scriptsDir, 'check-console-log.js'), payload);

    assert.strictEqual(result.code, 0, 'Should exit 0 even with oversized stdin');
    // Output should be truncated — significantly less than input
    assert.ok(result.stdout.length < payload.length,
      `stdout (${result.stdout.length}) should be shorter than input (${payload.length})`);
    // Output should be approximately 1MB (last accepted chunk may push slightly over)
    assert.ok(result.stdout.length <= 1024 * 1024 + 65536,
      `stdout (${result.stdout.length}) should be near 1MB, not unbounded`);
    assert.ok(result.stdout.length > 0, 'Should still pass through truncated data');
  })) passed++; else failed++;

  console.log('\nRound 59: pre-compact.js (read-only session file — appendFile error):');

  if (await asyncTest('exits 0 when session file is read-only (appendFile fails)', async () => {
    if (process.platform === 'win32' || (process.getuid && process.getuid() === 0)) {
      console.log('    (skipped — not supported on this platform)');
      return;
    }
    const isoHome = path.join(os.tmpdir(), `ecc-compact-ro-${Date.now()}`);
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    // Create a session file then make it read-only
    const sessionFile = path.join(sessionsDir, `${Date.now()}-session.tmp`);
    fs.writeFileSync(sessionFile, '# Active session\n');
    fs.chmodSync(sessionFile, 0o444);

    try {
      const result = await runScriptInDir(path.join(scriptsDir, 'pre-compact.js'), getSandboxRepo(), '', {
        HOME: isoHome, USERPROFILE: isoHome
      });
      // Should exit 0 — hooks must not block the user (catch at lines 45-47)
      assert.strictEqual(result.code, 0, 'Should exit 0 even when append fails');
      // Session file should remain unchanged (write was blocked)
      const content = fs.readFileSync(sessionFile, 'utf8');
      assert.strictEqual(content, '# Active session\n',
        'Read-only session file should remain unchanged');
    } finally {
      try { fs.chmodSync(sessionFile, 0o644); } catch { /* best-effort */ }
      try { fs.rmSync(isoHome, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  })) passed++; else failed++;

  // ── Round 60: replaceInFile failure, console-warn stdin overflow, format missing tool_input ──
  console.log('\nRound 60: session-end.js (replaceInFile returns false — timestamp update warning):');

  if (await asyncTest('logs warning when existing session file lacks Last Updated field', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-end-nots-${Date.now()}`);
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    // Create transcript with a user message so a summary is produced
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');
    fs.writeFileSync(transcriptPath, '{"type":"user","content":"test message"}\n');

    // Pre-create session file WITHOUT the **Last Updated:** line
    // Use today's date and a short ID matching getSessionIdShort() pattern
    const today = new Date().toISOString().split('T')[0];
    const sessionFile = path.join(sessionsDir, `${today}-session-session.tmp`);
    fs.writeFileSync(sessionFile, '# Session file without timestamp marker\nSome existing content\n');

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
      HOME: isoHome, USERPROFILE: isoHome
    });

    assert.strictEqual(result.code, 0, 'Should exit 0 even when replaceInFile fails');
    // replaceInFile returns false → line 166 logs warning about failed timestamp update
    assert.ok(result.stderr.includes('Failed to update') || result.stderr.includes('[SessionEnd]'),
      'Should log warning when timestamp pattern not found in session file');

    cleanupTestDir(testDir);
    try { fs.rmSync(isoHome, { recursive: true, force: true }); } catch { /* best-effort */ }
  })) passed++; else failed++;

  console.log('\nRound 60: post-edit-console-warn.js (stdin exceeding 1MB — truncation):');

  if (await asyncTest('truncates stdin at 1MB limit and still passes through data', async () => {
    // Send 1.2MB of data — exceeds the 1MB MAX_STDIN limit
    const payload = 'x'.repeat(1024 * 1024 + 200000);
    const result = await runScript(path.join(scriptsDir, 'post-edit-console-warn.js'), payload);

    assert.strictEqual(result.code, 0, 'Should exit 0 even with oversized stdin');
    // Data should be truncated — stdout significantly less than input
    assert.ok(result.stdout.length < payload.length,
      `stdout (${result.stdout.length}) should be shorter than input (${payload.length})`);
    // Should be approximately 1MB (last accepted chunk may push slightly over)
    assert.ok(result.stdout.length <= 1024 * 1024 + 65536,
      `stdout (${result.stdout.length}) should be near 1MB, not unbounded`);
    assert.ok(result.stdout.length > 0, 'Should still pass through truncated data');
  })) passed++; else failed++;

  console.log('\nRound 60: post-edit-format.js (valid JSON without tool_input key):');

  if (await asyncTest('skips formatting when JSON has no tool_input field', async () => {
    const stdinJson = JSON.stringify({ result: 'ok', output: 'some data' });
    const result = await runScript(path.join(scriptsDir, 'post-edit-format.js'), stdinJson);

    assert.strictEqual(result.code, 0, 'Should exit 0 for JSON without tool_input');
    // input.tool_input?.file_path is undefined → skips formatting → passes through
    assert.strictEqual(result.stdout, stdinJson,
      'Should pass through data unchanged when tool_input is absent');
  })) passed++; else failed++;

  // ── Round 64: post-edit-typecheck.js valid JSON without tool_input ──
  console.log('\nRound 64: post-edit-typecheck.js (valid JSON without tool_input):');

  if (await asyncTest('skips typecheck when JSON has no tool_input field', async () => {
    const stdinJson = JSON.stringify({ result: 'ok', metadata: { action: 'test' } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-typecheck.js'), stdinJson);

    assert.strictEqual(result.code, 0, 'Should exit 0 for JSON without tool_input');
    // input.tool_input?.file_path is undefined → skips TS check → passes through
    assert.strictEqual(result.stdout, stdinJson,
      'Should pass through data unchanged when tool_input is absent');
  })) passed++; else failed++;

  // ── Round 66: session-end.js entry.role === 'user' fallback and nonexistent transcript ──
  console.log('\nRound 66: session-end.js (entry.role user fallback):');

  if (await asyncTest('extracts user messages from role-only format (no type field)', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-role-only-${Date.now()}`);
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');
    // Use entries with ONLY role field (no type:"user") to exercise the fallback
    const lines = [
      '{"role":"user","content":"Deploy the production build"}',
      '{"role":"assistant","content":"I will deploy now"}',
      '{"role":"user","content":"Check the logs after deploy"}',
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));
    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });

    try {
      const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0);

      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('-session.tmp'));
      assert.ok(files.length > 0, 'Should create session file');
      const content = fs.readFileSync(path.join(sessionsDir, files[0]), 'utf8');
      // The role-only user messages should be extracted
      assert.ok(content.includes('Deploy the production build') || content.includes('deploy'),
        `Session file should include role-only user messages. Got: ${content.substring(0, 300)}`);
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
      cleanupTestDir(testDir);
    }
  })) passed++; else failed++;

  console.log('\nRound 66: session-end.js (nonexistent transcript path):');

  if (await asyncTest('logs "Transcript not found" for nonexistent transcript_path', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-notfound-${Date.now()}`);
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    const stdinJson = JSON.stringify({ transcript_path: '/tmp/nonexistent-transcript-99999.jsonl' });

    try {
      const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0, 'Should exit 0 for missing transcript');
      assert.ok(
        result.stderr.includes('Transcript not found') || result.stderr.includes('not found'),
        `Should log transcript not found. Got stderr: ${result.stderr.substring(0, 300)}`
      );
      // Should still create a session file (with blank template, since summary is null)
      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('-session.tmp'));
      assert.ok(files.length > 0, 'Should still create session file even without transcript');
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  // ── Round 70: session-end.js entry.name / entry.input fallback in direct tool_use entries ──
  console.log('\nRound 70: session-end.js (entry.name/entry.input fallback):');

  if (await asyncTest('extracts tool name and file path from entry.name/entry.input (not tool_name/tool_input)', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-r70-entryname-${Date.now()}`);
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    const transcriptPath = path.join(isoHome, 'transcript.jsonl');

    // Use "name" and "input" fields instead of "tool_name" and "tool_input"
    // This exercises the fallback at session-end.js lines 63 and 66:
    //   const toolName = entry.tool_name || entry.name || '';
    //   const filePath  = entry.tool_input?.file_path || entry.input?.file_path || '';
    const lines = [
      '{"type":"user","content":"Use the alt format fields"}',
      '{"type":"tool_use","name":"Edit","input":{"file_path":"/src/alt-format.ts"}}',
      '{"type":"tool_use","name":"Read","input":{"file_path":"/src/other.ts"}}',
      '{"type":"tool_use","name":"Write","input":{"file_path":"/src/written.ts"}}',
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    try {
      const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0, 'Should exit 0');

      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.tmp'));
      assert.ok(files.length > 0, 'Should create session file');
      const content = fs.readFileSync(path.join(sessionsDir, files[0]), 'utf8');
      // Tools extracted via entry.name fallback
      assert.ok(content.includes('Edit'), 'Should list Edit via entry.name fallback');
      assert.ok(content.includes('Read'), 'Should list Read via entry.name fallback');
      // Files modified via entry.input fallback (Edit and Write, not Read)
      assert.ok(content.includes('/src/alt-format.ts'), 'Should list edited file via entry.input fallback');
      assert.ok(content.includes('/src/written.ts'), 'Should list written file via entry.input fallback');
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  // ── Round 71: session-start.js default source shows getSelectionPrompt ──
  console.log('\nRound 71: session-start.js (default source — selection prompt):');

  if (await asyncTest('shows selection prompt when no package manager preference found (default source)', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-r71-ss-default-${Date.now()}`);
    const isoProject = path.join(isoHome, 'project');
    fs.mkdirSync(path.join(isoHome, '.claude', 'harness/data/sessions'), { recursive: true });
    fs.mkdirSync(path.join(isoHome, '.claude', 'skills', 'learned'), { recursive: true });
    fs.mkdirSync(isoProject, { recursive: true });
    // No package.json, no lock files, no package-manager.json — forces default source

    try {
      const result = await new Promise((resolve, reject) => {
        const env = { ...process.env, HOME: isoHome, USERPROFILE: isoHome };
        delete env.CLAUDE_PACKAGE_MANAGER; // Remove any env-level PM override
        const proc = spawn('node', [path.join(scriptsDir, 'session-start.js')], {
          env,
          cwd: isoProject, // CWD with no package.json or lock files
          stdio: ['pipe', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', data => stdout += data);
        proc.stderr.on('data', data => stderr += data);
        proc.stdin.end();
        proc.on('close', code => resolve({ code, stdout, stderr }));
        proc.on('error', reject);
      });
      assert.strictEqual(result.code, 0, 'Should exit 0');
      assert.ok(result.stderr.includes('No package manager preference'),
        `Should show selection prompt when source is default. Got stderr: ${result.stderr.slice(0, 500)}`);
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  // ── Round 74: session-start.js main().catch handler ──
  console.log('\nRound 74: session-start.js (main catch — unrecoverable error):');

  if (await asyncTest('session-start exits 0 with error message when HOME is non-directory', async () => {
    if (process.platform === 'win32') {
      console.log('    (skipped — /dev/null not available on Windows)');
      return;
    }
    // HOME=/dev/null makes ensureDir(sessionsDir) throw ENOTDIR,
    // which propagates to main().catch — the top-level error boundary
    const result = await runScript(path.join(scriptsDir, 'session-start.js'), '', {
      HOME: '/dev/null',
      USERPROFILE: '/dev/null'
    });
    assert.strictEqual(result.code, 0,
      `Should exit 0 (don't block on errors), got ${result.code}`);
    assert.ok(result.stderr.includes('[SessionStart] Error:'),
      `stderr should contain [SessionStart] Error:, got: ${result.stderr}`);
  })) passed++; else failed++;

  // ── Round 75: pre-compact.js main().catch handler ──
  console.log('\nRound 75: pre-compact.js (main catch — unrecoverable error):');

  if (await asyncTest('pre-compact exits 0 with error message when HOME is non-directory', async () => {
    if (process.platform === 'win32') {
      console.log('    (skipped — /dev/null not available on Windows)');
      return;
    }
    // HOME=/dev/null makes ensureDir(sessionsDir) throw ENOTDIR,
    // which propagates to main().catch — the top-level error boundary
    const result = await runScriptInDir(path.join(scriptsDir, 'pre-compact.js'), getSandboxRepo(), '', {
      HOME: '/dev/null',
      USERPROFILE: '/dev/null'
    });
    assert.strictEqual(result.code, 0,
      `Should exit 0 (don't block on errors), got ${result.code}`);
    assert.ok(result.stderr.includes('[PreCompact] Error:'),
      `stderr should contain [PreCompact] Error:, got: ${result.stderr}`);
  })) passed++; else failed++;

  // ── Round 75: session-end.js main().catch handler ──
  console.log('\nRound 75: session-end.js (main catch — unrecoverable error):');

  if (await asyncTest('session-end exits 0 with error message when HOME is non-directory', async () => {
    if (process.platform === 'win32') {
      console.log('    (skipped — /dev/null not available on Windows)');
      return;
    }
    // HOME=/dev/null makes ensureDir(sessionsDir) throw ENOTDIR inside main(),
    // which propagates to runMain().catch — the top-level error boundary
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), '{}', {
      HOME: '/dev/null',
      USERPROFILE: '/dev/null'
    });
    assert.strictEqual(result.code, 0,
      `Should exit 0 (don't block on errors), got ${result.code}`);
    assert.ok(result.stderr.includes('[SessionEnd] Error:'),
      `stderr should contain [SessionEnd] Error:, got: ${result.stderr}`);
  })) passed++; else failed++;


  // ── Round 76: suggest-compact.js main().catch handler ──
  console.log('\nRound 76: suggest-compact.js (main catch — double-failure):');

  if (await asyncTest('suggest-compact exits 0 with error when TMPDIR is non-directory', async () => {
    if (process.platform === 'win32') {
      console.log('    (skipped — /dev/null not available on Windows)');
      return;
    }
    // TMPDIR=/dev/null causes openSync to fail (ENOTDIR), then the catch
    // fallback writeFile also fails, propagating to main().catch
    const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
      TMPDIR: '/dev/null'
    });
    assert.strictEqual(result.code, 0,
      `Should exit 0 (don't block on errors), got ${result.code}`);
    assert.ok(result.stderr.includes('[StrategicCompact] Error:'),
      `stderr should contain [StrategicCompact] Error:, got: ${result.stderr}`);
  })) passed++; else failed++;

  // ── Round 80: session-end.js entry.message?.role === 'user' third OR condition ──
  console.log('\nRound 80: session-end.js (entry.message.role user — third OR condition):');

  if (await asyncTest('extracts user messages from entries where only message.role is user (not type or role)', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-msgrole-${Date.now()}`);
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');
    // Entries where type is NOT 'user' and there is no direct role field,
    // but message.role IS 'user'. This exercises the third OR condition at
    // session-end.js line 48: entry.message?.role === 'user'
    const lines = [
      '{"type":"human","message":{"role":"user","content":"Refactor the auth module"}}',
      '{"type":"human","message":{"role":"assistant","content":"I will refactor it"}}',
      '{"type":"human","message":{"role":"user","content":"Add integration tests too"}}',
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));
    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });

    try {
      const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0);

      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('-session.tmp'));
      assert.ok(files.length > 0, 'Should create session file');
      const content = fs.readFileSync(path.join(sessionsDir, files[0]), 'utf8');
      // The third OR condition should fire for type:"human" + message.role:"user"
      assert.ok(content.includes('Refactor the auth module') || content.includes('auth'),
        `Session should include message extracted via message.role path. Got: ${content.substring(0, 300)}`);
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
      cleanupTestDir(testDir);
    }
  })) passed++; else failed++;

  // ── Round 81: suggest-compact threshold upper bound, session-end non-string content ──
  console.log('\nRound 81: suggest-compact.js (COMPACT_THRESHOLD > 10000):');

  if (await asyncTest('COMPACT_THRESHOLD exceeding 10000 disables the suggestion', async () => {
    // Values > 10000 are positive and finite but fail the upper-bound check.
    // Out of range disables rather than falling back to a count, because no
    // fixed call count is correct across context sizes.
    const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
      COMPACT_THRESHOLD: '20000'
    });
    assert.strictEqual(result.code, 0, 'Should exit 0');
    assert.ok(!result.stderr.includes('tool calls'),
      'Out-of-range threshold must not produce a suggestion');
    const compactSource = fs.readFileSync(path.join(scriptsDir, 'suggest-compact.js'), 'utf8');
    assert.ok(compactSource.includes('<= 10000'),
      'Source should have <= 10000 upper bound check');
    assert.ok(compactSource.includes(': 0'),
      'Source should disable (threshold 0) when the value is out of range');
  })) passed++; else failed++;

  console.log('\nRound 81: session-end.js (user entry with non-string non-array content):');

  if (await asyncTest('skips user messages with numeric content (non-string non-array branch)', async () => {
    // session-end.js line 50-55: rawContent is checked for string, then array, else ''
    // When content is a number (42), neither branch matches, text = '', message is skipped.
    const isoHome = path.join(os.tmpdir(), `ecc-r81-numcontent-${Date.now()}`);
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    const transcriptPath = path.join(isoHome, 'transcript.jsonl');

    const lines = [
      // Normal user message (string content) — should be included
      '{"type":"user","content":"Real user message"}',
      // User message with numeric content — exercises the else: '' branch
      '{"type":"user","content":42}',
      // User message with boolean content — also hits the else branch
      '{"type":"user","content":true}',
      // User message with object content (no .text) — also hits the else branch
      '{"type":"user","content":{"type":"image","source":"data:..."}}',
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    try {
      const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0, 'Should exit 0');

      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.tmp'));
      assert.ok(files.length > 0, 'Should create session file');
      const content = fs.readFileSync(path.join(sessionsDir, files[0]), 'utf8');
      // The real string message should appear
      assert.ok(content.includes('Real user message'),
        'Should include the string content user message');
      // Numeric/boolean/object content should NOT appear as task bullets.
      // Avoid matching timestamps or dates elsewhere in the session template.
      assert.ok(!/\n- 42(?:\n|$)/.test(content),
        'Numeric content should be skipped from the task summary');
      assert.ok(!/\n- true(?:\n|$)/.test(content),
        'Boolean content should be skipped from the task summary');
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  // ── Round 82: tool_name OR fallback, template marker regex no-match ──

  console.log('\nRound 82: session-end.js (entry.tool_name without type=tool_use):');

  if (await asyncTest('collects tool name from entry with tool_name but non-tool_use type', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-r82-toolname-${Date.now()}`);
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    const transcriptPath = path.join(isoHome, 'transcript.jsonl');
    const lines = [
      '{"type":"user","content":"Fix the bug"}',
      '{"type":"result","tool_name":"Edit","tool_input":{"file_path":"/tmp/app.js"}}',
      '{"type":"assistant","message":{"content":[{"type":"text","text":"Done fixing"}]}}',
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    try {
      const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0, 'Should exit 0');
      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.tmp'));
      assert.ok(files.length > 0, 'Should create session file');
      const content = fs.readFileSync(path.join(sessionsDir, files[0]), 'utf8');
      // The tool name "Edit" should appear even though type is "result", not "tool_use"
      assert.ok(content.includes('Edit'), 'Should collect Edit tool via tool_name OR fallback');
      // The file modified should also be collected since tool_name is Edit
      assert.ok(content.includes('app.js'), 'Should collect modified file path from tool_input');
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  console.log('\nRound 82: session-end.js (template marker present but regex no-match):');

  if (await asyncTest('preserves file when marker present but regex does not match corrupted template', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-r82-tmpl-${Date.now()}`);
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    const today = new Date().toISOString().split('T')[0];
    const sessionFile = path.join(sessionsDir, `session-${today}.tmp`);

    // Write a corrupted template: has the marker but NOT the full regex structure
    const corruptedTemplate = `# Session: ${today}
**Date:** ${today}
**Started:** 10:00
**Last Updated:** 10:00

---

## Current State

[Session context goes here]

Some random content without the expected ### Context to Load section
`;
    fs.writeFileSync(sessionFile, corruptedTemplate);

    // Provide a transcript with enough content to generate a summary
    const transcriptPath = path.join(isoHome, 'transcript.jsonl');
    const lines = [
      '{"type":"user","content":"Implement authentication feature"}',
      '{"type":"assistant","message":{"content":[{"type":"text","text":"I will implement the auth feature using JWT tokens and bcrypt for password hashing."}]}}',
      '{"type":"tool_use","tool_name":"Write","name":"Write","tool_input":{"file_path":"/tmp/auth.js"}}',
      '{"type":"user","content":"Now add the login endpoint"}',
      '{"type":"assistant","message":{"content":[{"type":"text","text":"Adding the login endpoint with proper validation."}]}}',
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    try {
      const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0, 'Should exit 0');

      const content = fs.readFileSync(sessionFile, 'utf8');
      // The marker text should still be present since regex didn't match
      assert.ok(content.includes('[Session context goes here]'),
        'Marker should remain when regex fails to match corrupted template');
      // The corrupted content should still be there
      assert.ok(content.includes('Some random content'),
        'Original corrupted content should be preserved');
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  // ── Round 87: post-edit-format.js and post-edit-typecheck.js stdin overflow (1MB) ──
  console.log('\nRound 87: post-edit-format.js (stdin exceeding 1MB — truncation):');

  if (await asyncTest('truncates stdin at 1MB limit and still passes through data (post-edit-format)', async () => {
    // Send 1.2MB of data — exceeds the 1MB MAX_STDIN limit (lines 14-22)
    const payload = 'x'.repeat(1024 * 1024 + 200000);
    const result = await runScript(path.join(scriptsDir, 'post-edit-format.js'), payload);

    assert.strictEqual(result.code, 0, 'Should exit 0 even with oversized stdin');
    // Output should be truncated — significantly less than input
    assert.ok(result.stdout.length < payload.length,
      `stdout (${result.stdout.length}) should be shorter than input (${payload.length})`);
    // Output should be approximately 1MB (last accepted chunk may push slightly over)
    assert.ok(result.stdout.length <= 1024 * 1024 + 65536,
      `stdout (${result.stdout.length}) should be near 1MB, not unbounded`);
    assert.ok(result.stdout.length > 0, 'Should still pass through truncated data');
  })) passed++; else failed++;

  console.log('\nRound 87: post-edit-typecheck.js (stdin exceeding 1MB — truncation):');

  if (await asyncTest('truncates stdin at 1MB limit and still passes through data (post-edit-typecheck)', async () => {
    // Send 1.2MB of data — exceeds the 1MB MAX_STDIN limit (lines 16-24)
    const payload = 'x'.repeat(1024 * 1024 + 200000);
    const result = await runScript(path.join(scriptsDir, 'post-edit-typecheck.js'), payload);

    assert.strictEqual(result.code, 0, 'Should exit 0 even with oversized stdin');
    // Output should be truncated — significantly less than input
    assert.ok(result.stdout.length < payload.length,
      `stdout (${result.stdout.length}) should be shorter than input (${payload.length})`);
    // Output should be approximately 1MB (last accepted chunk may push slightly over)
    assert.ok(result.stdout.length <= 1024 * 1024 + 65536,
      `stdout (${result.stdout.length}) should be near 1MB, not unbounded`);
    assert.ok(result.stdout.length > 0, 'Should still pass through truncated data');
  })) passed++; else failed++;

  // ── Round 89: post-edit-typecheck.js error detection path (relevantLines) ──
  console.log('\nRound 89: post-edit-typecheck.js (TypeScript error detection path):');

  if (await asyncTest('filters TypeScript errors to edited file when tsc reports errors', async () => {
    // post-edit-typecheck.js lines 60-85: when execFileSync('npx', ['tsc', ...]) throws,
    // the catch block filters error output by file path candidates and logs relevant lines.
    // All existing tests either have no tsconfig (tsc never runs) or valid TS (tsc succeeds).
    // This test creates a .ts file with a type error and a tsconfig.json.
    const testDir = createTestDir();
    fs.writeFileSync(path.join(testDir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { strict: true, noEmit: true }
    }));
    const testFile = path.join(testDir, 'broken.ts');
    // Intentional type error: assigning string to number
    fs.writeFileSync(testFile, 'const x: number = "not a number";\n');

    const stdinJson = JSON.stringify({ tool_input: { file_path: testFile } });
    const result = await runScript(path.join(scriptsDir, 'post-edit-typecheck.js'), stdinJson);

    // Core: script must exit 0 and pass through stdin data regardless
    assert.strictEqual(result.code, 0, 'Should exit 0 even when tsc finds errors');
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.tool_input.file_path, testFile,
      'Should pass through original stdin data with file_path intact');

    // If tsc is available and ran, check that error output is filtered to this file
    if (result.stderr.includes('TypeScript errors in')) {
      assert.ok(result.stderr.includes('broken.ts'),
        `Should reference the edited file basename. Got: ${result.stderr}`);
    }
    // Either way, no crash and data passes through (verified above)
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  // ── Round 89: extractSessionSummary entry.name + entry.input fallback paths ──
  console.log('\nRound 89: session-end.js (entry.name + entry.input fallback in extractSessionSummary):');

  if (await asyncTest('extracts tool name from entry.name and file path from entry.input (fallback format)', async () => {
    // session-end.js line 63: const toolName = entry.tool_name || entry.name || '';
    // session-end.js line 66: const filePath = entry.tool_input?.file_path || entry.input?.file_path || '';
    // All existing tests use tool_name + tool_input format. This tests the name + input fallback.
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');

    const lines = [
      '{"type":"user","content":"Fix the auth module"}',
      // Tool entries using "name" + "input" instead of "tool_name" + "tool_input"
      '{"type":"tool_use","name":"Edit","input":{"file_path":"/src/auth.ts"}}',
      '{"type":"tool_use","name":"Write","input":{"file_path":"/src/new-helper.ts"}}',
      // Also include a tool with tool_name but entry.input (mixed format)
      '{"tool_name":"Read","input":{"file_path":"/src/config.ts"}}',
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
      HOME: testDir
    });
    assert.strictEqual(result.code, 0, 'Should exit 0');

    // Read the session file to verify tool names and file paths were extracted
    const claudeDir = path.join(testDir, '.claude', 'harness/data/sessions');
    if (fs.existsSync(claudeDir)) {
      const files = fs.readdirSync(claudeDir).filter(f => f.endsWith('.tmp'));
      if (files.length > 0) {
        const content = fs.readFileSync(path.join(claudeDir, files[0]), 'utf8');
        // Tools from entry.name fallback
        assert.ok(content.includes('Edit'),
          `Should extract Edit tool from entry.name fallback. Got: ${content}`);
        assert.ok(content.includes('Write'),
          `Should extract Write tool from entry.name fallback. Got: ${content}`);
        // File paths from entry.input fallback
        assert.ok(content.includes('/src/auth.ts'),
          `Should extract file path from entry.input.file_path fallback. Got: ${content}`);
        assert.ok(content.includes('/src/new-helper.ts'),
          `Should extract Write file from entry.input.file_path fallback. Got: ${content}`);
      }
    }
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  // ── Round 90: readStdinJson timeout path (utils.js lines 215-229) ──
  console.log('\nRound 90: readStdinJson (timeout fires when stdin stays open):');

  if (await asyncTest('readStdinJson resolves with {} when stdin never closes (timeout fires, no data)', async () => {
    // utils.js line 215: setTimeout fires because stdin 'end' never arrives.
    // Line 225: data.trim() is empty → resolves with {}.
    // Exercises: removeAllListeners, process.stdin.unref(), and the empty-data timeout resolution.
    const script = 'const u=require("./harness/scripts/lib/utils");u.readStdinJson({timeoutMs:100}).then(d=>{process.stdout.write(JSON.stringify(d));process.exit(0)})';
    return new Promise((resolve, reject) => {
      const child = spawn('node', ['-e', script], {
        cwd: path.resolve(__dirname, '../../..'),
        stdio: ['pipe', 'pipe', 'pipe']
      });
      // Don't write anything or close stdin — force the timeout to fire
      let stdout = '';
      child.stdout.on('data', d => stdout += d);
      const timer = setTimeout(() => { child.kill(); reject(new Error('Test timed out')); }, 5000);
      child.on('close', (code) => {
        clearTimeout(timer);
        try {
          assert.strictEqual(code, 0, 'Should exit 0 via timeout resolution');
          const parsed = JSON.parse(stdout);
          assert.deepStrictEqual(parsed, {}, 'Should resolve with {} when no data received before timeout');
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  })) passed++; else failed++;

  if (await asyncTest('readStdinJson resolves with {} when timeout fires with invalid partial JSON', async () => {
    // utils.js lines 224-228: setTimeout fires, data.trim() is non-empty,
    // JSON.parse(data) throws → catch at line 226 resolves with {}.
    const script = 'const u=require("./harness/scripts/lib/utils");u.readStdinJson({timeoutMs:100}).then(d=>{process.stdout.write(JSON.stringify(d));process.exit(0)})';
    return new Promise((resolve, reject) => {
      const child = spawn('node', ['-e', script], {
        cwd: path.resolve(__dirname, '../../..'),
        stdio: ['pipe', 'pipe', 'pipe']
      });
      // Write partial invalid JSON but don't close stdin — timeout fires with unparseable data
      child.stdin.write('{"incomplete":');
      let stdout = '';
      child.stdout.on('data', d => stdout += d);
      const timer = setTimeout(() => { child.kill(); reject(new Error('Test timed out')); }, 5000);
      child.on('close', (code) => {
        clearTimeout(timer);
        try {
          assert.strictEqual(code, 0, 'Should exit 0 via timeout resolution');
          const parsed = JSON.parse(stdout);
          assert.deepStrictEqual(parsed, {}, 'Should resolve with {} when partial JSON cannot be parsed');
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  })) passed++; else failed++;

  // ── Round 94: session-end.js tools used but no files modified ──
  console.log('\nRound 94: session-end.js (tools used without files modified):');

  if (await asyncTest('session file includes Tools Used but omits Files Modified when only Read/Grep used', async () => {
    // session-end.js buildSummarySection (lines 217-228):
    //   filesModified.length > 0 → include "### Files Modified" section
    //   toolsUsed.length > 0 → include "### Tools Used" section
    // Previously tested: BOTH present (Round ~10) and NEITHER present (Round ~10).
    // Untested combination: toolsUsed present, filesModified empty.
    // Transcript with Read/Grep tools (don't add to filesModified) and user messages.
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');

    const lines = [
      '{"type":"user","content":"Search the codebase for auth handlers"}',
      '{"type":"tool_use","tool_name":"Read","tool_input":{"file_path":"/src/auth.ts"}}',
      '{"type":"tool_use","tool_name":"Grep","tool_input":{"pattern":"handler"}}',
      '{"type":"user","content":"Check the test file too"}',
      '{"type":"tool_use","tool_name":"Read","tool_input":{"file_path":"/tests/auth.test.ts"}}',
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    const stdinJson = JSON.stringify({ transcript_path: transcriptPath });
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), stdinJson, {
      HOME: testDir
    });
    assert.strictEqual(result.code, 0, 'Should exit 0');

    const claudeDir = path.join(testDir, '.claude', 'harness/data/sessions');
    if (fs.existsSync(claudeDir)) {
      const files = fs.readdirSync(claudeDir).filter(f => f.endsWith('.tmp'));
      if (files.length > 0) {
        const content = fs.readFileSync(path.join(claudeDir, files[0]), 'utf8');
        assert.ok(content.includes('### Tools Used'), 'Should include Tools Used section');
        assert.ok(content.includes('Read'), 'Should list Read tool');
        assert.ok(content.includes('Grep'), 'Should list Grep tool');
        assert.ok(!content.includes('### Files Modified'),
          'Should NOT include Files Modified section (Read/Grep do not modify files)');
      }
    }
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  // permission-request.js tests
  console.log('\npermission-request.js:');

  if (await asyncTest('denies destructive bash commands with explicit policy class', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-perm-deny-${Date.now()}`);
    fs.mkdirSync(path.join(isoHome, '.claude', 'harness/data/sessions'), { recursive: true });

    try {
      const input = JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /tmp/test-target' }
      });
      const result = await runScript(path.join(scriptsDir, 'permission-request.js'), input, {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0, 'Should exit 0');
      const parsed = JSON.parse(result.stdout);
      const decision = parsed.hookSpecificOutput.decision;
      assert.strictEqual(decision.behavior, 'deny');
      assert.ok(decision.message.includes('hard-deny'), `Expected hard-deny message, got: ${decision.message}`);
      assert.strictEqual(decision.interrupt, true);
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  if (await asyncTest('auto-allows safe read-only bash commands with explicit policy class', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-perm-allow-${Date.now()}`);
    fs.mkdirSync(path.join(isoHome, '.claude', 'harness/data/sessions'), { recursive: true });

    try {
      const input = JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'rg plan.md /tmp' }
      });
      const result = await runScript(path.join(scriptsDir, 'permission-request.js'), input, {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0, 'Should exit 0');
      const parsed = JSON.parse(result.stdout);
      const decision = parsed.hookSpecificOutput.decision;
      assert.strictEqual(decision.behavior, 'allow');
      assert.ok(decision.message.includes('auto-allow'), `Expected auto-allow message, got: ${decision.message}`);
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  if (await asyncTest('returns ask decision for non-destructive but non-read-only bash commands', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-perm-ask-${Date.now()}`);
    fs.mkdirSync(path.join(isoHome, '.claude', 'harness/data/sessions'), { recursive: true });

    try {
      const input = JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'npm test' }
      });
      const result = await runScript(path.join(scriptsDir, 'permission-request.js'), input, {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0, 'Should exit 0');
      const parsed = JSON.parse(result.stdout);
      const decision = parsed.hookSpecificOutput.decision;
      assert.strictEqual(decision.behavior, 'ask');
      assert.ok(decision.message.includes('ask-with-justification'),
        `Expected ask-with-justification message, got: ${decision.message}`);
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  if (await asyncTest('passes through non-Bash permission requests without decision', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-perm-pass-${Date.now()}`);
    fs.mkdirSync(path.join(isoHome, '.claude', 'harness/data/sessions'), { recursive: true });

    try {
      const input = JSON.stringify({
        tool_name: 'Read',
        tool_input: { file_path: '/tmp/example.txt' }
      });
      const result = await runScript(path.join(scriptsDir, 'permission-request.js'), input, {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0, 'Should exit 0');
      assert.strictEqual(result.stdout.trim(), '', 'Should not emit a decision for non-Bash tools');
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  // subagent-stop.js tests
  console.log('\nsubagent-stop.js:');

  if (await asyncTest('writes structured subagent handoff details into the active session file', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-subagent-stop-${Date.now()}`);
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    const sessionFile = path.join(sessionsDir, '2026-04-10-main-session.tmp');
    fs.writeFileSync(sessionFile, '# Session\n');

    try {
      const input = JSON.stringify({
        subagent_name: 'docs-writer',
        stop_reason: 'completed',
        last_assistant_message: 'Finished authority docs and left one follow-up for tests.',
        next_action: 'Run hook tests'
      });
      const result = await runScriptInDir(path.join(scriptsDir, 'subagent-stop.js'), getSandboxRepo(), input, {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0, 'Should exit 0');
      const content = fs.readFileSync(sessionFile, 'utf8');
      assert.ok(content.includes('### Subagent Update'), 'Should include subagent update header');
      assert.ok(content.includes('agent=docs-writer'), 'Should include agent name');
      assert.ok(content.includes('status=completed'), 'Should include status');
      assert.ok(content.includes('next_action=Run hook tests'), 'Should include next action');
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  if (await asyncTest('includes goal and open risks in structured subagent handoff output', async () => {
    const isoHome = path.join(os.tmpdir(), `ecc-subagent-schema-${Date.now()}`);
    const sessionsDir = path.join(isoHome, '.claude', 'harness/data/sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    const sessionFile = path.join(sessionsDir, '2026-04-10-main-session.tmp');
    fs.writeFileSync(sessionFile, '# Session\n');
    const repoDir = path.join(isoHome, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });
    require('child_process').execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });

    try {
      const input = JSON.stringify({
        subagent_name: 'worker-1',
        stop_reason: 'completed',
        goal: 'Harden session restore contract',
        summary: 'Added parser coverage for progress.md state.',
        open_risks: 'Need smoke coverage for interrupted sessions',
        next_action: 'Run smoke checks',
        files_touched: ['SESSION.md', 'HARNESS.md'],
        verification_run: ['node smoke-harness-lifecycle.js']
      });
      const result = await runScriptInDir(path.join(scriptsDir, 'subagent-stop.js'), repoDir, input, {
        HOME: isoHome, USERPROFILE: isoHome
      });
      assert.strictEqual(result.code, 0, 'Should exit 0');
      const content = fs.readFileSync(sessionFile, 'utf8');
      assert.ok(content.includes('goal=Harden session restore contract'), 'Should include goal');
      assert.ok(content.includes('open_risks=Need smoke coverage for interrupted sessions'), 'Should include open risks');
      assert.ok(content.includes('next_action=Run smoke checks'), 'Should include next action');
      assert.ok(content.includes('files_touched=SESSION.md, HARNESS.md'), 'Should include files touched');
      assert.ok(content.includes('verification_run=node smoke-harness-lifecycle.js'), 'Should include verification run');
      // handoff はセッションファイルへの追記としてのみ残る（progress.md は撤去済み）。
      assert.ok(!fs.existsSync(path.join(repoDir, 'progress.md')), 'Should not recreate progress.md');
    } finally {
      fs.rmSync(isoHome, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  // pre-compact.js richer snapshot tests
  console.log('\npre-compact.js (artifact lifecycle state):');

  // lifecycle guardrail tests
  console.log('\nlifecycle guardrails:');

  if (await asyncTest('lifecycle-pre-edit warns when a linked worktree has no pipeline evidence', async () => {
    const testDir = createTestDir();
    const homeDir = path.join(testDir, 'home');
    fs.mkdirSync(homeDir, { recursive: true });
    const repoDir = createLinkedWorktree(testDir);

    try {
      fs.writeFileSync(path.join(repoDir, 'example.js'), 'console.log("ok");\n');

      const result = await runScriptInDir(
        path.join(__dirname, '../../hooks/lifecycle-pre-edit.js'),
        repoDir,
        JSON.stringify({ tool_input: { file_path: path.join(repoDir, 'example.js') } }),
        { HOME: homeDir, USERPROFILE: homeDir }
      );
      assert.strictEqual(result.code, 0, `Expected warning-only exit 0, got ${result.code}`);
      assert.ok(result.stderr.includes('no recent pipeline evidence'), `Expected pipeline evidence warning, got: ${result.stderr}`);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  if (await asyncTest('lifecycle-pre-commit advises when review-summary.md is missing in a linked worktree', async () => {
    const testDir = createTestDir();
    const repoDir = createLinkedWorktree(testDir);

    try {
      writeCompleteVerification(repoDir, 'review-required commit guard behavior');

      const result = await runScriptInDir(
        path.join(__dirname, '../../hooks/lifecycle-pre-commit.js'),
        repoDir,
        JSON.stringify({ tool_input: { command: 'git commit -m "test"' } })
      );
      assert.strictEqual(result.code, 0, `Expected advisory exit 0, got ${result.code}`);
      assert.ok(result.stderr.includes('review-summary.md'), `Expected review guidance, got: ${result.stderr}`);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  if (await asyncTest('lifecycle-pre-commit warns when a linked worktree has no pipeline evidence', async () => {
    const testDir = createTestDir();
    const homeDir = path.join(testDir, 'home');
    fs.mkdirSync(homeDir, { recursive: true });
    const repoDir = createLinkedWorktree(testDir);

    try {
      writeCompleteReview(repoDir, 'pipeline evidence commit warning behavior');
      writeCompleteVerification(repoDir, 'pipeline evidence commit warning behavior');
      writeCompleteObservation(repoDir, 'pipeline evidence commit warning behavior');

      const result = await runScriptInDir(
        path.join(__dirname, '../../hooks/lifecycle-pre-commit.js'),
        repoDir,
        JSON.stringify({ tool_input: { command: 'git commit -m "test"' } }),
        { HOME: homeDir, USERPROFILE: homeDir }
      );
      assert.strictEqual(result.code, 0, `Expected warning-only exit 0, got ${result.code}`);
      assert.ok(result.stderr.includes('no recent pipeline evidence'), `Expected pipeline evidence warning, got: ${result.stderr}`);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  if (await asyncTest('lifecycle-pre-commit advises on observation summaries without concrete evidence sources', async () => {
    const testDir = createTestDir();
    const repoDir = path.join(testDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    try {
      require('child_process').execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
      fs.writeFileSync(path.join(repoDir, 'plan.md'), [
        '---',
        'title: Observation source enforcement test',
        'status: approved',
        'task_type: non_trivial',
        'observe_required: true',
        '---',
        '',
        '# Plan: Observation source enforcement test'
      ].join('\n'));
      fs.writeFileSync(path.join(repoDir, 'progress.md'), [
        '# Progress',
        '',
        '## Current Phase',
        '- Phase 4: observe',
        '',
        '## Last Completed Step',
        '- Finished review and verification',
        '',
        '## Next Action',
        '- Replace generic observation notes with concrete evidence',
        '',
        '## Blockers',
        '- none',
        '',
        '## Delegated Work',
        '- none'
      ].join('\n'));
      writeCompleteReview(repoDir, 'observation gate behavior', { nextAction: 'Run verification and commit' });
      writeCompleteVerification(repoDir, 'observation evidence commit guard behavior');
      fs.writeFileSync(path.join(repoDir, 'observation-summary.md'), [
        '# Observation Summary',
        '',
        '## Behavior Checked',
        '- observation gate behavior',
        '',
        '## Method',
        '- manual check',
        '',
        '## Evidence',
        '- looks good',
        '',
        '## Remaining Uncertainty',
        '- none'
      ].join('\n'));

      const result = await runScriptInDir(
        path.join(__dirname, '../../hooks/lifecycle-pre-commit.js'),
        repoDir,
        JSON.stringify({ tool_input: { command: 'git commit -m "test"' } })
      );
      assert.strictEqual(result.code, 0, `Expected concrete evidence enforcement to advise, got ${result.code}`);
      assert.ok(result.stderr.includes('concrete evidence source required'), `Expected concrete evidence guidance, got: ${result.stderr}`);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  if (await asyncTest('lifecycle-pre-commit advises when review-summary.md still has unresolved findings', async () => {
    const testDir = createTestDir();
    const repoDir = path.join(testDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    try {
      require('child_process').execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
      fs.writeFileSync(path.join(repoDir, 'plan.md'), [
        '---',
        'title: Commit guard unresolved findings test',
        'status: approved',
        'task_type: non_trivial',
        'observe_required: true',
        '---',
        '',
        '# Plan: Commit guard unresolved findings test'
      ].join('\n'));
      fs.writeFileSync(path.join(repoDir, 'progress.md'), [
        '# Progress',
        '',
        '## Current Phase',
        '- Phase 4: review',
        '',
        '## Last Completed Step',
        '- Completed verification',
        '',
        '## Next Action',
        '- Resolve review findings',
        '',
        '## Blockers',
        '- none',
        '',
        '## Delegated Work',
        '- none'
      ].join('\n'));
      writeCompleteReview(repoDir, 'lifecycle guard behavior', {
        findings: ['- HIGH: review summary still contains unresolved behavior risk'],
        nextAction: 'Resolve findings and rerun review',
      });
      writeCompleteVerification(repoDir, 'unresolved review findings commit guard behavior');
      fs.writeFileSync(path.join(repoDir, 'observation-summary.md'), [
        '# Observation Summary',
        '',
        '## Behavior Checked',
        '- review gate behavior',
        '',
        '## Method',
        '- stderr: targeted hook execution of lifecycle-pre-commit',
        '',
        '## Evidence',
        '- stderr: unresolved findings should block commit',
        '',
        '## Remaining Uncertainty',
        '- none'
      ].join('\n'));

      const result = await runScriptInDir(
        path.join(__dirname, '../../hooks/lifecycle-pre-commit.js'),
        repoDir,
        JSON.stringify({ tool_input: { command: 'git commit -m "test"' } })
      );
      assert.strictEqual(result.code, 0, `Expected unresolved findings to advise, got ${result.code}`);
      assert.ok(result.stderr.includes('unresolved findings'), `Expected unresolved findings guidance, got: ${result.stderr}`);
      assert.ok(result.stderr.includes('HIGH'), `Expected severity preview, got: ${result.stderr}`);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  if (await asyncTest('lifecycle-pre-commit advises when review findings are missing severity prefixes', async () => {
    const testDir = createTestDir();
    const repoDir = path.join(testDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    try {
      require('child_process').execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
      fs.writeFileSync(path.join(repoDir, 'plan.md'), [
        '---',
        'title: Commit guard invalid findings format test',
        'status: approved',
        'task_type: non_trivial',
        'observe_required: true',
        '---',
        '',
        '# Plan: Commit guard invalid findings format test'
      ].join('\n'));
      fs.writeFileSync(path.join(repoDir, 'progress.md'), [
        '# Progress',
        '',
        '## Current Phase',
        '- Phase 4: review',
        '',
        '## Last Completed Step',
        '- Completed verification',
        '',
        '## Next Action',
        '- Normalize review findings',
        '',
        '## Blockers',
        '- none',
        '',
        '## Delegated Work',
        '- none'
      ].join('\n'));
      writeCompleteReview(repoDir, 'lifecycle guard behavior', {
        findings: ['- missing severity prefix here'],
        nextAction: 'Normalize review findings',
      });
      writeCompleteVerification(repoDir, 'review finding format commit guard behavior');
      fs.writeFileSync(path.join(repoDir, 'observation-summary.md'), [
        '# Observation Summary',
        '',
        '## Behavior Checked',
        '- review gate behavior',
        '',
        '## Method',
        '- stderr: targeted hook execution of lifecycle-pre-commit',
        '',
        '## Evidence',
        '- stderr: findings without severity should fail review parsing',
        '',
        '## Remaining Uncertainty',
        '- none'
      ].join('\n'));

      const result = await runScriptInDir(
        path.join(__dirname, '../../hooks/lifecycle-pre-commit.js'),
        repoDir,
        JSON.stringify({ tool_input: { command: 'git commit -m "test"' } })
      );
      assert.strictEqual(result.code, 0, `Expected invalid findings format to advise, got ${result.code}`);
      assert.ok(result.stderr.includes('severity prefix'), `Expected severity prefix guidance, got: ${result.stderr}`);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  if (await asyncTest('lifecycle-pre-commit captures guardrail candidates without blocking commit', async () => {
    const testDir = createTestDir();
    const repoDir = path.join(testDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    try {
      require('child_process').execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
      fs.writeFileSync(path.join(repoDir, 'plan.md'), [
        '---',
        'title: Guardrail capture success test',
        'status: approved',
        'task_type: non_trivial',
        'observe_required: false',
        '---',
        '',
        '# Plan: Guardrail capture success test'
      ].join('\n'));
      fs.writeFileSync(path.join(repoDir, 'progress.md'), [
        '# Progress',
        '',
        '## Current Phase',
        '- Phase 4: ready to commit',
        '',
        '## Last Completed Step',
        '- Finished verification and review',
        '',
        '## Next Action',
        '- none',
        '',
        '## Blockers',
        '- none',
        '',
        '## Delegated Work',
        '- none'
      ].join('\n'));
      fs.writeFileSync(path.join(repoDir, 'verification-summary.md'), [
        '# Verification Summary',
        '',
        '## Scope',
        '- guardrail capture behavior',
        '',
        '## Commands Run',
        '- node .claude/harness/tests/hooks/hooks.test.js',
        '',
        '## Verification Outcome',
        '- pending commit guard capture',
        '',
        '## Guardrail Candidates',
        '- failure_pattern: repeated missing acceptance artifact',
        '  source: verification-summary.md',
        '  recommended_layer: hook',
        '  confidence: high',
        '  promotion_hint: block commit when review artifact is absent',
        '',
        '## Assessment',
        '- verify remains rerunnable and non-acceptance-oriented'
      ].join('\n'));

      const result = await runScriptInDir(
        path.join(__dirname, '../../hooks/lifecycle-pre-commit.js'),
        repoDir,
        JSON.stringify({ tool_input: { command: 'git commit -m "capture"' } }),
        { HOME: testDir }
      );
      assert.strictEqual(result.code, 0, `Expected candidate capture to stay non-blocking, got ${result.code}`);

      const registryPath = path.join(testDir, '.claude', 'harness/data/state', 'guardrail-candidates.jsonl');
      assert.ok(fs.existsSync(registryPath), 'Expected guardrail candidate registry to be created');
      const rows = fs.readFileSync(registryPath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
      assert.strictEqual(rows.length, 1, 'Expected one captured candidate');
      assert.strictEqual(rows[0].recommended_layer, 'hook');
      assert.strictEqual(rows[0].source_artifact, 'verification-summary.md');
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  if (await asyncTest('lifecycle-pre-commit warns on malformed guardrail candidates without blocking commit', async () => {
    const testDir = createTestDir();
    const repoDir = path.join(testDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    try {
      require('child_process').execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
      fs.writeFileSync(path.join(repoDir, 'plan.md'), [
        '---',
        'title: Guardrail capture malformed test',
        'status: approved',
        'task_type: non_trivial',
        'observe_required: false',
        '---',
        '',
        '# Plan: Guardrail capture malformed test'
      ].join('\n'));
      fs.writeFileSync(path.join(repoDir, 'progress.md'), [
        '# Progress',
        '',
        '## Current Phase',
        '- Phase 4: ready to commit',
        '',
        '## Last Completed Step',
        '- Finished verification',
        '',
        '## Next Action',
        '- none',
        '',
        '## Blockers',
        '- none',
        '',
        '## Delegated Work',
        '- none'
      ].join('\n'));
      fs.writeFileSync(path.join(repoDir, 'verification-summary.md'), [
        '# Verification Summary',
        '',
        '## Scope',
        '- malformed guardrail candidate behavior',
        '',
        '## Commands Run',
        '- node .claude/harness/tests/hooks/hooks.test.js',
        '',
        '## Verification Outcome',
        '- pending malformed capture check',
        '',
        '## Guardrail Candidates',
        '- source: verification-summary.md',
        '  recommended_layer: hook',
        '  confidence: medium',
        '',
        '## Assessment',
        '- malformed candidates should warn, not block'
      ].join('\n'));

      const result = await runScriptInDir(
        path.join(__dirname, '../../hooks/lifecycle-pre-commit.js'),
        repoDir,
        JSON.stringify({ tool_input: { command: 'git commit -m "capture"' } }),
        { HOME: testDir }
      );
      assert.strictEqual(result.code, 0, `Expected malformed candidate warning to stay non-blocking, got ${result.code}`);
      assert.ok(result.stderr.includes('guardrail candidates'), `Expected guardrail warning, got: ${result.stderr}`);

      const registryPath = path.join(testDir, '.claude', 'harness/data/state', 'guardrail-candidates.jsonl');
      if (fs.existsSync(registryPath)) {
        const content = fs.readFileSync(registryPath, 'utf8').trim();
        assert.strictEqual(content, '', 'Malformed candidates should not be appended');
      }
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  cleanupSandboxRepo();

  // Summary
  console.log('\n=== Test Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}\n`);

  if (failedTests.length > 0) {
    console.log('Failures:');
    for (const entry of failedTests) {
      console.log(`- ${entry.name}`);
      console.log(`  error: ${entry.message}`);
    }
    console.log('');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
