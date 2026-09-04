#!/usr/bin/env node
'use strict';

/**
 * Captures the gate evidence one last time as the session ends.
 *
 * It used to also insert a `session_ended` row. Nothing read it: the readers
 * that did were moved to the JSON logs in Phase 3, and a session boundary is
 * derivable from the transcript, which Claude Code writes either way.
 */

const { getRuntimeSessionId } = require('../lib/utils');
const { getRepoRoot } = require('../lib/task-artifacts');
const { resolveRunSlug, resolveBranch } = require('../lib/run-record');
const { recordLifecycleGates } = require('../lib/lifecycle-record');

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
  const repoRoot = getRepoRoot(process.cwd()) || '';

  if (repoRoot) {
    try {
      const branch = resolveBranch(repoRoot);
      recordLifecycleGates({
        repoRoot,
        runId: resolveRunSlug({ repoRoot, branch, sessionId }),
        sessionId,
        branch,
        cwd: process.cwd(),
      });
    } catch {
      // A hook that fails must not swallow the payload it is passing through.
    }
  }

  process.stdout.write(raw);
});
