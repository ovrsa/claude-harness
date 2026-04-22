#!/usr/bin/env node
'use strict';

const { getRuntimeKind, getRuntimeSessionId } = require('../lib/utils');
const { getRepoRoot } = require('../lib/task-artifacts');
const { recordSessionEvent, recordLifecycleSnapshot, getRunId } = require('../lib/session-trace');

function main() {
  const runtime = getRuntimeKind();
  const sessionId = getRuntimeSessionId() || undefined;
  const runId = getRunId(sessionId);
  const repoRoot = getRepoRoot(process.cwd()) || '';

  if (repoRoot) {
    recordLifecycleSnapshot({
      sessionId,
      runId,
      repoRoot,
      cwd: process.cwd(),
      createdBy: 'runtime-session-end',
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
    createdBy: 'runtime-session-end',
    metadata: {
      runtime,
      bridge_mode: 'manual',
      final_status: 'persisted',
    },
  });
}

try {
  main();
  process.exit(0);
} catch {
  process.exit(0);
}
