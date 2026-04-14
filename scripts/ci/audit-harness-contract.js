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
  const reviewTask = read('commands/review-task.md');
  const reviewTemplate = read('templates/review-summary-template.md');
  const verifyTask = read('commands/verify.md');
  const observationTemplate = read('templates/observation-summary-template.md');
  const hookSuite = read('tests/hooks/hooks.test.js');
  const reviewTemplatePath = path.join(ROOT, 'templates/review-summary-template.md');
  const observationTemplatePath = path.join(ROOT, 'templates/observation-summary-template.md');

  assertIncludes(claude, 'review-summary.md', 'CLAUDE.md');
  assertIncludes(harness, 'review-summary.md', 'HARNESS.md');
  assertIncludes(harness, 'severity prefix', 'HARNESS.md');
  assertIncludes(harness, 'concrete source', 'HARNESS.md');
  assertIncludes(session, 'review-summary.md', 'SESSION.md');
  assertIncludes(observe, 'Behavior Checked', 'OBSERVE.md');
  assertIncludes(observe, 'runtime health', 'OBSERVE.md');
  assertIncludes(observe, 'Verify vs Observe', 'OBSERVE.md');
  assertIncludes(hooksReadme, 'review-summary.md', 'hooks/README.md');
  assertIncludes(hooksReadme, 'unresolved findings', 'hooks/README.md');
  assertIncludes(hooksReadme, 'concrete evidence source', 'hooks/README.md');
  assertIncludes(hooksJson, 'review, verify, and observe artifacts', 'hooks/hooks.json');
  assertIncludes(taskArtifacts, "'review-summary.md'", 'task-artifacts.js');
  assertIncludes(taskArtifacts, 'OBSERVATION_EVIDENCE_SOURCE_PATTERN', 'task-artifacts.js');
  assertIncludes(preCommit, 'Missing review-summary.md', 'lifecycle-pre-commit.js');
  assertIncludes(preCommit, 'unresolved findings', 'lifecycle-pre-commit.js');
  assertIncludes(preCommit, 'Concrete evidence source required', 'lifecycle-pre-commit.js');
  assertIncludes(reviewTask, 'severity prefixes', 'review-task.md');
  assertIncludes(reviewTemplate, 'HIGH: missing runtime evidence', 'review-summary-template.md');
  assertIncludes(verifyTask, 'runtime health', 'verify.md');
  assertIncludes(verifyTask, 'looks good', 'verify.md');
  assertIncludes(observationTemplate, 'logs:', 'observation-summary-template.md');
  assertIncludes(observationTemplate, 'browser:', 'observation-summary-template.md');
  assertIncludes(hookSuite, 'KNOWN_BASELINE_FAILURES', 'hooks.test.js');
  assertIncludes(hookSuite, '--allow-known-baseline', 'hooks.test.js');
  assertIncludes(hookSuite, 'Unexpected failures', 'hooks.test.js');

  if (!fs.existsSync(reviewTemplatePath)) {
    throw new Error('templates/review-summary-template.md is missing');
  }
  if (!fs.existsSync(observationTemplatePath)) {
    throw new Error('templates/observation-summary-template.md is missing');
  }

  console.log('PASS: harness contract audit');
}

try {
  main();
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
}
