/**
 * Tests for scripts/lib/lifecycle-record.js
 *
 * Run with: node tests/lib/lifecycle-record.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// tests/run-all.js sets CLAUDE_DISABLE_RUN_RECORD so other suites cannot write
// into the real runs/. This file needs the writes it is asserting on; every
// case passes an explicit temp runsDir.
delete process.env.CLAUDE_DISABLE_RUN_RECORD;

const {
  buildLifecycleSnapshot,
  recordLifecycleGates,
} = require('../../scripts/lib/lifecycle-record');
const { readRunRecord } = require('../../scripts/lib/run-record');

function test(name, fn) {
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

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-record-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const VERIFICATION = `# Verification Summary

## Scope

- x

## Commands Run

- \`true\`

## Verification Outcome

- ok

## Assessment

- ok
`;

const REVIEW = `# Review Summary

## Review Scope

- x

## Design Compliance

- matches the design doc

## Security

- no decision boundary touched

## Comment Adequacy

- unchanged

## Code Quality

- acceptable

## Test Adequacy

- covered

## Findings

INFO: nothing

## Residual Risks

- none

## Guardrail Candidates

- none

## Next Action

Merge it.
`;

const OBSERVATION = `# Observation Summary

## Behavior Checked

- x

## Method

- ran it

## Evidence

- output

## Remaining Uncertainty

- none
`;

function seedRepo(dir, files) {
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(repo, name), body);
  }
  return repo;
}

function runTests() {
  console.log('\n=== Testing lifecycle-record.js ===\n');
  let passed = 0;
  let failed = 0;

  if (test('buildLifecycleSnapshot returns null when there are no artifacts', () => {
    const dir = createTempDir();
    try {
      assert.strictEqual(buildLifecycleSnapshot(seedRepo(dir, {})), null);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('buildLifecycleSnapshot fingerprints each gate artifact', () => {
    const dir = createTempDir();
    try {
      const repo = seedRepo(dir, {
        'verification-summary.md': VERIFICATION,
        'review-summary.md': REVIEW,
      });
      const snapshot = buildLifecycleSnapshot(repo);
      assert.strictEqual(snapshot.repoRoot, repo);
      assert.ok(snapshot.fingerprints.verification);
      assert.ok(snapshot.fingerprints.review);
      assert.strictEqual(snapshot.fingerprints.observation, '');
      // plan.md and progress.md were retired 2026-08-17; their fingerprints
      // existed only to dedupe SQLite rows that no longer exist.
      assert.strictEqual(snapshot.fingerprints.plan, undefined);
      assert.strictEqual(snapshot.fingerprints.checkpoint, undefined);
      assert.strictEqual(snapshot.fingerprints.runState, undefined);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('recordLifecycleGates captures every gate artifact present', () => {
    const dir = createTempDir();
    try {
      const repo = seedRepo(dir, {
        'verification-summary.md': VERIFICATION,
        'review-summary.md': REVIEW,
        'observation-summary.md': OBSERVATION,
      });
      const runsDir = path.join(dir, 'runs');
      const result = recordLifecycleGates({
        repoRoot: repo,
        runsDir,
        runId: '2026-08-20-task',
        sessionId: 'sess-1',
        branch: 'worktree-task',
      });
      assert.deepStrictEqual(result.captured.slice().sort(), ['observation', 'review', 'verification']);
      assert.deepStrictEqual(result.firedGates.slice().sort(),
        ['observation_completed', 'review_completed', 'verification_completed']);

      const record = readRunRecord({ runsDir, runId: '2026-08-20-task' });
      assert.strictEqual(record.evidence.verification.body, VERIFICATION);
      assert.strictEqual(record.evidence.review.state.complete, true);
      assert.strictEqual(record.events.length, 3);
      assert.deepStrictEqual(record.session_ids, ['sess-1']);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('an unchanged artifact does not append a second gate event', () => {
    const dir = createTempDir();
    try {
      const repo = seedRepo(dir, { 'verification-summary.md': VERIFICATION });
      const runsDir = path.join(dir, 'runs');
      const args = { repoRoot: repo, runsDir, runId: '2026-08-20-task', sessionId: 'sess-1' };

      recordLifecycleGates(args);
      const second = recordLifecycleGates(args);

      // The hooks call this on session start, session end and every pipeline
      // step. Without dedup, events.ndjson would grow one line per invocation
      // and the gate timeline would read as many completions.
      assert.deepStrictEqual(second.firedGates, []);
      const record = readRunRecord({ runsDir, runId: '2026-08-20-task' });
      assert.strictEqual(record.events.length, 1);
      // Evidence is still refreshed: the body must be the state at the last
      // snapshot, since that is what survives ExitWorktree.
      assert.strictEqual(record.evidence.verification.body, VERIFICATION);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('a changed artifact appends a new gate event', () => {
    const dir = createTempDir();
    try {
      const repo = seedRepo(dir, { 'verification-summary.md': VERIFICATION });
      const runsDir = path.join(dir, 'runs');
      const args = { repoRoot: repo, runsDir, runId: '2026-08-20-task', sessionId: 'sess-1' };

      recordLifecycleGates(args);
      fs.writeFileSync(
        path.join(repo, 'verification-summary.md'),
        VERIFICATION.replace('- ok\n\n## Assessment', '- ok, twice\n\n## Assessment')
      );
      // The fingerprint is name:mtime:status, and two writes inside the same
      // millisecond would collide.
      const target = path.join(repo, 'verification-summary.md');
      const later = new Date(Date.now() + 5000);
      fs.utimesSync(target, later, later);

      const second = recordLifecycleGates(args);
      assert.deepStrictEqual(second.firedGates, ['verification_completed']);
      const record = readRunRecord({ runsDir, runId: '2026-08-20-task' });
      assert.strictEqual(record.events.length, 2);
      assert.ok(record.evidence.verification.body.includes('ok, twice'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('a repository with no artifacts writes no run record', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'runs');
      const result = recordLifecycleGates({
        repoRoot: seedRepo(dir, {}),
        runsDir,
        runId: '2026-08-20-task',
        sessionId: 'sess-1',
      });
      assert.deepStrictEqual(result.captured, []);
      assert.ok(!fs.existsSync(path.join(runsDir, '2026-08-20-task')));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('recordLifecycleGates honours the run-record kill switch', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'runs');
      process.env.CLAUDE_DISABLE_RUN_RECORD = '1';
      const result = recordLifecycleGates({
        repoRoot: seedRepo(dir, { 'verification-summary.md': VERIFICATION }),
        runsDir,
        runId: '2026-08-20-task',
        sessionId: 'sess-1',
      });
      assert.deepStrictEqual(result.captured, []);
      assert.ok(!fs.existsSync(path.join(runsDir, '2026-08-20-task')));
    } finally {
      delete process.env.CLAUDE_DISABLE_RUN_RECORD;
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('lifecycle-record does not depend on the SQLite layer', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'lib', 'lifecycle-record.js'),
      'utf8'
    );
    assert.ok(!/require\([^)]*session-trace/.test(source), 'must not require session-trace');
    assert.ok(!/\bdb\.prepare\(/.test(source), 'must not issue SQL');
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
