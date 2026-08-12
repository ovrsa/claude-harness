#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..', '..');
const HOOK_ROOT = path.join(REPO_ROOT, 'scripts', 'hooks');

function runHook(name, input, env = {}, raw = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(HOOK_ROOT, name)], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(raw ? input : JSON.stringify(input));
  });
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('\n=== Testing Experience hooks ===\n');
  let passed = 0;
  let failed = 0;

  const cases = [
    ['records all Experience hook families with empty stdout', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'experience-hooks-'));
      const env = { CLAUDE_EXPERIENCE_ROOT: root };
      const base = { session_id: 'hook-session-001', cwd: REPO_ROOT };
      const secret = 'sk-fixture-super-secret-123456789012345';
      const invocations = [
        ['experience-session-start.js', { ...base, hook_event_name: 'SessionStart' }],
        ['experience-user-prompt.js', { ...base, hook_event_name: 'UserPromptSubmit', prompt: `違う。token=${secret}` }],
        ['experience-pre-tool.js', { ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: `npm test\nAPI_KEY=${secret}` } }],
        ['experience-post-tool.js', { ...base, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: { output: `${secret}${'x'.repeat(9000)}` } }],
        ['experience-stop.js', { ...base, hook_event_name: 'Stop' }],
        ['experience-session-end.js', { ...base, hook_event_name: 'SessionEnd' }],
      ];

      for (const [script, input] of invocations) {
        const result = await runHook(script, input, env);
        assert.strictEqual(result.code, 0, `${script}: ${result.stderr}`);
        assert.strictEqual(result.stdout, '', `${script} must keep stdout empty`);
      }

      const runDir = path.join(root, 'runs', 'claude-hook-session-001');
      const manifest = JSON.parse(fs.readFileSync(path.join(runDir, 'manifest.json'), 'utf8'));
      const trace = readJsonl(path.join(runDir, 'trace.jsonl'));
      const outcome = JSON.parse(fs.readFileSync(path.join(runDir, 'outcome.json'), 'utf8'));
      const refs = JSON.parse(fs.readFileSync(path.join(runDir, 'refs.json'), 'utf8'));
      const index = readJsonl(path.join(root, 'index.jsonl'));
      const serialized = JSON.stringify({ manifest, trace, outcome, refs, index });

      assert.deepStrictEqual(trace.map((event) => event.family), [
        'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SessionEnd',
      ]);
      assert.strictEqual(outcome.outcome, 'corrected');
      assert.strictEqual(index.length, 1);
      assert.doesNotMatch(serialized, /fixture-super-secret/);
      assert.doesNotMatch(serialized, /違う。token=/);
      assert.ok(serialized.length < 20000);
    }],
    ['fails open with bounded stderr when the Experience root is unusable', async () => {
      const result = await runHook('experience-session-start.js', {
        session_id: 'hook-session-failure',
        cwd: REPO_ROOT,
      }, { CLAUDE_EXPERIENCE_ROOT: '/dev/null/experience' });
      assert.strictEqual(result.code, 0);
      assert.strictEqual(result.stdout, '');
      assert.match(result.stderr, /Experience observation skipped/);
      assert.ok(result.stderr.length < 500);
    }],
    ['fails open on malformed JSON without replaying stdin', async () => {
      const malformed = '{"prompt":"raw-private-text"';
      const result = await runHook('experience-user-prompt.js', malformed, {
        CLAUDE_EXPERIENCE_ROOT: '/dev/null/experience',
      }, true);
      assert.strictEqual(result.code, 0);
      assert.strictEqual(result.stdout, '');
      assert.doesNotMatch(result.stderr, /raw-private-text/);
      assert.ok(result.stderr.length < 500);
    }],
    ['keeps PermissionRequest independent in both hook registries', async () => {
      const settings = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'settings.json'), 'utf8'));
      const hooks = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'hooks', 'hooks.json'), 'utf8'));
      for (const registry of [settings, hooks]) {
        const permission = registry.hooks.PermissionRequest;
        assert.strictEqual(permission.length, 1);
        assert.match(permission[0].hooks[0].command, /permission-request\.js/);
      }
    }],
    ['does not persist raw PermissionRequest command text', async () => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'permission-hook-'));
      const secret = 'Bearer permission-fixture-secret-123456789';
      const result = await runHook('permission-request.js', {
        session_id: 'permission-session',
        tool_name: 'Bash',
        tool_input: { command: `curl -H "Authorization: ${secret}" https://example.com` },
      }, { HOME: home, USERPROFILE: home });
      assert.strictEqual(result.code, 0);
      const sessionsDir = path.join(home, '.claude', 'sessions');
      if (fs.existsSync(sessionsDir)) {
        for (const file of fs.readdirSync(sessionsDir)) {
          assert.doesNotMatch(fs.readFileSync(path.join(sessionsDir, file), 'utf8'), /permission-fixture-secret/);
        }
      }
    }],
    ['routes the Codex manual bridge through the same Experience store', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-experience-bridge-'));
      const env = {
        CLAUDE_EXPERIENCE_ROOT: root,
        CODEX_THREAD_ID: 'bridge-fixture',
        CLAUDE_SESSION_ID: '',
      };
      const start = await runHook('runtime-session-start.js', {}, env);
      const end = await runHook('runtime-session-end.js', {}, env);
      assert.strictEqual(start.code, 0);
      assert.strictEqual(end.code, 0);
      assert.strictEqual(start.stdout, '');
      assert.strictEqual(end.stdout, '');
      const runDir = path.join(root, 'runs', 'codex-codex-thread-bridge-fixture');
      const trace = readJsonl(path.join(runDir, 'trace.jsonl'));
      assert.deepStrictEqual(trace.map((event) => event.family), ['SessionStart', 'SessionEnd']);
      assert.strictEqual(JSON.parse(fs.readFileSync(path.join(runDir, 'outcome.json'), 'utf8')).outcome, 'unknown');
    }],
  ];

  for (const [name, fn] of cases) {
    if (await test(name, fn)) passed += 1;
    else failed += 1;
  }

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
