'use strict';

/**
 * The durable JSON record of one task run.
 *
 *   runs/<YYYY-MM-DD>-<slug>/
 *     meta.json               task identity, session ids, branch, merge commit
 *     logs/events.ndjson      lifecycle gate events, one JSON object per line
 *     evidence/<kind>.json    the gate artifact bodies, verbatim
 *
 * Why this exists: verification-summary.md / review-summary.md /
 * observation-summary.md are gitignored and written inside the worktree, so
 * ExitWorktree(action: "remove") destroyed them. SQLite kept a two-line extract
 * plus an evidence_ref pointing at the now-deleted path.
 *
 * The slug matches the docs/design/YYYY-MM-DD-<slug>.md convention on purpose:
 * the decision record and the evidence record share a name.
 *
 * Raw traces are NOT copied here. meta.json carries session_ids, which resolve
 * to projects/<slug>/<session-id>.jsonl (see transcript-log.js) or to Codex
 * rollouts (see codex-transcripts.js).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

/** Appends larger than this can interleave when two hooks write at once. */
const MAX_EVENT_BYTES = 4096;

const EVIDENCE_KINDS = new Set(['verification', 'review', 'observation']);

function isoNow() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^worktree-/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * One record per task, not per day. A task that runs past midnight must keep
 * the id it started with, otherwise its evidence splits across records and the
 * slug stops matching docs/design/YYYY-MM-DD-<slug>.md.
 */
function resolveRunSlug(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const date = now.toISOString().slice(0, 10);
  const name = slugify(options.branch) || slugify(options.sessionId) || 'unknown';

  const branch = String(options.branch || '');
  if (branch) {
    const existing = listRunRecords(options).find(run => run.branch === branch);
    if (existing) return existing.run_id;
  }

  return `${date}-${name}`;
}

/**
 * Harness work records into its own tree so the merge to main carries the
 * evidence. Work in any other repo records into the harness store instead of
 * dropping run records into an unrelated project's history.
 */
function getRunsDir(options = {}) {
  if (options.runsDir) return options.runsDir;

  // A caller that redirects persistence passes dbPath (<root>/telemetry/
  // telemetry.db). Redirect the run record to the same root, otherwise a test
  // with a sandboxed database still writes into the real runs/ — which is how
  // fixture session ids ended up in the live record.
  if (options.dbPath) {
    return path.join(path.dirname(path.dirname(String(options.dbPath))), 'runs');
  }

  const homeDir = options.homeDir || process.env.HOME || os.homedir();
  const harnessRoot = path.join(homeDir, '.claude');
  const repoRoot = String(options.repoRoot || '');

  // "The harness repo" is relative to the given home. Anchoring on the path
  // shape alone (basename '.claude', or a .claude/worktrees/ segment) would
  // treat the developer's real worktree as the harness repo even when the
  // caller redirected home to isolate itself.
  const isHarnessRepo = repoRoot === harnessRoot || repoRoot.startsWith(harnessRoot + path.sep);
  if (isHarnessRepo) return path.join(repoRoot, 'runs');
  return path.join(harnessRoot, 'runs');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Run ids become directory names, and `runs-cli show <run-id>` takes one
 * straight from argv. Without this, `..` or a separator escapes the runs
 * directory — an arbitrary directory write on the way in and an arbitrary file
 * read on the way out. Confirmed by probe before this guard existed.
 */
const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function assertSafeRunId(value) {
  const runId = String(value || '');
  if (!SAFE_RUN_ID.test(runId) || runId === '.' || runId === '..' || runId.includes('..')) {
    throw new Error(`run id must be a plain name, got: ${JSON.stringify(runId)}`);
  }
  return runId;
}

function getRunDir(options = {}) {
  return path.join(getRunsDir(options), assertSafeRunId(options.runId));
}

function readJson(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeRunMeta(options = {}) {
  const runDir = getRunDir(options);
  const runId = assertSafeRunId(options.runId);
  ensureDir(runDir);
  const metaPath = path.join(runDir, 'meta.json');

  const existing = readJson(metaPath) || {};
  const meta = { ...existing, ...(options.fields || {}) };
  meta.run_id = runId;
  meta.started_at = existing.started_at || meta.started_at || isoNow();
  meta.updated_at = isoNow();

  if (options.addSessionId) {
    const ids = Array.isArray(meta.session_ids) ? meta.session_ids.slice() : [];
    if (!ids.includes(options.addSessionId)) ids.push(options.addSessionId);
    meta.session_ids = ids;
  }

  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}

function appendRunEvent(options = {}) {
  const logsDir = path.join(getRunDir(options), 'logs');
  ensureDir(logsDir);

  const event = { occurred_at: isoNow(), ...(options.event || {}) };
  let line = JSON.stringify(event);
  if (Buffer.byteLength(line, 'utf8') >= MAX_EVENT_BYTES) {
    // Bodies belong in evidence/. Keep the line small enough that a single
    // append stays atomic, and say so rather than silently dropping fields.
    line = JSON.stringify({
      occurred_at: event.occurred_at,
      type: event.type,
      status: event.status,
      truncated: true,
    });
  }
  fs.appendFileSync(path.join(logsDir, 'events.ndjson'), `${line}\n`);
  return event;
}

/**
 * Copy a gate artifact into the run record verbatim. Returns null when the
 * artifact is absent, so a missing gate never becomes an empty-bodied record
 * that looks like it passed.
 */
function captureEvidence(options = {}) {
  const runId = String(options.runId || '');
  const kind = String(options.kind || '');
  const artifactPath = String(options.artifactPath || '');
  if (!runId || !EVIDENCE_KINDS.has(kind) || !artifactPath) return null;

  let body;
  try {
    body = fs.readFileSync(artifactPath, 'utf8');
  } catch {
    return null;
  }

  // Guarantee the run is discoverable. Evidence without a meta.json would be
  // invisible to readRunRecord/listRunRecords — the same silent loss this
  // module exists to prevent.
  writeRunMeta({ ...options, fields: options.metaFields || {} });

  const evidenceDir = path.join(getRunDir(options), 'evidence');
  ensureDir(evidenceDir);
  const record = {
    kind,
    source_path: artifactPath,
    captured_at: isoNow(),
    fingerprint: options.fingerprint || '',
    ...(options.specRevision ? { spec_revision: options.specRevision } : {}),
    ...(options.definitionRevision ? { definition_revision: options.definitionRevision } : {}),
    state: options.state || null,
    body,
  };
  fs.writeFileSync(path.join(evidenceDir, `${kind}.json`), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

function readRunRecord(options = {}) {
  const runDir = getRunDir(options);
  const meta = readJson(path.join(runDir, 'meta.json'));

  const evidence = {};
  for (const kind of EVIDENCE_KINDS) {
    const record = readJson(path.join(runDir, 'evidence', `${kind}.json`));
    if (record) evidence[kind] = record;
  }

  // A record with evidence but no readable meta is still worth returning;
  // refusing it would discard the only surviving copy of a gate result.
  if (!meta && Object.keys(evidence).length === 0) return null;

  let events = [];
  try {
    events = fs.readFileSync(path.join(runDir, 'logs', 'events.ndjson'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch {
    events = [];
  }

  return { ...(meta || { run_id: String(options.runId || '') }), path: runDir, evidence, events };
}

function listRunRecords(options = {}) {
  const runsDir = getRunsDir(options);
  let entries;
  try {
    entries = fs.readdirSync(runsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const runs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const meta = readJson(path.join(runsDir, entry.name, 'meta.json'));
    if (!meta) continue;
    runs.push({ ...meta, run_id: String(meta.run_id || entry.name), path: path.join(runsDir, entry.name) });
  }

  return runs.sort((a, b) => {
    const left = String(b.started_at || '');
    const right = String(a.started_at || '');
    return left.localeCompare(right) || String(b.run_id).localeCompare(String(a.run_id));
  });
}

function resolveBranch(repoRoot) {
  try {
    // --show-current, not rev-parse: rev-parse fails on an unborn HEAD.
    return execFileSync('git', ['branch', '--show-current'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/** gate artifact name -> evidence kind */
const GATE_ARTIFACTS = {
  'verification-summary.md': 'verification',
  'review-summary.md': 'review',
  'observation-summary.md': 'observation',
};

/**
 * Capture every gate artifact currently on disk, plus one event per gate that
 * just fired. Capturing on each snapshot (rather than only on change) is
 * deliberate: it is idempotent, and it means the last state before
 * ExitWorktree(action: "remove") is always the state that got saved.
 *
 * Returns { runId, captured } where captured lists the evidence kinds written.
 */
function recordGateEvidence(options = {}) {
  const runId = String(options.runId || '');
  const artifacts = Array.isArray(options.artifacts) ? options.artifacts : [];
  const captured = [];
  if (!runId) return { runId, captured };

  // Several test files exercise hooks with cwd inside the real repository and
  // the real HOME, so they would record fixture session ids into the live
  // run record — and runs/ is git-tracked, so those would be committed.
  // Redirecting HOME or dbPath covers most of them; this covers the rest.
  if (process.env.CLAUDE_DISABLE_RUN_RECORD === '1') return { runId, captured };

  const graph = readJson(path.join(getRunDir(options), 'graph.json'));
  const graphEvidence = graph && graph.schema_version === 1 && graph.spec?.revision && graph.definition_revision
    ? {
      fingerprint: require('./task-completion').taskFingerprint(options.repoRoot),
      specRevision: graph.spec.revision,
      definitionRevision: graph.definition_revision,
    }
    : {};

  for (const artifact of artifacts) {
    const kind = GATE_ARTIFACTS[artifact && artifact.name];
    if (!kind) continue;
    const written = captureEvidence({
      ...options,
      ...graphEvidence,
      kind,
      artifactPath: artifact.path,
      state: artifact[`${kind}_state`] || null,
      metaFields: {
        repo_root: options.repoRoot || '',
        branch: options.branch || '',
      },
    });
    if (written) captured.push(kind);
  }

  if (captured.length === 0) return { runId, captured };

  writeRunMeta({
    ...options,
    fields: {
      repo_root: options.repoRoot || '',
      branch: options.branch || '',
      gates: captured.slice().sort(),
    },
    addSessionId: options.sessionId || '',
  });

  for (const gate of Array.isArray(options.firedGates) ? options.firedGates : []) {
    appendRunEvent({ ...options, event: { type: gate, status: 'complete' } });
  }

  return { runId, captured };
}

/**
 * Record how resume went at the start of a session.
 *
 * The `resume_expected` / `resume_success` pair is the whole signal: without
 * "was there anything to resume", a fresh worktree looks identical to a failed
 * restore, which is how 382 of 471 health candidates came to be new worktrees.
 *
 * Nothing is written when there was nothing to resume and no record exists yet.
 * Recording those would create one git-tracked directory per branch per day
 * whose only content is that there was nothing to restore.
 */
function recordSessionStart(options = {}) {
  const runId = String(options.runId || '');
  if (!runId) return { runId, recorded: false };
  if (process.env.CLAUDE_DISABLE_RUN_RECORD === '1') return { runId, recorded: false };

  const resumeExpected = options.resumeExpected === true;
  let recordExists = false;
  try {
    recordExists = fs.existsSync(path.join(getRunDir(options), 'meta.json'));
  } catch {
    return { runId, recorded: false };
  }
  if (!resumeExpected && !recordExists) return { runId, recorded: false };

  writeRunMeta({
    ...options,
    fields: {
      repo_root: options.repoRoot || '',
      branch: options.branch || '',
    },
    addSessionId: options.sessionId || '',
  });

  appendRunEvent({
    ...options,
    event: {
      type: 'session_started',
      status: options.resumeSuccess === true ? 'resumed' : 'started',
      session_id: String(options.sessionId || ''),
      resume_expected: resumeExpected,
      resume_success: options.resumeSuccess === true,
      resume_reason: String(options.resumeReason || ''),
      resume_source: String(options.resumeSource || ''),
    },
  });

  return { runId, recorded: true };
}

module.exports = {
  MAX_EVENT_BYTES,
  resolveBranch,
  recordGateEvidence,
  recordSessionStart,
  resolveRunSlug,
  getRunsDir,
  getRunDir,
  writeRunMeta,
  appendRunEvent,
  captureEvidence,
  readRunRecord,
  listRunRecords,
};
