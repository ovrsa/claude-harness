#!/usr/bin/env node
'use strict';

const {
  readStdinJson,
} = require('../lib/utils');
const {
  classifyBashPermission,
} = require('../lib/permission-resolver');

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
