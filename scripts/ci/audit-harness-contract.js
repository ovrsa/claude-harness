#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function read(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  return fs.readFileSync(fullPath, 'utf8');
}

function assertIncludes(content, needle, label) {
  if (!content.includes(needle)) {
    throw new Error(`${label} is missing "${needle}"`);
  }
}

function main() {
  const claude = read('CLAUDE.md');
  const harness = read('HARNESS.md');
  const session = read('SESSION.md');
  const observe = read('OBSERVE.md');
  const hooksReadme = read('hooks/README.md');
  const hooksJson = read('hooks/hooks.json');
  const taskArtifacts = read('scripts/lib/task-artifacts.js');
  const preCommit = read('hooks/lifecycle-pre-commit.js');
  const reviewTemplatePath = path.join(ROOT, 'templates/review-summary-template.md');

  assertIncludes(claude, 'review-summary.md', 'CLAUDE.md');
  assertIncludes(harness, 'review-summary.md', 'HARNESS.md');
  assertIncludes(session, 'review-summary.md', 'SESSION.md');
  assertIncludes(observe, 'Behavior Checked', 'OBSERVE.md');
  assertIncludes(observe, 'Remaining Uncertainty', 'OBSERVE.md');
  assertIncludes(hooksReadme, 'review-summary.md', 'hooks/README.md');
  assertIncludes(hooksJson, 'review, verify, and observe artifacts', 'hooks/hooks.json');
  assertIncludes(taskArtifacts, "'review-summary.md'", 'task-artifacts.js');
  assertIncludes(preCommit, 'Missing review-summary.md', 'lifecycle-pre-commit.js');

  if (!fs.existsSync(reviewTemplatePath)) {
    throw new Error('templates/review-summary-template.md is missing');
  }

  console.log('PASS: harness contract audit');
}

try {
  main();
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
}
