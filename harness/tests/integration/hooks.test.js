/**
 * Integration tests for hook scripts
 *
 * Tests hook behavior in realistic scenarios with proper input/output handling.
 *
 * Run with: node harness/tests/integration/hooks.test.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFileSync } = require('child_process');

// harness/data/runs/ は git 追跡なので、テストが実リポジトリの run 記録に
// フィクスチャを混ぜないようにする（harness/scripts/lib/run-record.js）。
process.env.CLAUDE_DISABLE_RUN_RECORD = '1';
const REPO_ROOT = path.join(__dirname, '../../..');

// Test helper
function _test(name, fn) {
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

// Async test helper
async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

/**
 * Run a hook script with simulated Claude Code input
 * @param {string} scriptPath - Path to the hook script
 * @param {object} input - Hook input object (will be JSON stringified)
 * @param {object} env - Environment variables
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
function runHookWithInput(scriptPath, input = {}, env = {}, timeoutMs = 10000, cwd = undefined) {
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

    // Ignore EPIPE/EOF errors (process may exit before we finish writing)
    // Windows uses EOF instead of EPIPE for closed pipe writes
    proc.stdin.on('error', (err) => {
      if (err.code !== 'EPIPE' && err.code !== 'EOF') {
        reject(err);
      }
    });

    // Send JSON input on stdin (simulating Claude Code hook invocation)
    if (input && Object.keys(input).length > 0) {
      proc.stdin.write(JSON.stringify(input));
    }
    proc.stdin.end();

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`Hook timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on('close', code => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Run a hook command string exactly as declared in hooks.json.
 * Supports wrapped node script commands and shell wrappers.
 * @param {string} command - Hook command from hooks.json
 * @param {object} input - Hook input object
 * @param {object} env - Environment variables
 */
function runHookCommand(command, input = {}, env = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const mergedEnv = { ...process.env, CLAUDE_PLUGIN_ROOT: REPO_ROOT, ...env };
    // settings.json は ${VAR} と ${VAR:-default} の両形式を使う。後者を展開しないと
    // パスが未解決のまま node に渡り、フックが起動していないのに「出力が無い」形で失敗する。
    const expandVars = (value) => value.replace(
      /\$\{([A-Z_][A-Z0-9_]*)(?::-([^}]*))?\}/g,
      (_, name, fallback) => mergedEnv[name]
        ? String(mergedEnv[name])
        : String(fallback || '').replace(/\$([A-Z_][A-Z0-9_]*)/g, (__, n) => String(mergedEnv[n] || ''))
    );
    const resolvedCommand = expandVars(command);

    const nodeMatch = resolvedCommand.match(/^node\s+"([^"]+)"\s*(.*)$/);
    const useDirectNodeSpawn = Boolean(nodeMatch);
    const shell = isWindows ? 'cmd' : 'bash';
    const shellArgs = isWindows ? ['/d', '/s', '/c', resolvedCommand] : ['-lc', resolvedCommand];
    const nodeArgs = nodeMatch
      ? [
          nodeMatch[1],
          ...Array.from(
            nodeMatch[2].matchAll(/"([^"]*)"|(\S+)/g),
            m => m[1] !== undefined ? m[1] : m[2]
          )
        ]
      : [];

    const proc = useDirectNodeSpawn
      ? spawn('node', nodeArgs, { env: mergedEnv, stdio: ['pipe', 'pipe', 'pipe'] })
      : spawn(shell, shellArgs, { env: mergedEnv, stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let timer;

    proc.stdout.on('data', data => stdout += data);
    proc.stderr.on('data', data => stderr += data);

    // Ignore EPIPE/EOF errors (process may exit before we finish writing)
    proc.stdin.on('error', (err) => {
      if (err.code !== 'EPIPE' && err.code !== 'EOF') {
        if (timer) clearTimeout(timer);
        reject(err);
      }
    });

    if (input && Object.keys(input).length > 0) {
      proc.stdin.write(JSON.stringify(input));
    }
    proc.stdin.end();

    timer = setTimeout(() => {
      proc.kill(isWindows ? undefined : 'SIGKILL');
      reject(new Error(`Hook command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on('close', code => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// Create a temporary test directory
function createTestDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hook-integration-test-'));
}

// Clean up test directory
function cleanupTestDir(testDir) {
  fs.rmSync(testDir, { recursive: true, force: true });
}

// Test suite
async function runTests() {
  console.log('\n=== Hook Integration Tests ===\n');

  let passed = 0;
  let failed = 0;

  const scriptsDir = path.join(__dirname, '../../scripts/hooks');
  const hooksJsonPath = path.join(__dirname, '../../../settings.json');
  const hooks = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'));

  // ==========================================
  // Input Format Tests
  // ==========================================
  console.log('Hook Input Format Handling:');

  if (await asyncTest('hooks handle empty stdin gracefully', async () => {
    const result = await runHookWithInput(path.join(scriptsDir, 'session-start.js'), {});
    assert.strictEqual(result.code, 0, `Should exit 0, got ${result.code}`);
  })) passed++; else failed++;

  if (await asyncTest('hooks handle malformed JSON input', async () => {
    const proc = spawn('node', [path.join(scriptsDir, 'session-start.js')], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let code = null;
    proc.stdin.write('{ invalid json }');
    proc.stdin.end();

    await new Promise((resolve) => {
      proc.on('close', (c) => {
        code = c;
        resolve();
      });
    });

    // Hook should not crash on malformed input (exit 0)
    assert.strictEqual(code, 0, 'Should handle malformed JSON gracefully');
  })) passed++; else failed++;

  if (await asyncTest('hooks parse valid tool_input correctly', async () => {
    // Test the console.log warning hook with valid input
    const command = 'node -e "const fs=require(\'fs\');let d=\'\';process.stdin.on(\'data\',c=>d+=c);process.stdin.on(\'end\',()=>{const i=JSON.parse(d);const p=i.tool_input?.file_path||\'\';console.log(\'Path:\',p)})"';
    const match = command.match(/^node -e "(.+)"$/s);

    const proc = spawn('node', ['-e', match[1]], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    proc.stdout.on('data', data => stdout += data);

    proc.stdin.write(JSON.stringify({
      tool_input: { file_path: '/test/path.js' }
    }));
    proc.stdin.end();

    await new Promise(resolve => proc.on('close', resolve));

    assert.ok(stdout.includes('/test/path.js'), 'Should extract file_path from input');
  })) passed++; else failed++;

  // ==========================================
  // Output Format Tests
  // ==========================================
  console.log('\nHook Output Format:');

  if (await asyncTest('hooks output messages to stderr (not stdout)', async () => {
    const result = await runHookWithInput(path.join(scriptsDir, 'session-start.js'), {});
    // Session-start should write info to stderr
    assert.ok(result.stderr.length > 0, 'Should have stderr output');
    assert.ok(result.stderr.includes('[SessionStart]'), 'Should have [SessionStart] prefix');
  })) passed++; else failed++;

  // Run in a throwaway repository: pre-compact.js writes progress.md into the repo at cwd, so
  // inheriting this process's cwd made the test rewrite THIS repository's session state.
  if (await asyncTest('PreCompact hook logs to stderr', async () => {
    const sandboxRepo = createTestDir();
    execFileSync('git', ['init'], { cwd: sandboxRepo, stdio: 'ignore' });
    try {
      const result = await runHookWithInput(path.join(scriptsDir, 'pre-compact.js'), {}, {}, 10000, sandboxRepo);
      assert.ok(result.stderr.includes('[PreCompact]'), 'Should output to stderr with prefix');
    } finally {
      fs.rmSync(sandboxRepo, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  // ブロックするフックは git-push-guard.js の1つだけ。
  if (await asyncTest('blocking hooks output BLOCKED message', async () => {
    const result = await runHookWithInput(path.join(REPO_ROOT, 'harness/hooks', 'git-push-guard.js'), {
      tool_input: { command: 'git push origin main' }
    });

    assert.strictEqual(result.code, 2, 'Blocking hook should exit with code 2');
    assert.ok(/main|master/.test(result.stderr), 'Blocking hook should name the protected branch');
  })) passed++; else failed++;

  // ==========================================
  // Exit Code Tests
  // ==========================================
  console.log('\nHook Exit Codes:');

  if (await asyncTest('non-blocking hooks exit with code 0', async () => {
    const result = await runHookWithInput(path.join(scriptsDir, 'session-end.js'), {});
    assert.strictEqual(result.code, 0, 'Non-blocking hook should exit 0');
  })) passed++; else failed++;

  if (await asyncTest('blocking hooks exit with code 2', async () => {
    const result = await runHookWithInput(path.join(REPO_ROOT, 'harness/hooks', 'git-push-guard.js'), {
      tool_input: { command: 'git push origin master' }
    });

    assert.strictEqual(result.code, 2, 'Blocking hook should exit 2');
  })) passed++; else failed++;

  if (await asyncTest('advisory hooks exit 0 while naming the gap', async () => {
    const testDir = createTestDir();
    // 助言の重み判定は linked worktree かどうか
    const base = path.join(testDir, 'base');
    const repoDir = path.join(testDir, 'repo');
    fs.mkdirSync(base, { recursive: true });
    execFileSync('git', ['init'], { cwd: base, stdio: 'ignore' });
    execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t',
      'commit', '--allow-empty', '-m', 'init'], { cwd: base, stdio: 'ignore' });
    execFileSync('git', ['worktree', 'add', repoDir, '-b', 'advisory-test'], { cwd: base, stdio: 'ignore' });
    const srcDir = path.join(repoDir, 'src');
    const filePath = path.join(srcDir, 'app.ts');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(filePath, 'export const ok = true;\n');

    try {
      const result = await runHookWithInput(path.join(REPO_ROOT, 'harness/hooks', 'lifecycle-pre-edit.js'), {
        tool_input: { file_path: filePath }
      });

      assert.strictEqual(result.code, 0, 'Edit guard should not block');
      assert.ok(result.stderr.includes('[Lifecycle Guardrail]'), 'Edit guard should still name the gap');
    } finally {
      cleanupTestDir(testDir);
    }
  })) passed++; else failed++;

  if (await asyncTest('hooks handle missing files gracefully', async () => {
    const testDir = createTestDir();

    try {
      // 入れ物を evaluate-session.js から lifecycle-pre-edit.js へ移した
      // （2026-08-18 に学習ループごと撤去）。守っているのは「フックが存在しない
      // ファイルを渡されても落ちない」ことで、どのフックかではない。
      const result = await runHookWithInput(
        path.join(REPO_ROOT, 'harness/hooks', 'lifecycle-pre-edit.js'),
        { tool_input: { file_path: path.join(testDir, 'nonexistent.js') } }
      );

      // Should not crash, just skip processing
      assert.strictEqual(result.code, 0, 'Should exit 0 for missing file');
    } finally {
      cleanupTestDir(testDir);
    }
  })) passed++; else failed++;

  // ==========================================
  // Realistic Scenario Tests
  // ==========================================
  console.log('\nRealistic Scenarios:');

  if (await asyncTest('suggest-compact increments and triggers at threshold', async () => {
    const sessionId = 'integration-test-' + Date.now();
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);

    try {
      // Set counter just below threshold
      fs.writeFileSync(counterFile, '49');

      const result = await runHookWithInput(
        path.join(scriptsDir, 'suggest-compact.js'),
        {},
        { CLAUDE_SESSION_ID: sessionId, COMPACT_THRESHOLD: '50' }
      );

      assert.ok(
        result.stderr.includes('50 tool calls'),
        'Should suggest compact at threshold'
      );
    } finally {
      if (fs.existsSync(counterFile)) fs.unlinkSync(counterFile);
    }
  })) passed++; else failed++;

  if (await asyncTest('PostToolUse PR hook extracts PR URL', async () => {
    // Find the PR logging hook
    // settings.json のフックは description を持たないので、コマンド内容で特定する。
    const prHook = hooks.hooks.PostToolUse.find(h =>
      (h.hooks || []).some(x => String(x.command || '').includes('post:bash:pr-created'))
    );

    assert.ok(prHook, 'PR hook should exist');

    const result = await runHookCommand(prHook.hooks[0].command, {
      tool_input: { command: 'gh pr create --title "Test"' },
      tool_output: { output: 'Creating pull request...\nhttps://github.com/owner/repo/pull/123' }
    });

    assert.ok(
      result.stderr.includes('PR created') || result.stderr.includes('github.com'),
      'Should extract and log PR URL'
    );
  })) passed++; else failed++;

  // ==========================================
  // Session End Transcript Parsing Tests
  // ==========================================
  console.log('\nSession End Transcript Parsing:');

  if (await asyncTest('session-end extracts summary from mixed JSONL formats', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'mixed-transcript.jsonl');

    // Create transcript with both direct tool_use and nested assistant message formats
    const lines = [
      JSON.stringify({ type: 'user', content: 'Fix the login bug' }),
      JSON.stringify({ type: 'tool_use', name: 'Read', input: { file_path: 'src/auth.ts' } }),
      JSON.stringify({ type: 'assistant', message: { content: [
        { type: 'tool_use', name: 'Edit', input: { file_path: 'src/auth.ts' } }
      ]}}),
      JSON.stringify({ type: 'user', content: 'Now add tests' }),
      JSON.stringify({ type: 'assistant', message: { content: [
        { type: 'tool_use', name: 'Write', input: { file_path: 'harness/tests/auth.test.ts' } },
        { type: 'text', text: 'Here are the tests' }
      ]}}),
      JSON.stringify({ type: 'user', content: 'Looks good, commit' })
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    try {
      const result = await runHookWithInput(
        path.join(scriptsDir, 'session-end.js'),
        { transcript_path: transcriptPath },
        { HOME: testDir, USERPROFILE: testDir }
      );

      assert.strictEqual(result.code, 0, 'Should exit 0');
      assert.ok(result.stderr.includes('[SessionEnd]'), 'Should have SessionEnd log');

      // Verify a session file was created
      const sessionsDir = path.join(testDir, '.claude', 'harness/data/sessions');
      if (fs.existsSync(sessionsDir)) {
        const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.tmp'));
        assert.ok(files.length > 0, 'Should create a session file');

        // Verify session content includes tasks from user messages
        const content = fs.readFileSync(path.join(sessionsDir, files[0]), 'utf8');
        assert.ok(content.includes('Fix the login bug'), 'Should include first user message');
        assert.ok(content.includes('auth.ts'), 'Should include modified files');
      }
    } finally {
      cleanupTestDir(testDir);
    }
  })) passed++; else failed++;

  if (await asyncTest('session-end handles transcript with malformed lines gracefully', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'malformed-transcript.jsonl');

    const lines = [
      JSON.stringify({ type: 'user', content: 'Task 1' }),
      '{broken json here',
      JSON.stringify({ type: 'user', content: 'Task 2' }),
      '{"truncated":',
      JSON.stringify({ type: 'user', content: 'Task 3' })
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    try {
      const result = await runHookWithInput(
        path.join(scriptsDir, 'session-end.js'),
        { transcript_path: transcriptPath },
        { HOME: testDir, USERPROFILE: testDir }
      );

      assert.strictEqual(result.code, 0, 'Should exit 0 despite malformed lines');
      // Should still process the valid lines
      assert.ok(result.stderr.includes('[SessionEnd]'), 'Should have SessionEnd log');
      assert.ok(result.stderr.includes('unparseable'), 'Should warn about unparseable lines');
    } finally {
      cleanupTestDir(testDir);
    }
  })) passed++; else failed++;

  if (await asyncTest('session-end creates session file with nested user messages', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'nested-transcript.jsonl');

    // Claude Code JSONL format uses nested message.content arrays
    const lines = [
      JSON.stringify({ type: 'user', message: { role: 'user', content: [
        { type: 'text', text: 'Refactor the utils module' }
      ]}}),
      JSON.stringify({ type: 'assistant', message: { content: [
        { type: 'tool_use', name: 'Read', input: { file_path: 'lib/utils.js' } }
      ]}}),
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'Approve the changes' }})
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'));

    try {
      const result = await runHookWithInput(
        path.join(scriptsDir, 'session-end.js'),
        { transcript_path: transcriptPath },
        { HOME: testDir, USERPROFILE: testDir }
      );

      assert.strictEqual(result.code, 0, 'Should exit 0');

      // Check session file was created
      const sessionsDir = path.join(testDir, '.claude', 'harness/data/sessions');
      if (fs.existsSync(sessionsDir)) {
        const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.tmp'));
        assert.ok(files.length > 0, 'Should create session file');
        const content = fs.readFileSync(path.join(sessionsDir, files[0]), 'utf8');
        assert.ok(content.includes('Refactor the utils module') || content.includes('Approve'),
          'Should extract user messages from nested format');
      }
    } finally {
      cleanupTestDir(testDir);
    }
  })) passed++; else failed++;

  // ==========================================
  // Error Handling Tests
  // ==========================================
  console.log('\nError Handling:');

  if (await asyncTest('hooks do not crash on unexpected input structure', async () => {
    const result = await runHookWithInput(
      path.join(scriptsDir, 'suggest-compact.js'),
      { unexpected: { nested: { deeply: 'value' } } }
    );

    assert.strictEqual(result.code, 0, 'Should handle unexpected input structure');
  })) passed++; else failed++;

  if (await asyncTest('hooks handle null and missing values in input', async () => {
    const result = await runHookWithInput(
      path.join(scriptsDir, 'session-start.js'),
      { tool_input: null }
    );

    assert.strictEqual(result.code, 0, 'Should handle null/missing values gracefully');
  })) passed++; else failed++;

  if (await asyncTest('hooks handle very large input without hanging', async () => {
    const largeInput = {
      tool_input: { file_path: '/test.js' },
      tool_output: { output: 'x'.repeat(100000) }
    };

    const startTime = Date.now();
    const result = await runHookWithInput(
      path.join(scriptsDir, 'session-start.js'),
      largeInput
    );
    const elapsed = Date.now() - startTime;

    assert.strictEqual(result.code, 0, 'Should complete successfully');
    assert.ok(elapsed < 5000, `Should complete in <5s, took ${elapsed}ms`);
  })) passed++; else failed++;

  if (await asyncTest('hooks survive stdin exceeding 1MB limit', async () => {
    // The post-edit-console-warn hook reads stdin up to 1MB then passes through
    // Send > 1MB to verify truncation doesn't crash the hook
    const oversizedInput = JSON.stringify({
      tool_input: { file_path: '/test.js' },
      tool_output: { output: 'x'.repeat(1200000) } // ~1.2MB
    });

    const proc = spawn('node', [path.join(scriptsDir, 'post-edit-console-warn.js')], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let code = null;
    // MUST drain stdout/stderr to prevent backpressure blocking the child process
    proc.stdout.on('data', () => {});
    proc.stderr.on('data', () => {});
    proc.stdin.on('error', (err) => {
      if (err.code !== 'EPIPE' && err.code !== 'EOF') throw err;
    });
    proc.stdin.write(oversizedInput);
    proc.stdin.end();

    await new Promise(resolve => {
      proc.on('close', (c) => { code = c; resolve(); });
    });

    assert.strictEqual(code, 0, 'Should exit 0 despite oversized input');
  })) passed++; else failed++;

  if (await asyncTest('hooks handle truncated JSON from overflow gracefully', async () => {
    // session-end parses stdin JSON. If input is > 1MB and truncated mid-JSON,
    // JSON.parse should fail and fall back to env var
    const proc = spawn('node', [path.join(scriptsDir, 'session-end.js')], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let code = null;
    let stderr = '';
    // MUST drain stdout to prevent backpressure blocking the child process
    proc.stdout.on('data', () => {});
    proc.stderr.on('data', data => stderr += data);
    proc.stdin.on('error', (err) => {
      if (err.code !== 'EPIPE' && err.code !== 'EOF') throw err;
    });

    // Build a string that will be truncated mid-JSON at 1MB
    const bigValue = 'x'.repeat(1200000);
    proc.stdin.write(`{"transcript_path":"/tmp/none","padding":"${bigValue}"}`);
    proc.stdin.end();

    await new Promise(resolve => {
      proc.on('close', (c) => { code = c; resolve(); });
    });

    // Should exit 0 even if JSON parse fails (falls back to env var or null)
    assert.strictEqual(code, 0, 'Should not crash on truncated JSON');
  })) passed++; else failed++;

  // ==========================================
  // Round 51: Timeout Enforcement
  // ==========================================
  console.log('\nRound 51: Timeout Enforcement:');

  if (await asyncTest('runHookWithInput kills hanging hooks after timeout', async () => {
    const testDir = createTestDir();
    const hangingHookPath = path.join(testDir, 'hanging-hook.js');
    fs.writeFileSync(hangingHookPath, 'setInterval(() => {}, 100);');

    try {
      const startTime = Date.now();
      let error = null;

      try {
        await runHookWithInput(hangingHookPath, {}, {}, 500);
      } catch (err) {
        error = err;
      }

      const elapsed = Date.now() - startTime;
      assert.ok(error, 'Should throw timeout error');
      assert.ok(error.message.includes('timed out'), 'Error should mention timeout');
      assert.ok(elapsed >= 450, `Should wait at least ~500ms, waited ${elapsed}ms`);
      assert.ok(elapsed < 2000, `Should not wait much longer than 500ms, waited ${elapsed}ms`);
    } finally {
      cleanupTestDir(testDir);
    }
  })) passed++; else failed++;

  // ==========================================
  // Round 51: hooks.json Schema Validation
  // ==========================================
  console.log('\nRound 51: hooks.json Schema Validation:');

  if (await asyncTest('hooks.json async hook has valid timeout field', async () => {
    const asyncHook = hooks.hooks.PostToolUse.find(h =>
      h.hooks && h.hooks[0] && h.hooks[0].async === true
    );

    assert.ok(asyncHook, 'Should have at least one async hook defined');
    assert.strictEqual(asyncHook.hooks[0].async, true, 'async field should be true');
    assert.ok(asyncHook.hooks[0].timeout, 'Should have timeout field');
    assert.strictEqual(typeof asyncHook.hooks[0].timeout, 'number', 'Timeout should be a number');
    assert.ok(asyncHook.hooks[0].timeout > 0, 'Timeout should be positive');

    const command = asyncHook.hooks[0].command;
    const isNodeInline = command.startsWith('node -e');
    const isNodeScript = command.startsWith('node "');
    const isShellWrapper =
      command.startsWith('bash "') ||
      command.startsWith('sh "') ||
      command.startsWith('bash -lc ') ||
      command.startsWith('sh -c ');
    assert.ok(
      isNodeInline || isNodeScript || isShellWrapper,
      `Async hook command should be runnable (node -e, node script, or shell wrapper), got: ${command.substring(0, 80)}`
    );
  })) passed++; else failed++;

  if (await asyncTest('all hook commands in hooks.json are valid format', async () => {
    for (const [hookType, hookArray] of Object.entries(hooks.hooks)) {
      for (const hookDef of hookArray) {
        assert.ok(hookDef.hooks, `${hookType} entry should have hooks array`);

        for (const hook of hookDef.hooks) {
          assert.ok(hook.command, `Hook in ${hookType} should have command field`);

          const isInline = hook.command.startsWith('node -e');
          const isFilePath = hook.command.startsWith('node "');
          const isShellWrapper =
            /^(bash|sh)\s+["']/.test(hook.command) ||
            hook.command.startsWith('bash -lc ') ||
            hook.command.startsWith('sh -c ');
          const isShellScriptPath = /\.sh["']?(\s|$)/.test(hook.command);
          // 音を鳴らすだけのオペレータ用フック。スクリプトを持たない。
          const isNotificationSound = /^afplay\s/.test(hook.command);

          assert.ok(
            isInline || isFilePath || isShellWrapper || isShellScriptPath || isNotificationSound,
            `Hook command in ${hookType} should be node -e, node script, shell wrapper/script, or afplay, got: ${hook.command.substring(0, 80)}`
          );
        }
      }
    }
  })) passed++; else failed++;

  // Summary
  console.log('\n=== Test Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
