#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildExperienceStatus } = require('../../scripts/experience-status');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    return false;
  }
}

function runTests() {
  console.log('\n=== Testing experience-status.js ===\n');
  let passed = 0;
  let failed = 0;

  const cases = [
    ['summarizes runs, bytes, outcomes, and experiments without mutation', () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'experience-status-'));
      const experienceRoot = path.join(root, 'experience');
      const experimentsRoot = path.join(root, 'experiments');
      writeJson(path.join(experienceRoot, 'runs', 'run-a', 'manifest.json'), { runId: 'run-a' });
      writeJson(path.join(experienceRoot, 'runs', 'run-a', 'outcome.json'), { outcome: 'accepted', finalizedAt: '2026-08-10T00:00:00.000Z' });
      writeJson(path.join(experienceRoot, 'runs', 'run-b', 'manifest.json'), { runId: 'run-b' });
      fs.mkdirSync(path.join(experimentsRoot, 'experiment-a'), { recursive: true });
      fs.mkdirSync(path.join(experimentsRoot, 'experiment-b'), { recursive: true });
      const before = fs.statSync(experienceRoot).mtimeMs;

      const status = buildExperienceStatus({ experienceRoot, experimentsRoot });
      assert.strictEqual(status.runCount, 2);
      assert.ok(status.totalBytes > 0);
      assert.strictEqual(status.outcomeCounts.accepted, 1);
      assert.strictEqual(status.outcomeCounts.unknown, 1);
      assert.strictEqual(status.unclassifiedRuns, 1);
      assert.strictEqual(status.lastFinalizedRun.runId, 'run-a');
      assert.strictEqual(status.experimentCount, 2);
      assert.strictEqual(fs.statSync(experienceRoot).mtimeMs, before);
    }],
    ['reports an empty absent store without creating directories', () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'experience-status-empty-'));
      const experienceRoot = path.join(root, 'missing-experience');
      const experimentsRoot = path.join(root, 'missing-experiments');
      const status = buildExperienceStatus({ experienceRoot, experimentsRoot });
      assert.strictEqual(status.runCount, 0);
      assert.strictEqual(status.totalBytes, 0);
      assert.strictEqual(status.unclassifiedRuns, 0);
      assert.strictEqual(status.lastFinalizedRun, null);
      assert.strictEqual(status.experimentCount, 0);
      assert.strictEqual(fs.existsSync(experienceRoot), false);
      assert.strictEqual(fs.existsSync(experimentsRoot), false);
    }],
  ];

  for (const [name, fn] of cases) {
    if (test(name, fn)) passed += 1;
    else failed += 1;
  }

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
