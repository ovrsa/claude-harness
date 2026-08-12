const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { readStdinJson, getRuntimeKind, getRuntimeSessionId } = require('./utils');
const { ExperienceStore, OUTCOMES, observeSafely } = require('./experience-store');

function boundedWarning(message) {
  return String(message || 'unknown error').replace(/[\r\n]+/g, ' ').slice(0, 400);
}

function runtimeForInput(input = {}, fallback = 'unknown') {
  if (typeof input.runtime === 'string' && /^[a-z0-9-]{1,32}$/i.test(input.runtime)) return input.runtime.toLowerCase();
  if (input.hook_event_name || input.session_id) return 'claude';
  const detected = getRuntimeKind();
  if (detected !== 'unknown') return detected;
  return fallback;
}

function runIdForInput(input = {}, runtime = runtimeForInput(input)) {
  const raw = String(input.session_id || input.sessionId || getRuntimeSessionId() || '').trim();
  if (raw && /^[A-Za-z0-9._-]{1,96}$/.test(raw)) return `${runtime}-${raw}`;
  const identity = raw || `${process.cwd()}-${process.ppid}`;
  const digest = crypto.createHash('sha256').update(identity).digest('hex').slice(0, 20);
  return `${runtime}-${digest}`;
}

function harnessFingerprint(root = path.join(__dirname, '..', '..')) {
  const hash = crypto.createHash('sha256');
  for (const relativePath of ['CLAUDE.md', 'settings.json']) {
    const filePath = path.join(root, relativePath);
    if (fs.existsSync(filePath)) hash.update(fs.readFileSync(filePath));
  }
  return `sha256:${hash.digest('hex')}`;
}

function contextForInput(input = {}, { runtimeFallback = 'unknown' } = {}) {
  const runtime = runtimeForInput(input, runtimeFallback);
  const store = new ExperienceStore();
  const runId = runIdForInput(input, runtime);
  const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();
  const run = store.ensureRun({
    runId,
    runtime,
    cwd,
    harnessFingerprint: harnessFingerprint(),
  });
  return { ...run, store, runtime, cwd };
}

function inferOutcome(store, runId) {
  const tracePath = path.join(store.runPath(runId), 'trace.jsonl');
  if (!fs.existsSync(tracePath)) return { outcome: 'unknown', reason: 'no feedback signal' };
  const lines = fs.readFileSync(tracePath, 'utf8').trim().split('\n').filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const event = JSON.parse(lines[index]);
      const outcome = event.feedback?.outcome;
      if (OUTCOMES.has(outcome) && outcome !== 'unknown') {
        return {
          outcome,
          reason: 'latest sanitized user feedback signal',
          source: 'UserPromptSubmit',
        };
      }
    } catch {
      // A malformed historical line cannot block session finalization.
    }
  }
  return { outcome: 'unknown', reason: 'no explicit feedback signal' };
}

async function runObservation(handler, options = {}) {
  const input = await readStdinJson({ timeoutMs: 1000, maxSize: 1024 * 1024 });
  observeSafely(() => handler(input || {}), {
    onError: (message) => {
      process.stderr.write(`[Experience observation skipped] ${boundedWarning(message)}\n`);
    },
  });
  return options;
}

module.exports = {
  contextForInput,
  harnessFingerprint,
  inferOutcome,
  runIdForInput,
  runObservation,
  runtimeForInput,
};
