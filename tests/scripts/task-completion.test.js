'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const script = path.resolve(__dirname, '../../scripts/task-completion.js');
const { parseReviewState } = require('../../scripts/lib/task-artifacts');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-completion-'));
const run = (...args) => spawnSync(process.execPath, [script, '--repo', dir, ...args], { encoding: 'utf8', cwd: dir });
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
function review(revision, overrides = {}) {
  const fields = { Refactoring: 'unchanged | src.js の分岐を確認し、重複なし', Documents: 'unchanged | README.md の手順が実装と一致', Comments: 'unchanged | src.js の判断理由に過不足なし', Verification: 'passed | node --check src.js を仕上げ後に実行', Observation: 'not-required | 文言整理のみ', Revision: revision, ...overrides };
  return ['# Review Summary', '## Review Scope', '- src.js, README.md', '## Design Compliance', '- 承認範囲内', '## Security', '- 外部入力の扱いを変更していない', '## Comment Adequacy', '- src.js の判断理由を確認', '## Code Quality', ...Object.entries(fields).map(([k,v]) => `- ${k}: ${v}`), '## Test Adequacy', '- 構文検査', '## Findings', '- none', '## Residual Risks', '- none', '## Guardrail Candidates', '- none', '## Next Action', '- none'].join('\n');
}
try {
  spawnSync('git', ['init', '-q', dir]);
  fs.writeFileSync(path.join(dir, 'src.js'), 'const x = 1;\n');
  test('empty review passes cannot count as a completed review', () => {
    const empty = review('unused').replace(/## Comment Adequacy[\s\S]*?## Code Quality/, '## Comment Adequacy\n<!-- instructions only -->\n- \n## Code Quality');
    assert.strictEqual(parseReviewState(empty).complete, false);
  });
  test('missing evidence refuses completion', () => {
    const result = run();
    assert.strictEqual(result.status, 1, result.stderr);
    assert.match(result.stdout, /review-summary.md/);
  });
  const fingerprint = () => { const r = run('--fingerprint'); assert.strictEqual(r.status, 0, r.stderr); return r.stdout.trim(); };
  fs.writeFileSync(path.join(dir, 'verification-summary.md'), '# Verification\n## Scope\n- src.js\n## Commands Run\n- node --check src.js\n## Verification Outcome\n- passed\n## Assessment\n- 構文エラーなし\n');
  test('reasoned no-change passes and evidence writes do not invalidate revision', () => {
    fs.writeFileSync(path.join(dir, 'review-summary.md'), review(fingerprint()));
    const result = run();
    assert.strictEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /READY/);
  });
  test('pending cleanup and placeholders refuse completion', () => {
    for (const value of ['pending | あとで確認', 'unchanged |', 'unchanged | <理由>', 'none']) {
      fs.writeFileSync(path.join(dir, 'review-summary.md'), review(fingerprint(), { Documents: value }));
      assert.strictEqual(run().status, 1, value);
    }
  });
  test('a changed source invalidates the previous finishing record', () => {
    fs.writeFileSync(path.join(dir, 'review-summary.md'), review(fingerprint()));
    fs.writeFileSync(path.join(dir, 'src.js'), 'const x = 2;\n');
    const result = run();
    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /Revision/);
  });
  test('fingerprint handles literal filenames, staging, and symlinks without executing or following them', () => {
    const name = "odd ' $(touch SHOULD_NOT_EXIST).js";
    fs.writeFileSync(path.join(dir, name), 'literal path');
    const before = fingerprint();
    spawnSync('git', ['-C', dir, 'add', '--', name]);
    assert.strictEqual(fingerprint(), before);
    assert.strictEqual(fs.existsSync(path.join(dir, 'SHOULD_NOT_EXIST')), false);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'finishing-outside-'));
    try {
      fs.writeFileSync(path.join(outside, 'target'), 'one');
      fs.symlinkSync(path.join(outside, 'target'), path.join(dir, 'external'));
      const linked = fingerprint();
      fs.writeFileSync(path.join(outside, 'target'), 'two');
      assert.strictEqual(fingerprint(), linked, 'hash the link target name, not outside content');
    } finally {
      fs.unlinkSync(path.join(dir, 'external'));
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
  test('duplicate declarations and unresolved high findings refuse completion', () => {
    const duplicate = review(fingerprint()).replace('## Test Adequacy', '- Documents: unchanged | duplicate claim\n## Test Adequacy');
    fs.writeFileSync(path.join(dir, 'review-summary.md'), duplicate);
    assert.strictEqual(run().status, 1);
    fs.writeFileSync(path.join(dir, 'review-summary.md'), review(fingerprint()).replace('## Findings\n- none', '## Findings\n- HIGH: unresolved regression'));
    assert.strictEqual(run().status, 1);
  });
  test('required observation cannot be omitted', () => {
    fs.writeFileSync(path.join(dir, 'review-summary.md'), review(fingerprint(), { Observation: 'recorded | stdout を確認' }));
    assert.strictEqual(run().status, 1);
    fs.writeFileSync(path.join(dir, 'observation-summary.md'), '# Observation\n## Behavior Checked\n- CLI\n## Method\n- CLI を実行\n## Evidence\n- stdout: READY\n## Remaining Uncertainty\n- none\n');
    assert.strictEqual(run().status, 0);
  });
  test('failed or missing verification refuses completion', () => {
    fs.writeFileSync(path.join(dir, 'review-summary.md'), review(fingerprint(), { Verification: 'failed | node --check src.js' }));
    assert.strictEqual(run().status, 1);
    fs.writeFileSync(path.join(dir, 'review-summary.md'), review(fingerprint()));
    fs.unlinkSync(path.join(dir, 'verification-summary.md'));
    assert.strictEqual(run().status, 1);
  });
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
console.log(`Results: Passed: ${passed}, Failed: 0`);
