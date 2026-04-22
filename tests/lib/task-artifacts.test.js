/**
 * Tests for scripts/lib/task-artifacts.js
 *
 * Run with: node tests/lib/task-artifacts.test.js
 */

const assert = require('assert');

const {
  buildLifecycleState,
  parseProgressState,
  parsePlanState,
  classifyProgressExecutionState,
  classifyProgressCompletionState,
} = require('../../scripts/lib/task-artifacts');

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

function runTests() {
  console.log('\n=== Testing task-artifacts.js ===\n');

  let passed = 0;
  let failed = 0;

  if (test('parses implementation-ready plan evidence fields', () => {
    const plan = parsePlanState([
      '---',
      'status: approved',
      '---',
      '',
      '# Plan',
      '',
      '## Summary',
      '- implement the change',
      '',
      '## Acceptance Criteria',
      '- behavior works',
      '',
      '## Touched Files',
      '- src/example.js',
      '',
      '## Behavior Spec',
      '- Given state',
      '- When action',
      '- Then result',
      '- normal: standard case',
      '- boundary: edge case',
      '- abnormal: error case',
      '',
      '## Verify',
      '- npm test',
      '',
      '## Test Evidence Plan',
      '- RED command: npm test -- failing',
      '- expected failure: assertion fails',
      '- GREEN command: npm test',
      '',
      '## Evaluate',
      '- review findings resolved',
      '',
      '## Observe',
      '- required: no',
      '',
      '## Execution Todo',
      '- [ ] write failing test',
    ].join('\n'));

    assert.strictEqual(plan.complete, true);
    assert.strictEqual(plan.hasGivenWhenThen, true);
    assert.strictEqual(plan.hasTddEvidencePlan, true);
  })) passed++; else failed++;

  if (test('detects incomplete plan evidence fields', () => {
    const plan = parsePlanState([
      '# Plan',
      '',
      '## Summary',
      '- implement the change',
      '',
      '## Acceptance Criteria',
      '- behavior works',
    ].join('\n'));

    assert.strictEqual(plan.complete, false);
    assert.ok(plan.missingSections.includes('Behavior Spec'));
    assert.strictEqual(plan.hasTddEvidencePlan, false);
  })) passed++; else failed++;

  if (test('builds ordered lifecycle chain with current blocked step', () => {
    const state = buildLifecycleState([
      {
        name: 'research.md',
        status: '',
      },
      {
        name: 'plan.md',
        status: 'approved',
        task_type: 'non_trivial',
        worktree_required: 'true',
        observe_required: 'true',
        review_required: '',
        plan_state: {
          complete: true,
        },
      },
      {
        name: 'progress.md',
        progress_state: parseProgressState([
          '# Progress',
          '',
          '## Current Phase',
          '- Phase 2: implementation',
          '',
          '## Last Completed Step',
          '- Approved the plan',
          '',
          '## Next Action',
          '- Run verification',
          '',
          '## Blockers',
          '- none',
          '',
          '## Delegated Work',
          '- none',
        ].join('\n')),
      },
    ]);

    assert.deepStrictEqual(state.chain.map(step => step.id), [
      'research',
      'plan',
      'progress',
      'implementation',
      'verification',
      'review',
      'observation',
      'completion',
    ]);
    assert.strictEqual(state.currentStepId, 'implementation');
    assert.strictEqual(state.chain.find(step => step.id === 'verification').status, 'pending');
    assert.ok(state.blocked.includes('missing verification-summary.md'));
    assert.ok(state.blocked.includes('missing review-summary.md'));
    assert.ok(state.blocked.includes('missing observation-summary.md'));
  })) passed++; else failed++;

  if (test('marks lifecycle chain complete when required artifacts are complete', () => {
    const state = buildLifecycleState([
      {
        name: 'research.md',
        status: '',
      },
      {
        name: 'plan.md',
        status: 'approved',
        task_type: 'non_trivial',
        worktree_required: 'true',
        observe_required: 'false',
        review_required: 'true',
        plan_state: {
          complete: true,
        },
      },
      {
        name: 'progress.md',
        progress_state: parseProgressState([
          '# Progress',
          '',
          '## Current Phase',
          '- Ready to commit',
          '',
          '## Last Completed Step',
          '- Finished verification and review',
          '',
          '## Next Action',
          '- none',
          '',
          '## Blockers',
          '- none',
          '',
          '## Delegated Work',
          '- none',
        ].join('\n')),
      },
      {
        name: 'verification-summary.md',
        verification_state: {
          complete: true,
        },
      },
      {
        name: 'review-summary.md',
        review_state: {
          complete: true,
          hasBlockingFindings: false,
        },
      },
    ]);

    assert.strictEqual(state.currentStepId, 'complete');
    assert.strictEqual(state.nextRequiredAction, 'none');
    assert.strictEqual(state.blocked.length, 0);
    assert.strictEqual(state.chain.find(step => step.id === 'observation').status, 'skipped');
    assert.strictEqual(state.chain.find(step => step.id === 'completion').status, 'complete');
  })) passed++; else failed++;

  if (test('classifies planning-only progress state conservatively', () => {
    const progress = parseProgressState([
      '# Progress',
      '',
      '## Current Phase',
      '- Planning and approval',
      '',
      '## Last Completed Step',
      '- Approved the plan',
      '',
      '## Next Action',
      '- Start coding after state update',
      '',
      '## Blockers',
      '- none',
      '',
      '## Delegated Work',
      '- none',
    ].join('\n'));

    assert.strictEqual(classifyProgressExecutionState(progress), 'planning_only');
  })) passed++; else failed++;

  if (test('classifies explicit implementation state as execution', () => {
    const progress = parseProgressState([
      '# Progress',
      '',
      '## Current Phase',
      '- Phase 2: implementation',
      '',
      '## Last Completed Step',
      '- Approved the plan',
      '',
      '## Next Action',
      '- Edit lifecycle guardrails',
      '',
      '## Blockers',
      '- none',
      '',
      '## Delegated Work',
      '- none',
    ].join('\n'));

    assert.strictEqual(classifyProgressExecutionState(progress), 'execution');
  })) passed++; else failed++;

  if (test('treats mixed or ambiguous wording as unknown', () => {
    const progress = parseProgressState([
      '# Progress',
      '',
      '## Current Phase',
      '- Phase 2: plan continuity hardening',
      '',
      '## Last Completed Step',
      '- Tightened guardrail heuristics',
      '',
      '## Next Action',
      '- Keep refining wording',
      '',
      '## Blockers',
      '- none',
      '',
      '## Delegated Work',
      '- none',
    ].join('\n'));

    assert.strictEqual(classifyProgressExecutionState(progress), 'unknown');
  })) passed++; else failed++;

  if (test('classifies explicit completion wording as a completion candidate', () => {
    const progress = parseProgressState([
      '# Progress',
      '',
      '## Current Phase',
      '- Ready to commit',
      '',
      '## Last Completed Step',
      '- Finished lifecycle verification',
      '',
      '## Next Action',
      '- none',
      '',
      '## Blockers',
      '- none',
      '',
      '## Delegated Work',
      '- none',
    ].join('\n'));

    assert.strictEqual(classifyProgressCompletionState(progress), 'completion_candidate');
  })) passed++; else failed++;

  if (test('treats active verification and review phases as not complete', () => {
    const progress = parseProgressState([
      '# Progress',
      '',
      '## Current Phase',
      '- Phase 4: review',
      '',
      '## Last Completed Step',
      '- Completed verification',
      '',
      '## Next Action',
      '- Resolve review findings',
      '',
      '## Blockers',
      '- none',
      '',
      '## Delegated Work',
      '- none',
    ].join('\n'));

    assert.strictEqual(classifyProgressCompletionState(progress), 'not_complete');
  })) passed++; else failed++;

  if (test('treats ambiguous completion-adjacent wording as unknown', () => {
    const progress = parseProgressState([
      '# Progress',
      '',
      '## Current Phase',
      '- Phase 3: completion hardening',
      '',
      '## Last Completed Step',
      '- Tightened lifecycle guardrails',
      '',
      '## Next Action',
      '- Keep refining hooks',
      '',
      '## Blockers',
      '- none',
      '',
      '## Delegated Work',
      '- none',
    ].join('\n'));

    assert.strictEqual(classifyProgressCompletionState(progress), 'unknown');
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
