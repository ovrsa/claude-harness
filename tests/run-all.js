#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const testsDir = __dirname;
const suites = {
  core: [
    'lib/managed-skill-resolver.test.js',
    'lib/experience-redaction.test.js',
    'lib/experience-store.test.js',
    'lib/permission-resolver.test.js',
    'lib/shell-split.test.js',
    'integration/experience-hooks.test.js',
    'integration/hooks.test.js',
    'scripts/experience-status.test.js',
    'ci/validators.test.js',
  ],
  hooks: [
    'integration/experience-hooks.test.js',
    'integration/hooks.test.js',
    'lib/permission-resolver.test.js',
  ],
  regression: [
    'lib/utils.test.js',
    'lib/package-manager.test.js',
    'lib/project-detect.test.js',
    'lib/session-aliases.test.js',
    'lib/session-manager.test.js',
    'scripts/claw.test.js',
    'scripts/setup-package-manager.test.js',
    'scripts/skill-create-output.test.js',
  ],
};

suites.full = [...new Set([...suites.core, ...suites.regression])];

function suiteName(argv) {
  const inline = argv.find((arg) => arg.startsWith('--suite='));
  if (inline) return inline.slice('--suite='.length);
  const index = argv.indexOf('--suite');
  return index >= 0 && argv[index + 1] ? argv[index + 1] : 'full';
}

const selected = suiteName(process.argv.slice(2));
if (!suites[selected]) {
  console.error('Unknown test suite: ' + selected);
  process.exit(1);
}

let failedFiles = 0;
for (const relativePath of suites[selected]) {
  const testPath = path.join(testsDir, relativePath);
  if (!fs.existsSync(testPath)) {
    console.error('Missing test file: ' + relativePath);
    failedFiles += 1;
    continue;
  }
  console.log('\n━━━ Running ' + relativePath + ' ━━━');
  const result = spawnSync(process.execPath, [testPath], { encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) failedFiles += 1;
}

console.log('\nSuite: ' + selected);
console.log('Files: ' + suites[selected].length);
console.log('Failed: ' + failedFiles);
process.exit(failedFiles > 0 ? 1 : 0);
