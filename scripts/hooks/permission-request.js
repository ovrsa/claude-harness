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

const SAFE_READONLY_BASH = [
  /^\s*pwd\s*$/,
  /^\s*ls(?:\s|$)/,
  /^\s*rg(?:\s|$)/,
  /^\s*sed\s+-n(?:\s|$)/,
  /^\s*cat(?:\s|$)/,
  /^\s*find(?:\s|$)/,
  /^\s*wc(?:\s|$)/,
  /^\s*head(?:\s|$)/,
  /^\s*tail(?:\s|$)/,
  /^\s*stat(?:\s|$)/,
  /^\s*file(?:\s|$)/,
  /^\s*readlink(?:\s|$)/,
  /^\s*which(?:\s|$)/,
  /^\s*git\s+(status|diff|log|show|rev-parse|branch)\b/,
];

const DANGEROUS_BASH = [
  /\brm\s+-rf\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\s+-fd\b/,
  /\bgit\s+push\b.*--force\b/,
  /\bchmod\s+-R\s+777\b/,
];

const AUDIT_ONLY_BASH = [
  /^\s*ps(?:\s|$)/,
  /^\s*whoami\s*$/,
  /^\s*id\s*$/,
  /^\s*date\s*$/,
];

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

function makeDecision(policyClass, behavior, message, extra = {}) {
  return {
    behavior,
    policy_class: policyClass,
    message: `${policyClass}: ${message}`,
    ...extra,
  };
}

async function main() {
  const input = await readStdinJson();
  logPermissionRequest(input);

  if (input.tool_name !== 'Bash') {
    return;
  }

  const command = String(input.tool_input?.command || '');

  if (DANGEROUS_BASH.some(pattern => pattern.test(command))) {
    emitDecision(makeDecision(
      'hard-deny',
      'deny',
      'Denied by personal harness boundary. Use a safer alternative or request an explicit override.',
      { interrupt: true }
    ));
    return;
  }

  if (SAFE_READONLY_BASH.some(pattern => pattern.test(command))) {
    emitDecision(makeDecision(
      'auto-allow',
      'allow',
      'Safe read-only inspection command.'
    ));
    return;
  }

  if (AUDIT_ONLY_BASH.some(pattern => pattern.test(command))) {
    emitDecision(makeDecision(
      'audit-only',
      'allow',
      'Low-risk metadata command allowed with logging.'
    ));
    return;
  }

  if (command.trim()) {
    emitDecision(makeDecision(
      'ask-with-justification',
      'ask',
      'Requires explicit human approval with a concrete justification.'
    ));
  }
}

main().catch(() => process.exit(0));
