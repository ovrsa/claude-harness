#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const VALIDATORS = [
  'validate-runtime-surface.js',
  'validate-hooks.js',
  'validate-commands.js',
  'validate-rules.js',
  'validate-no-personal-paths.js',
  'audit-harness-contract.js',
];

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
  console.log('\n=== Testing active validators ===\n');
  let passed = 0;
  let failed = 0;

  if (test('all active validators pass on the current harness', () => {
    for (const validator of VALIDATORS) {
      const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'ci', validator)], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      assert.strictEqual(result.status, 0, validator + ': ' + result.stderr);
    }
  })) passed += 1; else failed += 1;

  if (test('retired lifecycle validators are absent', () => {
    assert.strictEqual(fs.existsSync(path.join(ROOT, 'scripts', 'ci', 'validate-artifact-templates.js')), false);
    assert.strictEqual(fs.existsSync(path.join(ROOT, 'scripts', 'ci', 'smoke-harness-lifecycle.js')), false);
  })) passed += 1; else failed += 1;

  console.log('\nPassed: ' + passed);
  console.log('Failed: ' + failed);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
