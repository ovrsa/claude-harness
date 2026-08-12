#!/usr/bin/env node

const { sanitizeToolInput, sanitizeToolResult } = require('../lib/experience-redaction');
const { contextForInput, runObservation } = require('../lib/experience-hook');

runObservation((input) => {
  const { store, runId } = contextForInput(input, { runtimeFallback: 'claude' });
  const toolName = typeof input.tool_name === 'string' ? input.tool_name : 'unknown';
  store.appendTrace(runId, {
    family: 'PostToolUse',
    event: 'completed',
    tool: toolName,
    toolInput: sanitizeToolInput(toolName, input.tool_input || {}),
    toolResult: sanitizeToolResult(toolName, input.tool_response ?? input.tool_output ?? {}),
  });
});
