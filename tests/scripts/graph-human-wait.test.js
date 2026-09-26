'use strict';

// Regression for #7. A Graph that waits for a person must not wake the runtime until a valid
// answer arrives. The runtime here is a fake: before it starts an LLM session it asks
// `task-goal.js graph ingest`, and it counts the sessions it starts. No real time passes.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { prepareGoal } = require('../../scripts/lib/task-goal');

const script = path.resolve(__dirname, '../../scripts/task-goal.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-human-wait-'));
const repoDir = path.join(root, 'repo');
fs.mkdirSync(path.join(repoDir, '.claude'), { recursive: true });
spawnSync('git', ['init', '-q', repoDir]);
fs.writeFileSync(path.join(repoDir, '.claude', 'tracker.json'), JSON.stringify({ kind: 'github', repo: 'acme/repo' }));
fs.writeFileSync(path.join(repoDir, 'work.js'), 'module.exports = 1;\n');
spawnSync('git', ['-C', repoDir, 'add', 'work.js', '.claude/tracker.json']);
spawnSync('git', ['-C', repoDir, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'initial']);

const taskInput = { tracker: 'github', branch: 'issue-1', task: { ref: '#1', title: 'spike', body: '## 目的\n人の承認を待つ。\n\n## 受け入れ条件\n- [ ] 承認後に続ける。\n\n## 検証方法\n- テストを実行する。\n\n## Graph\n- 型: 個別（理由: テストが定義の JSON を渡す）\n' } };
const taskFile = path.join(root, 'task.json');
fs.writeFileSync(taskFile, JSON.stringify(taskInput));
const revision = prepareGoal({ task: taskInput.task, repo: repoDir, branch: taskInput.branch }).revision;
const requirements = [`${revision}:AC-1`];
const WAIT = {
  wait_id: 'approve-spike',
  reason: 'human_decision',
  question: 'Runtime Spike の結果で進めてよいか',
  allowed_actors: [{ kind: 'human', id: 'operator' }],
  resume_on: [{ type: 'human_answer', correlation_id: 'approve-spike', required_fields: ['choice'] }],
  resume_mode: 'continue_attempt',
};

let passed = 0;
let inputs = 0;
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

/** A Run whose only node has started and is waiting for the operator's approval. */
function pausedRun(name, wait = WAIT) {
  const runDir = path.join(root, 'runs', name);
  const definition = {
    schema_version: 1, graph_id: 'github:github.com/acme/repo:#1', task_id: 'github:github.com/acme/repo:#1', run_id: name,
    spec: { source: 'https://github.com/acme/repo/issues/1', revision },
    limits: { max_total_attempts: 4, max_same_cause_failures: 3 }, requirement_ids: requirements,
    nodes: [{ id: 'implement', kind: 'implementation', role: 'action', required: true, requirement_ids: requirements, depends_on: [], authority: 'agent', permissions: ['repo:write'], max_attempts: 1, success_when: [{ type: 'event', event_type: 'work_recorded', correlation_id: 'implement' }], success_to: 'complete' }],
  };
  const created = run('create', runDir, definition, '--session', 'session-0', '--permissions', 'repo:write');
  assert.strictEqual(created.status, 0, created.stderr);
  const waited = run('wait', runDir, wait, '--session', 'session-0');
  assert.strictEqual(waited.status, 0, waited.stderr);
  return { runDir, attemptId: created.json.next.attempt_id };
}

function answer(attemptId, eventId, payload = { choice: 'go' }) {
  return { event_id: eventId, type: 'human_answer', correlation_id: WAIT.wait_id, attempt_id: attemptId, actor: { kind: 'human', id: 'operator' }, occurred_at: '2026-09-18T09:00:00Z', payload };
}

/** The only rule a runtime needs: start a session when ingest answers wake, and never otherwise. */
function ingestSaysWake(runDir, event) {
  const result = run('ingest', runDir, event);
  return { wake: result.status === 0 && result.json?.wake === true, status: result.status };
}

/** Stands in for any runtime. Each session it starts resumes with the event it was started for. */
function fakeRuntime(runDir, shouldWake = ingestSaysWake) {
  const started = [];
  const replies = [];
  return {
    started,
    replies,
    deliver(event) {
      const reply = shouldWake(runDir, event);
      replies.push(reply);
      if (reply.wake) started.push(event);
    },
    runStarted() { return started.map((event, i) => run('resume', runDir, event, '--session', `session-${i + 1}`)); },
  };
}

const loop = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/graph-human-wait/notification-loop.json'), 'utf8'));

/** Eight hours of the loop on a virtual clock: the events carry their times and nothing sleeps. */
function eightHours(attemptId) {
  const start = Date.parse('2026-09-18T02:13:00+09:00');
  const events = [];
  for (let minute = 0; minute < 8 * 60; minute += loop.interval_minutes) {
    for (const { type } of loop.cycle) {
      events.push({ event_id: `${type}-${minute}`, type, correlation_id: WAIT.wait_id, attempt_id: attemptId, actor: { kind: 'system', id: 'runtime' }, occurred_at: new Date(start + minute * 60000).toISOString(), payload: {} });
    }
  }
  return events;
}

function eventLog(runDir) { return fs.readFileSync(path.join(runDir, 'logs', 'events.ndjson'), 'utf8'); }
function snapshot(runDir) { return { revision: run('status', runDir).json.revision, log: eventLog(runDir) }; }

/** What must stay the same while nobody answers: no session, no transition, nothing new stored. */
function assertStillPaused(runDir, runtime, before) {
  assert.strictEqual(runtime.started.length, 0, `${runtime.started.length} sessions started without an answer`);
  const status = run('status', runDir).json;
  assert.strictEqual(status.state, 'waiting');
  assert.strictEqual(status.revision, before.revision);
  assert.strictEqual(eventLog(runDir), before.log);
}

try {
  test('a valid answer starts one session, which resumes the paused attempt', () => {
    const { runDir, attemptId } = pausedRun('valid-answer');
    const runtime = fakeRuntime(runDir);
    runtime.deliver(answer(attemptId, 'answer-1'));
    assert.strictEqual(runtime.started.length, 1);
    const [resumed] = runtime.runStarted();
    assert.strictEqual(resumed.status, 0, resumed.stderr);
    assert.strictEqual(resumed.json.state, 'active');
    assert.strictEqual(resumed.json.next.attempt_id, attemptId);
  });

  test('an answer without the required choice keeps the pause and starts nothing', () => {
    const { runDir, attemptId } = pausedRun('incomplete-answer');
    const runtime = fakeRuntime(runDir);
    runtime.deliver(answer(attemptId, 'answer-empty', {}));
    runtime.deliver(answer(attemptId, 'answer-blank', { choice: '' }));
    assert.strictEqual(runtime.started.length, 0);
    assert.strictEqual(run('status', runDir).json.state, 'waiting');
  });

  test('repeated, second and stale answers never start a second session', () => {
    const { runDir, attemptId } = pausedRun('duplicate-answers');
    const runtime = fakeRuntime(runDir);
    const first = answer(attemptId, 'answer-1');
    runtime.deliver(answer('attempt-of-an-earlier-run', 'answer-stale'));
    runtime.deliver(first);
    runtime.deliver(first);
    runtime.deliver(answer(attemptId, 'answer-2'));
    assert.strictEqual(runtime.started.length, 1);
    assert.deepStrictEqual(runtime.started.map(event => event.event_id), ['answer-1']);
    const [resumed] = runtime.runStarted();
    assert.strictEqual(resumed.status, 0, resumed.stderr);
    runtime.deliver(answer(attemptId, 'answer-after-resume'));
    runtime.deliver({ event_id: 'work-1', type: 'work_recorded', correlation_id: 'implement', attempt_id: attemptId, actor: { kind: 'agent', id: 'session-1' }, occurred_at: '2026-09-18T09:05:00Z', payload: {} });
    assert.strictEqual(runtime.started.length, 1, 'events of the running session never start another');
    const graph = JSON.parse(fs.readFileSync(path.join(runDir, 'graph.json'), 'utf8'));
    assert.strictEqual(graph.attempts.length, 1, 'the paused attempt continues; no second attempt runs');
  });

  test('eight hours of the notification loop start no session and leave the pause untouched', () => {
    const { runDir, attemptId } = pausedRun('notification-loop');
    const before = snapshot(runDir);
    const runtime = fakeRuntime(runDir);
    for (const event of eightHours(attemptId)) runtime.deliver(event);
    assert.ok(runtime.replies.every(reply => reply.status === 4), 'each notification is held, not treated as an error');
    assertStillPaused(runDir, runtime, before);
    runtime.deliver(answer(attemptId, 'answer-after-eight-hours'));
    assert.strictEqual(runtime.started.length, 1);
  });

  test('the same check fails for a runtime that wakes on every notification, as the observed loop did', () => {
    const { runDir, attemptId } = pausedRun('wake-on-notification');
    const before = snapshot(runDir);
    const runtime = fakeRuntime(runDir, () => ({ wake: true }));
    for (const event of eightHours(attemptId)) runtime.deliver(event);
    assert.throws(() => assertStillPaused(runDir, runtime, before), /sessions started without an answer/);
  });

  test('a resume event of another kind, or an answer from someone other than the operator, does not stand in for the answer', () => {
    const { runDir, attemptId } = pausedRun('other-kind');
    const runtime = fakeRuntime(runDir);
    runtime.deliver({ ...answer(attemptId, 'granted'), type: 'permission_granted' });
    runtime.deliver({ ...answer(attemptId, 'self-answer'), actor: { kind: 'agent', id: 'worker' } });
    assert.strictEqual(runtime.started.length, 0);
    assert.strictEqual(run('status', runDir).json.state, 'waiting');
  });

  test('a new session reads back the question, its evidence and what resumes it without the conversation', () => {
    const evidence = ['spike-report.md', 'commit 1234abc'];
    const { runDir, attemptId } = pausedRun('restore', { ...WAIT, evidence });
    const status = run('status', runDir, undefined, '--session', 'session-later').json;
    assert.strictEqual(status.state, 'waiting');
    assert.strictEqual(status.next, null);
    assert.strictEqual(status.wait.question, WAIT.question);
    assert.deepStrictEqual(status.wait.evidence, evidence);
    assert.deepStrictEqual(status.wait.resume_on, WAIT.resume_on);
    assert.strictEqual(status.wait.attempt_id, attemptId);
  });
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log(`Results: Passed: ${passed}, Failed: 0`);
