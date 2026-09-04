/**
 * Tests for scripts/eval-batch.js and scripts/lib/eval-aggregates.js.
 *
 * Run with: node tests/scripts/eval-batch.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const EVAL_BATCH = path.join(ROOT, 'scripts', 'eval-batch.js');
const AGGREGATES = path.join(ROOT, 'scripts', 'lib', 'eval-aggregates.js');

const { aggregateAll, defaultWindow, isoWeekKey } = require(AGGREGATES);
const { main: runEvalBatch } = require(EVAL_BATCH);

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'eval-batch-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function isoOffset(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Every aggregate now reads JSON: the transcripts for tool failures, tokens and
 * turn counts, runs/ for gate evidence and review findings. Both roots must be
 * pointed at fixtures or the assertions depend on the developer's machine.
 */
function seedTranscripts(dir) {
  const transcriptDir = path.join(dir, 'projects');
  const projectDir = path.join(transcriptDir, 'proj-fixture');
  fs.mkdirSync(projectDir, { recursive: true });
  // Inside the window, not on its edge: the window is half-open [start, end)
  // and `end` is "now", so a timestamp of exactly now falls outside.
  const at = isoOffset(1);
  const lines = [];
  const call = (id, name) => JSON.stringify({
    type: 'assistant',
    timestamp: at,
    sessionId: 'sess-1',
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input: {} }] },
  });
  const result = (id, isError) => JSON.stringify({
    type: 'user',
    timestamp: at,
    sessionId: 'sess-1',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isError }] },
  });
  // Bash: 9 ok + 1 real failure. Read: 5 ok.
  for (let i = 0; i < 10; i += 1) {
    lines.push(call(`b${i}`, 'Bash'));
    lines.push(result(`b${i}`, i === 0));
  }
  for (let i = 0; i < 5; i += 1) {
    lines.push(call(`r${i}`, 'Read'));
    lines.push(result(`r${i}`, false));
  }
  // Token usage, and three human turns so the session is flagged as busy.
  lines.push(JSON.stringify({
    type: 'assistant',
    timestamp: at,
    sessionId: 'sess-1',
    message: {
      role: 'assistant',
      model: 'claude-opus-5',
      usage: { input_tokens: 12, output_tokens: 3400, cache_read_input_tokens: 90000 },
      content: [{ type: 'text', text: 'ok' }],
    },
  }));
  for (const text of ['first', 'second', 'third']) {
    lines.push(JSON.stringify({
      type: 'user',
      timestamp: at,
      sessionId: 'sess-1',
      message: { role: 'user', content: [{ type: 'text', text }] },
    }));
  }
  fs.writeFileSync(path.join(projectDir, 'sess-1.jsonl'), `${lines.join('\n')}\n`);
  return transcriptDir;
}

/** An existing but empty transcript directory, for empty-state assertions. */
function emptyTranscripts(dir) {
  const transcriptDir = path.join(dir, 'empty-projects');
  fs.mkdirSync(transcriptDir, { recursive: true });
  return transcriptDir;
}

/**
 * Two run records: one in this window with all three gates, one in the previous
 * window with review findings only.
 */
function seedRuns(dir) {
  const runsDir = path.join(dir, 'runs');

  const write = (runId, startedAt, evidence) => {
    const runDir = path.join(runsDir, runId);
    fs.mkdirSync(path.join(runDir, 'evidence'), { recursive: true });
    fs.writeFileSync(
      path.join(runDir, 'meta.json'),
      `${JSON.stringify({ run_id: runId, started_at: startedAt, repo_root: '/repo', branch: `worktree-${runId}` }, null, 2)}\n`
    );
    for (const [kind, state] of Object.entries(evidence)) {
      fs.writeFileSync(
        path.join(runDir, 'evidence', `${kind}.json`),
        `${JSON.stringify({ kind, captured_at: startedAt, body: '# x\n', state }, null, 2)}\n`
      );
    }
  };

  write('2026-cur-alpha', isoOffset(1), {
    verification: { complete: true },
    review: {
      complete: true,
      parsedFindings: [
        { severity: 'HIGH', message: 'a' },
        { severity: 'HIGH', message: 'b' },
        { severity: 'INFO', message: 'c' },
      ],
    },
    observation: { complete: true },
  });
  write('2026-prev-beta', isoOffset(8), {
    review: { complete: true, parsedFindings: [{ severity: 'CRITICAL', message: 'd' }] },
  });

  return runsDir;
}

function emptyRuns(dir) {
  const runsDir = path.join(dir, 'empty-runs');
  fs.mkdirSync(runsDir, { recursive: true });
  return runsDir;
}

console.log('eval-aggregates + eval-batch');

test('aggregateAll returns expected shape with nothing to read', () => {
  const dir = createTempDir();
  try {
    const report = aggregateAll({
      base: new Date(),
      transcriptDir: emptyTranscripts(dir),
      runsDir: emptyRuns(dir),
    });
    assert.ok(report.week);
    assert.ok(report.window);
    assert.ok(report.previousWindow);
    // Field by field, not deepStrictEqual — histogram has a null prototype by design.
    assert.deepStrictEqual(Object.keys(report.findingsHistogram.current.histogram), []);
    assert.strictEqual(report.findingsHistogram.current.total, 0);
    assert.strictEqual(report.findingsHistogram.current.reviewsRead, 0);
    assert.strictEqual(report.gateCoverage.current.totals.runs, 0);
    assert.strictEqual(report.toolFailureRate.ranked.length, 0);
    assert.strictEqual(report.tokenUsage.totals.records, 0);
    assert.deepStrictEqual(report.highTurnSessions, []);
  } finally {
    cleanup(dir);
  }
});

test('eval-aggregates does not depend on the SQLite layer', () => {
  // The dependency is the contract, and it is checkable. Function.length is
  // not: a parameter with a default does not count toward it, so asserting the
  // arity would have passed no matter what the signature was.
  const source = fs.readFileSync(AGGREGATES, 'utf8');
  assert.ok(!source.includes('session-trace'), 'eval-aggregates must not require session-trace');
  assert.ok(!/\bdb\.prepare\(/.test(source), 'eval-aggregates must not issue SQL');
  const batchSource = fs.readFileSync(EVAL_BATCH, 'utf8');
  assert.ok(!batchSource.includes('session-trace'), 'eval-batch must not require session-trace');
  assert.ok(!batchSource.includes('getTelemetryDbPath'), 'eval-batch must not resolve a db path');
});

test('gateCoverage counts which gates left evidence, replacing the success rate', () => {
  const dir = createTempDir();
  try {
    const report = aggregateAll({
      base: new Date(),
      transcriptDir: emptyTranscripts(dir),
      runsDir: seedRuns(dir),
    });
    const cur = report.gateCoverage.current.totals;
    assert.strictEqual(cur.runs, 1, 'only the in-window run');
    assert.strictEqual(cur.verification, 1);
    assert.strictEqual(cur.review, 1);
    assert.strictEqual(cur.observation, 1);
    assert.strictEqual(report.gateCoverage.previous.totals.runs, 1);
    assert.strictEqual(report.gateCoverage.previous.totals.verification, 0);

    // final_status='completed_clean' became unreachable when plan.md was
    // retired on 2026-08-17: computeFinalStatus returns blocked_before_plan
    // first. One row carried it in the whole history, from 2026-04-17.
    assert.strictEqual(report.successRate, undefined, 'the retired metric must not reappear');
    assert.strictEqual(report.pipelineEvents, undefined, 'pipeline_* was never recorded once');
  } finally {
    cleanup(dir);
  }
});

test('findingsHistogram reads the captured review bodies', () => {
  const dir = createTempDir();
  try {
    const report = aggregateAll({
      base: new Date(),
      transcriptDir: emptyTranscripts(dir),
      runsDir: seedRuns(dir),
    });
    assert.strictEqual(report.findingsHistogram.current.total, 3);
    assert.strictEqual(report.findingsHistogram.current.histogram.HIGH, 2);
    assert.strictEqual(report.findingsHistogram.current.histogram.INFO, 1);
    assert.strictEqual(report.findingsHistogram.current.reviewsRead, 1);
    assert.strictEqual(report.findingsHistogram.previous.histogram.CRITICAL, 1);
  } finally {
    cleanup(dir);
  }
});

test('toolFailureRate reports real transcript errors, not a dangling-start proxy', () => {
  const dir = createTempDir();
  try {
    const report = aggregateAll({
      base: new Date(),
      transcriptDir: seedTranscripts(dir),
      runsDir: emptyRuns(dir),
    });
    const bash = report.toolFailureRate.ranked.find(r => r.tool === 'Bash');
    const read = report.toolFailureRate.ranked.find(r => r.tool === 'Read');
    assert.ok(bash, 'Bash entry missing');
    assert.strictEqual(bash.total, 10);
    assert.strictEqual(bash.failed, 1);
    assert.strictEqual(bash.ok, 9);
    assert.strictEqual(bash.failureRate, 0.1);
    assert.ok(read);
    assert.strictEqual(read.total, 5);
    assert.strictEqual(read.failureRate, 0);
    // The retired proxy field must not reappear.
    assert.strictEqual(bash.danglingStarted, undefined);
  } finally {
    cleanup(dir);
  }
});

test('tokenUsage comes from the transcript, where the numbers actually exist', () => {
  const dir = createTempDir();
  try {
    const report = aggregateAll({
      base: new Date(),
      transcriptDir: seedTranscripts(dir),
      runsDir: emptyRuns(dir),
    });
    assert.strictEqual(report.tokenUsage.totals.records, 1);
    assert.strictEqual(report.tokenUsage.totals.output_tokens, 3400);
    assert.strictEqual(report.tokenUsage.totals.cache_read_input_tokens, 90000);
    assert.strictEqual(report.tokenUsage.ranked[0].model, 'claude-opus-5');
    // SQLite recorded 3,113 of these with input_tokens=null. No cost estimate:
    // unit prices would become a maintained value in the harness.
    assert.strictEqual(report.tokenUsage.totals.estimated_cost_usd, undefined);
  } finally {
    cleanup(dir);
  }
});

test('highTurnSessions surfaces sessions with many human turns', () => {
  const dir = createTempDir();
  try {
    const report = aggregateAll({
      base: new Date(),
      transcriptDir: seedTranscripts(dir),
      runsDir: emptyRuns(dir),
    });
    assert.strictEqual(report.highTurnSessions.length, 1);
    assert.strictEqual(report.highTurnSessions[0].sessionId, 'sess-1');
    assert.strictEqual(report.highTurnSessions[0].turns, 3);
  } finally {
    cleanup(dir);
  }
});

test('defaultWindow and isoWeekKey still export', () => {
  const window = defaultWindow(7);
  assert.ok(window.start < window.end);
  assert.match(isoWeekKey(new Date('2026-08-20T00:00:00.000Z')), /^\d{4}-W\d{2}$/);
});

test('eval-batch CLI writes JSON + MD to output-dir', () => {
  const dir = createTempDir();
  try {
    const outputDir = path.join(dir, 'out');
    const exitCode = runEvalBatch([
      '--output-dir', outputDir,
      '--transcript-dir', seedTranscripts(dir),
      '--runs-dir', seedRuns(dir),
    ]);
    assert.strictEqual(exitCode, 0);
    const week = isoWeekKey(new Date());
    const jsonPath = path.join(outputDir, `eval-weekly-${week}.json`);
    const mdPath = path.join(outputDir, `eval-weekly-${week}.md`);
    assert.ok(fs.existsSync(jsonPath), `${jsonPath} missing`);
    assert.ok(fs.existsSync(mdPath), `${mdPath} missing`);
    const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    assert.strictEqual(json.week, week);
    assert.ok(json.gateCoverage);
    assert.ok(json.findingsHistogram);
    assert.ok(json.toolFailureRate);
    assert.ok(json.tokenUsage);
    const md = fs.readFileSync(mdPath, 'utf8');
    assert.ok(md.includes('Weekly Eval'));
    assert.ok(md.includes('Gate Coverage'));
    assert.ok(md.includes('Token Usage'));
    assert.ok(!md.includes('Success Rate'), 'the retired metric must not reappear in the report');
  } finally {
    cleanup(dir);
  }
});

test('eval-batch CLI honors --week override', () => {
  const dir = createTempDir();
  try {
    const outputDir = path.join(dir, 'out');
    const exitCode = runEvalBatch([
      '--output-dir', outputDir,
      '--week', '2026-W99',
      '--transcript-dir', seedTranscripts(dir),
      '--runs-dir', seedRuns(dir),
    ]);
    assert.strictEqual(exitCode, 0);
    assert.ok(fs.existsSync(path.join(outputDir, 'eval-weekly-2026-W99.json')));
    assert.ok(fs.existsSync(path.join(outputDir, 'eval-weekly-2026-W99.md')));
  } finally {
    cleanup(dir);
  }
});

test('eval-batch CLI does not require a database to exist', () => {
  const dir = createTempDir();
  try {
    const outputDir = path.join(dir, 'out');
    // The old CLI exited 1 with "telemetry.db not found". Nothing it reads is
    // in a database any more, so demanding one would block the report on a
    // dependency it no longer has.
    const exitCode = runEvalBatch([
      '--output-dir', outputDir,
      '--transcript-dir', emptyTranscripts(dir),
      '--runs-dir', emptyRuns(dir),
    ]);
    assert.strictEqual(exitCode, 0);
  } finally {
    cleanup(dir);
  }
});

console.log();
console.log(`Results: Passed: ${passed}, Failed: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
