#!/usr/bin/env node
'use strict';

/**
 * The codex-bridge counterpart of session-end-marker.js: capture the gate
 * evidence as the session ends.
 *
 * The `session_ended` row it also wrote is gone with the table. Its
 * `bridge_mode: 'manual'` metadata was the input to a health detector retired
 * on 2026-08-20 -- that value was never recorded once in the entire telemetry
 * history, because this hook only writes on session end while the detector read
 * `session_started`.
 */

const { getRuntimeSessionId } = require('../lib/utils');
const { getRepoRoot } = require('../lib/task-artifacts');
const { resolveRunSlug, resolveBranch } = require('../lib/run-record');
const { recordLifecycleGates } = require('../lib/lifecycle-record');

function main() {
  const sessionId = getRuntimeSessionId() || undefined;
  const repoRoot = getRepoRoot(process.cwd()) || '';
  if (!repoRoot) return;

  const branch = resolveBranch(repoRoot);
  recordLifecycleGates({
    repoRoot,
    runId: resolveRunSlug({ repoRoot, branch, sessionId }),
    sessionId,
    branch,
    cwd: process.cwd(),
  });
}

try {
  main();
  process.exit(0);
} catch {
  process.exit(0);
}
