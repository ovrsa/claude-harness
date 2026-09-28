'use strict';

const { getRepoRoot } = require('./task-artifacts');
const { getCurrentSessionId } = require('./utils');
const { recordSessionStart, resolveRunSlug, resolveBranch } = require('./run-record');
const { resolveResumeState } = require('./run-log');
const { recordLifecycleGates } = require('./lifecycle-record');

/** Both native hooks and the manual bridge use the same Run store and evidence rules. */
function captureRuntimeSession(phase, options = {}) {
  const cwd = options.cwd || process.cwd();
  const repoRoot = getRepoRoot(cwd);
  if (!repoRoot) return '';
  const sessionId = options.sessionId || getCurrentSessionId() || undefined;
  const branch = resolveBranch(repoRoot);
  const runId = resolveRunSlug({ repoRoot, branch, sessionId });
  const resume = phase === 'start' ? resolveResumeState({ repoRoot }) : null;
  recordLifecycleGates({ repoRoot, runId, sessionId, branch, cwd });
  if (!resume) return '';
  recordSessionStart({ repoRoot, runId, sessionId, branch,
    resumeExpected: resume.expected, resumeSuccess: resume.success,
    resumeReason: resume.reason, resumeSource: resume.source });
  return resume.context || '';
}

function hookSessionId(raw, runtime = 'claude') {
  try {
    const id = JSON.parse(raw).session_id;
    if (typeof id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(id)) {
      return runtime === 'codex' ? `codex-session-${id}` : id;
    }
  } catch { /* Manual invocation has no hook payload. */ }
  return getCurrentSessionId() || undefined;
}

function readHookInput() {
  return new Promise(resolve => {
    let raw = '';
    let oversized = false;
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      if (raw.length + chunk.length > 1024 * 1024) oversized = true;
      if (!oversized) raw += chunk;
    });
    process.stdin.on('end', () => resolve(oversized ? '' : raw));
    process.stdin.on('error', () => resolve(''));
  });
}

module.exports = { captureRuntimeSession, hookSessionId, readHookInput };
