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
  const harness = read('docs/harness-structure-and-ownership.md');
  const operatingModel = read('docs/harness-operating-loop.md');
  const session = read('docs/session-resume-state.md');
  const observe = read('docs/runtime-evidence-requirements.md');
  const hooksReadme = read('hooks/README.md');
  const hooksJson = read('hooks/hooks.json');
  const sessionTrace = read('scripts/lib/session-trace.js');
  const taskArtifacts = read('scripts/lib/task-artifacts.js');
  const preCommit = read('hooks/lifecycle-pre-commit.js');
  const readme = read('README.md');
  const commandIndex = read('commands/COMMANDS.md');
  const evalCommand = read('commands/eval.md');
  const healthStatusCommand = read('commands/health-status.md');
  const planCommand = read('commands/plan.md');
  const planTaskCommand = read('commands/plan-task.md');
  const reviewTask = read('commands/review-task.md');
  const repoMapCommand = read('commands/repo-map.md');
  const researchCommand = read('commands/research.md');
  const researchTaskCommand = read('commands/research-task.md');
  const triageLoopCommand = read('commands/triage-loop.md');
  const healthTemplate = read('templates/health-summary-template.md');
  const reviewTemplate = read('templates/review-summary-template.md');
  const repoMapTemplate = read('templates/repo-map-template.md');
  const triageTemplate = read('templates/triage-summary-template.md');
  const verifyTask = read('commands/verify.md');
  const observationTemplate = read('templates/observation-summary-template.md');
  const postCommitCapture = read('commands/post-commit-capture.md');
  const hookSuite = read('tests/hooks/hooks.test.js');
  const commandIndexPath = path.join(ROOT, 'commands/COMMANDS.md');
  const operatingModelPath = path.join(ROOT, 'docs/harness-operating-loop.md');
  const healthTemplatePath = path.join(ROOT, 'templates/health-summary-template.md');
  const reviewTemplatePath = path.join(ROOT, 'templates/review-summary-template.md');
  const observationTemplatePath = path.join(ROOT, 'templates/observation-summary-template.md');
  const repoMapTemplatePath = path.join(ROOT, 'templates/repo-map-template.md');
  const triageTemplatePath = path.join(ROOT, 'templates/triage-summary-template.md');
  const verificationTemplatePath = path.join(ROOT, 'templates/verification-summary-template.md');

  assertIncludes(claude, 'docs/harness-operating-loop.md', 'CLAUDE.md');
  assertIncludes(claude, 'commands/COMMANDS.md', 'CLAUDE.md');
  assertIncludes(claude, 'review-summary.md', 'CLAUDE.md');
  assertIncludes(claude, 'guardrail candidates', 'CLAUDE.md');
  assertIncludes(claude, 'repo-local map', 'CLAUDE.md');
  assertIncludes(claude, 'AGENTS.md', 'CLAUDE.md');
  assertIncludes(claude, 'health and triage', 'CLAUDE.md');
  assertIncludes(harness, 'docs/harness-operating-loop.md', 'docs/harness-structure-and-ownership.md');
  assertIncludes(harness, 'commands/COMMANDS.md', 'docs/harness-structure-and-ownership.md');
  assertIncludes(harness, 'review-summary.md', 'docs/harness-structure-and-ownership.md');
  assertIncludes(harness, 'severity prefix', 'docs/harness-structure-and-ownership.md');
  assertIncludes(harness, 'concrete source', 'docs/harness-structure-and-ownership.md');
  assertIncludes(harness, 'docs', 'docs/harness-structure-and-ownership.md');
  assertIncludes(harness, 'command', 'docs/harness-structure-and-ownership.md');
  assertIncludes(harness, 'hook', 'docs/harness-structure-and-ownership.md');
  assertIncludes(harness, 'skill', 'docs/harness-structure-and-ownership.md');
  assertIncludes(harness, 'Repo-Local Maps', 'docs/harness-structure-and-ownership.md');
  assertIncludes(harness, 'codemaps', 'docs/harness-structure-and-ownership.md');
  assertIncludes(harness, 'Triage And Health Loop', 'docs/harness-structure-and-ownership.md');
  assertIncludes(harness, 'promotion-ready', 'docs/harness-structure-and-ownership.md');
  assertIncludes(harness, 'resolved', 'docs/harness-structure-and-ownership.md');
  assertIncludes(operatingModel, 'Lifecycle Loop', 'docs/harness-operating-loop.md');
  assertIncludes(operatingModel, 'post-commit capture', 'docs/harness-operating-loop.md');
  assertIncludes(operatingModel, 'Enforced Now', 'docs/harness-operating-loop.md');
  assertIncludes(operatingModel, 'Not Enforced Yet', 'docs/harness-operating-loop.md');
  assertIncludes(operatingModel, 'health / triage', 'docs/harness-operating-loop.md');
  assertIncludes(session, 'review-summary.md', 'docs/session-resume-state.md');
  assertIncludes(session, 'telemetry.db', 'docs/session-resume-state.md');
  assertIncludes(session, 'run_state', 'docs/session-resume-state.md');
  assertIncludes(observe, 'Behavior Checked', 'docs/runtime-evidence-requirements.md');
  assertIncludes(observe, 'runtime health', 'docs/runtime-evidence-requirements.md');
  assertIncludes(observe, 'Verify vs Observe', 'docs/runtime-evidence-requirements.md');
  assertIncludes(readme, 'Repo-Local Maps', 'README.md');
  assertIncludes(readme, 'commands/COMMANDS.md', 'README.md');
  assertIncludes(readme, 'AGENTS.md', 'README.md');
  assertIncludes(readme, 'Triage And Health Loop', 'README.md');
  assertIncludes(readme, '/health-status', 'README.md');
  assertIncludes(readme, '/triage-loop', 'README.md');
  assertIncludes(commandIndex, 'Preferred Lifecycle Path', 'commands/COMMANDS.md');
  assertIncludes(commandIndex, '/eval', 'commands/COMMANDS.md');
  assertIncludes(commandIndex, 'Core Lifecycle Pairs', 'commands/COMMANDS.md');
  assertIncludes(commandIndex, 'Continuous Learning And Promotion', 'commands/COMMANDS.md');
  assertIncludes(commandIndex, 'Advanced Orchestration And Loops', 'commands/COMMANDS.md');
  assertIncludes(commandIndex, 'Visibility Tiers', 'commands/COMMANDS.md');
  assertIncludes(evalCommand, 'acceptance gate', 'eval.md');
  assertIncludes(evalCommand, '/review-task', 'eval.md');
  assertIncludes(evalCommand, '/verify', 'eval.md');
  assertIncludes(planCommand, '/plan-task', 'plan.md');
  assertIncludes(planTaskCommand, '/plan', 'plan-task.md');
  assertIncludes(researchCommand, '/research-task', 'research.md');
  assertIncludes(researchTaskCommand, '/research', 'research-task.md');
  assertIncludes(hooksReadme, 'review-summary.md', 'hooks/README.md');
  assertIncludes(hooksReadme, 'telemetry.db', 'hooks/README.md');
  assertIncludes(hooksReadme, 'unresolved findings', 'hooks/README.md');
  assertIncludes(hooksReadme, 'concrete evidence source', 'hooks/README.md');
  assertIncludes(hooksReadme, 'guardrail candidates', 'hooks/README.md');
  assertIncludes(hooksJson, 'review, verify, and observe artifacts', 'hooks/hooks.json');
  assertIncludes(hooksJson, 'telemetry-pre-tool.js', 'hooks/hooks.json');
  assertIncludes(hooksJson, 'telemetry-post-tool.js', 'hooks/hooks.json');
  assertIncludes(sessionTrace, 'CREATE TABLE IF NOT EXISTS run_state', 'session-trace.js');
  assertIncludes(sessionTrace, 'CREATE TABLE IF NOT EXISTS tool_executions', 'session-trace.js');
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

  if (!fs.existsSync(operatingModelPath)) {
    throw new Error('docs/harness-operating-loop.md is missing');
  }
  if (!fs.existsSync(commandIndexPath)) {
    throw new Error('commands/COMMANDS.md is missing');
  }
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
