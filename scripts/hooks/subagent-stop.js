#!/usr/bin/env node
'use strict';

const path = require('path');
const {
  readStdinJson,
  getSessionsDir,
  ensureDir,
  appendFile,
  findFiles,
  getDateTimeString,
} = require('../lib/utils');

function summarize(input) {
  const agent =
    input.subagent_name ||
    input.agent_name ||
    'unknown';
  const status =
    input.stop_reason ||
    input.status ||
    'completed';
  const message =
    input.last_assistant_message ||
    input.summary ||
    'subagent completed';
  const nextAction =
    input.next_action ||
    input.nextAction ||
    '';

  return {
    agent: String(agent).replace(/\s+/g, ' ').slice(0, 120),
    status: String(status).replace(/\s+/g, ' ').slice(0, 120),
    summary: String(message).replace(/\s+/g, ' ').slice(0, 300),
    nextAction: String(nextAction).replace(/\s+/g, ' ').slice(0, 200),
  };
}

async function main() {
  const input = await readStdinJson();
  const sessionsDir = getSessionsDir();
  ensureDir(sessionsDir);

  const summary = summarize(input);
  const logLine = `[${getDateTimeString()}] agent=${summary.agent} status=${summary.status} summary=${summary.summary}${summary.nextAction ? ` next_action=${summary.nextAction}` : ''}\n`;
  appendFile(path.join(sessionsDir, 'subagent-stop.log'), logLine);

  const sessions = findFiles(sessionsDir, '*-session.tmp');
  if (sessions.length > 0) {
    const lines = [
      '',
      '### Subagent Update',
      `- agent=${summary.agent}`,
      `- status=${summary.status}`,
      `- summary=${summary.summary}`,
    ];
    if (summary.nextAction) {
      lines.push(`- next_action=${summary.nextAction}`);
    }
    appendFile(sessions[0].path, `${lines.join('\n')}\n`);
  }
}

main().catch(() => process.exit(0));
