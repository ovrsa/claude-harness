/**
 * Tests for scripts/lib/task-router.js
 *
 * Run with: node tests/lib/task-router.test.js
 */

const assert = require('assert');

const {
  routeTask,
  normalizeTaskBrief,
} = require('../../scripts/lib/task-router');

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

function brief(overrides = {}) {
  return {
    objective: 'Update command documentation',
    acceptanceCriteria: ['Docs explain the operator path'],
    taskWeight: 'standard',
    constraints: [],
    nonGoals: [],
    requiredEvidence: ['changed-files summary', 'focused tests or validators'],
    openQuestions: [],
    ...overrides,
  };
}

function runTests() {
  console.log('\n=== Testing task-router.js ===\n');

  let passed = 0;
  let failed = 0;

  console.log('normalizeTaskBrief:');

  if (test('normalizes missing fields conservatively', () => {
    const normalized = normalizeTaskBrief({});
    assert.strictEqual(normalized.taskWeight, 'standard');
    assert.deepStrictEqual(normalized.acceptanceCriteria, []);
    assert.deepStrictEqual(normalized.openQuestions, []);
  })) passed++; else failed++;

  console.log('\nrouteTask:');

  if (test('routes open questions back to shaping', () => {
    const routed = routeTask(brief({ openQuestions: ['What should count as acceptance?'] }));
    assert.strictEqual(routed.inputReadiness, 'needs-shaping');
    assert.strictEqual(routed.recommendedDestination, 'human-decision');
    assert.strictEqual(routed.delegationEligible, false);
    assert.ok(routed.suggestedNextStep.includes('Resolve open questions'));
  })) passed++; else failed++;

  if (test('routes trivial work to main context', () => {
    const routed = routeTask(brief({
      taskWeight: 'trivial',
      objective: 'Answer a small usage question',
      acceptanceCriteria: ['Answer is clear'],
      requiredEvidence: [],
    }));
    assert.strictEqual(routed.inputReadiness, 'ready');
    assert.strictEqual(routed.recommendedDestination, 'main-context');
    assert.strictEqual(routed.delegationEligible, false);
  })) passed++; else failed++;

  if (test('routes exploratory readonly research to subagent sidecar when requested', () => {
    const routed = routeTask(brief({
      taskWeight: 'exploratory',
      objective: 'Inspect codebase examples for route-task candidates',
      requiredEvidence: ['source claims or observations'],
    }), {
      preferDelegation: true,
      readonly: true,
    });
    assert.strictEqual(routed.inputReadiness, 'ready');
    assert.strictEqual(routed.recommendedDestination, 'subagent-sidecar');
    assert.strictEqual(routed.delegationEligible, true);
  })) passed++; else failed++;

  if (test('routes standard work to main context by default', () => {
    const routed = routeTask(brief());
    assert.strictEqual(routed.inputReadiness, 'ready');
    assert.strictEqual(routed.recommendedDestination, 'main-context');
    assert.strictEqual(routed.delegationEligible, false);
  })) passed++; else failed++;

  if (test('routes approved standard queued work to task queue', () => {
    const routed = routeTask(brief(), {
      approved: true,
      queueIntent: true,
    });
    assert.strictEqual(routed.inputReadiness, 'ready');
    assert.strictEqual(routed.recommendedDestination, 'task-queue');
    assert.strictEqual(routed.delegationEligible, false);
    assert.ok(routed.requiredApproval.includes('approved task brief'));
  })) passed++; else failed++;

  if (test('routes behavior-changing work with observation evidence requirement', () => {
    const routed = routeTask(brief({
      taskWeight: 'behavior-changing',
      objective: 'Change runtime workflow behavior',
      requiredEvidence: ['focused tests or validators'],
    }));
    assert.strictEqual(routed.recommendedDestination, 'main-context');
    assert.ok(routed.requiredEvidence.includes('observation or manual path evidence'));
  })) passed++; else failed++;

  if (test('blocks heavy-risky work on human decision without approval', () => {
    const routed = routeTask(brief({
      taskWeight: 'heavy-risky',
      objective: 'Deploy auth migration',
      requiredEvidence: ['risk review'],
    }));
    assert.strictEqual(routed.inputReadiness, 'blocked');
    assert.strictEqual(routed.recommendedDestination, 'human-decision');
    assert.strictEqual(routed.delegationEligible, false);
    assert.ok(routed.requiredApproval.includes('risk boundary approval'));
  })) passed++; else failed++;

  if (test('routes approved heavy-risky work to isolated clone through queue', () => {
    const routed = routeTask(brief({
      taskWeight: 'heavy-risky',
      objective: 'Implement approved migration',
      requiredEvidence: ['risk review', 'residual-risk acceptance'],
    }), {
      approved: true,
      riskApproved: true,
      queueIntent: true,
      isolate: true,
    });
    assert.strictEqual(routed.inputReadiness, 'ready');
    assert.strictEqual(routed.recommendedDestination, 'isolated-clone');
    assert.strictEqual(routed.delegationEligible, false);
  })) passed++; else failed++;

  if (test('never delegates credential, deploy, push, PR, destructive, or residual-risk decisions', () => {
    const routed = routeTask(brief({
      objective: 'Deploy with credentials and push PR after deleting old config',
      constraints: ['requires credential use', 'requires deploy', 'requires push', 'requires PR creation', 'requires destructive action', 'requires residual-risk acceptance'],
    }), {
      preferDelegation: true,
      readonly: true,
    });
    assert.strictEqual(routed.inputReadiness, 'blocked');
    assert.strictEqual(routed.recommendedDestination, 'human-decision');
    assert.strictEqual(routed.delegationEligible, false);
    assert.ok(routed.stopConditions.includes('credential use requires human decision'));
    assert.ok(routed.stopConditions.includes('residual-risk acceptance requires human decision'));
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
