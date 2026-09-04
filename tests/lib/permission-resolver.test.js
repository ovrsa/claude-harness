/**
 * Tests for scripts/lib/permission-resolver.js
 *
 * Run with: node tests/lib/permission-resolver.test.js
 */

const assert = require('assert');

const {
  resolvePermission,
  detectBlockedActions,
  classifyBashPermission,
} = require('../../scripts/lib/permission-resolver');

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
  console.log('\n=== Testing permission-resolver.js ===\n');

  let passed = 0;
  let failed = 0;

  if (test('resolves readonly workflow step to readonly', () => {
    const decision = resolvePermission({
      track: 'standard',
      runtime: 'codex',
      workflowStep: { name: 'research', mode: 'readonly' },
      planContent: 'Inspect files only',
    });

    assert.strictEqual(decision.mode, 'readonly');
    assert.strictEqual(decision.source, 'workflow_step');
    assert.strictEqual(decision.requires_explicit_authorization, false);
    assert.deepStrictEqual(decision.blocked_actions, []);
  })) passed++; else failed++;

  if (test('resolves edit workflow step to edit', () => {
    const decision = resolvePermission({
      track: 'standard',
      runtime: 'codex',
      workflowStep: { name: 'implement', mode: 'edit' },
      planContent: 'Modify local files',
    });

    assert.strictEqual(decision.mode, 'edit');
    assert.strictEqual(decision.source, 'workflow_step');
    assert.strictEqual(decision.requires_explicit_authorization, false);
  })) passed++; else failed++;

  if (test('required_permission_mode raises workflow step permission floor', () => {
    const decision = resolvePermission({
      track: 'standard',
      runtime: 'codex',
      workflowStep: { name: 'implement', mode: 'readonly', required_permission_mode: 'edit' },
      planContent: 'Modify local files',
    });

    assert.strictEqual(decision.mode, 'edit');
    assert.strictEqual(decision.source, 'workflow_step_required_permission');
    assert.strictEqual(decision.requires_explicit_authorization, false);
  })) passed++; else failed++;

  if (test('detects plan text actions that require full authorization', () => {
    const blocked = detectBlockedActions('After verification, push the branch, create PR, deploy, and run rm -rf build.');

    assert.deepStrictEqual(blocked, ['push', 'PR', 'deploy', 'destructive rm']);
  })) passed++; else failed++;

  if (test('plan text full actions require explicit authorization', () => {
    const decision = resolvePermission({
      track: 'standard',
      runtime: 'codex',
      workflowStep: { name: 'implement', mode: 'edit' },
      planContent: 'Deploy after verification',
    });

    assert.strictEqual(decision.mode, 'full');
    assert.strictEqual(decision.source, 'plan_text');
    assert.strictEqual(decision.requires_explicit_authorization, true);
    assert.deepStrictEqual(decision.blocked_actions, ['deploy']);
    assert.ok(decision.reasons.some(reason => reason.includes('permission-sensitive action')));
  })) passed++; else failed++;

  if (test('heavy-risky without approval requires explicit authorization', () => {
    const decision = resolvePermission({
      track: 'heavy-risky',
      runtime: 'codex',
      workflowStep: { name: 'implement', mode: 'edit' },
      planContent: 'Modify local files',
      heavyRiskyApproved: false,
    });

    assert.strictEqual(decision.mode, 'full');
    assert.strictEqual(decision.source, 'track_policy');
    assert.strictEqual(decision.requires_explicit_authorization, true);
    assert.ok(decision.reasons.includes('heavy-risky work requires explicit approval'));
  })) passed++; else failed++;

  if (test('heavy-risky approval resolves without blocking when no full action exists', () => {
    const decision = resolvePermission({
      track: 'heavy-risky',
      runtime: 'codex',
      workflowStep: { name: 'implement', mode: 'edit' },
      planContent: 'Modify local files',
      heavyRiskyApproved: true,
    });

    assert.strictEqual(decision.mode, 'edit');
    assert.strictEqual(decision.requires_explicit_authorization, false);
  })) passed++; else failed++;

  if (test('invalid workflow mode fails conservatively', () => {
    const decision = resolvePermission({
      track: 'standard',
      runtime: 'codex',
      workflowStep: { name: 'unknown', mode: 'write-everything' },
      planContent: '',
    });

    assert.strictEqual(decision.mode, 'full');
    assert.strictEqual(decision.source, 'invalid_workflow_step');
    assert.strictEqual(decision.requires_explicit_authorization, true);
    assert.ok(decision.reasons.includes('invalid workflow permission mode: write-everything'));
  })) passed++; else failed++;

  if (test('includes provider option placeholders for supported runtimes', () => {
    const decision = resolvePermission({
      track: 'trivial',
      runtime: 'sdk',
      workflowStep: null,
      planContent: '',
    });

    assert.deepStrictEqual(Object.keys(decision.provider_options).sort(), ['claude', 'codex', 'sdk']);
  })) passed++; else failed++;

  if (test('classifies rm -rf as hard deny with interrupt', () => {
    const decision = classifyBashPermission('rm -rf /tmp/test-target');

    assert.strictEqual(decision.policy_class, 'hard-deny');
    assert.strictEqual(decision.behavior, 'deny');
    assert.strictEqual(decision.interrupt, true);
    assert.ok(decision.message.includes('hard-deny'));
    assert.ok(decision.blocked_actions.includes('destructive rm'));
    assert.strictEqual(decision.permission.mode, 'full');
  })) passed++; else failed++;

  if (test('classifies git reset hard as hard deny', () => {
    const decision = classifyBashPermission('git reset --hard HEAD');

    assert.strictEqual(decision.policy_class, 'hard-deny');
    assert.strictEqual(decision.behavior, 'deny');
    assert.ok(decision.blocked_actions.includes('git reset hard'));
  })) passed++; else failed++;

  if (test('classifies rg as auto allow', () => {
    const decision = classifyBashPermission('rg plan.md /tmp');

    assert.strictEqual(decision.policy_class, 'auto-allow');
    assert.strictEqual(decision.behavior, 'allow');
    assert.ok(decision.message.includes('auto-allow'));
    assert.strictEqual(decision.permission.mode, 'readonly');
  })) passed++; else failed++;

  if (test('classifies git status as auto allow', () => {
    const decision = classifyBashPermission('git status --short');

    assert.strictEqual(decision.policy_class, 'auto-allow');
    assert.strictEqual(decision.behavior, 'allow');
  })) passed++; else failed++;

  if (test('classifies metadata commands as audit only', () => {
    const dateDecision = classifyBashPermission('date');
    const psDecision = classifyBashPermission('ps -ef');

    assert.strictEqual(dateDecision.policy_class, 'audit-only');
    assert.strictEqual(dateDecision.behavior, 'allow');
    assert.strictEqual(psDecision.policy_class, 'audit-only');
    assert.strictEqual(psDecision.behavior, 'allow');
  })) passed++; else failed++;

  if (test('classifies npm test as ask with justification', () => {
    const decision = classifyBashPermission('npm test');

    assert.strictEqual(decision.policy_class, 'ask-with-justification');
    assert.strictEqual(decision.behavior, 'ask');
    assert.ok(decision.message.includes('ask-with-justification'));
    assert.strictEqual(decision.permission.mode, 'edit');
  })) passed++; else failed++;

  if (test('returns null for empty bash command', () => {
    assert.strictEqual(classifyBashPermission('   '), null);
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
