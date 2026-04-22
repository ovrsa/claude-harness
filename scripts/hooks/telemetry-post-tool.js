#!/usr/bin/env node
'use strict';

const { readStdinJson, getRuntimeSessionId } = require('../lib/utils');
const { getRepoRoot } = require('../lib/task-artifacts');
const { recordToolExecution, getRunId } = require('../lib/session-trace');

function truncate(value, maxLength = 240) {
  const normalized = String(value || '');
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function buildDetails(toolInput = {}) {
  const details = {
    tool_input_keys: Object.keys(toolInput).sort(),
  };

  if (typeof toolInput.command === 'string') details.command = truncate(toolInput.command);
  if (typeof toolInput.file_path === 'string') details.file_path = toolInput.file_path;
  if (typeof toolInput.pattern === 'string') details.pattern = truncate(toolInput.pattern, 120);
  if (typeof toolInput.query === 'string') details.query = truncate(toolInput.query, 120);
  return details;
}

(async () => {
  const input = await readStdinJson({ timeoutMs: 1000 });
  const toolName = String(input.tool_name || '').trim();
  if (!toolName) process.exit(0);

  const cwd = process.cwd();
  const repoRoot = getRepoRoot(cwd) || '';
  const sessionId = getRuntimeSessionId() || undefined;

  recordToolExecution({
    sessionId,
    runId: getRunId(sessionId),
    repoRoot,
    cwd,
    toolName,
    toolInput: input.tool_input || {},
    phase: 'completed',
    status: 'completed',
    details: buildDetails(input.tool_input || {}),
  });

  process.exit(0);
})().catch(() => process.exit(0));
