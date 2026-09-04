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
    assert.strictEqual(code, 0);
    assert.ok(out.includes('sess-new-1.jsonl'), 'the existing transcript must be reported');
    // The missing one must be named as missing rather than silently omitted.
    assert.ok(out.includes('sess-new-2'), 'a session with no transcript should still be listed');
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
