'use strict';

/**
 * Records the lifecycle gates into the JSON run record.
 *
 * This is what is left of session-trace.js's recordLifecycleSnapshot once the
 * SQLite writes are gone. The three parts it had:
 *
 *   1. build a snapshot of the repository's gate artifacts  -- kept, was never
 *      a database operation
 *   2. dedupe by fingerprint against the last recorded event -- kept, now read
 *      from logs/events.ndjson instead of session_events
 *   3. insert rows into session_events / session_runs / run_state / ...
 *      -- gone, nothing read them
 *
 * The gate evidence capture (Phase 2) hung off part 3, which is why this module
 * exists rather than the writes simply being deleted.
 *
 * No console output.
 */

const fs = require('fs');
const path = require('path');

const { findTaskArtifacts, buildLifecycleState, getRepoRoot } = require('./task-artifacts');
const { recordGateEvidence, appendRunEvent, getRunDir } = require('./run-record');

/** gate artifact name -> the event appended when it changes */
const GATE_EVENTS = {
  'verification-summary.md': 'verification_completed',
  'review-summary.md': 'review_completed',
  'observation-summary.md': 'observation_completed',
};

/** gate artifact name -> fingerprint key on the snapshot */
const GATE_FINGERPRINTS = {
  'verification-summary.md': 'verification',
  'review-summary.md': 'review',
  'observation-summary.md': 'observation',
};

function artifactFingerprint(artifact) {
  if (!artifact || !artifact.path || !fs.existsSync(artifact.path)) return '';
  const stats = fs.statSync(artifact.path);
  return `${artifact.name}:${stats.mtimeMs}:${artifact.status || ''}`;
}

/**
 * The repository's gate state, or null when there are no task artifacts.
 *
 * Fingerprints only for the three gates. The old snapshot also fingerprinted
 * plan.md, progress.md's checkpoint and a serialized run_state; all three were
 * retired on 2026-08-17 and existed only to decide whether to write a SQLite
 * row.
 */
function buildLifecycleSnapshot(repoRoot) {
  const artifacts = findTaskArtifacts(repoRoot);
  if (artifacts.length === 0) return null;

  const byName = new Map(artifacts.map(artifact => [artifact.name, artifact]));
  const fingerprints = {};
  for (const [name, key] of Object.entries(GATE_FINGERPRINTS)) {
    const artifact = byName.get(name);
    if (!artifact) {
      fingerprints[key] = '';
      continue;
    }
    // Review carries its blocking-finding count: the same file with a finding
    // resolved is a different gate result, and mtime alone would hide that.
    const findings = key === 'review'
      ? `:${artifact.review_state?.blockingFindings?.length || 0}`
      : '';
    fingerprints[key] = `${artifactFingerprint(artifact)}${findings}`;
  }

  return {
    repoRoot,
    artifacts,
    lifecycle: buildLifecycleState(artifacts),
    artifactContextFingerprint: artifacts.map(artifactFingerprint).join('|'),
    fingerprints,
  };
}

/**
 * The fingerprint carried by the most recent event of this type, from the run
 * record's own log. Replaces a SELECT against session_events.
 */
function lastRecordedFingerprint(options, eventType) {
  let raw;
  try {
    raw = fs.readFileSync(path.join(getRunDir(options), 'logs', 'events.ndjson'), 'utf8');
  } catch {
    return null;
  }

  let latest = null;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (parsed && parsed.type === eventType) latest = parsed;
  }
  return latest ? String(latest.fingerprint || '') : null;
}

/**
 * Capture the gate artifacts and append an event per gate whose result changed.
 *
 * Capture is unconditional and idempotent: the body written is the state at the
 * last snapshot, which is what has to survive ExitWorktree(action: "remove").
 * The event append is deduped, because the hooks call this on session start,
 * session end and every pipeline step, and one line per invocation would make
 * the gate timeline read as many completions.
 */
function recordLifecycleGates(input = {}) {
  const cwd = String(input.cwd || process.cwd());
  const repoRoot = String(input.repoRoot || getRepoRoot(cwd) || '');
  const empty = { runId: String(input.runId || ''), captured: [], firedGates: [] };
  if (!repoRoot) return empty;

  const snapshot = buildLifecycleSnapshot(repoRoot);
  if (!snapshot) return empty;

  const location = {
    repoRoot,
    runId: input.runId,
    runsDir: input.runsDir,
    homeDir: input.homeDir,
  };

  const firedGates = [];
  for (const artifact of snapshot.artifacts) {
    const eventType = GATE_EVENTS[artifact.name];
    if (!eventType) continue;
    const fingerprint = snapshot.fingerprints[GATE_FINGERPRINTS[artifact.name]];
    if (!fingerprint) continue;
    if (lastRecordedFingerprint(location, eventType) === fingerprint) continue;
    firedGates.push(eventType);
  }

  const result = recordGateEvidence({
    ...location,
    sessionId: input.sessionId,
    branch: input.branch,
    artifacts: snapshot.artifacts,
    // recordGateEvidence appends one event per entry; the dedup above decides
    // which gates get one. It writes no events when nothing was captured.
    firedGates: [],
  });

  if (result.captured.length === 0) return { ...empty, runId: result.runId };

  const fired = [];
  for (const eventType of firedGates) {
    const key = Object.entries(GATE_EVENTS).find(([, value]) => value === eventType);
    const fingerprintKey = key ? GATE_FINGERPRINTS[key[0]] : '';
    appendRunEvent({
      ...location,
      runId: result.runId,
      event: {
        type: eventType,
        status: 'complete',
        fingerprint: snapshot.fingerprints[fingerprintKey] || '',
      },
    });
    fired.push(eventType);
  }

  return { runId: result.runId, captured: result.captured, firedGates: fired };
}

module.exports = {
  buildLifecycleSnapshot,
  recordLifecycleGates,
};
