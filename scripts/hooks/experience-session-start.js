#!/usr/bin/env node

const { contextForInput, runObservation } = require('../lib/experience-hook');

runObservation((input) => {
  const { store, runId, runtime } = contextForInput(input, { runtimeFallback: 'claude' });
  store.appendTrace(runId, {
    family: 'SessionStart',
    event: 'started',
    runtime,
  });
});
