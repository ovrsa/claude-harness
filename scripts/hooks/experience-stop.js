#!/usr/bin/env node

const { contextForInput, runObservation } = require('../lib/experience-hook');

runObservation((input) => {
  const { store, runId } = contextForInput(input, { runtimeFallback: 'claude' });
  store.appendTrace(runId, {
    family: 'Stop',
    event: 'response-completed',
    stopReason: typeof input.stop_reason === 'string' ? input.stop_reason.slice(0, 200) : null,
  });
});
