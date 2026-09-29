/**
 * Tests for harness/scripts/hooks/statusline.sh
 *
 * Only the context segment on line 1 is checked. The rest of the output comes
 * from git and rate-limit fields that these inputs leave empty.
 *
 * Run with: node harness/tests/scripts/statusline.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '../../scripts/hooks/statusline.sh');
const BLUE = '\x1b[94m';
const RED = '\x1b[31m';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    failed += 1;
  }
}

// cwd is a non-repo temp dir so the git segments stay empty.
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'statusline-'));

function contextSegment({ windowSize, used, usage }) {
  const contextWindow = {
    current_usage: usage !== undefined ? usage : { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: used },
  };
  if (windowSize !== undefined) contextWindow.context_window_size = windowSize;
  const result = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    input: JSON.stringify({ cwd: workDir, model: { display_name: 'Opus 5' }, context_window: contextWindow }),
    timeout: 10000,
  });
  assert.strictEqual(result.status, 0, result.stderr);
  return result.stdout.split('\n')[0].split('  |  ').pop();
}

function expectSegment(input, pct, color) {
  assert.strictEqual(contextSegment(input), `${color}Ctx Used: ${pct}%\x1b[0m`);
}

console.log('\n=== statusline.sh context segment ===\n');

test('1M window below 40% is blue and shows the share of the whole window', () => {
  expectSegment({ windowSize: 1000000, used: 350000 }, '35.0', BLUE);
});

test('one token below 40% stays blue and does not round up to 40.0', () => {
  expectSegment({ windowSize: 1000000, used: 399999 }, '39.9', BLUE);
});

test('exactly 40% of a 1M window turns red', () => {
  expectSegment({ windowSize: 1000000, used: 400000 }, '40.0', RED);
});

test('just under the 60% auto compact point is still red', () => {
  expectSegment({ windowSize: 1000000, used: 590000 }, '59.0', RED);
});

test('200K window switches at 80K', () => {
  expectSegment({ windowSize: 200000, used: 79999 }, '39.9', BLUE);
  expectSegment({ windowSize: 200000, used: 80000 }, '40.0', RED);
});

test('missing window size falls back to 200K', () => {
  expectSegment({ used: 80000 }, '40.0', RED);
});

test('non-numeric window size is treated as zero instead of dividing by it', () => {
  expectSegment({ windowSize: 'abc', used: 400000 }, '0.0', BLUE);
});

test('usage above the window is capped at 100%', () => {
  expectSegment({ windowSize: 1000000, used: 1200000 }, '100.0', RED);
});

test('no usage yet shows 0.0% in blue', () => {
  expectSegment({ windowSize: 1000000, usage: null }, '0.0', BLUE);
});

fs.rmSync(workDir, { recursive: true, force: true });

console.log(`\nResults: Passed: ${passed}, Failed: ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);
