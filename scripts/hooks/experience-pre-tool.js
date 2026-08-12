#!/usr/bin/env node

const { sanitizeToolInput } = require('../lib/experience-redaction');
const { contextForInput, runObservation } = require('../lib/experience-hook');

runObservation((input) => {
  const { store, runId } = contextForInput(input, { runtimeFallback: 'claude' });
  const toolName = typeof input.tool_name === 'string' ? input.tool_name : 'unknown';
  store.appendTrace(runId, {
    family: 'PreToolUse',
    event: 'started',
    tool: toolName,
    toolInput: sanitizeToolInput(toolName, input.tool_input || {}),
  });
  if (/skill/i.test(toolName)) {
    const skill = input.tool_input?.skill || input.tool_input?.name;
    if (typeof skill === 'string' && skill.length <= 200) {
      store.recordSkillActivation(runId, { skill, source: 'managed-runtime' });
    }
  }
});
