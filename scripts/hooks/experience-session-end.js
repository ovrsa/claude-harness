#!/usr/bin/env node

const { contextForInput, inferOutcome, runObservation } = require('../lib/experience-hook');

runObservation((input) => {
  const { store, runId, runtime } = contextForInput(input, { runtimeFallback: 'claude' });
  store.appendTrace(runId, {
    family: 'SessionEnd',
    event: 'ended',
    runtime,
  });
  store.finalizeRun(runId, inferOutcome(store, runId));
});
