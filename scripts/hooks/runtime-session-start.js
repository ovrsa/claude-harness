#!/usr/bin/env node
'use strict';

const { getRuntimeKind, getRuntimeSessionId } = require('../lib/utils');
const { getRepoRoot, buildArtifactContext } = require('../lib/task-artifacts');
const {
  recordSessionEvent,
  recordLifecycleSnapshot,
  getRunId,
  getLatestRunState,
  formatResumeState,
} = require('../lib/session-trace');

function main() {
  const runtime = getRuntimeKind();
  const sessionId = getRuntimeSessionId() || undefined;
  const runId = getRunId(sessionId);
  const repoRoot = getRepoRoot(process.cwd());
  const artifactContext = buildArtifactContext(repoRoot);
  const persistedState = repoRoot
    ? (getLatestRunState({ repoRoot }) || getLatestRunState())
    : getLatestRunState();

  if (persistedState) {
    process.stdout.write(`${formatResumeState(persistedState)}\n`);
  } else if (artifactContext) {
    process.stdout.write(`${artifactContext}\n`);
  }

  recordSessionEvent({
    sessionId,
    runId,
    eventType: 'session_started',
    status: persistedState ? 'resumed' : (artifactContext ? 'artifact_resumed' : 'started'),
    repoRoot: repoRoot || '',
    cwd: process.cwd(),
    taskPhase: persistedState?.currentPhase || '',
    metadata: {
      runtime,
      bridge_mode: 'manual',
      resume_success: Boolean(persistedState || artifactContext),
      resume_source: persistedState ? 'sqlite' : (artifactContext ? 'artifacts' : 'none'),
    },
    createdBy: 'runtime-session-start',
  });

  if (repoRoot) {
    recordLifecycleSnapshot({
      sessionId,
      runId,
      repoRoot,
      cwd: process.cwd(),
      includeArtifactContextLoaded: true,
      createdBy: 'runtime-session-start',
    });
  }
}

try {
  main();
  process.exit(0);
} catch {
  process.exit(0);
}
