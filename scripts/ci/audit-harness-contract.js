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
  const readme = read('README.md');
  const healthStatusCommand = read('commands/health-status.md');
  const reviewTask = read('commands/review-task.md');
  const repoMapCommand = read('commands/repo-map.md');
  const triageLoopCommand = read('commands/triage-loop.md');
  const healthTemplate = read('templates/health-summary-template.md');
  const reviewTemplate = read('templates/review-summary-template.md');
  const repoMapTemplate = read('templates/repo-map-template.md');
  const triageTemplate = read('templates/triage-summary-template.md');
  const verifyTask = read('commands/verify.md');
  const observationTemplate = read('templates/observation-summary-template.md');
  const postCommitCapture = read('commands/post-commit-capture.md');
  const hookSuite = read('tests/hooks/hooks.test.js');
  const healthTemplatePath = path.join(ROOT, 'templates/health-summary-template.md');
  const reviewTemplatePath = path.join(ROOT, 'templates/review-summary-template.md');
  const observationTemplatePath = path.join(ROOT, 'templates/observation-summary-template.md');
  const repoMapTemplatePath = path.join(ROOT, 'templates/repo-map-template.md');
  const triageTemplatePath = path.join(ROOT, 'templates/triage-summary-template.md');
  const verificationTemplatePath = path.join(ROOT, 'templates/verification-summary-template.md');

  assertIncludes(claude, 'review-summary.md', 'CLAUDE.md');
  assertIncludes(claude, 'guardrail candidates', 'CLAUDE.md');
  assertIncludes(claude, 'repo-local map', 'CLAUDE.md');
  assertIncludes(claude, 'AGENTS.md', 'CLAUDE.md');
  assertIncludes(claude, 'health and triage', 'CLAUDE.md');
  assertIncludes(harness, 'review-summary.md', 'HARNESS.md');
  assertIncludes(harness, 'severity prefix', 'HARNESS.md');
  assertIncludes(harness, 'concrete source', 'HARNESS.md');
  assertIncludes(harness, 'docs', 'HARNESS.md');
  assertIncludes(harness, 'command', 'HARNESS.md');
  assertIncludes(harness, 'hook', 'HARNESS.md');
  assertIncludes(harness, 'skill', 'HARNESS.md');
  assertIncludes(harness, 'Repo-Local Maps', 'HARNESS.md');
  assertIncludes(harness, 'codemaps', 'HARNESS.md');
  assertIncludes(harness, 'Triage And Health Loop', 'HARNESS.md');
  assertIncludes(harness, 'promotion-ready', 'HARNESS.md');
  assertIncludes(harness, 'resolved', 'HARNESS.md');
  assertIncludes(session, 'review-summary.md', 'SESSION.md');
  assertIncludes(observe, 'Behavior Checked', 'OBSERVE.md');
  assertIncludes(observe, 'runtime health', 'OBSERVE.md');
  assertIncludes(observe, 'Verify vs Observe', 'OBSERVE.md');
  assertIncludes(readme, 'Repo-Local Maps', 'README.md');
  assertIncludes(readme, 'AGENTS.md', 'README.md');
  assertIncludes(readme, 'Triage And Health Loop', 'README.md');
  assertIncludes(readme, '/health-status', 'README.md');
  assertIncludes(readme, '/triage-loop', 'README.md');
  assertIncludes(hooksReadme, 'review-summary.md', 'hooks/README.md');
  assertIncludes(hooksReadme, 'unresolved findings', 'hooks/README.md');
  assertIncludes(hooksReadme, 'concrete evidence source', 'hooks/README.md');
  assertIncludes(hooksReadme, 'guardrail candidates', 'hooks/README.md');
  assertIncludes(hooksJson, 'review, verify, and observe artifacts', 'hooks/hooks.json');
  assertIncludes(taskArtifacts, "'review-summary.md'", 'task-artifacts.js');
  assertIncludes(taskArtifacts, 'OBSERVATION_EVIDENCE_SOURCE_PATTERN', 'task-artifacts.js');
  assertIncludes(preCommit, 'Missing review-summary.md', 'lifecycle-pre-commit.js');
  assertIncludes(preCommit, 'unresolved findings', 'lifecycle-pre-commit.js');
  assertIncludes(preCommit, 'Concrete evidence source required', 'lifecycle-pre-commit.js');
  assertIncludes(reviewTask, 'Guardrail Candidates', 'review-task.md');
  assertIncludes(repoMapCommand, 'AGENTS.md', 'repo-map.md');
  assertIncludes(repoMapCommand, 'Keep the file short', 'repo-map.md');
  assertIncludes(healthStatusCommand, 'current local harness health', 'health-status.md');
  assertIncludes(healthStatusCommand, 'avoid making promotion decisions', 'health-status.md');
  assertIncludes(reviewTask, 'severity prefixes', 'review-task.md');
  assertIncludes(triageLoopCommand, 'next follow-up tasks', 'triage-loop.md');
  assertIncludes(triageLoopCommand, 'avoid auto-promoting', 'triage-loop.md');
  assertIncludes(healthTemplate, 'Signal Window', 'health-summary-template.md');
  assertIncludes(healthTemplate, 'Grouped Patterns', 'health-summary-template.md');
  assertIncludes(reviewTemplate, 'HIGH: missing runtime evidence', 'review-summary-template.md');
  assertIncludes(reviewTemplate, 'Guardrail Candidates', 'review-summary-template.md');
  assertIncludes(repoMapTemplate, 'Repository Purpose', 'repo-map-template.md');
  assertIncludes(repoMapTemplate, 'Local Boundaries', 'repo-map-template.md');
  assertIncludes(triageTemplate, 'Recommended Next Tasks', 'triage-summary-template.md');
  assertIncludes(triageTemplate, 'Monitor Only', 'triage-summary-template.md');
  assertIncludes(verifyTask, 'runtime health', 'verify.md');
  assertIncludes(verifyTask, 'looks good', 'verify.md');
  assertIncludes(verifyTask, 'Guardrail Candidates', 'verify.md');
  assertIncludes(read('commands/update-codemaps.md'), 'repo-local map', 'update-codemaps.md');
  assertIncludes(read('commands/update-codemaps.md'), 'not the first repo entrypoint', 'update-codemaps.md');
  assertIncludes(observationTemplate, 'logs:', 'observation-summary-template.md');
  assertIncludes(observationTemplate, 'browser:', 'observation-summary-template.md');
  assertIncludes(observationTemplate, 'Guardrail Candidates', 'observation-summary-template.md');
  assertIncludes(postCommitCapture, 'docs update', 'post-commit-capture.md');
  assertIncludes(postCommitCapture, 'hook follow-up', 'post-commit-capture.md');
  assertIncludes(postCommitCapture, 'skill candidate', 'post-commit-capture.md');
  assertIncludes(postCommitCapture, 'triage and health loop', 'post-commit-capture.md');
  assertIncludes(hookSuite, 'KNOWN_BASELINE_FAILURES', 'hooks.test.js');
  assertIncludes(hookSuite, '--allow-known-baseline', 'hooks.test.js');
  assertIncludes(hookSuite, 'Unexpected failures', 'hooks.test.js');

  if (!fs.existsSync(healthTemplatePath)) {
    throw new Error('templates/health-summary-template.md is missing');
  }
  if (!fs.existsSync(reviewTemplatePath)) {
    throw new Error('templates/review-summary-template.md is missing');
  }
  if (!fs.existsSync(observationTemplatePath)) {
    throw new Error('templates/observation-summary-template.md is missing');
  }
  if (!fs.existsSync(repoMapTemplatePath)) {
    throw new Error('templates/repo-map-template.md is missing');
  }
  if (!fs.existsSync(triageTemplatePath)) {
    throw new Error('templates/triage-summary-template.md is missing');
  }
  if (!fs.existsSync(verificationTemplatePath)) {
    throw new Error('templates/verification-summary-template.md is missing');
  }

  console.log('PASS: harness contract audit');
}

try {
  main();
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
}
