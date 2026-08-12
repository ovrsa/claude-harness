const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  redactValue,
} = require('./experience-redaction');

const OUTCOMES = new Set(['accepted', 'corrected', 'failed', 'abandoned', 'unknown']);

function nowIso() {
  return new Date().toISOString();
}

function assertRunId(runId) {
  if (typeof runId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)) {
    throw new Error('Invalid Experience run id');
  }
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tempPath, filePath);
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch (error) {
      // Cleanup must not replace the original write result.
      if (error.code !== 'ENOENT') void error;
    }
  }
}

function appendJsonl(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const line = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(line) > 8192) throw new Error('Experience JSONL line exceeds 8 KiB');
  fs.appendFileSync(filePath, line, { encoding: 'utf8', mode: 0o600, flag: 'a' });
}

function gitValue(cwd, args) {
  if (!cwd) return null;
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 1000,
  });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

function buildRepoIdentity(cwd) {
  return {
    cwd: cwd || null,
    root: gitValue(cwd, ['rev-parse', '--show-toplevel']),
    commit: gitValue(cwd, ['rev-parse', 'HEAD']),
    branch: gitValue(cwd, ['branch', '--show-current']),
  };
}

function createRunId(prefix = 'run') {
  const timestamp = nowIso().replace(/[-:.]/g, '').replace('Z', 'Z');
  return `${prefix}-${timestamp}-${crypto.randomBytes(4).toString('hex')}`;
}

function normalizeOutcome(value = {}) {
  const outcome = OUTCOMES.has(value.outcome) ? value.outcome : 'unknown';
  return redactValue({
    schemaVersion: 1,
    outcome,
    reason: typeof value.reason === 'string' ? value.reason : 'not classified',
    source: typeof value.source === 'string' ? value.source : 'runtime-observation',
    finalizedAt: typeof value.finalizedAt === 'string' ? value.finalizedAt : nowIso(),
  }, { maxString: 1000, maxEntries: 20 });
}

function observeSafely(operation, { onError = () => {} } = {}) {
  try {
    return { ok: true, value: operation() };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, ' ').slice(0, 400);
    onError(message);
    return { ok: false };
  }
}

class ExperienceStore {
  constructor({ root = process.env.CLAUDE_EXPERIENCE_ROOT || path.join(os.homedir(), '.claude', 'experience') } = {}) {
    this.root = path.resolve(root);
  }

  runPath(runId) {
    assertRunId(runId);
    return path.join(this.root, 'runs', runId);
  }

  ensureRun({ runId = createRunId(), runtime = 'unknown', cwd = null, harnessFingerprint = null, grillSkippedReason = null } = {}) {
    assertRunId(runId);
    const runPath = this.runPath(runId);
    const manifestPath = path.join(runPath, 'manifest.json');
    fs.mkdirSync(runPath, { recursive: true, mode: 0o700 });

    if (!fs.existsSync(manifestPath)) {
      atomicWriteJson(manifestPath, redactValue({
        schemaVersion: 1,
        runId,
        createdAt: nowIso(),
        runtime,
        repository: buildRepoIdentity(cwd),
        harnessFingerprint,
        grill: {
          skipped: Boolean(grillSkippedReason),
          skipReason: grillSkippedReason || null,
        },
        finalized: false,
      }, { maxString: 1000, maxEntries: 50 }));
      fs.closeSync(fs.openSync(path.join(runPath, 'trace.jsonl'), 'a', 0o600));
    }

    return { runId, runPath };
  }

  appendTrace(runId, event) {
    const runPath = this.runPath(runId);
    if (!fs.existsSync(path.join(runPath, 'manifest.json'))) {
      throw new Error(`Experience run does not exist: ${runId}`);
    }
    appendJsonl(path.join(runPath, 'trace.jsonl'), redactValue({
      schemaVersion: 1,
      timestamp: nowIso(),
      runId,
      ...event,
    }, { maxDepth: 7, maxEntries: 80, maxString: 3000 }));
  }

  recordSkillActivation(runId, { skill, source = 'managed' }) {
    this.appendTrace(runId, {
      family: 'SkillActivation',
      event: 'activated',
      skill,
      source,
    });
  }

  writeOutcome(runId, value) {
    const runPath = this.runPath(runId);
    if (!fs.existsSync(path.join(runPath, 'manifest.json'))) {
      throw new Error(`Experience run does not exist: ${runId}`);
    }
    const outcome = normalizeOutcome(value);
    atomicWriteJson(path.join(runPath, 'outcome.json'), outcome);
    return outcome;
  }

  writeRefs(runId, refs = []) {
    const runPath = this.runPath(runId);
    const normalized = Array.isArray(refs) ? refs.slice(0, 100).map((ref) => ({
      kind: typeof ref.kind === 'string' ? ref.kind.slice(0, 100) : 'reference',
      ...(typeof ref.path === 'string' ? { path: ref.path.slice(0, 1000) } : {}),
      ...(typeof ref.url === 'string' ? { url: ref.url.slice(0, 1000) } : {}),
    })) : [];
    atomicWriteJson(path.join(runPath, 'refs.json'), redactValue({ schemaVersion: 1, refs: normalized }));
    return normalized;
  }

  finalizeRun(runId, value = {}) {
    const runPath = this.runPath(runId);
    const manifestPath = path.join(runPath, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const outcome = this.writeOutcome(runId, value);

    if (!fs.existsSync(path.join(runPath, 'refs.json'))) this.writeRefs(runId, []);
    if (!manifest.finalized) {
      appendJsonl(path.join(this.root, 'index.jsonl'), {
        schemaVersion: 1,
        runId,
        runtime: manifest.runtime,
        createdAt: manifest.createdAt,
        finalizedAt: outcome.finalizedAt,
        outcome: outcome.outcome,
      });
      manifest.finalized = true;
      manifest.finalizedAt = outcome.finalizedAt;
      atomicWriteJson(manifestPath, manifest);
    }
    return outcome;
  }
}

module.exports = {
  ExperienceStore,
  OUTCOMES,
  appendJsonl,
  atomicWriteJson,
  buildRepoIdentity,
  createRunId,
  normalizeOutcome,
  observeSafely,
};
