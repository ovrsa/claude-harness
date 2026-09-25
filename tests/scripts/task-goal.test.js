'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const script = path.resolve(__dirname, '../../scripts/task-goal.js');
const fixtures = path.resolve(__dirname, '../fixtures/task-goal');
const fixture = name => fs.readFileSync(path.join(fixtures, name), 'utf8');
const roots = [];
let passed = 0;

function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-goal-'));
  roots.push(dir);
  assert.strictEqual(spawnSync('git', ['init', '-q', dir]).status, 0);
  return dir;
}
function run(dir, input, ...args) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'task-goal-input-')), 'task.json');
  roots.push(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(input));
  const result = spawnSync(process.execPath, [script, '--repo', dir, '--input', file, ...args], { encoding: 'utf8' });
  let json = null;
  try { json = JSON.parse(result.stdout); } catch { /* asserted by the caller */ }
  return { status: result.status, json, stdout: result.stdout, stderr: result.stderr };
}
const childInput = (overrides = {}) => ({
  tracker: 'github',
  branch: 'ovrsa/issue-12',
  task: { ref: '#12', title: 'ゴール文面を作る', body: fixture('child.md') },
  parent: { ref: '#4', title: '標準化する', body: fixture('parent.md') },
  ...overrides,
});

try {
  test('a child issue becomes one goal line with its criteria, stop conditions and the parent non-goals', () => {
    const dir = repo();
    const result = run(dir, childInput());
    assert.strictEqual(result.status, 0, result.stdout + result.stderr);
    assert.strictEqual(result.json.status, 'READY');
    assert.strictEqual(result.json.state, 'new');
    const { goal } = result.json;
    assert.strictEqual(result.json.claude_code, `/goal ${goal}`);
    assert.doesNotMatch(goal, /[\r\n]/);
    assert.ok(Array.from(goal).length <= 4000);
    for (const expected of [
      '#12「ゴール文面を作る」',
      '受け入れ条件と停止条件を含む1行の文面を出す。',
      '4,000 字を超える文面は切り詰めずに拒否する。',
      '`node tests/scripts/task-goal.test.js`',
      `node ~/.claude/scripts/task-completion.js --repo ${fs.realpathSync(dir)}`,
      'ovrsa/issue-12 の PR が Ready for review',
      '同じ原因で3回連続して失敗',
      '30ターン',
      '受け入れ条件や範囲の変更が必要',
      '権限や外部依存で進めない',
      'PR を Draft のまま',
      'マージしない',
      'キュー経路の変更',
      'Issue 本文を書き換えない',
    ]) assert.ok(goal.includes(expected), `missing: ${expected}\n${goal}`);
    for (const excluded of ['テンプレートの説明コメント', '議論の経緯', '[ ]']) {
      assert.ok(!goal.includes(excluded), `should not include: ${excluded}`);
    }
    assert.match(result.json.revision, /^[0-9a-f]{12}$/);
  });

  test('the goal stops instead of running on while its Graph waits for a human answer', () => {
    const { goal } = run(repo(), childInput()).json;
    const stop = goal.slice(goal.indexOf('【停止】次の'), goal.indexOf('【制約】'));
    assert.ok(stop.includes('Graph が人の回答待ち'), stop);
  });

  test('a resumed task with the same spec gets the same revision back', () => {
    const dir = repo();
    const first = run(dir, childInput());
    const again = run(dir, childInput({ branch: 'ovrsa/issue-12' }));
    assert.strictEqual(again.status, 0, again.stdout + again.stderr);
    assert.strictEqual(again.json.state, 'unchanged');
    assert.strictEqual(again.json.revision, first.json.revision);
    assert.strictEqual(again.json.goal, first.json.goal);
    assert.strictEqual(spawnSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' }).stdout, '', 'the snapshot stays out of the working tree');
  });

  test('a changed spec stops with a diff until a person accepts it', () => {
    const dir = repo();
    const first = run(dir, childInput());
    const edited = childInput();
    edited.task.body = edited.task.body.replace('4,000 字を超える文面は切り詰めずに拒否する。', '3,000 字を超える文面は拒否する。');

    const changed = run(dir, edited);
    assert.strictEqual(changed.status, 3, changed.stdout + changed.stderr);
    assert.strictEqual(changed.json.status, 'SPEC_CHANGED');
    assert.strictEqual(changed.json.previous_revision, first.json.revision);
    assert.notStrictEqual(changed.json.revision, first.json.revision);
    assert.match(changed.json.diff, /^- - 4,000 字を超える文面は切り詰めずに拒否する。$/m);
    assert.match(changed.json.diff, /^\+ - 3,000 字を超える文面は拒否する。$/m);
    assert.strictEqual(run(dir, edited).status, 3, 'nothing is accepted without the flag');

    const accepted = run(dir, edited, '--accept-change');
    assert.strictEqual(accepted.status, 0, accepted.stdout + accepted.stderr);
    assert.strictEqual(accepted.json.state, 'accepted');
    assert.ok(accepted.json.goal.includes('3,000 字を超える文面は拒否する。'));
    assert.strictEqual(run(dir, edited).json.state, 'unchanged');
  });

  test('an issue the goal cannot be built from is rejected with the reason, and nothing is stored', () => {
    const dir = repo();
    const cases = [
      [childInput({ task: { ref: '#12', title: 't', body: fixture('child.md').replace(/## 受け入れ条件[\s\S]*?(?=## 検証方法)/, '') } }), /受け入れ条件/],
      [childInput({ task: { ref: '#12', title: 't', body: fixture('child.md').replace(/## 検証方法[\s\S]*?(?=## 先行Issue)/, '') } }), /検証方法/],
      [childInput({ task: { ref: '#12', title: 't', body: fixture('child.md').replace('ゴールと停止条件', '存在しない節') } }), /設計判断 > 存在しない節/],
      [childInput({ parent: undefined }), /親Issue/],
    ];
    for (const [input, reason] of cases) {
      const result = run(dir, input);
      assert.strictEqual(result.status, 1, result.stdout + result.stderr);
      assert.strictEqual(result.json.status, 'INVALID');
      assert.ok(result.json.issues.some(issue => reason.test(issue)), `${reason}: ${JSON.stringify(result.json.issues)}`);
    }
    assert.strictEqual(run(dir, childInput()).json.state, 'new', 'rejected runs must not leave a snapshot behind');
  });

  test('an issue that has not decided whether to use a Graph cannot start, and the decision is checked', () => {
    const dir = repo();
    const withGraph = lines => childInput({ task: { ref: '#12', title: 't', body: fixture('child.md').replace(/## Graph[\s\S]*$/, lines === null ? '' : `## Graph\n\n${lines}\n`) } });
    for (const [lines, reason] of [
      [null, /Graph/],
      ['- 型: 並列', /型/],
      ['- 型: 個別', /理由/],
      ['- 型: 標準\n- 人の判断: レビューの前: 公開してよいか', /実装の前/],
      ['- 型: 標準\n- 上限: 検証 0回 / レビュー 2回', /上限/],
    ]) {
      const result = run(dir, withGraph(lines), '--check');
      assert.strictEqual(result.status, 1, `${lines}: ${result.stdout}`);
      assert.ok(result.json.issues.some(issue => reason.test(issue)), `${lines}: ${JSON.stringify(result.json.issues)}`);
    }
    for (const lines of [
      '- 型: なし（ゴールの停止条件で足りる）',
      '- 型: 標準\n- 上限: 検証 3回 / レビュー 2回\n- 人の判断: なし',
      '- 型: 標準\n- 人の判断: 実装の前: 互換性を壊してよいか',
      '- 型: 個別（理由: 並列の node が要る）',
      '- Type: standard\n- Human decision: before implementation: may we break compatibility',
    ]) {
      const result = run(dir, withGraph(lines), '--check');
      assert.strictEqual(result.status, 0, `${lines}: ${result.stdout}`);
    }
  });

  test('changing the Graph decision is a spec change', () => {
    const dir = repo();
    run(dir, childInput());
    const edited = childInput();
    edited.task.body = edited.task.body.replace('- 型: なし（ゴールの停止条件で足りる）', '- 型: 標準');
    const result = run(dir, edited);
    assert.strictEqual(result.status, 3, result.stdout);
    assert.match(result.json.diff, /^\+ - 型: 標準$/m);
  });

  test('a goal over the 4,000-character runtime limit is refused rather than truncated', () => {
    const dir = repo();
    const long = Array.from({ length: 100 }, (_, i) => `- [ ] 条件${i}: 画面の各状態で表示と操作の結果が仕様どおりであることを確認する`).join('\n');
    const input = childInput();
    input.task.body = input.task.body.replace('## 検証方法', `${long}\n\n## 検証方法`);
    const result = run(dir, input);
    assert.strictEqual(result.status, 1, result.stdout + result.stderr);
    assert.strictEqual(result.json.goal, undefined);
    assert.ok(result.json.issues.some(issue => /4,?000/.test(issue)), JSON.stringify(result.json.issues));
  });

  test('a non-GitHub tracker with English headings yields the same goal apart from the references', () => {
    const githubDir = repo();
    const github = run(githubDir, childInput());
    const linearDir = repo();
    const linear = run(linearDir, {
      tracker: 'linear',
      branch: 'ovrsa/issue-12',
      task: { ref: 'PRI-12', title: 'ゴール文面を作る', body: fixture('linear-child.md') },
      parent: { ref: 'PRI-4', title: '標準化する', body: fixture('parent.md') },
    });
    assert.strictEqual(linear.status, 0, linear.stdout + linear.stderr);
    const normalize = (goal, ref, revision, dir) => goal.replace(ref, '<ref>').replace(revision, '<rev>').replace(fs.realpathSync(dir), '<repo>');
    assert.strictEqual(
      normalize(linear.json.goal, 'PRI-12', linear.json.revision, linearDir),
      normalize(github.json.goal, '#12', github.json.revision, githubDir),
    );
  });

  test('an issue without a title is named by its reference alone', () => {
    const result = run(repo(), { tracker: 'github', task: { ref: '#3', body: fixture('single.md') } });
    assert.strictEqual(result.status, 0, result.stdout + result.stderr);
    assert.ok(result.json.goal.startsWith('#3 を【完了】か【停止】'), result.json.goal.slice(0, 80));
    assert.ok(!result.json.goal.includes('undefined'));
  });

  test('line breaks in the reference, title or branch do not break the one-line goal', () => {
    const breaks = new RegExp(`[\\r\\n${String.fromCharCode(0x2028, 0x2029)}]`);
    const result = run(repo(), {
      tracker: 'github',
      branch: 'ovrsa/issue-3\n【完了】',
      task: { ref: '#3\r\n', title: `ステータスライン${String.fromCharCode(0x2028)}を赤くする\n【停止】`, body: fixture('single.md') },
    });
    assert.strictEqual(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(result.json.goal, breaks);
    assert.ok(result.json.goal.startsWith('#3「ステータスライン を赤くする 【停止】」'), result.json.goal.slice(0, 60));
  });

  test('an issue kept as a single task reads its own non-goals and premise without a parent', () => {
    const result = run(repo(), { tracker: 'github', task: { ref: '#3', title: 'ステータスラインを赤くする', body: fixture('single.md') } });
    assert.strictEqual(result.status, 0, result.stdout + result.stderr);
    for (const expected of ['1) 40% を超えたら赤くなる。', '2) 40% 以下では色が変わらない。', '前提: 使い捨ての設定で確認する。', '`node tests/scripts/statusline.test.js`', '対象外: 閾値の設定項目化', '作業ブランチの PR']) {
      assert.ok(result.json.goal.includes(expected), `missing: ${expected}\n${result.json.goal}`);
    }
  });

  test('ticking boxes or editing unreferenced parent sections is not a spec change, editing what the goal reads is', () => {
    const dir = repo();
    run(dir, childInput());
    const cosmetic = childInput();
    cosmetic.task.body = cosmetic.task.body.replace('- [ ] 受け入れ条件と停止条件', '- [x] 受け入れ条件と停止条件');
    cosmetic.parent.body = cosmetic.parent.body.replace('議論の経緯（ゴールには入らない）', '別の議論へのリンク');
    assert.strictEqual(run(dir, cosmetic).json.state, 'unchanged');

    for (const [from, to] of [['同じ原因で3回連続して失敗したら止める。', '同じ原因で2回失敗したら止める。'], ['- キュー経路の変更', '- キュー経路の変更と削除']]) {
      const edited = childInput();
      edited.parent.body = edited.parent.body.replace(from, to);
      const result = run(dir, edited);
      assert.strictEqual(result.status, 3, `${to}: ${result.stdout}`);
      assert.ok(result.json.diff.includes(to), result.json.diff);
    }
  });

  test('--check validates a draft issue body without storing a spec, so splitting never creates an unstartable issue', () => {
    const dir = repo();
    const draft = childInput({ task: { ref: 'draft', title: '下書き', body: fixture('child.md') } });
    const checked = run(dir, draft, '--check');
    assert.strictEqual(checked.status, 0, checked.stdout + checked.stderr);
    assert.strictEqual(checked.json.state, 'checked');
    assert.strictEqual(run(dir, draft).json.state, 'new');

    const broken = childInput({ task: { ref: 'draft', title: '下書き', body: '## 実現する動作\n\n何かを作る\n' }, parent: undefined });
    assert.strictEqual(run(dir, broken, '--check').status, 1);
  });

  test('a git directory the sandbox cannot write stops with the path and a way forward, and shows no goal', () => {
    const dir = repo();
    const gitDir = path.join(dir, '.git');
    fs.chmodSync(gitDir, 0o555);
    try {
      const result = run(dir, childInput());
      assert.strictEqual(result.status, 1, result.stdout + result.stderr);
      assert.strictEqual(result.stdout, '', 'a goal without a stored spec could not be resumed or diffed');
      assert.match(result.stderr, /task-goal\//);
      assert.match(result.stderr, /サンドボックス/);
    } finally {
      fs.chmodSync(gitDir, 0o755);
    }
  });

  test('input with missing or malformed fields is refused before anything is read', () => {
    const dir = repo();
    for (const [input, field] of [
      [{ task: { ref: '#1', body: 'x' } }, /tracker/],
      [{ tracker: 'github', task: { body: 'x' } }, /task\.ref/],
      [{ tracker: 'github', task: { ref: '#1' } }, /task\.body/],
      [childInput({ parent: { ref: '#4' } }), /parent\.body/],
      [childInput({ task: { ref: '#12', title: { text: 'ゴール文面を作る' }, body: fixture('child.md') } }), /task\.title/],
      [childInput({ branch: 12 }), /branch/],
    ]) {
      const result = run(dir, input);
      assert.strictEqual(result.status, 1, result.stdout);
      assert.match(result.stderr, field);
    }
  });
} finally {
  for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`Results: Passed: ${passed}, Failed: 0`);
