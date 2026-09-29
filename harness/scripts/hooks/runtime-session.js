#!/usr/bin/env node
'use strict';
const path = require('path');
const { captureRuntimeSession } = require('../lib/runtime-session');

// Runtime is selected by the installed command, not inferred from an inherited shell variable.
const runtime = process.argv[process.argv.indexOf('--runtime') + 1];
let raw = '';
let oversized = false;
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (raw.length + chunk.length > 1024 * 1024) oversized = true;
  if (!oversized) raw += chunk;
});
process.stdin.on('end', () => {
  try {
    if (oversized || !['claude', 'codex'].includes(runtime)) return;
    const input = JSON.parse(raw);
    if (!input || Array.isArray(input) || typeof input !== 'object') return;
    if (typeof input.session_id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(input.session_id)) return;
    if (typeof input.cwd !== 'string' || !path.isAbsolute(input.cwd)) return;
    if (!['SessionStart', 'SessionEnd', 'Stop'].includes(input.hook_event_name)) return;
    const sessionId = runtime === 'codex' ? `codex-session-${input.session_id}` : input.session_id;
    const context = captureRuntimeSession(input.hook_event_name === 'SessionStart' ? 'start' : 'end', { cwd: input.cwd, sessionId });
    if (context && input.hook_event_name === 'SessionStart') {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }));
    }
  } catch (error) {
    // Recording is advisory; report failure without preventing the user's session from running.
    process.stderr.write(`[Harness recording] ${error.message}\n`);
  }
});
