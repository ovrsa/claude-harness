#!/usr/bin/env node
'use strict';

/**
 * Captures the gate evidence one last time as the session ends.
 *
 * It used to also insert a `session_ended` row. Nothing read it: the readers
 * that did were moved to the JSON logs in Phase 3, and a session boundary is
 * derivable from the transcript, which Claude Code writes either way.
 */

const { captureRuntimeSession, hookSessionId } = require('../lib/runtime-session');

const MAX_STDIN = 1024 * 1024;
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (raw.length < MAX_STDIN) {
    const remaining = MAX_STDIN - raw.length;
    raw += chunk.substring(0, remaining);
  }
});
process.stdin.on('end', () => {
  try {
    captureRuntimeSession('end', { sessionId: hookSessionId(raw) });
  } catch {
    // Preserve the passthrough contract even if recording fails.
  }

  process.stdout.write(raw);
});
