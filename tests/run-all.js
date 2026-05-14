#!/usr/bin/env node
/**
 * Run all tests
 *
 * Usage: node tests/run-all.js
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const testsDir = __dirname;
const testFiles = [
  { file: 'lib/utils.test.js' },
  { file: 'lib/package-manager.test.js' },
  { file: 'lib/session-manager.test.js' },
  { file: 'lib/session-aliases.test.js' },
  { file: 'lib/project-detect.test.js' },
  { file: 'lib/task-artifacts.test.js' },
  { file: 'lib/session-trace.test.js' },
  { file: 'lib/permission-resolver.test.js' },
  { file: 'lib/pipeline-evidence.test.js' },
  { file: 'lib/harness-status.test.js' },
  { file: 'lib/telemetry-health.test.js' },
  { file: 'lib/triage-loop.test.js' },
  { file: 'hooks/hooks.test.js', args: ['--allow-known-baseline'] },
  { file: 'hooks/evaluate-session.test.js' },
  { file: 'hooks/suggest-compact.test.js' },
  { file: 'integration/hooks.test.js' },
  { file: 'ci/validators.test.js' },
  { file: 'scripts/claw.test.js' },
  { file: 'scripts/pipeline-runner.test.js' },
  { file: 'scripts/provider-adapters.test.js' },
  { file: 'scripts/prompt-assemble.test.js' },
  { file: 'scripts/task-queue.test.js' },
  { file: 'scripts/workflow-doctor.test.js' },
  { file: 'scripts/harness-status.test.js' },
  { file: 'scripts/setup-package-manager.test.js' },
  { file: 'scripts/skill-create-output.test.js' }
];

const BOX_W = 58; // inner width between ║ delimiters
const boxLine = (s) => `║${s.padEnd(BOX_W)}║`;

console.log('╔' + '═'.repeat(BOX_W) + '╗');
console.log(boxLine('           Everything Claude Code - Test Suite'));
console.log('╚' + '═'.repeat(BOX_W) + '╝');
console.log();

let totalPassed = 0;
let totalFailed = 0;
let totalTests = 0;

for (const testEntry of testFiles) {
  const testFile = typeof testEntry === 'string' ? testEntry : testEntry.file;
  const testArgs = typeof testEntry === 'string' ? [] : (testEntry.args || []);
  const testPath = path.join(testsDir, testFile);

  if (!fs.existsSync(testPath)) {
    console.log(`⚠ Skipping ${testFile} (file not found)`);
    continue;
  }

  console.log(`\n━━━ Running ${testFile} ━━━`);

  const result = spawnSync(process.execPath, [testPath, ...testArgs], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';

  // Show both stdout and stderr so hook warnings are visible
  if (stdout) console.log(stdout);
  if (stderr) console.log(stderr);

  // Parse results from combined output
  const combined = stdout + stderr;
  const passedMatch = combined.match(/Passed:\s*(\d+)/);
  const failedMatch = combined.match(/Failed:\s*(\d+)/);
  const unexpectedFailedMatch = combined.match(/Unexpected failures:\s*(\d+)/);

  if (passedMatch) totalPassed += parseInt(passedMatch[1], 10);
  if (unexpectedFailedMatch) {
    totalFailed += parseInt(unexpectedFailedMatch[1], 10);
  } else if (failedMatch) {
    totalFailed += parseInt(failedMatch[1], 10);
  }
}

totalTests = totalPassed + totalFailed;

console.log('\n╔' + '═'.repeat(BOX_W) + '╗');
console.log(boxLine('                     Final Results'));
console.log('╠' + '═'.repeat(BOX_W) + '╣');
console.log(boxLine(`  Total Tests: ${String(totalTests).padStart(4)}`));
console.log(boxLine(`  Passed:      ${String(totalPassed).padStart(4)}  ✓`));
console.log(boxLine(`  Failed:      ${String(totalFailed).padStart(4)}  ${totalFailed > 0 ? '✗' : ' '}`));
console.log('╚' + '═'.repeat(BOX_W) + '╝');

process.exit(totalFailed > 0 ? 1 : 0);
