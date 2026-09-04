#!/usr/bin/env node
'use strict';

const { getRuntimeSessionId } = require('../lib/utils');
const { getRepoRoot } = require('../lib/task-artifacts');
const { recordSessionStart, resolveRunSlug, resolveBranch } = require('../lib/run-record');
const { resolveResumeState } = require('../lib/run-log');
const { recordLifecycleGates } = require('../lib/lifecycle-record');

function main() {
  const sessionId = getRuntimeSessionId() || undefined;
  const repoRoot = getRepoRoot(process.cwd());

  // Previously `getLatestRunState({ repoRoot }) || getLatestRunState()`. The
  // fallback was the cross-repository read that session-start.js had already
  // removed as a contract violation: with no row for this repository it reached
  // for whichever repository was touched last. resolveResumeState is scoped to
  // one repository with no fallback, so the bug goes with the table.
  // Not conditional on repoRoot: resolveResumeState handles an empty repoRoot
  // itself, and a null here would only be safe because the guard below happens
  // to test the same condition.
  const resume = resolveResumeState({ repoRoot });

  if (resume.context) {
    process.stdout.write(`${resume.context}\n`);
  }

  if (repoRoot) {
    try {
      const branch = resolveBranch(repoRoot);
      const runId = resolveRunSlug({ repoRoot, branch, sessionId });
      recordLifecycleGates({ repoRoot, runId, sessionId, branch, cwd: process.cwd() });
      recordSessionStart({
        repoRoot,
        runId,
        sessionId,
        branch,
        resumeExpected: resume.expected,
        resumeSuccess: resume.success,
        resumeReason: resume.reason,
        resumeSource: resume.source,
      });
    } catch {
      // Recording must never keep a session from starting.
    }
  }
}

try {
  main();
  process.exit(0);
} catch {
  process.exit(0);
}
