#!/usr/bin/env node
'use strict';

const { getRuntimeSessionId } = require('../lib/utils');
const { getRepoRoot } = require('../lib/task-artifacts');
const { recordSessionEvent, recordLifecycleSnapshot, getRunId } = require('../lib/session-trace');

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
  const sessionId = getRuntimeSessionId() || undefined;
  const runId = getRunId(sessionId);
  const repoRoot = getRepoRoot(process.cwd()) || '';

  if (repoRoot) {
    recordLifecycleSnapshot({
      sessionId,
      runId,
      repoRoot,
      cwd: process.cwd(),
      createdBy: 'session-end-marker',
      includeArtifactContextLoaded: false,
    });
  }

  recordSessionEvent({
    sessionId,
    runId,
    eventType: 'session_ended',
    status: 'ended',
    repoRoot,
    cwd: process.cwd(),
    createdBy: 'session-end-marker',
    metadata: {},
  });
  process.stdout.write(raw);
});
