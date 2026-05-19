/**
 * Tests for scripts/lib/task-shaper.js
 *
 * Run with: node tests/lib/task-shaper.test.js
 */

const assert = require('assert');

const {
  shapeTask,
  detectSignals,
  decideTaskWeight,
  decideSpecNeed,
} = require('../../scripts/lib/task-shaper');

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    return true;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

function runTests() {
  console.log('\n=== Testing task-shaper.js ===\n');

  let passed = 0;
  let failed = 0;

  console.log('signals:');

  if (test('detects ambiguous strategy discussion', () => {
    const signals = detectSignals('今の開発体験をどうすべきか議論したい');
    assert.strictEqual(signals.ambiguous, true);
    assert.strictEqual(signals.implementation, false);
  })) passed++; else failed++;

  if (test('detects risky implementation work', () => {
    const signals = detectSignals('implement auth migration and deploy to production');
    assert.strictEqual(signals.risky, true);
    assert.strictEqual(decideTaskWeight(signals, 'implement auth migration and deploy to production'), 'heavy-risky');
    assert.strictEqual(decideSpecNeed('heavy-risky', signals), 'required');
  })) passed++; else failed++;

  console.log('\nshapeTask:');

  if (test('keeps vague strategy requests in discussion', () => {
    const shaped = shapeTask('ユーザーハーネスをどうしたら自立化できるか議論したい');
    assert.strictEqual(shaped.taskWeight, 'exploratory');
    assert.strictEqual(shaped.specNeeded, 'no');
    assert.strictEqual(shaped.suggestedTrack, 'continue-discussion');
    assert.ok(shaped.openQuestions.includes('What outcome should be accepted as success?'));
    assert.strictEqual(shaped.readonly, true);
  })) passed++; else failed++;

  if (test('routes document reading to bounded research', () => {
    const shaped = shapeTask('この記事を読解して、今の設定に適用できるか検討したい');
    assert.strictEqual(shaped.taskWeight, 'exploratory');
    assert.strictEqual(shaped.suggestedTrack, 'research');
    assert.ok(shaped.requiredEvidence.includes('source claims or observations'));
    assert.ok(shaped.requiredEvidence.includes('adopt / hold / reject decision'));
  })) passed++; else failed++;

  if (test('proposes readonly delegation for heavy context reading', () => {
    const shaped = shapeTask('1000行のログと大量ファイルを読んで、失敗原因の候補だけ要約してほしい');
    assert.strictEqual(shaped.heavyContext, true);
    assert.strictEqual(shaped.canDelegateReadOnly, true);
    assert.ok(shaped.delegationTask.includes('read-only'));
    assert.ok(shaped.delegationTask.includes('要点'));
    assert.ok(shaped.constraints.includes('Delegate only reading, summarization, extraction, or evidence collection when heavy context is present.'));
  })) passed++; else failed++;

  if (test('marks normal implementation as ready for plan or route', () => {
    const shaped = shapeTask('Add a /shape-task command and tests');
    assert.strictEqual(shaped.taskWeight, 'standard');
    assert.strictEqual(shaped.specNeeded, 'optional');
    assert.strictEqual(shaped.suggestedTrack, 'plan-or-route');
    assert.strictEqual(shaped.delegationReady, true);
    assert.strictEqual(shaped.heavyContext, false);
    assert.strictEqual(shaped.canDelegateReadOnly, false);
    assert.strictEqual(shaped.delegationTask, 'none');
    assert.ok(shaped.requiredEvidence.includes('focused tests or validators'));
  })) passed++; else failed++;

  if (test('requires stronger process for behavior-changing work', () => {
    const shaped = shapeTask('Update the browser workflow UI behavior and add tests');
    assert.strictEqual(shaped.taskWeight, 'behavior-changing');
    assert.strictEqual(shaped.specNeeded, 'recommended');
    assert.strictEqual(shaped.suggestedTrack, 'plan');
    assert.ok(shaped.requiredEvidence.includes('manual path or runtime observation evidence'));
  })) passed++; else failed++;

  if (test('keeps human approval explicit for non-trivial work', () => {
    const shaped = shapeTask('Fix the command validator');
    assert.strictEqual(shaped.humanApprovalNeeded, true);
    assert.ok(shaped.constraints.includes('Human-owned purpose, scope, and acceptance remain explicit.'));
    assert.ok(shaped.nonGoals.includes('Do not replace approval with automation.'));
  })) passed++; else failed++;

  if (test('turns shape-task quality improvement into a standard implementation task', () => {
    const shaped = shapeTask('/shape-task の出力品質を改善したい。汎用質問ではなく、現在の .claude ハーネス文脈から改善候補を出したい。');
    assert.strictEqual(shaped.taskWeight, 'standard');
    assert.strictEqual(shaped.specNeeded, 'optional');
    assert.strictEqual(shaped.suggestedTrack, 'plan-or-route');
    assert.ok(shaped.requiredEvidence.includes('focused tests or validators'));
    assert.ok(shaped.requiredEvidence.includes('/shape-task sample output before/after'));
  })) passed++; else failed++;

  if (test('adds harness-specific decision candidates for pipeline prioritization', () => {
    const shaped = shapeTask('今の .claude ハーネスを Agentic Development Pipeline に沿って改善したい。まずどの改善を優先すべきか整理したい。');
    assert.strictEqual(shaped.taskWeight, 'exploratory');
    assert.strictEqual(shaped.suggestedTrack, 'continue-discussion');
    assert.ok(shaped.decisionCandidates.includes('Improve /shape-task output quality'));
    assert.ok(shaped.decisionCandidates.includes('Design /route-task after shaping'));
    assert.ok(shaped.decisionCandidates.includes('Add an always-on suggestion for ambiguous requests'));
    assert.ok(shaped.suggestedNextStep.includes('Compare decision candidates'));
    assert.ok(shaped.requiredEvidence.includes('progress.md next action alignment'));
    assert.ok(shaped.requiredEvidence.includes('docs/development-task-pipeline.md alignment'));
  })) passed++; else failed++;

  if (test('does not misclassify route-task readiness discussion as shape-task quality implementation', () => {
    const shaped = shapeTask('次の .claude ハーネス改善として、route-task 設計に進むべきか、もう少し shape-task の実例レビューを続けるべきか判断したい。');
    assert.strictEqual(shaped.taskWeight, 'exploratory');
    assert.strictEqual(shaped.specNeeded, 'no');
    assert.strictEqual(shaped.suggestedTrack, 'continue-discussion');
    assert.ok(shaped.decisionCandidates.includes('Design /route-task after shaping'));
    assert.ok(shaped.suggestedNextStep.includes('Compare decision candidates'));
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
