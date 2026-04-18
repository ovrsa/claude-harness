/**
 * Tests for scripts/lib/task-artifacts.js
 *
 * Run with: node tests/lib/task-artifacts.test.js
 */

const assert = require('assert');

const {
  parseProgressState,
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
