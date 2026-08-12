#!/usr/bin/env node

const { classifyFeedbackSignal } = require('../lib/experience-redaction');
const { contextForInput, runObservation } = require('../lib/experience-hook');

runObservation((input) => {
  const { store, runId } = contextForInput(input, { runtimeFallback: 'claude' });
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  store.appendTrace(runId, {
    family: 'UserPromptSubmit',
    event: 'feedback-classified',
    feedback: classifyFeedbackSignal(prompt),
    metadata: {
      characterCount: prompt.length,
      explicitGrillBypass: /Grill不要/i.test(prompt),
    },
  });
  if (/Grill不要/i.test(prompt)) {
    store.appendTrace(runId, {
      family: 'GrillDecision',
      event: 'skipped',
      reason: 'explicit-user-bypass',
    });
  }
});
