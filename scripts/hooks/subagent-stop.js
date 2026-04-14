#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  readStdinJson,
  getSessionsDir,
  ensureDir,
  appendFile,
  findFiles,
  getDateTimeString,
} = require('../lib/utils');
const {
  getRepoRoot,
  parseProgressState,
  writeProgressCheckpoint,
  writeProgressDelegatedHandoff,
} = require('../lib/task-artifacts');

function summarize(input) {
  const goal =
    input.goal ||
    input.task ||
    input.prompt ||
    '';
  const agent =
    input.subagent_name ||
    input.agent_name ||
    'unknown';
  const status =
    input.stop_reason ||
    input.status ||
    'completed';
  const message =
    input.summary ||
    input.last_assistant_message ||
    'subagent completed';
  const openRisks =
    input.open_risks ||
    input.openRisks ||
    '';
  const nextAction =
    input.next_action ||
    input.nextAction ||
    '';
  const filesTouched = Array.isArray(input.files_touched)
    ? input.files_touched.join(', ')
    : (input.files_touched || input.filesTouched || '');
  const verificationRun = Array.isArray(input.verification_run)
    ? input.verification_run.join(' | ')
    : (input.verification_run || input.verificationRun || '');

  return {
    goal: String(goal).replace(/\s+/g, ' ').slice(0, 200),
    agent: String(agent).replace(/\s+/g, ' ').slice(0, 120),
    status: String(status).replace(/\s+/g, ' ').slice(0, 120),
    summary: String(message).replace(/\s+/g, ' ').slice(0, 300),
    openRisks: String(openRisks).replace(/\s+/g, ' ').slice(0, 200),
    nextAction: String(nextAction).replace(/\s+/g, ' ').slice(0, 200),
    filesTouched: String(filesTouched).replace(/\s+/g, ' ').slice(0, 240),
    verificationRun: String(verificationRun).replace(/\s+/g, ' ').slice(0, 240),
  };
}

async function main() {
  const input = await readStdinJson();
  const sessionsDir = getSessionsDir();
  ensureDir(sessionsDir);

  const summary = summarize(input);
  const parts = [
    `[${getDateTimeString()}]`,
    `agent=${summary.agent}`,
    `status=${summary.status}`,
  ];
  if (summary.goal) parts.push(`goal=${summary.goal}`);
  parts.push(`summary=${summary.summary}`);
  if (summary.openRisks) parts.push(`open_risks=${summary.openRisks}`);
  if (summary.nextAction) parts.push(`next_action=${summary.nextAction}`);
  if (summary.filesTouched) parts.push(`files_touched=${summary.filesTouched}`);
  if (summary.verificationRun) parts.push(`verification_run=${summary.verificationRun}`);
  const logLine = `${parts.join(' ')}\n`;
  appendFile(path.join(sessionsDir, 'subagent-stop.log'), logLine);

  const sessions = findFiles(sessionsDir, '*-session.tmp');
  if (sessions.length > 0) {
    const lines = [
      '',
      '### Subagent Update',
      `- agent=${summary.agent}`,
      `- status=${summary.status}`,
      ...(summary.goal ? [`- goal=${summary.goal}`] : []),
      `- summary=${summary.summary}`,
      `- result=${summary.summary}`,
      ...(summary.openRisks ? [`- open_risks=${summary.openRisks}`] : []),
      ...(summary.filesTouched ? [`- files_touched=${summary.filesTouched}`] : []),
      ...(summary.verificationRun ? [`- verification_run=${summary.verificationRun}`] : []),
    ];
    if (summary.nextAction) {
      lines.push(`- next_action=${summary.nextAction}`);
    }
    appendFile(sessions[0].path, `${lines.join('\n')}\n`);
  }

  const repoRoot = getRepoRoot(process.cwd());
  const progressPath = repoRoot ? path.join(repoRoot, 'progress.md') : null;
  if (progressPath && fs.existsSync(progressPath)) {
    const progress = parseProgressState(fs.readFileSync(progressPath, 'utf8'));
    writeProgressDelegatedHandoff(progressPath, {
      updatedAt: getDateTimeString(),
      agent: summary.agent,
      status: summary.status,
      goal: summary.goal,
      result: summary.summary,
      filesTouched: summary.filesTouched ? summary.filesTouched.split(/\s*,\s*/) : [],
      verificationRun: summary.verificationRun ? summary.verificationRun.split(/\s*\|\s*/) : [],
      openRisks: summary.openRisks,
      nextAction: summary.nextAction,
    });
    writeProgressCheckpoint(progressPath, {
      updatedAt: getDateTimeString(),
      event: 'subagent-stop',
      currentPhase: progress.currentPhase,
      lastCompletedStep: summary.summary || progress.lastCompletedStep,
      suggestedNextAction: summary.nextAction || (progress.nextActionExplicitNone ? 'none' : progress.nextAction),
      blockers: progress.blockers,
      delegatedWork: progress.delegatedWork.length > 0
        ? progress.delegatedWork
        : (summary.goal ? [`${summary.agent}: ${summary.goal}`] : []),
    });
  }
}

main().catch(() => process.exit(0));
