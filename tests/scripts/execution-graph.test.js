'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { prepareGoal } = require('../../scripts/lib/task-goal');
const { writeFinishingEvidence } = require('../fixtures/task-finishing');

const script = path.resolve(__dirname, '../../scripts/task-goal.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'execution-graph-'));
const runDir = path.join(root, 'runs', 'run-1');
const repoDir = path.join(root, 'repo'); fs.mkdirSync(repoDir); spawnSync('git', ['init', '-q', repoDir]);
fs.mkdirSync(path.join(repoDir, '.claude'));
fs.writeFileSync(path.join(repoDir, '.claude', 'tracker.json'), JSON.stringify({ kind: 'github', repo: 'acme/repo' }));
fs.writeFileSync(path.join(repoDir, 'work.js'), 'module.exports = 1;\n');
spawnSync('git', ['-C', repoDir, 'add', 'work.js', '.claude/tracker.json']); spawnSync('git', ['-C', repoDir, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'initial']);
fs.appendFileSync(path.join(repoDir, 'work.js'), '// change\n');
const taskInput = { tracker: 'github', branch: 'issue-1', task: { ref: '#1', title: 'graph task', body: '## 目的\nGraphを試す。\n\n## 受け入れ条件\n- [ ] Graphで完了する。\n\n## 検証方法\n- テストを実行する。\n' } };
const taskFile = jsonFileLater('task.json', taskInput);
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
function jsonFileLater(name, value) { const file = path.join(root, name); fs.writeFileSync(file, JSON.stringify(value)); return file; }
function jsonFile(name, value) { return jsonFileLater(name, value); }
function run(operation, value, ...extra) { return runInSession({}, operation, value, ...extra); }
// runtimeEnv replaces every runtime session variable, including the ones of the session running the tests.
function runInSession(runtimeEnv, operation, value, ...extra) {
  const args = [script, 'graph', operation, '--run-dir', runDir, '--repo', repoDir, '--input', taskFile, ...extra];
  if (value !== undefined) args.push('--graph-input', jsonFile(`${operation}-${Date.now()}-${Math.random()}.json`, value));
  const env = { ...process.env };
  for (const name of ['CLAUDE_SESSION_ID', 'CLAUDE_CODE_SESSION_ID', 'CODEX_SESSION_ID', 'CODEX_THREAD_ID']) delete env[name];
  Object.assign(env, runtimeEnv);
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', env });
  let json; try { json = JSON.parse(result.stdout); } catch { json = null; }
  return { ...result, json };
}
function appendEvent(dir, event) { fs.mkdirSync(path.join(dir, 'logs'), { recursive: true }); fs.appendFileSync(path.join(dir, 'logs', 'events.ndjson'), `${JSON.stringify(event)}\n`); }
function currentAttempt(dir) { const graph = JSON.parse(fs.readFileSync(path.join(dir, 'graph.json'))); return graph.attempts.at(-1).attempt_id; }
function evidence(dir, kind, body) {
  fs.writeFileSync(path.join(repoDir, `${kind}-summary.md`), body);
  const captured = run('capture', { kind }, '--run-dir', dir);
  assert.strictEqual(captured.status, 0, captured.stderr);
}
const rev = prepareGoal({ task: taskInput.task, repo: repoDir, branch: taskInput.branch }).revision;
const requirements = [`${rev}:AC-1`];
const definition = {
  schema_version: 1, graph_id: 'github:github.com/acme/repo:#1', task_id: 'github:github.com/acme/repo:#1', run_id: 'run-1',
  spec: { source: 'https://github.com/acme/repo/issues/1', revision: rev },
  limits: { max_total_attempts: 8, max_same_cause_failures: 3 }, requirement_ids: requirements,
  nodes: [
    { id: 'implement', kind: 'implementation', role: 'action', required: true, requirement_ids: requirements, depends_on: [], authority: 'agent', permissions: ['repo:write'], max_attempts: 1, success_when: [{ type: 'event', event_type: 'work_recorded', correlation_id: 'implement' }], success_to: 'verify' },
    { id: 'verify', kind: 'verification', role: 'gate', required: true, requirement_ids: requirements, depends_on: ['implement'], authority: 'agent', permissions: ['repo:read'], max_attempts: 3, success_when: [{ type: 'evidence', kind: 'verification', subject: 'task', revision_selector: 'current_subject' }], failure_to: 'fix', success_to: 'review' },
    { id: 'fix', kind: 'fix', role: 'action', required: false, requirement_ids: requirements, depends_on: ['implement'], authority: 'agent', permissions: ['repo:write'], max_attempts: 1, success_when: [{ type: 'event', event_type: 'work_recorded', correlation_id: 'fix' }], success_to: 'verify' },
    { id: 'review', kind: 'review', role: 'gate', required: true, requirement_ids: requirements, depends_on: ['verify'], authority: 'agent', permissions: ['repo:read'], max_attempts: 1, success_when: [{ type: 'evidence', kind: 'review', subject: 'task', revision_selector: 'current_subject' }], success_to: 'complete', failure_to: 'fix' },
  ],
};

try {
  test('creates a validated graph and starts by returning the node instruction', () => {
    const created = run('create', definition, '--repo', repoDir, '--input', taskFile, '--session', 's-impl', '--permissions', 'repo:read,repo:write');
    assert.strictEqual(created.status, 0, created.stderr); assert.strictEqual(created.json.next.node_id, 'implement');
    assert.ok(fs.existsSync(path.join(runDir, 'graph.json')));
    const resumed = run('status', undefined, '--session', 's-new');
    assert.strictEqual(resumed.status, 0, resumed.stderr);
    assert.strictEqual(resumed.json.next.attempt_id, created.json.next.attempt_id);
    const premature = run('revalidate', undefined, '--session', 's-new');
    assert.notStrictEqual(premature.status, 0);
    assert.match(premature.stderr, /active action/);
  });
  test('requires evidence, loops through repair, rejects same-session review, then completes with task result', () => {
    const implEvent = { event_id: 'e1', type: 'work_recorded', correlation_id: 'implement', attempt_id: currentAttempt(runDir), actor: { kind: 'agent', id: 'a' }, occurred_at: new Date().toISOString(), payload: {} };
    appendEvent(runDir, implEvent);
    let r = run('succeed', { event: implEvent }, '--session', 's-impl');
    assert.strictEqual(r.status, 0, r.stderr); assert.strictEqual(r.json.next.node_id, 'verify');
    r = run('succeed', { subject_fingerprint: 'fp1' }, '--session', 's-impl'); assert.notStrictEqual(r.status, 0); assert.match(r.stderr, /evidence/i);
    r = run('fail', { cause: 'tests_failed' }, '--session', 's-impl'); assert.strictEqual(r.json.next.node_id, 'fix');
    const fixEvent = { event_id: 'e2', type: 'work_recorded', correlation_id: 'fix', attempt_id: currentAttempt(runDir), actor: { kind: 'agent', id: 'a' }, occurred_at: new Date().toISOString(), payload: {} };
    appendEvent(runDir, fixEvent);
    r = run('succeed', { event: fixEvent }, '--session', 's-impl'); assert.strictEqual(r.json.next.node_id, 'verify');
    writeFinishingEvidence(repoDir);
    const fp = require('../../scripts/lib/task-completion').taskFingerprint(repoDir);
    evidence(runDir, 'verification', fs.readFileSync(path.join(repoDir, 'verification-summary.md'), 'utf8'));
    r = run('succeed', { evidence: { kind: 'verification', subject: 'task', subject_revision: fp } }, '--session', 's-impl'); assert.strictEqual(r.json.next.node_id, 'review');
    const actualFp = require('../../scripts/lib/task-completion').taskFingerprint(repoDir);
    evidence(runDir, 'review', fs.readFileSync(path.join(repoDir, 'review-summary.md'), 'utf8'));
    r = run('succeed', { evidence: { kind: 'review', subject: 'task', subject_revision: actualFp } }, '--session', 's-impl'); assert.notStrictEqual(r.status, 0); assert.match(r.stderr, /separate|別/);
    r = run('succeed', { evidence: { kind: 'review', subject: 'task', subject_revision: actualFp } }, '--repo', repoDir, '--session', 's-review'); assert.strictEqual(r.status, 0, r.stderr); assert.strictEqual(r.json.state, 'completed');
    const { recordGateEvidence } = require('../../scripts/lib/run-record');
    recordGateEvidence({ runsDir: path.dirname(runDir), runId: path.basename(runDir), repoRoot: repoDir, branch: 'issue-1', artifacts: [
      { name: 'verification-summary.md', path: path.join(repoDir, 'verification-summary.md') },
      { name: 'review-summary.md', path: path.join(repoDir, 'review-summary.md') },
    ] });
    const afterSnapshot = run('status');
    assert.strictEqual(afterSnapshot.status, 0, afterSnapshot.stderr);
    assert.strictEqual(afterSnapshot.json.state, 'completed');
    const originalWork = fs.readFileSync(path.join(repoDir, 'work.js'), 'utf8');
    fs.appendFileSync(path.join(repoDir, 'work.js'), '// changed after completion\n');
    const stale = run('status');
    assert.notStrictEqual(stale.status, 0, 'a completed graph must not remain valid after its subject changes');
    assert.match(stale.stderr, /stale|fingerprint|再検証/i);
    const reopened = run('revalidate', undefined, '--session', 's-new');
    assert.strictEqual(reopened.status, 0, reopened.stderr);
    assert.strictEqual(reopened.json.state, 'active');
    assert.strictEqual(reopened.json.next.node_id, 'verify');
    fs.writeFileSync(path.join(repoDir, 'work.js'), originalWork);
  });
  test('waits durably and resumes once only for a complete allowed answer', () => {
    const other = path.join(root, 'runs', 'wait-run');
    const d = JSON.parse(JSON.stringify(definition)); d.run_id = 'wait-run';
    d.nodes = [{ id: 'decide', kind: 'question', role: 'action', required: true, requirement_ids: requirements, depends_on: [], authority: 'human', permissions: [], max_attempts: 1, success_when: [{ type: 'event', event_type: 'human_answer', correlation_id: 'w1' }], success_to: 'complete' }];
    let r = run('create', d, '--run-dir', other, '--repo', repoDir, '--input', taskFile, '--session', 's1'); // last --run-dir wins
    assert.strictEqual(r.status, 0, r.stderr);
    const wait = { wait_id: 'w1', reason: 'human_decision', question: 'choose', allowed_actors: [{ kind: 'human', id: 'operator' }], resume_on: [{ type: 'human_answer', correlation_id: 'w1', required_fields: ['choice'] }], resume_mode: 'continue_attempt' };
    assert.notStrictEqual(run('wait', { ...wait, allowed_actors: [] }, '--run-dir', other).status, 0);
    assert.notStrictEqual(run('wait', { ...wait, resume_on: [] }, '--run-dir', other).status, 0);
    r = run('wait', wait, '--run-dir', other); assert.strictEqual(r.status, 0, r.stderr); assert.strictEqual(r.json.state, 'waiting');
    r = run('status', undefined, '--run-dir', other, '--session', 's2'); assert.strictEqual(r.json.wait.question, 'choose'); assert.strictEqual(r.json.next, null);
    const base = { event_id: 'answer-1', type: 'human_answer', correlation_id: 'w1', attempt_id: currentAttempt(other), actor: { kind: 'human', id: 'operator' }, occurred_at: new Date().toISOString(), payload: {} };
    r = run('resume', base, '--run-dir', other, '--session', 's2'); assert.notStrictEqual(r.status, 0);
    r = run('ingest', base, '--run-dir', other);
    assert.strictEqual(r.status, 4, r.stderr); assert.strictEqual(r.json.wake, false); assert.match(r.json.reason, /required field/);
    r = run('resume', base, '--run-dir', other, '--session', 's2'); assert.notStrictEqual(r.status, 0); assert.match(r.stderr, /not persisted/);
    const answer = { ...base, event_id: 'answer-2', payload: { choice: 'A' } };
    assert.strictEqual(run('ingest', answer, '--run-dir', other).status, 0);
    r = run('resume', answer, '--run-dir', other, '--session', 's2'); assert.strictEqual(r.status, 0, r.stderr);
    r = run('resume', answer, '--run-dir', other, '--session', 's3'); assert.notStrictEqual(r.status, 0);
    r = run('succeed', { event: answer }, '--run-dir', other, '--session', 's2');
    assert.strictEqual(r.status, 0, r.stderr); assert.strictEqual(r.json.state, 'completed');
    const actorRun = path.join(root, 'runs', 'human-actor-run');
    const actorDefinition = { ...d, run_id: 'human-actor-run' };
    assert.strictEqual(run('create', actorDefinition, '--run-dir', actorRun, '--session', 's1').status, 0);
    const wrongActor = { ...answer, event_id: 'agent-answer', attempt_id: currentAttempt(actorRun), actor: { kind: 'agent', id: 'a' } };
    r = run('ingest', wrongActor, '--run-dir', actorRun);
    assert.notStrictEqual(r.status, 0, 'an agent cannot confirm a human-authority node');
    assert.match(r.stderr, /authority/);
  });
  test('rejects forged or stale state and unsafe Run paths', () => {
    const other = path.join(root, 'runs', 'adversarial');
    const d = JSON.parse(JSON.stringify(definition)); d.run_id = 'adversarial';
    const wrongRepo = { ...d, graph_id: 'github:github.com/other/repo:#1', task_id: 'github:github.com/other/repo:#1', run_id: 'wrong-repo' };
    const wrong = run('create', wrongRepo, '--run-dir', path.join(root, 'runs', 'wrong-repo'), '--session', 's1', '--permissions', 'repo:read,repo:write');
    assert.notStrictEqual(wrong.status, 0, 'task identity must come from the declared tracker repository');
    assert.match(wrong.stderr, /repository identity/);
    let r = run('create', d, '--run-dir', other, '--session', 's1', '--permissions', 'repo:read,repo:write');
    assert.strictEqual(r.status, 0, r.stderr);
    const otherBranch = { ...taskInput, branch: 'unrelated-branch' };
    r = run('status', undefined, '--run-dir', other, '--input', jsonFile('wrong-branch-task.json', otherBranch));
    assert.notStrictEqual(r.status, 0, 'a Run must not resume on a different branch');
    assert.match(r.stderr, /branch/);
    r = run('succeed', { event: { event_id: 'forged', type: 'work_recorded', correlation_id: 'implement', attempt_id: currentAttempt(other) } }, '--run-dir', other, '--session', 's1');
    assert.notStrictEqual(r.status, 0); assert.match(r.stderr, /persisted/);
    const fake = { event_id: 'e-adv', type: 'work_recorded', correlation_id: 'implement', attempt_id: currentAttempt(other), actor: { kind: 'agent', id: 'a' }, occurred_at: new Date().toISOString(), payload: {} };
    assert.strictEqual(run('ingest', fake, '--run-dir', other).status, 0);
    assert.notStrictEqual(run('ingest', fake, '--run-dir', other).status, 0);
    const altered = { ...fake, actor: { kind: 'agent', id: 'impostor' }, payload: { result: 'different' } };
    r = run('succeed', { event: altered }, '--run-dir', other, '--session', 's1');
    assert.notStrictEqual(r.status, 0, 'event data must match the persisted envelope');
    assert.match(r.stderr, /persisted/);
    assert.strictEqual(run('succeed', { event: fake }, '--run-dir', other, '--session', 's1').status, 0);
    r = run('succeed', { evidence: { kind: 'verification', subject: 'task', subject_revision: require('../../scripts/lib/task-completion').taskFingerprint(repoDir) } }, '--run-dir', other, '--session', 's1');
    assert.notStrictEqual(r.status, 0); assert.match(r.stderr, /evidence/);
    evidence(other, 'verification', fs.readFileSync(path.join(repoDir, 'verification-summary.md'), 'utf8'));
    r = run('succeed', { evidence: { kind: 'verification', subject: 'task', subject_revision: require('../../scripts/lib/task-completion').taskFingerprint(repoDir) } }, '--run-dir', other, '--session', 's1');
    assert.strictEqual(r.status, 0, r.stderr);
    const originalWork = fs.readFileSync(path.join(repoDir, 'work.js'), 'utf8');
    fs.appendFileSync(path.join(repoDir, 'work.js'), '// stale before review\n');
    r = run('status', undefined, '--run-dir', other);
    assert.notStrictEqual(r.status, 0, 'stale verification must not allow a resumed review to start');
    assert.match(r.stderr, /stale/);
    r = run('revalidate', undefined, '--run-dir', other, '--session', 's2');
    assert.strictEqual(r.status, 0, r.stderr); assert.strictEqual(r.json.next.node_id, 'verify');
    fs.writeFileSync(path.join(repoDir, 'work.js'), originalWork);
    const edited = JSON.parse(JSON.stringify(taskInput)); edited.task.body = edited.task.body.replace('Graphで完了', 'Graphで停止');
    const editedFile = jsonFile('changed-task.json', edited);
    r = run('status', undefined, '--run-dir', other, '--input', editedFile); assert.notStrictEqual(r.status, 0); assert.match(r.stderr, /SPEC_CHANGED/);
    const outside = path.join(root, 'outside'); fs.mkdirSync(outside);
    const link = path.join(root, 'runs', 'link'); fs.symlinkSync(outside, link);
    r = run('create', { ...d, run_id: 'link' }, '--run-dir', link, '--session', 's1', '--permissions', 'repo:read,repo:write');
    assert.notStrictEqual(r.status, 0); assert.ok(!fs.existsSync(path.join(outside, 'graph.json')));
    const parentLink = path.join(root, 'linked-runs'); fs.symlinkSync(path.join(root, 'runs'), parentLink);
    r = run('create', { ...d, run_id: 'through-parent' }, '--run-dir', path.join(parentLink, 'through-parent'), '--session', 's1', '--permissions', 'repo:read,repo:write');
    assert.notStrictEqual(r.status, 0); assert.ok(!fs.existsSync(path.join(root, 'runs', 'through-parent', 'graph.json')));
    const logLinkRun = path.join(root, 'runs', 'log-link'); fs.mkdirSync(logLinkRun);
    fs.symlinkSync(outside, path.join(logLinkRun, 'logs'));
    r = run('create', { ...d, run_id: 'log-link' }, '--run-dir', logLinkRun, '--session', 's1', '--permissions', 'repo:read,repo:write');
    assert.notStrictEqual(r.status, 0); assert.ok(!fs.existsSync(path.join(outside, 'events.ndjson')));
  });
  test('accepted spec change starts a fresh definition and invalidates old attempts', () => {
    const other = path.join(root, 'runs', 'revision-run');
    const d = JSON.parse(JSON.stringify(definition)); d.run_id = 'revision-run';
    assert.strictEqual(run('create', d, '--run-dir', other, '--session', 's1', '--permissions', 'repo:read,repo:write').status, 0);
    const wait = { wait_id: 'w-change', reason: 'specification', question: 'accept revision?', allowed_actors: [{ kind: 'human', id: 'operator' }], resume_on: [{ type: 'spec_change_accepted', correlation_id: 'w-change', required_fields: ['revision'] }], resume_mode: 'new_attempt' };
    assert.strictEqual(run('wait', wait, '--run-dir', other).status, 0);
    const edited = JSON.parse(JSON.stringify(taskInput)); edited.task.body = edited.task.body.replace('Graphで完了', 'Graphで新仕様を完了');
    const editedFile = jsonFile('accepted-task.json', edited);
    const newRev = prepareGoal({ task: edited.task, repo: repoDir, branch: edited.branch }).revision;
    const event = { event_id: 'accepted-1', type: 'spec_change_accepted', correlation_id: 'w-change', attempt_id: currentAttempt(other), actor: { kind: 'human', id: 'operator' }, occurred_at: new Date().toISOString(), payload: { revision: newRev } };
    assert.strictEqual(run('ingest', event, '--run-dir', other, '--input', editedFile).status, 0);
    const revised = JSON.parse(JSON.stringify(d)); revised.spec.revision = newRev; revised.requirement_ids = [`${newRev}:AC-1`]; revised.nodes.forEach(n => { n.requirement_ids = [`${newRev}:AC-1`]; });
    const result = run('revise', { definition: revised, event_id: event.event_id }, '--run-dir', other, '--input', editedFile, '--session', 's2');
    assert.strictEqual(result.status, 0, result.stderr); assert.strictEqual(result.json.next.node_id, 'implement');
    const saved = JSON.parse(fs.readFileSync(path.join(other, 'graph.json')));
    assert.strictEqual(saved.spec.revision, newRev); assert.strictEqual(saved.attempts.length, 2);
    assert.strictEqual(saved.attempts[0].state, 'cancelled');
    assert.notStrictEqual(run('revise', { definition: revised, event_id: event.event_id }, '--run-dir', other, '--input', editedFile).status, 0);
    const limitedDir = path.join(root, 'runs', 'revision-limit-run');
    const limited = JSON.parse(JSON.stringify(d)); limited.run_id = 'revision-limit-run'; limited.limits.max_total_attempts = 1;
    assert.strictEqual(run('create', limited, '--run-dir', limitedDir, '--session', 's1', '--permissions', 'repo:read,repo:write').status, 0);
    assert.strictEqual(run('wait', wait, '--run-dir', limitedDir).status, 0);
    const limitedEvent = { ...event, event_id: 'accepted-limit', attempt_id: currentAttempt(limitedDir) };
    assert.strictEqual(run('ingest', limitedEvent, '--run-dir', limitedDir, '--input', editedFile).status, 0);
    const limitedRevision = JSON.parse(JSON.stringify(revised)); limitedRevision.run_id = 'revision-limit-run'; limitedRevision.limits.max_total_attempts = 1;
    const limitedResult = run('revise', { definition: limitedRevision, event_id: limitedEvent.event_id }, '--run-dir', limitedDir, '--input', editedFile, '--session', 's2');
    assert.strictEqual(limitedResult.status, 0, limitedResult.stderr);
    assert.strictEqual(limitedResult.json.state, 'stopped', 'a specification change must not reset the Graph-wide attempt limit');
  });
  test('definition rejects missing requirements and transition refuses a dependency bypass', () => {
    const invalid = JSON.parse(JSON.stringify(definition));
    invalid.run_id = 'invalid-run';
    invalid.nodes[0].success_to = 'review';
    invalid.nodes[3].depends_on = ['verify'];
    const r = run('create', invalid, '--run-dir', path.join(root, 'runs', 'invalid-run'), '--session', 's1', '--permissions', 'repo:read,repo:write');
    assert.strictEqual(r.status, 0, r.stderr);
    const badEvent = { event_id: 'dep-event', type: 'work_recorded', correlation_id: 'implement', attempt_id: currentAttempt(path.join(root, 'runs', 'invalid-run')), actor: { kind: 'agent', id: 'a' }, occurred_at: new Date().toISOString(), payload: {} };
    assert.strictEqual(run('ingest', badEvent, '--run-dir', path.join(root, 'runs', 'invalid-run')).status, 0);
    const bypass = run('succeed', { event: badEvent }, '--run-dir', path.join(root, 'runs', 'invalid-run'), '--session', 's1');
    assert.notStrictEqual(bypass.status, 0); assert.match(bypass.stderr, /dependency verify/);
    const missing = JSON.parse(JSON.stringify(definition)); missing.run_id = 'missing-run'; missing.requirement_ids = [`${rev}:AC-2`];
    const r2 = run('create', missing, '--run-dir', path.join(root, 'runs', 'missing-run'), '--session', 's1', '--permissions', 'repo:read,repo:write');
    assert.notStrictEqual(r2.status, 0); assert.match(r2.stderr, /requirement_ids/);
    const emptyId = { ...definition, run_id: 'empty-id-run', graph_id: '' };
    const emptyResult = run('create', emptyId, '--run-dir', path.join(root, 'runs', 'empty-id-run'), '--session', 's1', '--permissions', 'repo:read,repo:write');
    assert.notStrictEqual(emptyResult.status, 0); assert.match(emptyResult.stderr, /graph_id/);
    const noExit = JSON.parse(JSON.stringify(definition)); noExit.run_id = 'no-exit-run';
    noExit.nodes[1].failure_to = 'stop';
    noExit.nodes[2].success_to = 'complete';
    noExit.nodes[3].success_to = 'verify';
    noExit.nodes[3].failure_to = 'stop';
    const r3 = run('create', noExit, '--run-dir', path.join(root, 'runs', 'no-exit-run'), '--session', 's1', '--permissions', 'repo:read,repo:write');
    assert.notStrictEqual(r3.status, 0, 'a completion exit on an unreachable optional node is insufficient');
    assert.match(r3.stderr, /completion exit/);
    const successLoop = JSON.parse(JSON.stringify(noExit)); successLoop.run_id = 'success-loop-run';
    successLoop.nodes[1].failure_to = 'complete';
    const r4 = run('create', successLoop, '--run-dir', path.join(root, 'runs', 'success-loop-run'), '--session', 's1', '--permissions', 'repo:read,repo:write');
    assert.notStrictEqual(r4.status, 0, 'a loop needs a success path out, not only a failure path to complete');
    assert.match(r4.stderr, /success loop/);
  });
  test('rejects a --session that differs from the running Claude Code or Codex session', () => {
    const sessionRun = path.join(root, 'runs', 'runtime-session-run');
    const d = JSON.parse(JSON.stringify(definition)); d.run_id = 'runtime-session-run';
    const claudeCode = { CLAUDE_CODE_SESSION_ID: '7c010143-8bf0-46be-b12a-e1c43a11ea91' };
    let r = runInSession(claudeCode, 'create', d, '--run-dir', sessionRun, '--session', 'someone-else', '--permissions', 'repo:read,repo:write');
    assert.notStrictEqual(r.status, 0); assert.match(r.stderr, /session id must match the current runtime/);
    assert.ok(!fs.existsSync(path.join(sessionRun, 'graph.json')));
    r = runInSession(claudeCode, 'create', d, '--run-dir', sessionRun, '--permissions', 'repo:read,repo:write');
    assert.strictEqual(r.status, 0, r.stderr);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(sessionRun, 'graph.json'))).attempts[0].session_ids, [claudeCode.CLAUDE_CODE_SESSION_ID]);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(sessionRun, 'meta.json'))).session_ids, [claudeCode.CLAUDE_CODE_SESSION_ID]);
    r = runInSession(claudeCode, 'status', undefined, '--run-dir', sessionRun, '--session', claudeCode.CLAUDE_CODE_SESSION_ID);
    assert.strictEqual(r.status, 0, r.stderr);
    // A Codex session started from a Claude Code shell inherits CLAUDE_CODE_SESSION_ID; its own ID still decides.
    const codexInClaudeCode = { ...claudeCode, CODEX_THREAD_ID: 'thread-1' };
    r = runInSession(codexInClaudeCode, 'status', undefined, '--run-dir', sessionRun, '--session', claudeCode.CLAUDE_CODE_SESSION_ID);
    assert.notStrictEqual(r.status, 0); assert.match(r.stderr, /session id must match the current runtime/);
    r = runInSession(codexInClaudeCode, 'status', undefined, '--run-dir', sessionRun, '--session', 'codex-thread-thread-1');
    assert.strictEqual(r.status, 0, r.stderr);
  });
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log(`Results: Passed: ${passed}, Failed: 0`);
