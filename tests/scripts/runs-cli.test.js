/**
 * Tests for scripts/runs-cli.js
 *
 * Run with: node tests/scripts/runs-cli.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const { main: runsCli } = require(path.join(ROOT, 'scripts', 'runs-cli.js'));
const {
  writeRunMeta,
  appendRunEvent,
  captureEvidence,
} = require(path.join(ROOT, 'scripts', 'lib', 'run-record.js'));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    failed += 1;
  }
}

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'runs-cli-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Capture stdout so assertions can read what the operator would see. */
function capture(fn) {
  const chunks = [];
  const original = process.stdout.write;
  process.stdout.write = chunk => { chunks.push(String(chunk)); return true; };
  let code;
  try {
    code = fn();
  } finally {
    process.stdout.write = original;
  }
  return { code, out: chunks.join('') };
}

function seedRuns(dir) {
  const runsDir = path.join(dir, 'runs');
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(repo, { recursive: true });

  const vPath = path.join(repo, 'verification-summary.md');
  fs.writeFileSync(vPath, '# Verification\n\n## RED Evidence\n\nfailed first\n\n## Outcome\n\npass\n');

  writeRunMeta({
    runsDir,
    runId: '2026-08-10-older-task',
    fields: { repo_root: repo, branch: 'worktree-older-task', started_at: '2026-08-10T00:00:00.000Z', gates: ['verification'] },
    addSessionId: 'sess-old',
  });
  captureEvidence({ runsDir, runId: '2026-08-10-older-task', kind: 'verification', artifactPath: vPath });
  appendRunEvent({ runsDir, runId: '2026-08-10-older-task', event: { type: 'verification_completed', status: 'complete' } });

  writeRunMeta({
    runsDir,
    runId: '2026-08-18-newer-task',
    fields: { repo_root: repo, branch: 'worktree-newer-task', started_at: '2026-08-18T00:00:00.000Z', gates: ['verification', 'review'] },
    addSessionId: 'sess-new-1',
  });
  writeRunMeta({ runsDir, runId: '2026-08-18-newer-task', fields: {}, addSessionId: 'sess-new-2' });
  captureEvidence({ runsDir, runId: '2026-08-18-newer-task', kind: 'verification', artifactPath: vPath });
  return runsDir;
}

console.log('runs-cli');

test('list shows newest first with gates and session count', () => {
  const dir = createTempDir();
  try {
    const runsDir = seedRuns(dir);
    const { code, out } = capture(() => runsCli(['list', '--runs-dir', runsDir]));
    assert.strictEqual(code, 0);
    const newerAt = out.indexOf('2026-08-18-newer-task');
    const olderAt = out.indexOf('2026-08-10-older-task');
    assert.ok(newerAt >= 0 && olderAt >= 0, 'both runs should be listed');
    assert.ok(newerAt < olderAt, 'newest run must come first');
    assert.ok(out.includes('review'), 'gates should be visible in the listing');
  } finally {
    cleanup(dir);
  }
});

test('list honors --limit', () => {
  const dir = createTempDir();
  try {
    const runsDir = seedRuns(dir);
    const { out } = capture(() => runsCli(['list', '--runs-dir', runsDir, '--limit', '1']));
    assert.ok(out.includes('2026-08-18-newer-task'));
    assert.ok(!out.includes('2026-08-10-older-task'));
  } finally {
    cleanup(dir);
  }
});

test('show prints the evidence body verbatim, not a summary', () => {
  const dir = createTempDir();
  try {
    const runsDir = seedRuns(dir);
    const { code, out } = capture(() => runsCli(['show', '2026-08-10-older-task', '--runs-dir', runsDir]));
    assert.strictEqual(code, 0);
    assert.ok(out.includes('## RED Evidence'), 'the RED observation must survive to the reader');
    assert.ok(out.includes('failed first'));
    assert.ok(out.includes('worktree-older-task'));
  } finally {
    cleanup(dir);
  }
});

test('show --json emits machine-readable output for an agent to parse', () => {
  const dir = createTempDir();
  try {
    const runsDir = seedRuns(dir);
    const { code, out } = capture(() => runsCli(['show', '2026-08-18-newer-task', '--runs-dir', runsDir, '--json']));
    assert.strictEqual(code, 0);
    const parsed = JSON.parse(out);
    assert.strictEqual(parsed.run_id, '2026-08-18-newer-task');
    assert.deepStrictEqual(parsed.session_ids, ['sess-new-1', 'sess-new-2']);
    assert.ok(parsed.evidence.verification.body.includes('RED Evidence'));
  } finally {
    cleanup(dir);
  }
});

test('show on an unknown run exits nonzero instead of printing nothing', () => {
  const dir = createTempDir();
  try {
    const runsDir = seedRuns(dir);
    const { code } = capture(() => runsCli(['show', 'no-such-run', '--runs-dir', runsDir]));
    assert.strictEqual(code, 1);
  } finally {
    cleanup(dir);
  }
});

test('trace resolves a run to its transcript paths via session_ids', () => {
  const dir = createTempDir();
  try {
    const runsDir = seedRuns(dir);
    // Two sessions, only one of which has a transcript on disk.
    const projects = path.join(dir, 'projects', 'proj-a');
    fs.mkdirSync(projects, { recursive: true });
    fs.writeFileSync(path.join(projects, 'sess-new-1.jsonl'), '{}\n');

    const { code, out } = capture(() => runsCli([
      'trace', '2026-08-18-newer-task',
      '--runs-dir', runsDir,
      '--transcript-dir', path.join(dir, 'projects'),
    ]));
    // One of two transcripts is not a success: the reader would take a partial trace for the whole run.
    assert.strictEqual(code, 2, out);
    assert.ok(/partial/.test(out), `the run must be called partial, got: ${out}`);
    assert.ok(out.includes('sess-new-1.jsonl'), 'the existing transcript must be reported');
    // The missing one must be named as missing rather than silently omitted.
    assert.ok(out.includes('sess-new-2'), 'a session with no transcript should still be listed');
  } finally {
    cleanup(dir);
  }
});

/** A run whose only session is `sessionId`, for trace tests. */
function seedTraceRun(dir, runId, sessionIds) {
  const runsDir = path.join(dir, 'runs');
  writeRunMeta({ runsDir, runId, fields: { branch: runId } });
  for (const sessionId of sessionIds) writeRunMeta({ runsDir, runId, fields: {}, addSessionId: sessionId });
  return runsDir;
}

/** A Codex rollout file. Codex writes session_meta first; `metaId` lets a test make it disagree with the name. */
function seedCodexRollout(codexHome, folder, id, { metaId = id, lines = [] } = {}) {
  const dir = path.join(codexHome, folder);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `rollout-2026-09-24T10-00-00-${id}.jsonl`);
  const meta = { type: 'session_meta', payload: { id: metaId, cwd: '/tmp', originator: 'codex-tui' } };
  fs.writeFileSync(file, [meta, ...lines].map(line => JSON.stringify(line)).join('\n') + '\n');
  return file;
}

const CODEX_ID = '01a0d3b1-d208-7fc1-ae99-4b0ec2bab438';

test('trace resolves a Codex session id to its rollout under sessions/', () => {
  const dir = createTempDir();
  try {
    const runsDir = seedTraceRun(dir, '2026-09-24-codex', [`codex-session-${CODEX_ID}`]);
    const codexHome = path.join(dir, 'codex');
    const file = seedCodexRollout(codexHome, path.join('sessions', '2026', '09', '24'), CODEX_ID);
    // Identity comes from session_meta, not the file name: this one only borrows the id in its name.
    const impostor = seedCodexRollout(codexHome, path.join('sessions', '2026', '09', '25'), CODEX_ID, { metaId: '01a0ffff-0000-7000-8000-000000000000' });
    // A rollout cut off after its first record has no trailing newline; session_meta is still whole.
    const cutOff = path.join(codexHome, 'sessions', '2026', '09', '26', `rollout-2026-09-26T10-00-00-${CODEX_ID}.jsonl`);
    fs.mkdirSync(path.dirname(cutOff), { recursive: true });
    fs.writeFileSync(cutOff, JSON.stringify({ type: 'session_meta', payload: { id: CODEX_ID } }));
    const { code, out } = capture(() => runsCli([
      'trace', '2026-09-24-codex', '--runs-dir', runsDir,
      '--transcript-dir', path.join(dir, 'projects'), '--codex-home', codexHome,
    ]));
    assert.strictEqual(code, 0, out);
    assert.ok(/resolved/.test(out), `the run must be called resolved, got: ${out}`);
    assert.ok(out.includes(file), `the rollout must be reported, got: ${out}`);
    assert.ok(!out.includes(impostor), 'a rollout whose session_meta names another session must not be reported');
    assert.ok(out.includes(cutOff), `a rollout without a trailing newline must still resolve, got: ${out}`);
  } finally {
    cleanup(dir);
  }
});

test('trace resolves archived Codex rollouts and the codex-thread form of the id', () => {
  const dir = createTempDir();
  try {
    // CODEX_THREAD_ID carries the same id as session_meta (seen in real rollouts), recorded as codex-thread-<id>.
    const threadId = '019d9f09-64e9-7f53-905c-d89dce56cef2';
    // The same id can reach a run in both forms; each must resolve rather than one shadowing the other.
    const runsDir = seedTraceRun(dir, '2026-09-24-archived', [`codex-session-${CODEX_ID}`, `codex-thread-${threadId}`, `codex-thread-${CODEX_ID}`]);
    const codexHome = path.join(dir, 'codex');
    const archived = seedCodexRollout(codexHome, 'archived_sessions', CODEX_ID);
    const thread = seedCodexRollout(codexHome, path.join('sessions', '2026', '04', '18'), threadId);
    const { code, out } = capture(() => runsCli([
      'trace', '2026-09-24-archived', '--runs-dir', runsDir,
      '--transcript-dir', path.join(dir, 'projects'), '--codex-home', codexHome,
    ]));
    assert.strictEqual(code, 0, out);
    assert.ok(out.includes(archived), `the archived rollout must be reported, got: ${out}`);
    assert.ok(out.includes(thread), `the codex-thread id must resolve, got: ${out}`);
    assert.ok(/resolved \(3\/3 sessions\)/.test(out), `every form of the id must resolve, got: ${out}`);
  } finally {
    cleanup(dir);
  }
});

test('trace tells an unlinked run from a missing one, and neither exits 0', () => {
  const dir = createTempDir();
  try {
    const runsDir = seedTraceRun(dir, '2026-09-24-unlinked', []);
    seedTraceRun(dir, '2026-09-24-missing', [`codex-session-${CODEX_ID}`, 'claude-gone']);
    const args = ['--runs-dir', runsDir, '--transcript-dir', path.join(dir, 'projects'), '--codex-home', path.join(dir, 'codex')];
    const unlinked = capture(() => runsCli(['trace', '2026-09-24-unlinked', ...args]));
    assert.strictEqual(unlinked.code, 2, unlinked.out);
    assert.ok(/unlinked/.test(unlinked.out), `got: ${unlinked.out}`);
    const missing = capture(() => runsCli(['trace', '2026-09-24-missing', ...args]));
    assert.strictEqual(missing.code, 2, missing.out);
    assert.ok(/missing/.test(missing.out), `got: ${missing.out}`);
    assert.ok(missing.out.includes(`codex-session-${CODEX_ID}`) && missing.out.includes('claude-gone'), 'each missing session must be named');
  } finally {
    cleanup(dir);
  }
});

test('trace shows the models each transcript used and the lines where they changed', () => {
  const dir = createTempDir();
  try {
    const runsDir = seedTraceRun(dir, '2026-09-24-mixed', ['claude-mixed', `codex-session-${CODEX_ID}`]);
    const projects = path.join(dir, 'projects', 'proj-a');
    fs.mkdirSync(projects, { recursive: true });
    const assistant = model => ({ type: 'assistant', message: { role: 'assistant', model, content: [] } });
    fs.writeFileSync(path.join(projects, 'claude-mixed.jsonl'), [
      { type: 'user', message: { role: 'user', content: 'go' } },
      assistant('claude-opus-5-5'), assistant('claude-opus-5-5'), assistant('claude-sonnet-5'), assistant('<synthetic>'),
    ].map(line => JSON.stringify(line)).join('\n') + '\n');
    const codexHome = path.join(dir, 'codex');
    const turn = model => ({ type: 'turn_context', payload: { model } });
    seedCodexRollout(codexHome, path.join('sessions', '2026', '09', '24'), CODEX_ID, {
      lines: [turn('gpt-6-sol'), { type: 'response_item', payload: {} }, turn('gpt-6-sol'), turn('gpt-6-mini')],
    });
    const { code, out } = capture(() => runsCli([
      'trace', '2026-09-24-mixed', '--runs-dir', runsDir,
      '--transcript-dir', path.join(dir, 'projects'), '--codex-home', codexHome,
    ]));
    assert.strictEqual(code, 0, out);
    // Line numbers are 1-based lines of the JSONL file, so a reader can jump straight there.
    for (const expected of ['line 2: model=claude-opus-5-5', 'line 4: model=claude-sonnet-5', 'line 2: model=gpt-6-sol', 'line 5: model=gpt-6-mini']) {
      assert.ok(out.includes(expected), `expected "${expected}" in: ${out}`);
    }
    assert.ok(!out.includes('line 3: model=claude-opus-5-5'), 'an unchanged model is not repeated');
    assert.ok(!out.includes('<synthetic>'), 'Claude Code placeholder messages are not a model');
    assert.ok(/models: claude-opus-5-5, claude-sonnet-5, gpt-6-sol, gpt-6-mini/.test(out), `the run must list every model it used, got: ${out}`);
  } finally {
    cleanup(dir);
  }
});

test('diff reports which gates and evidence differ between two runs', () => {
  const dir = createTempDir();
  try {
    const runsDir = seedRuns(dir);
    const { code, out } = capture(() => runsCli([
      'diff', '2026-08-10-older-task', '2026-08-18-newer-task', '--runs-dir', runsDir,
    ]));
    assert.strictEqual(code, 0);
    assert.ok(out.includes('review'), 'the gate present in only one run must be called out');
  } finally {
    cleanup(dir);
  }
});

test('no subcommand prints help and exits 1', () => {
  const { code, out } = capture(() => runsCli([]));
  assert.strictEqual(code, 1);
  assert.ok(out.includes('list'));
  assert.ok(out.includes('show'));
  assert.ok(out.includes('trace'));
});

test('an empty runs directory reports emptiness rather than crashing', () => {
  const dir = createTempDir();
  try {
    const { code, out } = capture(() => runsCli(['list', '--runs-dir', path.join(dir, 'nope')]));
    assert.strictEqual(code, 0);
    assert.ok(/no run/i.test(out), `expected an explicit empty message, got: ${out}`);
  } finally {
    cleanup(dir);
  }
});

console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
