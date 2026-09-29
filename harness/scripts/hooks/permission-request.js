#!/usr/bin/env node
'use strict';

const path = require('path');
const {
  readStdinJson,
  getSessionsDir,
  ensureDir,
  appendFile,
  getDateTimeString,
} = require('../lib/utils');
const {
  classifyBashPermission,
} = require('../lib/permission-resolver');

function logPermissionRequest(input) {
  const sessionsDir = getSessionsDir();
  ensureDir(sessionsDir);
  const logPath = path.join(sessionsDir, 'permission-requests.log');
  const command = String(input.tool_input?.command || '');
  const line = `[${getDateTimeString()}] ${input.tool_name || 'unknown'} ${command}\n`;
  appendFile(logPath, line);
}

function emitDecision(decision) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision,
    },
  }));
}

async function main() {
  const input = await readStdinJson();
  logPermissionRequest(input);

  if (input.tool_name !== 'Bash') {
    return;
  }

  const command = String(input.tool_input?.command || '');
  const decision = classifyBashPermission(command);
  if (decision) {
    emitDecision(decision);
  }
}

main().catch(() => process.exit(0));
