/**
 * Tests for harness/scripts/lib/run-record.js
 *
 * Run with: node harness/tests/lib/run-record.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { execFileSync } = require('child_process');

// harness/tests/run-all.js sets CLAUDE_DISABLE_RUN_RECORD so other suites cannot write
// into the real harness/data/runs/. This file is the exception: every case here passes an
// explicit temp runsDir, and inheriting the kill switch would make it assert
// against a no-op.
delete process.env.CLAUDE_DISABLE_RUN_RECORD;

const {
  resolveRunSlug,
  getRunsDir,
  writeRunMeta,
  appendRunEvent,
  captureEvidence,
  readRunRecord,
  listRunRecords,
  resolveBranch,
  recordGateEvidence,
  recordSessionStart,
} = require('../../scripts/lib/run-record');

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'run-record-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const VERIFICATION_BODY = `# Verification Summary

## RED Evidence

\`node harness/tests/run-all.js\` → 1 failed（transcript-log 未実装）

## Checks

- \`node harness/tests/run-all.js\` → 1324 passed / 0 failed
- \`npm run lint\` → 0 errors

## Outcome

pass
`;

function runTests() {
  console.log('\n=== Testing run-record.js ===\n');
  let passed = 0;
  let failed = 0;

  if (test('run slug is date + branch, matching the docs/design/ naming convention', () => {
    const slug = resolveRunSlug({
      branch: 'worktree-json-logs-retire-sqlite',
      now: new Date('2026-08-18T05:00:00.000Z'),
    });
    assert.strictEqual(slug, '2026-08-18-json-logs-retire-sqlite');
  })) passed++; else failed++;

  if (test('a task that crosses midnight keeps its original run id', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'harness/data/runs');
      // Day 1: the record is created.
      const day1 = resolveRunSlug({
        runsDir,
        branch: 'worktree-my-task',
        now: new Date('2026-08-18T23:50:00.000Z'),
      });
      assert.strictEqual(day1, '2026-08-18-my-task');
      writeRunMeta({ runsDir, runId: day1, fields: { branch: 'worktree-my-task' } });

      // Day 2, same branch: without this the evidence would split across two
      // records and stop matching docs/design/YYYY-MM-DD-<slug>.md.
      const day2 = resolveRunSlug({
        runsDir,
        branch: 'worktree-my-task',
        now: new Date('2026-08-19T00:10:00.000Z'),
      });
      assert.strictEqual(day2, '2026-08-18-my-task');

      // A different branch still gets its own record.
      const other = resolveRunSlug({
        runsDir,
        branch: 'worktree-other-task',
        now: new Date('2026-08-19T00:10:00.000Z'),
      });
      assert.strictEqual(other, '2026-08-19-other-task');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('run slug falls back to the session id when there is no branch', () => {
    const slug = resolveRunSlug({
      branch: '',
      sessionId: 'sess-abc',
      now: new Date('2026-08-18T05:00:00.000Z'),
    });
    assert.strictEqual(slug, '2026-08-18-sess-abc');
  })) passed++; else failed++;

  if (test('run slug strips characters that would break a filename or a grep', () => {
    const slug = resolveRunSlug({
      branch: 'feature/RAR-2172_fix (v2)',
      now: new Date('2026-08-18T05:00:00.000Z'),
    });
    assert.ok(/^2026-08-18-[a-z0-9-]+$/.test(slug), `unexpected slug: ${slug}`);
  })) passed++; else failed++;

  if (test('harness repo writes into its own harness/data/runs/ so the merge carries the evidence', () => {
    const dir = createTempDir();
    try {
      const repoRoot = path.join(dir, '.claude');
      fs.mkdirSync(repoRoot, { recursive: true });
      assert.strictEqual(getRunsDir({ repoRoot, homeDir: dir }), path.join(repoRoot, 'harness/data/runs'));

      const wt = path.join(dir, '.claude', '.claude', 'worktrees', 'wt-1');
      fs.mkdirSync(wt, { recursive: true });
      assert.strictEqual(getRunsDir({ repoRoot: wt, homeDir: dir }), path.join(wt, 'harness/data/runs'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('a redirected home isolates the run record even for the real harness repo', () => {
    const dir = createTempDir();
    try {
      // The test suite isolates by pointing HOME at a temp dir. A repo is only
      // "the harness repo" relative to that home, otherwise a hook exercised
      // with cwd inside the real worktree writes into the real harness/data/runs/ — which is
      // how fixture session ids reached the live record.
      const realWorktree = '/Users/someone/.claude/.claude/worktrees/wt-1';
      assert.strictEqual(
        getRunsDir({ repoRoot: realWorktree, homeDir: dir }),
        path.join(dir, '.claude', 'harness/data/runs'),
        'a repo outside the given home must not be treated as the harness repo'
      );
      // With the matching home it is the harness repo again.
      assert.strictEqual(
        getRunsDir({ repoRoot: realWorktree, homeDir: '/Users/someone' }),
        path.join(realWorktree, 'harness/data/runs')
      );
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('other repos record into the harness store, not into their own tree', () => {
    const dir = createTempDir();
    try {
      const repoRoot = path.join(dir, 'some-project');
      fs.mkdirSync(repoRoot, { recursive: true });
      assert.strictEqual(
        getRunsDir({ repoRoot, homeDir: dir }),
        path.join(dir, '.claude', 'harness/data/runs')
      );
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('an explicit dbPath redirects the run record too, so tests cannot write real paths', () => {
    const dir = createTempDir();
    try {
      // Callers that redirect persistence pass options.dbPath. Before this,
      // only SQLite followed it and run records still landed in the real
      // $HOME/.claude/runs or the current repo — the test suite polluted the
      // live record with fixture session ids.
      const dbPath = path.join(dir, 'sandbox', '.claude', 'telemetry', 'telemetry.db');
      assert.strictEqual(
        getRunsDir({ dbPath, repoRoot: '/some/real/repo', homeDir: '/real/home' }),
        path.join(dir, 'sandbox', '.claude', 'harness/data/runs')
      );
      // An explicit runsDir still wins over the derivation.
      assert.strictEqual(
        getRunsDir({ dbPath, runsDir: path.join(dir, 'explicit') }),
        path.join(dir, 'explicit')
      );
      // Without dbPath, production behaviour is unchanged.
      const repoRoot = path.join(dir, '.claude');
      fs.mkdirSync(repoRoot, { recursive: true });
      assert.strictEqual(getRunsDir({ repoRoot, homeDir: dir }), path.join(repoRoot, 'harness/data/runs'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('captured evidence keeps the whole body, not a preview', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'harness/data/runs');
      const artifactPath = path.join(dir, 'verification-summary.md');
      fs.writeFileSync(artifactPath, VERIFICATION_BODY);

      captureEvidence({ runsDir, runId: 'r1', kind: 'verification', artifactPath });

      const saved = JSON.parse(fs.readFileSync(path.join(runsDir, 'r1', 'evidence', 'verification.json'), 'utf8'));
      assert.strictEqual(saved.body, VERIFICATION_BODY);
      assert.strictEqual(saved.kind, 'verification');
      assert.strictEqual(saved.source_path, artifactPath);
      assert.ok(saved.captured_at);
      // The RED observation is the part most easily lost to summarisation.
      assert.ok(saved.body.includes('RED Evidence'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('evidence outlives the worktree that produced it', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'harness/data/runs');
      const worktree = path.join(dir, 'wt');
      fs.mkdirSync(worktree, { recursive: true });
      const artifactPath = path.join(worktree, 'review-summary.md');
      fs.writeFileSync(artifactPath, '# Review\n\n## Findings\n\n- none\n');

      captureEvidence({ runsDir, runId: 'r1', kind: 'review', artifactPath });
      // ExitWorktree(action: "remove") — the whole reason this module exists.
      fs.rmSync(worktree, { recursive: true, force: true });

      const record = readRunRecord({ runsDir, runId: 'r1' });
      assert.ok(record.evidence.review, 'review evidence missing after worktree removal');
      assert.ok(record.evidence.review.body.includes('## Findings'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('capturing a missing artifact records nothing rather than an empty body', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'harness/data/runs');
      const result = captureEvidence({
        runsDir,
        runId: 'r1',
        kind: 'observation',
        artifactPath: path.join(dir, 'does-not-exist.md'),
      });
      assert.strictEqual(result, null);
      assert.ok(!fs.existsSync(path.join(runsDir, 'r1', 'evidence', 'observation.json')));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('meta merges across gates instead of clobbering earlier fields', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'harness/data/runs');
      writeRunMeta({ runsDir, runId: 'r1', fields: { repo_root: '/repo', session_ids: ['s1'] } });
      writeRunMeta({ runsDir, runId: 'r1', fields: { merge_commit: 'abc1234' } });

      const meta = JSON.parse(fs.readFileSync(path.join(runsDir, 'r1', 'meta.json'), 'utf8'));
      assert.strictEqual(meta.repo_root, '/repo');
      assert.strictEqual(meta.merge_commit, 'abc1234');
      assert.deepStrictEqual(meta.session_ids, ['s1']);
      assert.strictEqual(meta.run_id, 'r1');
      assert.ok(meta.updated_at);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('session ids accumulate without duplicating, so a resumed task joins its traces', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'harness/data/runs');
      writeRunMeta({ runsDir, runId: 'r1', fields: {}, addSessionId: 's1' });
      writeRunMeta({ runsDir, runId: 'r1', fields: {}, addSessionId: 's2' });
      writeRunMeta({ runsDir, runId: 'r1', fields: {}, addSessionId: 's1' });

      const meta = JSON.parse(fs.readFileSync(path.join(runsDir, 'r1', 'meta.json'), 'utf8'));
      assert.deepStrictEqual(meta.session_ids, ['s1', 's2']);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('a corrupt meta.json is replaced rather than throwing', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'harness/data/runs');
      fs.mkdirSync(path.join(runsDir, 'r1'), { recursive: true });
      fs.writeFileSync(path.join(runsDir, 'r1', 'meta.json'), '{ not json');

      writeRunMeta({ runsDir, runId: 'r1', fields: { repo_root: '/repo' } });
      const meta = JSON.parse(fs.readFileSync(path.join(runsDir, 'r1', 'meta.json'), 'utf8'));
      assert.strictEqual(meta.repo_root, '/repo');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('events append one JSON object per line under logs/', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'harness/data/runs');
      appendRunEvent({ runsDir, runId: 'r1', event: { type: 'verification_completed', status: 'complete' } });
      appendRunEvent({ runsDir, runId: 'r1', event: { type: 'review_completed', status: 'complete' } });

      const raw = fs.readFileSync(path.join(runsDir, 'r1', 'logs', 'events.ndjson'), 'utf8');
      const lines = raw.split('\n').filter(Boolean);
      assert.strictEqual(lines.length, 2);
      const first = JSON.parse(lines[0]);
      assert.strictEqual(first.type, 'verification_completed');
      assert.ok(first.occurred_at, 'events must be timestamped to be orderable');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('event lines stay under 4096 bytes so concurrent appends cannot interleave', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'harness/data/runs');
      appendRunEvent({
        runsDir,
        runId: 'r1',
        event: { type: 'verification_completed', note: 'x'.repeat(20000) },
      });
      const raw = fs.readFileSync(path.join(runsDir, 'r1', 'logs', 'events.ndjson'), 'utf8');
      const line = raw.split('\n').filter(Boolean)[0];
      assert.ok(
        Buffer.byteLength(line, 'utf8') < 4096,
        `line was ${Buffer.byteLength(line, 'utf8')} bytes; bodies belong in evidence/, not events`
      );
      // Truncation must be visible, not silent.
      assert.ok(JSON.parse(line).truncated === true);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('listRunRecords returns newest first and tolerates junk directories', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'harness/data/runs');
      writeRunMeta({ runsDir, runId: '2026-08-01-older', fields: { started_at: '2026-08-01T00:00:00.000Z' } });
      writeRunMeta({ runsDir, runId: '2026-08-18-newer', fields: { started_at: '2026-08-18T00:00:00.000Z' } });
      fs.mkdirSync(path.join(runsDir, 'not-a-run'), { recursive: true });

      const runs = listRunRecords({ runsDir });
      assert.strictEqual(runs.length, 2);
      assert.strictEqual(runs[0].run_id, '2026-08-18-newer');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('readRunRecord on an unknown run returns null instead of throwing', () => {
    const dir = createTempDir();
    try {
      assert.strictEqual(readRunRecord({ runsDir: path.join(dir, 'harness/data/runs'), runId: 'nope' }), null);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('a run id containing path separators or .. is refused, not resolved', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'harness/data/runs');
      fs.mkdirSync(runsDir, { recursive: true });
      const hostile = [
        '../../../../../../tmp/CLAUDE-ESCAPED',
        '..',
        '.',
        'a/b',
        'a\\b',
        '/abs',
        '',
      ];
      for (const runId of hostile) {
        assert.throws(
          () => writeRunMeta({ runsDir, runId, fields: { probe: true } }),
          /run id/i,
          `writeRunMeta accepted a hostile run id: ${JSON.stringify(runId)}`
        );
        assert.throws(
          () => readRunRecord({ runsDir, runId }),
          /run id/i,
          `readRunRecord accepted a hostile run id: ${JSON.stringify(runId)}`
        );
      }
      // Nothing may exist outside runsDir, and runsDir itself stays clean.
      assert.deepStrictEqual(fs.readdirSync(runsDir), []);
      assert.ok(!fs.existsSync(path.join(dir, 'meta.json')), 'escaped one level up');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('a normal date-slug run id is still accepted', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'harness/data/runs');
      writeRunMeta({ runsDir, runId: '2026-08-18-json-logs-retire-sqlite', fields: {} });
      assert.ok(fs.existsSync(path.join(runsDir, '2026-08-18-json-logs-retire-sqlite', 'meta.json')));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('resolveBranch reads the branch from git, and is empty outside a repo', () => {
    const dir = createTempDir();
    try {
      assert.strictEqual(resolveBranch(dir), '');
      execFileSync('git', ['init', '-q', '-b', 'worktree-my-task'], { cwd: dir });
      assert.strictEqual(resolveBranch(dir), 'worktree-my-task');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('recordGateEvidence captures every present gate artifact in one pass', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'harness/data/runs');
      const repoRoot = path.join(dir, 'repo');
      fs.mkdirSync(repoRoot, { recursive: true });
      fs.writeFileSync(path.join(repoRoot, 'verification-summary.md'), VERIFICATION_BODY);
      fs.writeFileSync(path.join(repoRoot, 'review-summary.md'), '# Review\n\n## Findings\n\n- none\n');

      const result = recordGateEvidence({
        runsDir,
        runId: '2026-08-18-my-task',
        repoRoot,
        sessionId: 'sess-1',
        branch: 'worktree-my-task',
        artifacts: [
          { name: 'verification-summary.md', path: path.join(repoRoot, 'verification-summary.md') },
          { name: 'review-summary.md', path: path.join(repoRoot, 'review-summary.md') },
        ],
        firedGates: ['verification_completed'],
      });

      assert.deepStrictEqual(result.captured.sort(), ['review', 'verification']);

      const record = readRunRecord({ runsDir, runId: '2026-08-18-my-task' });
      assert.strictEqual(record.evidence.verification.body, VERIFICATION_BODY);
      assert.ok(record.evidence.review);
      // observation was absent, so it must not appear as an empty record
      assert.strictEqual(record.evidence.observation, undefined);
      assert.strictEqual(record.repo_root, repoRoot);
      assert.strictEqual(record.branch, 'worktree-my-task');
      assert.deepStrictEqual(record.session_ids, ['sess-1']);
      // only the gate that actually fired gets an event
      assert.strictEqual(record.events.length, 1);
      assert.strictEqual(record.events[0].type, 'verification_completed');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('recordGateEvidence re-capture refreshes the body instead of appending copies', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'harness/data/runs');
      const repoRoot = path.join(dir, 'repo');
      fs.mkdirSync(repoRoot, { recursive: true });
      const artifactPath = path.join(repoRoot, 'verification-summary.md');
      fs.writeFileSync(artifactPath, '# v1\n');

      const args = {
        runsDir,
        runId: 'r1',
        repoRoot,
        sessionId: 'sess-1',
        artifacts: [{ name: 'verification-summary.md', path: artifactPath }],
        firedGates: [],
      };
      recordGateEvidence(args);
      fs.writeFileSync(artifactPath, '# v2 with more evidence\n');
      recordGateEvidence(args);

      const record = readRunRecord({ runsDir, runId: 'r1' });
      assert.strictEqual(record.evidence.verification.body, '# v2 with more evidence\n');
      assert.strictEqual(record.events.length, 0);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('recordGateEvidence without any gate artifact writes no run directory', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'harness/data/runs');
      const result = recordGateEvidence({
        runsDir,
        runId: 'r1',
        repoRoot: dir,
        artifacts: [{ name: 'research.md', path: path.join(dir, 'research.md') }],
        firedGates: [],
      });
      assert.deepStrictEqual(result.captured, []);
      assert.ok(!fs.existsSync(path.join(runsDir, 'r1')), 'no gate evidence means no run record');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  // --- recordSessionStart ---------------------------------------------------
  // The resume outcome used to live only in session_events.metadata_json. It
  // moves here so the health detector can read it without SQLite.

  if (test('recordSessionStart appends the resume outcome to the run record', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'harness/data/runs');
      recordSessionStart({
        runsDir,
        runId: '2026-08-20-my-task',
        sessionId: 'sess-1',
        repoRoot: dir,
        branch: 'worktree-my-task',
        resumeExpected: true,
        resumeSuccess: false,
        resumeReason: 'artifacts-missing',
      });
      const record = readRunRecord({ runsDir, runId: '2026-08-20-my-task' });
      assert.strictEqual(record.events.length, 1);
      const event = record.events[0];
      assert.strictEqual(event.type, 'session_started');
      assert.strictEqual(event.resume_expected, true);
      assert.strictEqual(event.resume_success, false);
      assert.strictEqual(event.resume_reason, 'artifacts-missing');
      assert.strictEqual(event.session_id, 'sess-1');
      // meta.json must exist or listRunRecords cannot see the record at all.
      assert.strictEqual(record.branch, 'worktree-my-task');
      assert.deepStrictEqual(record.session_ids, ['sess-1']);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('a fresh worktree with nothing to resume writes no run record', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'harness/data/runs');
      const result = recordSessionStart({
        runsDir,
        runId: '2026-08-20-fresh',
        sessionId: 'sess-1',
        repoRoot: dir,
        branch: 'worktree-fresh',
        resumeExpected: false,
        resumeSuccess: false,
      });
      // Recording every session start would create one git-tracked directory
      // per branch per day whose only content is "there was nothing to resume".
      assert.strictEqual(result.recorded, false);
      assert.ok(!fs.existsSync(path.join(runsDir, '2026-08-20-fresh')));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('a session start on an existing run record is recorded even with nothing to resume', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'harness/data/runs');
      // The task already has evidence, so this is a continuing task and the
      // second session belongs in its history.
      writeRunMeta({ runsDir, runId: '2026-08-20-my-task', fields: { branch: 'worktree-my-task' } });
      const result = recordSessionStart({
        runsDir,
        runId: '2026-08-20-my-task',
        sessionId: 'sess-2',
        repoRoot: dir,
        branch: 'worktree-my-task',
        resumeExpected: false,
        resumeSuccess: true,
      });
      assert.strictEqual(result.recorded, true);
      const record = readRunRecord({ runsDir, runId: '2026-08-20-my-task' });
      assert.strictEqual(record.events.length, 1);
      assert.deepStrictEqual(record.session_ids, ['sess-2']);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('recordSessionStart honours the run-record kill switch', () => {
    const dir = createTempDir();
    try {
      const runsDir = path.join(dir, 'harness/data/runs');
      process.env.CLAUDE_DISABLE_RUN_RECORD = '1';
      const result = recordSessionStart({
        runsDir,
        runId: '2026-08-20-my-task',
        sessionId: 'sess-1',
        repoRoot: dir,
        resumeExpected: true,
        resumeSuccess: false,
      });
      assert.strictEqual(result.recorded, false);
      assert.ok(!fs.existsSync(path.join(runsDir, '2026-08-20-my-task')));
    } finally {
      delete process.env.CLAUDE_DISABLE_RUN_RECORD;
      cleanup(dir);
    }
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
