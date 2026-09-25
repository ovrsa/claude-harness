'use strict';

// #17. An issue whose Graph section says 標準 gets its Graph from that section, so the agent writes
// no definition JSON. なし makes no Graph, and 個別 keeps the definition JSON path.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { prepareGoal } = require('../../scripts/lib/task-goal');
const { taskFingerprint } = require('../../scripts/lib/task-completion');
const { writeFinishingEvidence } = require('../fixtures/task-finishing');

const script = path.resolve(__dirname, '../../scripts/task-goal.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-standard-'));
const repoDir = path.join(root, 'repo');
fs.mkdirSync(path.join(repoDir, '.claude'), { recursive: true });
spawnSync('git', ['init', '-q', repoDir]);
fs.writeFileSync(path.join(repoDir, '.claude', 'tracker.json'), JSON.stringify({ kind: 'github', repo: 'acme/repo' }));
fs.writeFileSync(path.join(repoDir, 'work.js'), 'module.exports = 1;\n');
spawnSync('git', ['-C', repoDir, 'add', 'work.js', '.claude/tracker.json']);
spawnSync('git', ['-C', repoDir, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'initial']);
fs.appendFileSync(path.join(repoDir, 'work.js'), '// change\n');

let passed = 0;
let files = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
function writeJson(value) {
  const file = path.join(root, `input-${files++}.json`);
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
}
function task(graphSection) {
  const body = `## 目的\n標準の Graph を試す。\n\n## 受け入れ条件\n- [ ] 一つ目の条件。\n- [ ] 二つ目の条件。\n\n## 検証方法\n- テストを実行する。\n\n## Graph\n\n${graphSection}\n`;
  const input = { tracker: 'github', branch: 'issue-1', task: { ref: '#1', title: 'standard', body } };
  return { file: writeJson(input), revision: prepareGoal({ task: input.task, repo: repoDir, branch: input.branch }).revision };
}
function run(operation, runDir, taskFile, value, ...extra) {
  const args = [script, 'graph', operation, '--run-dir', runDir, '--repo', repoDir, '--input', taskFile, ...extra];
  if (value !== undefined) args.push('--graph-input', writeJson(value));
  const env = { ...process.env };
  for (const name of ['CLAUDE_SESSION_ID', 'CODEX_SESSION_ID', 'CODEX_THREAD_ID']) delete env[name];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', env });
  let json = null;
  try { json = JSON.parse(result.stdout); } catch { /* asserted by the caller */ }
  return { ...result, json };
}
const runDir = name => path.join(root, 'runs', name);
const saved = dir => JSON.parse(fs.readFileSync(path.join(dir, 'graph.json'), 'utf8'));
const create = (dir, taskFile) => run('create', dir, taskFile, undefined, '--session', 's-impl', '--permissions', 'repo:read,repo:write');

try {
  test('a standard issue gets its Graph from the Graph section, with the limits it names', () => {
    const { file, revision } = task('- 型: 標準\n- 上限: 検証 2回 / レビュー 1回\n- 人の判断: なし');
    const dir = runDir('named-limits');
    const created = create(dir, file);
    assert.strictEqual(created.status, 0, created.stderr);
    assert.strictEqual(created.json.state, 'active');
    assert.strictEqual(created.json.next.node_id, 'implement');
    const graph = saved(dir);
    const requirements = [`${revision}:AC-1`, `${revision}:AC-2`];
    assert.deepStrictEqual(graph.nodes.map(node => node.id), ['implement', 'verify', 'fix', 'review']);
    assert.deepStrictEqual(graph.requirement_ids, requirements);
    assert.strictEqual(graph.spec.source, 'https://github.com/acme/repo/issues/1');
    assert.strictEqual(graph.run_id, 'named-limits');
    const byId = Object.fromEntries(graph.nodes.map(node => [node.id, node]));
    assert.strictEqual(byId.verify.max_attempts, 2);
    assert.strictEqual(byId.review.max_attempts, 1);
    assert.strictEqual(byId.verify.failure_to, 'fix');
    assert.strictEqual(byId.review.failure_to, 'fix');
    for (const node of graph.nodes.filter(item => item.required)) assert.deepStrictEqual(node.requirement_ids, requirements);

    const defaults = runDir('default-limits');
    assert.strictEqual(create(defaults, task('- 型: 標準').file).status, 0);
    const defaultNodes = Object.fromEntries(saved(defaults).nodes.map(node => [node.id, node]));
    assert.strictEqual(defaultNodes.verify.max_attempts, 3);
    assert.strictEqual(defaultNodes.review.max_attempts, 2);
  });

  test('a question for before implementation starts the Graph waiting on a human node', () => {
    const { file } = task('- 型: 標準\n- 人の判断: 実装の前: 互換性を壊してよいか');
    const dir = runDir('ask-first');
    const created = create(dir, file);
    assert.strictEqual(created.status, 0, created.stderr);
    assert.strictEqual(created.json.state, 'waiting');
    assert.strictEqual(created.json.next, null);
    assert.strictEqual(created.json.wait.question, '互換性を壊してよいか');
    const graph = saved(dir);
    assert.deepStrictEqual(graph.nodes.map(node => node.id), ['ask', 'implement', 'verify', 'fix', 'review']);
    assert.strictEqual(graph.nodes[0].authority, 'human');
    assert.deepStrictEqual(graph.nodes[1].depends_on, ['ask']);

    const answer = { event_id: 'answer-1', type: 'human_answer', correlation_id: created.json.wait.wait_id, attempt_id: graph.attempts.at(-1).attempt_id, actor: { kind: 'human', id: 'operator' }, occurred_at: new Date().toISOString(), payload: { answer: '壊してよい' } };
    const ingested = run('ingest', dir, file, answer);
    assert.strictEqual(ingested.status, 0, ingested.stderr);
    assert.strictEqual(ingested.json.wake, true);
    assert.strictEqual(run('resume', dir, file, answer, '--session', 's-answer').status, 0);
    const next = run('succeed', dir, file, { event: answer }, '--session', 's-answer');
    assert.strictEqual(next.status, 0, next.stderr);
    assert.strictEqual(next.json.next.node_id, 'implement');
  });

  test('なし makes no Graph, 個別 needs its definition, and 標準 refuses one', () => {
    const none = runDir('none');
    const refused = create(none, task('- 型: なし（ゴールの停止条件で足りる）').file);
    assert.strictEqual(refused.status, 1, refused.stdout);
    assert.match(refused.stderr, /なし/);
    assert.ok(!fs.existsSync(path.join(none, 'graph.json')));

    const custom = run('create', runDir('custom'), task('- 型: 個別（理由: 並列の node が要る）').file, undefined, '--session', 's-impl', '--permissions', 'repo:read,repo:write');
    assert.strictEqual(custom.status, 1, custom.stdout);
    assert.match(custom.stderr, /個別/);

    const standard = run('create', runDir('standard-with-json'), task('- 型: 標準').file, { nodes: [] }, '--session', 's-impl', '--permissions', 'repo:read,repo:write');
    assert.strictEqual(standard.status, 1, standard.stdout);
    assert.match(standard.stderr, /個別/);
  });

  test('the standard Graph runs from implementation through a separate-session review to completion', () => {
    const { file } = task('- 型: 標準');
    const dir = runDir('complete');
    const created = create(dir, file);
    assert.strictEqual(created.status, 0, created.stderr);
    const work = { event_id: 'work-1', type: 'work_recorded', correlation_id: 'implement', attempt_id: created.json.next.attempt_id, actor: { kind: 'agent', id: 'agent' }, occurred_at: new Date().toISOString(), payload: {} };
    assert.strictEqual(run('ingest', dir, file, work).status, 0);
    let step = run('succeed', dir, file, { event: work }, '--session', 's-impl');
    assert.strictEqual(step.json.next.node_id, 'verify', step.stderr);

    writeFinishingEvidence(repoDir);
    for (const [kind, session, next] of [['verification', 's-impl', 'review'], ['review', 's-review', null]]) {
      fs.writeFileSync(path.join(repoDir, `${kind}-summary.md`), fs.readFileSync(path.join(repoDir, `${kind}-summary.md`), 'utf8'));
      assert.strictEqual(run('capture', dir, file, { kind }).status, 0);
      step = run('succeed', dir, file, { evidence: { kind, subject: 'task', subject_revision: taskFingerprint(repoDir) } }, '--session', session);
      assert.strictEqual(step.status, 0, step.stderr);
      if (next) assert.strictEqual(step.json.next.node_id, next);
    }
    assert.strictEqual(step.json.state, 'completed');
  });
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log(`Results: Passed: ${passed}, Failed: 0`);
