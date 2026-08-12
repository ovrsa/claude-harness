#!/usr/bin/env node

const { contextForInput, inferOutcome } = require('../lib/experience-hook');
const { getRuntimeKind } = require('../lib/utils');
const { observeSafely } = require('../lib/experience-store');

observeSafely(() => {
  const runtime = getRuntimeKind() === 'unknown' ? 'codex' : getRuntimeKind();
  const { store, runId } = contextForInput({ runtime, cwd: process.cwd() }, { runtimeFallback: runtime });
  store.appendTrace(runId, {
    family: 'SessionEnd',
    event: 'ended',
    runtime,
    bridge: 'manual',
  });
  store.finalizeRun(runId, inferOutcome(store, runId));
});
