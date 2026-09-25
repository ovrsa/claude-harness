'use strict';

// Regression for #16. Running #7 through its own Graph, finishing edits after a passed verification
// made `revalidate` use up verify's attempt limit, and the stopped Graph could not be continued.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { prepareGoal } = require('../../scripts/lib/task-goal');
const { taskFingerprint } = require('../../scripts/lib/task-completion');

const script = path.resolve(__dirname, '../../scripts/task-goal.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-limits-'));
const repoDir = path.join(root, 'repo');
fs.mkdirSync(path.join(repoDir, '.claude'), { recursive: true });
spawnSync('git', ['init', '-q', repoDir]);
fs.writeFileSync(path.join(repoDir, '.claude', 'tracker.json'), JSON.stringify({ kind: 'github', repo: 'acme/repo' }));
fs.writeFileSync(path.join(repoDir, 'work.js'), 'module.exports = 0;\n');
spawnSync('git', ['-C', repoDir, 'add', 'work.js', '.claude/tracker.json']);
spawnSync('git', ['-C', repoDir, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'initial']);

const taskInput = { tracker: 'github', branch: 'issue-1', task: { ref: '#1', title: 'limits', body: '## 目的\n上限を試す。\n\n## 受け入れ条件\n- [ ] 検証とレビューを通る。\n\n## 検証方法\n- テストを実行する。\n' } };
const taskFile = path.join(root, 'task.json');
fs.writeFileSync(taskFile, JSON.stringify(taskInput));
const revision = prepareGoal({ task: taskInput.task, repo: repoDir, branch: taskInput.branch }).revision;
const requirements = [`${revision}:AC-1`];
const LIMITS = { max_total_attempts: 6, max_same_cause_failures: 3 };

let passed = 0;
let inputs = 0;
let edits = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
function run(operation, runDir, value, ...extra) {
  const args = [script, 'graph', operation, '--run-dir', runDir, '--repo', repoDir, '--input', taskFile, ...extra];
  if (value !== undefined) {
    const file = path.join(root, `input-${inputs++}.json`);
    fs.writeFileSync(file, JSON.stringify(value));
    args.push('--graph-input', file);
  }
  const env = { ...process.env };
  for (const name of ['CLAUDE_SESSION_ID', 'CLAUDE_CODE_SESSION_ID', 'CODEX_SESSION_ID', 'CODEX_THREAD_ID']) delete env[name];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', env });
  let json = null;
  try { json = JSON.parse(result.stdout); } catch { /* asserted by the caller */ }
  return { ...result, json };
}
function ok(result) { assert.strictEqual(result.status, 0, result.stderr); return result.json; }
function saved(runDir) { return JSON.parse(fs.readFileSync(path.join(runDir, 'graph.json'), 'utf8')); }

/** implement -> verify -> review -> complete, with fix as the failure path of both gates. */
function newRun(name, { verifyMaxAttempts = 2, verifyFailureTo = 'fix', limits = LIMITS } = {}) {
  const runDir = path.join(root, 'runs', name);
  const definition = {
    schema_version: 1, graph_id: 'github:github.com/acme/repo:#1', task_id: 'github:github.com/acme/repo:#1', run_id: name,
    spec: { source: 'https://github.com/acme/repo/issues/1', revision }, limits, requirement_ids: requirements,
    nodes: [
      { id: 'implement', kind: 'implementation', role: 'action', required: true, requirement_ids: requirements, depends_on: [], authority: 'agent', permissions: ['repo:write'], max_attempts: 1, success_when: [{ type: 'event', event_type: 'work_recorded', correlation_id: 'implement' }], success_to: 'verify' },
      { id: 'verify', kind: 'verification', role: 'gate', required: true, requirement_ids: requirements, depends_on: ['implement'], authority: 'agent', permissions: ['repo:read'], max_attempts: verifyMaxAttempts, success_when: [{ type: 'evidence', kind: 'verification', subject: 'task', revision_selector: 'current_subject' }], failure_to: verifyFailureTo, success_to: 'review' },
      { id: 'fix', kind: 'fix', role: 'action', required: false, requirement_ids: requirements, depends_on: ['implement'], authority: 'agent', permissions: ['repo:write'], max_attempts: 3, success_when: [{ type: 'event', event_type: 'work_recorded', correlation_id: 'fix' }], success_to: 'verify' },
      { id: 'review', kind: 'review', role: 'gate', required: true, requirement_ids: requirements, depends_on: ['verify'], authority: 'agent', permissions: ['repo:read'], max_attempts: 1, success_when: [{ type: 'evidence', kind: 'review', subject: 'task', revision_selector: 'current_subject' }], failure_to: 'fix', success_to: 'complete' },
    ],
  };
  ok(run('create', runDir, definition, '--session', 'maker', '--permissions', 'repo:read,repo:write'));
  return runDir;
}
function recordWork(runDir) {
  const next = ok(run('status', runDir)).next;
  const event = { event_id: `work-${inputs}`, type: 'work_recorded', correlation_id: next.node_id, attempt_id: next.attempt_id, actor: { kind: 'agent', id: 'maker' }, occurred_at: '2026-09-25T09:00:00Z', payload: {} };
  ok(run('ingest', runDir, event));
  return ok(run('succeed', runDir, { event }, '--session', 'maker'));
}
function passVerification(runDir) {
  fs.writeFileSync(path.join(repoDir, 'verification-summary.md'), `# Verification ${edits}\n`);
  ok(run('capture', runDir, { kind: 'verification' }, '--session', 'maker'));
  return ok(run('succeed', runDir, { evidence: { kind: 'verification', subject: 'task', subject_revision: taskFingerprint(repoDir) } }, '--session', 'maker'));
}
/** A finishing edit: the artifact changes, so every passed gate is stale. */
function editArtifact() { fs.writeFileSync(path.join(repoDir, 'work.js'), `module.exports = ${++edits};\n`); }
function stopOf(runDir) { return ok(run('status', runDir)).stop; }
function override(stop, eventId, payload = { reason: 'the failures were flaky infrastructure; continue' }, actor = { kind: 'human', id: 'operator' }) {
  return { event_id: eventId, type: 'limit_override', correlation_id: stop.stop_id, attempt_id: stop.attempt_id, actor, occurred_at: '2026-09-25T10:00:00Z', payload };
}

try {
  test('re-running gates after finishing edits does not use up the attempt limits', () => {
    const runDir = newRun('finishing-edits');
    recordWork(runDir);
    assert.strictEqual(passVerification(runDir).next.node_id, 'review');
    // verify allows 2 attempts, review 1 and the Graph 6. Five rounds re-run both gates past all of them.
    for (let round = 1; round <= 5; round++) {
      editArtifact();
      const reopened = ok(run('revalidate', runDir, undefined, '--session', 'maker'));
      assert.strictEqual(reopened.state, 'active', `round ${round} stopped the graph`);
      assert.strictEqual(reopened.next.node_id, 'verify');
      const verified = passVerification(runDir);
      assert.strictEqual(verified.state, 'active', `round ${round} stopped before re-running review`);
      assert.strictEqual(verified.next.node_id, 'review');
    }
    const graph = saved(runDir);
    assert.strictEqual(graph.attempts.length, 13);
    const reruns = graph.attempts.filter(attempt => attempt.started_by === 'revalidate');
    assert.deepStrictEqual(reruns.map(attempt => attempt.node_id), ['verify', 'review', 'verify', 'review', 'verify', 'review', 'verify', 'review', 'verify', 'review']);
  });

  test('a failed re-run counts, so real verification failures still stop at the limit', () => {
    const runDir = newRun('real-failures', { limits: { ...LIMITS, max_total_attempts: 20 } });
    recordWork(runDir);
    ok(run('fail', runDir, { cause: 'tests_failed' }, '--session', 'maker'));
    recordWork(runDir);
    passVerification(runDir);
    editArtifact();
    ok(run('revalidate', runDir, undefined, '--session', 'maker'));
    // The re-run itself is allowed, but it fails: verify now has two counted failures and one pass.
    ok(run('fail', runDir, { cause: 'tests_failed' }, '--session', 'maker'));
    const stopped = recordWork(runDir);
    assert.strictEqual(stopped.state, 'stopped');
    assert.strictEqual(stopped.next, null);
    assert.strictEqual(stopped.stop.reason, 'max_attempts');
    assert.strictEqual(stopped.stop.node_id, 'verify');
  });

  test('the same failure cause still stops the graph, and a decision starts the count again', () => {
    const runDir = newRun('same-cause', { verifyMaxAttempts: 5 });
    recordWork(runDir);
    for (let round = 1; round <= 3; round++) {
      const failed = ok(run('fail', runDir, { cause: 'lint_failed' }, '--session', 'maker'));
      if (round < 3) { assert.strictEqual(failed.next.node_id, 'fix'); recordWork(runDir); continue; }
      assert.strictEqual(failed.state, 'stopped');
      assert.strictEqual(failed.stop.reason, 'max_same_cause_failures');
      assert.strictEqual(failed.stop.node_id, 'fix');
    }
    const decision = override(stopOf(runDir), 'same-cause-decision');
    ok(run('ingest', runDir, decision));
    assert.strictEqual(ok(run('resume', runDir, decision, '--session', 'operator-session')).next.node_id, 'fix');
    recordWork(runDir);
    // Counted from before the decision, this would be the third lint failure in a row again.
    assert.strictEqual(ok(run('fail', runDir, { cause: 'lint_failed' }, '--session', 'maker')).next.node_id, 'fix');
  });

  test("a person's recorded decision resumes a graph stopped by a limit and keeps every attempt", () => {
    const runDir = newRun('override');
    recordWork(runDir);
    for (let round = 1; round <= 2; round++) {
      ok(run('fail', runDir, { cause: `tests_failed_${round}` }, '--session', 'maker'));
      recordWork(runDir);
    }
    const stop = stopOf(runDir);
    assert.strictEqual(stop.reason, 'max_attempts');
    const attemptsBefore = saved(runDir).attempts.length;
    // The runtime asks ingest first; nothing but a complete human decision is stored or wakes anyone.
    const fromAgent = run('ingest', runDir, override(stop, 'agent-override', undefined, { kind: 'agent', id: 'maker' }));
    assert.strictEqual(fromAgent.status, 4); assert.strictEqual(fromAgent.json.wake, false);
    const noReason = run('ingest', runDir, override(stop, 'no-reason', { reason: ' ' }));
    assert.strictEqual(noReason.status, 4); assert.match(noReason.json.reason, /reason/);
    const wrongStop = run('ingest', runDir, { ...override(stop, 'wrong-stop'), correlation_id: 'another-stop' });
    assert.strictEqual(wrongStop.status, 4);
    assert.notStrictEqual(run('resume', runDir, override(stop, 'not-ingested'), '--session', 'operator-session').status, 0);

    const decision = override(stop, 'decision-1');
    assert.strictEqual(ok(run('ingest', runDir, decision)).wake, true);
    const resumed = ok(run('resume', runDir, decision, '--session', 'operator-session'));
    assert.strictEqual(resumed.state, 'active');
    assert.strictEqual(resumed.stop, null);
    assert.strictEqual(resumed.next.node_id, 'verify');
    assert.notStrictEqual(run('resume', runDir, decision, '--session', 'operator-session').status, 0, 'a decision is used once');

    const graph = saved(runDir);
    assert.strictEqual(graph.attempts.length, attemptsBefore + 1, 'earlier attempts stay in the record');
    assert.deepStrictEqual(graph.limit_overrides.map(item => ({ event_id: item.event_id, reason: item.reason, stop: item.stop.stop_id })), [{ event_id: 'decision-1', reason: decision.payload.reason, stop: stop.stop_id }]);
    assert.match(fs.readFileSync(path.join(runDir, 'logs', 'events.ndjson'), 'utf8'), /"event_id":"decision-1"/);
    // Limits count again from the decision: verify gets its two attempts back.
    ok(run('fail', runDir, { cause: 'tests_failed' }, '--session', 'maker'));
    assert.strictEqual(recordWork(runDir).next.node_id, 'verify');
  });

  test('a graph stopped by its own transition, not by a limit, cannot be overridden', () => {
    const runDir = newRun('explicit-stop', { verifyFailureTo: 'stop' });
    recordWork(runDir);
    const stopped = ok(run('fail', runDir, { cause: 'tests_failed' }, '--session', 'maker'));
    assert.strictEqual(stopped.state, 'stopped');
    assert.strictEqual(stopped.stop, null);
    const attempt = saved(runDir).attempts.at(-1);
    const held = run('ingest', runDir, { event_id: 'late', type: 'limit_override', correlation_id: 'none', attempt_id: attempt.attempt_id, actor: { kind: 'human', id: 'operator' }, occurred_at: '2026-09-25T10:00:00Z', payload: { reason: 'continue' } });
    assert.strictEqual(held.status, 4); assert.match(held.json.reason, /not stopped by a limit/);
  });
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log(`Results: Passed: ${passed}, Failed: 0`);
