#!/usr/bin/env node

const assert = require('assert');

const resolver = require('../../scripts/lib/permission-resolver');
const { classifyBashPermission } = resolver;

function test(name, fn) {
  try {
    fn();
    console.log('  ✓ ' + name);
    return true;
  } catch (error) {
    console.log('  ✗ ' + name);
    console.log('    Error: ' + error.message);
    return false;
  }
}

function runTests() {
  console.log('\n=== Testing permission-resolver.js ===\n');
  let passed = 0;
  let failed = 0;

  const cases = [
    ['exports only the active Bash permission classifier and policy tables', () => {
      assert.deepStrictEqual(Object.keys(resolver).sort(), [
        'AUDIT_ONLY_BASH',
        'DANGEROUS_BASH',
        'SAFE_READONLY_BASH',
        'classifyBashPermission',
      ]);
    }],
    ['hard-denies destructive rm', () => {
      const decision = classifyBashPermission('rm -rf /tmp/test-target');
      assert.deepStrictEqual(decision, {
        behavior: 'deny',
        policy_class: 'hard-deny',
        message: 'hard-deny: Denied by personal harness boundary. Use a safer alternative or request an explicit override.',
        interrupt: true,
        blocked_actions: ['destructive rm'],
      });
    }],
    ['hard-denies git reset hard', () => {
      const decision = classifyBashPermission('git reset --hard HEAD');
      assert.strictEqual(decision.policy_class, 'hard-deny');
      assert.ok(decision.blocked_actions.includes('git reset hard'));
    }],
    ['auto-allows readonly inspection', () => {
      assert.strictEqual(classifyBashPermission('rg pattern src').behavior, 'allow');
      assert.strictEqual(classifyBashPermission('git status --short').policy_class, 'auto-allow');
    }],
    ['allows low-risk metadata as audit-only without writing a log', () => {
      assert.strictEqual(classifyBashPermission('date').policy_class, 'audit-only');
      assert.strictEqual(classifyBashPermission('ps -ef').behavior, 'allow');
    }],
    ['asks for non-readonly commands', () => {
      const decision = classifyBashPermission('npm test');
      assert.deepStrictEqual(decision, {
        behavior: 'ask',
        policy_class: 'ask-with-justification',
        message: 'ask-with-justification: Requires explicit human approval with a concrete justification.',
      });
    }],
    ['returns null for empty input', () => {
      assert.strictEqual(classifyBashPermission('   '), null);
    }],
  ];

  for (const [name, fn] of cases) {
    if (test(name, fn)) passed += 1;
    else failed += 1;
  }

  console.log('\nPassed: ' + passed);
  console.log('Failed: ' + failed);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
