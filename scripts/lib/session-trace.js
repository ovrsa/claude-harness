'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let DatabaseSync = null;
let sqliteCliAvailable = null;

function loadDatabaseSync() {
  if (DatabaseSync) return DatabaseSync;
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch {
    DatabaseSync = null;
  }
  return DatabaseSync;
}

function hasSqliteCli() {
  if (sqliteCliAvailable !== null) return sqliteCliAvailable;
  try {
    execFileSync('sqlite3', ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    sqliteCliAvailable = true;
  } catch {
    sqliteCliAvailable = false;
  }
  return sqliteCliAvailable;
}

const { ensureDir, getClaudeDir, getSessionIdShort } = require('./utils');
const {
  findTaskArtifacts,
  buildLifecycleState,
  getRepoRoot,
} = require('./task-artifacts');

const SCHEMA_VERSION = 2;
const DEFAULT_RUN_STATUS = 'in_progress';

function getTelemetryDir() {
  return ensureDir(path.join(getClaudeDir(), 'telemetry'));
}

function getTelemetryDbPath() {
  return path.join(getTelemetryDir(), 'telemetry.db');
}

function isSqliteAvailable() {
  return Boolean(loadDatabaseSync() || hasSqliteCli());
}

function normalizeString(value, fallback = '') {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function getSessionId() {
  return normalizeString(process.env.CLAUDE_SESSION_ID, `session-${getSessionIdShort()}`);
}

function getRunId(sessionId = getSessionId()) {
  return sessionId;
}

function getProjectId(repoRoot) {
  const normalized = normalizeString(repoRoot);
  if (!normalized) return '';
  return crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 12);
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortObjectKeys(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function stableJsonStringify(value) {
  if (value === undefined) return 'null';
  return JSON.stringify(sortObjectKeys(value));
}

function truncate(value, maxLength = 240) {
  const normalized = String(value || '');
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}\u2026`;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function substituteSqlParams(sql, params = []) {
  let index = 0;
  return String(sql).replace(/\?/g, () => sqlLiteral(params[index++]));
}

function runSqliteCli(dbPath, sql, options = {}) {
  const args = [dbPath];
  if (options.json) args.push('-json');
  args.push(sql);
  return execFileSync('sqlite3', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function createSqliteCliDatabase(dbPath) {
  return {
    exec(sql) {
      runSqliteCli(dbPath, sql);
    },
    prepare(sql) {
      return {
        run(...params) {
          const statement = substituteSqlParams(sql, params);
          const output = runSqliteCli(
            dbPath,
            `${statement}; SELECT changes() AS changes, last_insert_rowid() AS lastInsertRowid;`,
            { json: true }
          );
          const rows = safeJsonParse(output, []);
          return Array.isArray(rows) && rows.length > 0 ? rows[rows.length - 1] : {};
        },
        get(...params) {
          const statement = substituteSqlParams(sql, params);
          const output = runSqliteCli(dbPath, statement, { json: true });
          const rows = safeJsonParse(output, []);
          return Array.isArray(rows) && rows.length > 0 ? rows[0] : undefined;
        },
        all(...params) {
          const statement = substituteSqlParams(sql, params);
          const output = runSqliteCli(dbPath, statement, { json: true });
          const rows = safeJsonParse(output, []);
          return Array.isArray(rows) ? rows : [];
        },
      };
    },
    close() {
      return undefined;
    },
  };
}

function createDatabase(dbPath = getTelemetryDbPath()) {
  const DatabaseSyncClass = loadDatabaseSync();
  if (!DatabaseSyncClass && !hasSqliteCli()) {
    throw new Error('node:sqlite is unavailable in this Node runtime');
  }

  ensureDir(path.dirname(dbPath));
  const db = DatabaseSyncClass ? new DatabaseSyncClass(dbPath) : createSqliteCliDatabase(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_at TEXT NOT NULL,
      session_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL,
      repo_root TEXT NOT NULL,
      cwd TEXT NOT NULL,
      task_phase TEXT NOT NULL,
      artifact_refs_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      schema_version INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_runs (
      run_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      repo_root TEXT NOT NULL DEFAULT '',
      project_id TEXT NOT NULL DEFAULT '',
      started_at TEXT NOT NULL,
      ended_at TEXT DEFAULT '',
      final_status TEXT NOT NULL DEFAULT '${DEFAULT_RUN_STATUS}',
      plan_present INTEGER NOT NULL DEFAULT 0,
      verify_present INTEGER NOT NULL DEFAULT 0,
      review_present INTEGER NOT NULL DEFAULT 0,
      observe_present INTEGER NOT NULL DEFAULT 0,
      human_intervention_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS task_runs (
      task_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      repo_root TEXT NOT NULL,
      objective TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '${DEFAULT_RUN_STATUS}',
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS run_state (
      run_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      repo_root TEXT NOT NULL,
      current_phase TEXT NOT NULL DEFAULT '',
      current_step TEXT NOT NULL DEFAULT '',
      next_action TEXT NOT NULL DEFAULT '',
      blockers_json TEXT NOT NULL DEFAULT '[]',
      delegated_work_json TEXT NOT NULL DEFAULT '[]',
      checkpoint_event TEXT NOT NULL DEFAULT '',
      artifact_blocked_json TEXT NOT NULL DEFAULT '[]',
      plan_status TEXT NOT NULL DEFAULT '',
      review_required INTEGER NOT NULL DEFAULT 0,
      observe_required INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tool_executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      repo_root TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      phase TEXT NOT NULL,
      status TEXT NOT NULL,
      input_fingerprint TEXT NOT NULL,
      details_json TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS verification_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      repo_root TEXT NOT NULL,
      check_name TEXT NOT NULL,
      command TEXT NOT NULL,
      status TEXT NOT NULL,
      evidence_ref TEXT NOT NULL,
      details_json TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      fingerprint TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS review_findings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      repo_root TEXT NOT NULL,
      severity TEXT NOT NULL,
      category TEXT NOT NULL,
      location TEXT NOT NULL,
      disposition TEXT NOT NULL,
      message TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      fingerprint TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_semantic (
      key TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      repo_root TEXT NOT NULL,
      value_json TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_episodic (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      repo_root TEXT NOT NULL,
      run_id TEXT NOT NULL,
      episode_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      details_json TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_procedural (
      tactic_key TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      repo_root TEXT NOT NULL,
      summary TEXT NOT NULL,
      details_json TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      success_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tactic_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      repo_root TEXT NOT NULL,
      run_id TEXT NOT NULL,
      tactic_key TEXT NOT NULL,
      proposal TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      risk_level TEXT NOT NULL DEFAULT 'low',
      status TEXT NOT NULL DEFAULT 'candidate',
      requires_approval INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tactic_adoptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      repo_root TEXT NOT NULL,
      run_id TEXT NOT NULL,
      tactic_key TEXT NOT NULL,
      adoption_mode TEXT NOT NULL,
      outcome TEXT NOT NULL,
      details_json TEXT NOT NULL,
      rollback_flag INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_session_events_run_id ON session_events(run_id);
    CREATE INDEX IF NOT EXISTS idx_session_events_event_type ON session_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_session_events_repo_root ON session_events(repo_root);
    CREATE INDEX IF NOT EXISTS idx_session_runs_started_at ON session_runs(started_at);
    CREATE INDEX IF NOT EXISTS idx_run_state_repo_root ON run_state(repo_root, updated_at);
    CREATE INDEX IF NOT EXISTS idx_tool_executions_run_id ON tool_executions(run_id, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_verification_results_run_id ON verification_results(run_id, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_review_findings_run_id ON review_findings(run_id, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_memory_episodic_project ON memory_episodic(project_id, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_tactic_candidates_project ON tactic_candidates(project_id, status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_tactic_adoptions_project ON tactic_adoptions(project_id, created_at);
  `);

  db.prepare(`
    INSERT INTO schema_meta(key, value)
    VALUES ('schema_version', ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(String(SCHEMA_VERSION));

  return db;
}

function withDatabase(callback, dbPath = getTelemetryDbPath()) {
  if (!isSqliteAvailable()) return null;
  let db = null;
  try {
    db = createDatabase(dbPath);
    return callback(db);
  } catch {
    return null;
  } finally {
    if (db && typeof db.close === 'function') {
      db.close();
    }
  }
}

function ensureSessionRunRow(db, sessionId, runId, repoRoot, occurredAt) {
  const projectId = getProjectId(repoRoot);
  db.prepare(`
    INSERT INTO session_runs (
      run_id,
      session_id,
      repo_root,
      project_id,
      started_at,
      ended_at,
      final_status,
      plan_present,
      verify_present,
      review_present,
      observe_present,
      human_intervention_count
    )
    VALUES (?, ?, ?, ?, ?, '', ?, 0, 0, 0, 0, 0)
    ON CONFLICT(run_id) DO UPDATE SET
      session_id = excluded.session_id,
      repo_root = CASE WHEN excluded.repo_root != '' THEN excluded.repo_root ELSE session_runs.repo_root END,
      project_id = CASE WHEN excluded.project_id != '' THEN excluded.project_id ELSE session_runs.project_id END,
      started_at = CASE
        WHEN session_runs.started_at = '' OR session_runs.started_at > excluded.started_at
          THEN excluded.started_at
        ELSE session_runs.started_at
      END
  `).run(runId, sessionId, repoRoot, projectId, occurredAt, DEFAULT_RUN_STATUS);
}

function ensureTaskRunRow(db, runId, repoRoot, objective, occurredAt, status) {
  const projectId = getProjectId(repoRoot);
  const taskId = `${projectId || 'global'}:${runId}`;
  db.prepare(`
    INSERT INTO task_runs (
      task_id,
      run_id,
      project_id,
      repo_root,
      objective,
      status,
      started_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(task_id) DO UPDATE SET
      objective = CASE WHEN excluded.objective != '' THEN excluded.objective ELSE task_runs.objective END,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run(taskId, runId, projectId, repoRoot, objective, status, occurredAt, occurredAt);
}

function updateSessionRunFromEvent(db, event, parsedMetadata) {
  const existing = db.prepare(`
    SELECT *
    FROM session_runs
    WHERE run_id = ?
    LIMIT 1
  `).get(event.runId);

  const nextState = {
    started_at: existing ? existing.started_at : event.occurredAt,
    ended_at: existing ? existing.ended_at : '',
    final_status: existing ? existing.final_status : DEFAULT_RUN_STATUS,
    plan_present: existing ? Number(existing.plan_present) : 0,
    verify_present: existing ? Number(existing.verify_present) : 0,
    review_present: existing ? Number(existing.review_present) : 0,
    observe_present: existing ? Number(existing.observe_present) : 0,
    human_intervention_count: existing ? Number(existing.human_intervention_count) : 0,
  };

  if (event.eventType === 'session_started' && nextState.started_at > event.occurredAt) {
    nextState.started_at = event.occurredAt;
  }
  if (event.eventType === 'session_ended') {
    nextState.ended_at = event.occurredAt;
    if (normalizeString(parsedMetadata.final_status)) {
      nextState.final_status = normalizeString(parsedMetadata.final_status);
    }
  }
  if (event.eventType === 'plan_status_observed' && normalizeString(parsedMetadata.plan_status) === 'approved') {
    nextState.plan_present = 1;
  }
  if (event.eventType === 'verification_completed') {
    nextState.verify_present = 1;
  }
  if (event.eventType === 'review_completed') {
    nextState.review_present = 1;
  }
  if (event.eventType === 'observation_completed') {
    nextState.observe_present = 1;
  }
  if (Number.isFinite(Number(parsedMetadata.human_intervention_count))) {
    nextState.human_intervention_count = Math.max(
      nextState.human_intervention_count,
      Number(parsedMetadata.human_intervention_count)
    );
  }

  db.prepare(`
    UPDATE session_runs
    SET
      started_at = ?,
      ended_at = ?,
      final_status = ?,
      plan_present = ?,
      verify_present = ?,
      review_present = ?,
      observe_present = ?,
      human_intervention_count = ?
    WHERE run_id = ?
  `).run(
    nextState.started_at,
    nextState.ended_at,
    nextState.final_status,
    nextState.plan_present,
    nextState.verify_present,
    nextState.review_present,
    nextState.observe_present,
    nextState.human_intervention_count,
    event.runId
  );
}

function recordSessionEvent(input = {}, options = {}) {
  return withDatabase(db => {
    const occurredAt = normalizeString(input.occurredAt, new Date().toISOString());
    const sessionId = normalizeString(input.sessionId, getSessionId());
    const runId = normalizeString(input.runId, getRunId(sessionId));
    const repoRoot = normalizeString(input.repoRoot, '');
    const cwd = normalizeString(input.cwd, process.cwd());
    const taskPhase = normalizeString(input.taskPhase, '');
    const artifactRefs = Array.isArray(input.artifactRefs) ? input.artifactRefs : [];
    const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};
    const durationMs = Number.isFinite(Number(input.durationMs)) ? Number(input.durationMs) : 0;
    const createdBy = normalizeString(input.createdBy, 'session-trace');
    const eventType = normalizeString(input.eventType);
    const status = normalizeString(input.status, 'ok');

    if (!eventType) return null;

    ensureSessionRunRow(db, sessionId, runId, repoRoot, occurredAt);
    const metadataJson = stableJsonStringify(metadata);
    const artifactRefsJson = stableJsonStringify(artifactRefs);

    const result = db.prepare(`
      INSERT INTO session_events (
        occurred_at,
        session_id,
        run_id,
        event_type,
        status,
        repo_root,
        cwd,
        task_phase,
        artifact_refs_json,
        metadata_json,
        duration_ms,
        created_by,
        schema_version
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      occurredAt,
      sessionId,
      runId,
      eventType,
      status,
      repoRoot,
      cwd,
      taskPhase,
      artifactRefsJson,
      metadataJson,
      durationMs,
      createdBy,
      SCHEMA_VERSION
    );

    updateSessionRunFromEvent(db, {
      runId,
      occurredAt,
      eventType,
    }, metadata);

    return result.lastInsertRowid;
  }, options.dbPath);
}

function getLatestEventMetadata(db, runId, eventType) {
  const row = db.prepare(`
    SELECT metadata_json
    FROM session_events
    WHERE run_id = ? AND event_type = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(runId, eventType);

  return row ? safeJsonParse(row.metadata_json, {}) : null;
}

function buildArtifactRefs(artifacts = []) {
  return artifacts.map(artifact => ({
    name: artifact.name,
    path: artifact.path,
    status: artifact.status || '',
  }));
}

function getArtifactFingerprint(artifact) {
  if (!artifact || !artifact.path || !fs.existsSync(artifact.path)) return '';
  const stats = fs.statSync(artifact.path);
  return `${artifact.name}:${stats.mtimeMs}:${artifact.status || ''}`;
}

function buildLifecycleSnapshot(repoRoot) {
  const artifacts = findTaskArtifacts(repoRoot);
  if (artifacts.length === 0) return null;

  const lifecycle = buildLifecycleState(artifacts);
  const byName = new Map(artifacts.map(artifact => [artifact.name, artifact]));

  return {
    repoRoot,
    artifacts,
    artifactRefs: buildArtifactRefs(artifacts),
    lifecycle,
    artifactContextFingerprint: artifacts.map(getArtifactFingerprint).join('|'),
    objective: byName.get('plan.md')?.title || '',
    fingerprints: {
      plan: (() => {
        const artifact = byName.get('plan.md');
        return artifact
          ? `${getArtifactFingerprint(artifact)}:${lifecycle.planStatus}:${lifecycle.blocked.join('|')}`
          : `missing:${lifecycle.planStatus}:${lifecycle.blocked.join('|')}`;
      })(),
      verification: (() => {
        const artifact = byName.get('verification-summary.md');
        return artifact ? getArtifactFingerprint(artifact) : '';
      })(),
      review: (() => {
        const artifact = byName.get('review-summary.md');
        const findings = artifact?.review_state?.blockingFindings?.length || 0;
        return artifact ? `${getArtifactFingerprint(artifact)}:${findings}` : '';
      })(),
      observation: (() => {
        const artifact = byName.get('observation-summary.md');
        return artifact ? getArtifactFingerprint(artifact) : '';
      })(),
      checkpoint: (() => {
        const artifact = byName.get('progress.md');
        const checkpoint = artifact?.progress_state?.automation?.checkpoint || {};
        return artifact
          ? `${getArtifactFingerprint(artifact)}:${checkpoint.updatedAt || ''}:${checkpoint.event || ''}`
          : '';
      })(),
      runState: stableJsonStringify({
        currentPhase: lifecycle.sessionState.currentPhase || '',
        lastCompletedStep: lifecycle.sessionState.lastCompletedStep || '',
        nextAction: lifecycle.sessionState.nextAction || '',
        blockers: lifecycle.sessionState.blockers || [],
        delegatedWork: lifecycle.sessionState.delegatedWork || [],
        blocked: lifecycle.blocked || [],
      }),
    },
  };
}

function hasFingerprintChanged(db, runId, eventType, fingerprint) {
  const previous = getLatestEventMetadata(db, runId, eventType);
  return !previous || normalizeString(previous.fingerprint) !== normalizeString(fingerprint);
}

function classifyRunStatus(lifecycle, humanInterventionCount = 0) {
  if (!lifecycle) return DEFAULT_RUN_STATUS;
  if (lifecycle.planStatus === 'missing' || lifecycle.planStatus === 'draft') {
    return 'blocked_before_plan';
  }
  if (Array.isArray(lifecycle.blocked) && lifecycle.blocked.length > 0) {
    return 'blocked_after_plan';
  }
  if (humanInterventionCount > 0) {
    return 'completed_with_intervention';
  }
  if (
    lifecycle.hasVerification &&
    (!lifecycle.reviewRequired || lifecycle.hasReview) &&
    (!lifecycle.observeRequired || lifecycle.hasObservation)
  ) {
    return 'completed_clean';
  }
  return DEFAULT_RUN_STATUS;
}

function upsertRunState(db, sessionId, runId, repoRoot, snapshot, occurredAt) {
  const state = snapshot.lifecycle.sessionState || {};
  const projectId = getProjectId(repoRoot);
  db.prepare(`
    INSERT INTO run_state (
      run_id,
      session_id,
      project_id,
      repo_root,
      current_phase,
      current_step,
      next_action,
      blockers_json,
      delegated_work_json,
      checkpoint_event,
      artifact_blocked_json,
      plan_status,
      review_required,
      observe_required,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id) DO UPDATE SET
      session_id = excluded.session_id,
      project_id = excluded.project_id,
      repo_root = excluded.repo_root,
      current_phase = excluded.current_phase,
      current_step = excluded.current_step,
      next_action = excluded.next_action,
      blockers_json = excluded.blockers_json,
      delegated_work_json = excluded.delegated_work_json,
      checkpoint_event = excluded.checkpoint_event,
      artifact_blocked_json = excluded.artifact_blocked_json,
      plan_status = excluded.plan_status,
      review_required = excluded.review_required,
      observe_required = excluded.observe_required,
      updated_at = excluded.updated_at
  `).run(
    runId,
    sessionId,
    projectId,
    repoRoot,
    state.currentPhase || '',
    state.lastCompletedStep || '',
    state.nextAction || (state.nextActionExplicitNone ? 'none' : ''),
    stableJsonStringify(state.blockers || []),
    stableJsonStringify(state.delegatedWork || []),
    state.automation?.checkpoint?.event || '',
    stableJsonStringify(snapshot.lifecycle.blocked || []),
    snapshot.lifecycle.planStatus || '',
    snapshot.lifecycle.reviewRequired ? 1 : 0,
    snapshot.lifecycle.observeRequired ? 1 : 0,
    occurredAt
  );
}

function applyLifecycleSnapshot(db, sessionId, runId, snapshot, humanInterventionCount = null, occurredAt = new Date().toISOString()) {
  if (!snapshot) return null;
  ensureSessionRunRow(db, sessionId, runId, snapshot.repoRoot, occurredAt);

  const count = Number.isFinite(Number(humanInterventionCount))
    ? Number(humanInterventionCount)
    : Number(db.prepare(`
      SELECT human_intervention_count
      FROM session_runs
      WHERE run_id = ?
      LIMIT 1
    `).get(runId)?.human_intervention_count || 0);

  db.prepare(`
    UPDATE session_runs
    SET
      repo_root = ?,
      project_id = ?,
      plan_present = ?,
      verify_present = ?,
      review_present = ?,
      observe_present = ?,
      human_intervention_count = ?,
      final_status = ?
    WHERE run_id = ?
  `).run(
    snapshot.repoRoot,
    getProjectId(snapshot.repoRoot),
    snapshot.lifecycle.planStatus === 'approved' ? 1 : 0,
    snapshot.lifecycle.hasVerification ? 1 : 0,
    snapshot.lifecycle.hasReview ? 1 : 0,
    snapshot.lifecycle.hasObservation ? 1 : 0,
    count,
    classifyRunStatus(snapshot.lifecycle, count),
    runId
  );

  upsertRunState(db, sessionId, runId, snapshot.repoRoot, snapshot, occurredAt);
  ensureTaskRunRow(
    db,
    runId,
    snapshot.repoRoot,
    snapshot.objective || '',
    occurredAt,
    classifyRunStatus(snapshot.lifecycle, count)
  );

  db.prepare(`
    INSERT INTO memory_episodic (
      project_id,
      repo_root,
      run_id,
      episode_type,
      summary,
      details_json,
      occurred_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    getProjectId(snapshot.repoRoot),
    snapshot.repoRoot,
    runId,
    'lifecycle_snapshot',
    truncate(`${snapshot.lifecycle.sessionState.currentPhase || 'unknown phase'} -> ${snapshot.lifecycle.sessionState.nextAction || 'unknown next action'}`, 200),
    stableJsonStringify({
      blocked: snapshot.lifecycle.blocked,
      current_phase: snapshot.lifecycle.sessionState.currentPhase || '',
      current_step: snapshot.lifecycle.sessionState.lastCompletedStep || '',
      next_action: snapshot.lifecycle.sessionState.nextAction || '',
    }),
    occurredAt
  );

  return count;
}

function recordVerificationResult(db, runId, repoRoot, artifact, occurredAt, fingerprint) {
  const commands = artifact.verification_state?.commandsRun || [];
  const outcomes = artifact.verification_state?.verificationOutcome || [];
  const evidenceRef = artifact.path || '';
  const seen = new Set();
  const pairs = commands.length > 0 ? commands : ['artifact_present'];

  for (const command of pairs) {
    const key = `${command}|${fingerprint}`;
    if (seen.has(key)) continue;
    seen.add(key);
    db.prepare(`
      INSERT INTO verification_results (
        run_id,
        repo_root,
        check_name,
        command,
        status,
        evidence_ref,
        details_json,
        occurred_at,
        fingerprint
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      repoRoot,
      'verification-summary',
      command,
      artifact.verification_state?.complete ? 'complete' : 'present',
      evidenceRef,
      stableJsonStringify({
        outcome: outcomes,
        assessment: artifact.verification_state?.assessment || [],
      }),
      occurredAt,
      fingerprint
    );
  }
}

function recordReviewDetails(db, runId, repoRoot, artifact, occurredAt, fingerprint) {
  const findings = artifact.review_state?.parsedFindings || [];
  if (findings.length === 0) {
    db.prepare(`
      INSERT INTO review_findings (
        run_id,
        repo_root,
        severity,
        category,
        location,
        disposition,
        message,
        occurred_at,
        fingerprint
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(runId, repoRoot, 'INFO', 'review-summary', artifact.path || '', 'accepted', 'none', occurredAt, fingerprint);
    return;
  }

  for (const finding of findings) {
    db.prepare(`
      INSERT INTO review_findings (
        run_id,
        repo_root,
        severity,
        category,
        location,
        disposition,
        message,
        occurred_at,
        fingerprint
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      repoRoot,
      finding.severity,
      'review-summary',
      artifact.path || '',
      'open',
      finding.message,
      occurredAt,
      fingerprint
    );
  }
}

function recordLifecycleSnapshot(input = {}, options = {}) {
  return withDatabase(db => {
    const sessionId = normalizeString(input.sessionId, getSessionId());
    const runId = normalizeString(input.runId, getRunId(sessionId));
    const cwd = normalizeString(input.cwd, process.cwd());
    const repoRoot = normalizeString(input.repoRoot, getRepoRoot(cwd) || '');
    if (!repoRoot) return null;

    const snapshot = buildLifecycleSnapshot(repoRoot);
    if (!snapshot) return null;

    const taskPhase = snapshot.lifecycle.sessionState.currentPhase || '';
    const createdBy = normalizeString(input.createdBy, 'session-trace');
    const occurredAt = normalizeString(input.occurredAt, new Date().toISOString());
    const humanInterventionCount = Number.isFinite(Number(input.humanInterventionCount))
      ? Number(input.humanInterventionCount)
      : null;
    const recorded = [];

    ensureSessionRunRow(db, sessionId, runId, repoRoot, occurredAt);
    applyLifecycleSnapshot(db, sessionId, runId, snapshot, humanInterventionCount, occurredAt);

    const shared = {
      sessionId,
      runId,
      repoRoot,
      cwd,
      taskPhase,
      artifactRefs: snapshot.artifactRefs,
      createdBy,
      occurredAt,
    };

    if (input.includeArtifactContextLoaded && hasFingerprintChanged(db, runId, 'artifact_context_loaded', snapshot.artifactContextFingerprint)) {
      recorded.push(recordSessionEvent({
        ...shared,
        eventType: 'artifact_context_loaded',
        status: 'loaded',
        metadata: {
          artifact_count: snapshot.artifacts.length,
          blocked: snapshot.lifecycle.blocked,
          fingerprint: snapshot.artifactContextFingerprint,
        },
      }, options));
    }

    if (hasFingerprintChanged(db, runId, 'plan_status_observed', snapshot.fingerprints.plan)) {
      recorded.push(recordSessionEvent({
        ...shared,
        eventType: 'plan_status_observed',
        status: snapshot.lifecycle.planStatus || 'missing',
        metadata: {
          blocked: snapshot.lifecycle.blocked,
          fingerprint: snapshot.fingerprints.plan,
          observe_required: snapshot.lifecycle.observeRequired,
          plan_status: snapshot.lifecycle.planStatus,
          progress_present: snapshot.lifecycle.progressPresent,
          review_required: snapshot.lifecycle.reviewRequired,
        },
      }, options));
    }

    const verificationArtifact = snapshot.artifacts.find(artifact => artifact.name === 'verification-summary.md');
    if (verificationArtifact && hasFingerprintChanged(db, runId, 'verification_completed', snapshot.fingerprints.verification)) {
      recordVerificationResult(db, runId, repoRoot, verificationArtifact, occurredAt, snapshot.fingerprints.verification);
      recorded.push(recordSessionEvent({
        ...shared,
        eventType: 'verification_completed',
        status: verificationArtifact.verification_state?.complete ? 'complete' : 'present',
        metadata: {
          complete: Boolean(verificationArtifact.verification_state?.complete),
          fingerprint: snapshot.fingerprints.verification,
          missing_values: verificationArtifact.verification_state?.missingValues || [],
        },
      }, options));
    }

    const reviewArtifact = snapshot.artifacts.find(artifact => artifact.name === 'review-summary.md');
    if (reviewArtifact && reviewArtifact.review_state?.complete && hasFingerprintChanged(db, runId, 'review_completed', snapshot.fingerprints.review)) {
      recordReviewDetails(db, runId, repoRoot, reviewArtifact, occurredAt, snapshot.fingerprints.review);
      recorded.push(recordSessionEvent({
        ...shared,
        eventType: 'review_completed',
        status: reviewArtifact.review_state.hasBlockingFindings ? 'blocking' : 'complete',
        metadata: {
          findings_count: reviewArtifact.review_state.blockingFindings.length,
          fingerprint: snapshot.fingerprints.review,
          has_blocking_findings: reviewArtifact.review_state.hasBlockingFindings,
        },
      }, options));
    }

    const observationArtifact = snapshot.artifacts.find(artifact => artifact.name === 'observation-summary.md');
    if (observationArtifact && observationArtifact.observation_state?.complete && hasFingerprintChanged(db, runId, 'observation_completed', snapshot.fingerprints.observation)) {
      recorded.push(recordSessionEvent({
        ...shared,
        eventType: 'observation_completed',
        status: 'complete',
        metadata: {
          fingerprint: snapshot.fingerprints.observation,
          has_concrete_evidence: observationArtifact.observation_state.hasConcreteEvidence,
        },
      }, options));
    }

    const progressArtifact = snapshot.artifacts.find(artifact => artifact.name === 'progress.md');
    if (progressArtifact?.progress_state?.automation?.checkpoint?.updatedAt && hasFingerprintChanged(db, runId, 'checkpoint_written', snapshot.fingerprints.checkpoint)) {
      recorded.push(recordSessionEvent({
        ...shared,
        eventType: 'checkpoint_written',
        status: 'recorded',
        metadata: {
          checkpoint_event: progressArtifact.progress_state.automation.checkpoint.event,
          fingerprint: snapshot.fingerprints.checkpoint,
          human_intervention_count: humanInterventionCount,
          next_action: progressArtifact.progress_state.nextAction,
        },
      }, options));
    }

    return recorded.filter(Boolean);
  }, options.dbPath);
}

function fingerprintToolDetails(toolName, toolInput = {}) {
  return crypto.createHash('sha1')
    .update(stableJsonStringify({
      tool_name: toolName,
      tool_input: toolInput,
    }))
    .digest('hex')
    .slice(0, 16);
}

function recordToolExecution(input = {}, options = {}) {
  const sessionId = normalizeString(input.sessionId, getSessionId());
  const runId = normalizeString(input.runId, getRunId(sessionId));
  const repoRoot = normalizeString(input.repoRoot, getRepoRoot(process.cwd()) || '');
  const cwd = normalizeString(input.cwd, process.cwd());
  const toolName = normalizeString(input.toolName);
  const phase = normalizeString(input.phase, 'completed');
  if (!toolName) return null;

  const toolInput = input.toolInput && typeof input.toolInput === 'object' ? input.toolInput : {};
  const occurredAt = normalizeString(input.occurredAt, new Date().toISOString());
  const status = normalizeString(input.status, phase === 'started' ? 'started' : 'completed');
  const durationMs = Number.isFinite(Number(input.durationMs)) ? Number(input.durationMs) : 0;
  const details = input.details && typeof input.details === 'object' ? input.details : {};
  const inputFingerprint = fingerprintToolDetails(toolName, toolInput);
  const projectId = getProjectId(repoRoot);

  const inserted = withDatabase(db => {
    ensureSessionRunRow(db, sessionId, runId, repoRoot, occurredAt);
    db.prepare(`
      INSERT INTO tool_executions (
        run_id,
        session_id,
        project_id,
        repo_root,
        tool_name,
        phase,
        status,
        input_fingerprint,
        details_json,
        occurred_at,
        duration_ms
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      sessionId,
      projectId,
      repoRoot,
      toolName,
      phase,
      status,
      inputFingerprint,
      stableJsonStringify({
        tool_input: toolInput,
        ...details,
      }),
      occurredAt,
      durationMs
    );
    return inputFingerprint;
  }, options.dbPath);

  if (!inserted) return null;

  recordSessionEvent({
    sessionId,
    runId,
    eventType: phase === 'started' ? 'tool_invoked' : 'tool_completed',
    status,
    repoRoot,
    cwd,
    taskPhase: '',
    metadata: {
      tool_name: toolName,
      input_fingerprint: inputFingerprint,
      tool_input_keys: Object.keys(toolInput).sort(),
    },
    durationMs,
    createdBy: `tool-${phase}`,
  }, options);

  return inputFingerprint;
}

function getLatestRunState(options = {}) {
  const dbPath = normalizeString(options.dbPath, getTelemetryDbPath());
  const repoRoot = normalizeString(options.repoRoot, '');
  const runId = normalizeString(options.runId, '');

  return withDatabase(db => {
    let row;
    if (runId) {
      row = db.prepare(`
        SELECT rs.*, sr.final_status, sr.started_at, sr.ended_at, sr.plan_present, sr.verify_present, sr.review_present, sr.observe_present
        FROM run_state rs
        JOIN session_runs sr ON sr.run_id = rs.run_id
        WHERE rs.run_id = ?
        LIMIT 1
      `).get(runId);
    } else if (repoRoot) {
      row = db.prepare(`
        SELECT rs.*, sr.final_status, sr.started_at, sr.ended_at, sr.plan_present, sr.verify_present, sr.review_present, sr.observe_present
        FROM run_state rs
        JOIN session_runs sr ON sr.run_id = rs.run_id
        WHERE rs.repo_root = ?
        ORDER BY rs.updated_at DESC
        LIMIT 1
      `).get(repoRoot);
    } else {
      row = db.prepare(`
        SELECT rs.*, sr.final_status, sr.started_at, sr.ended_at, sr.plan_present, sr.verify_present, sr.review_present, sr.observe_present
        FROM run_state rs
        JOIN session_runs sr ON sr.run_id = rs.run_id
        ORDER BY rs.updated_at DESC
        LIMIT 1
      `).get();
    }
    if (!row) return null;

    return {
      runId: row.run_id,
      sessionId: row.session_id,
      projectId: row.project_id,
      repoRoot: row.repo_root,
      currentPhase: row.current_phase || '',
      currentStep: row.current_step || '',
      nextAction: row.next_action || '',
      blockers: safeJsonParse(row.blockers_json, []),
      delegatedWork: safeJsonParse(row.delegated_work_json, []),
      checkpointEvent: row.checkpoint_event || '',
      artifactBlocked: safeJsonParse(row.artifact_blocked_json, []),
      planStatus: row.plan_status || '',
      reviewRequired: Number(row.review_required) === 1,
      observeRequired: Number(row.observe_required) === 1,
      updatedAt: row.updated_at || '',
      finalStatus: row.final_status || DEFAULT_RUN_STATUS,
      startedAt: row.started_at || '',
      endedAt: row.ended_at || '',
      planPresent: Number(row.plan_present) === 1,
      verifyPresent: Number(row.verify_present) === 1,
      reviewPresent: Number(row.review_present) === 1,
      observePresent: Number(row.observe_present) === 1,
    };
  }, dbPath);
}

function formatResumeState(state) {
  if (!state) return null;
  const lines = ['Persisted runtime state:'];
  lines.push(`- run_id=${truncate(state.runId, 32)}`);
  lines.push(`- plan_status=${state.planStatus || 'unknown'}`);
  lines.push(`- current_phase=${state.currentPhase || 'unknown'}`);
  lines.push(`- current_step=${state.currentStep || 'unknown'}`);
  lines.push(`- next_action=${state.nextAction || 'none'}`);
  lines.push(`- blockers=${state.blockers.length > 0 ? state.blockers.join('; ') : 'none'}`);
  lines.push(`- delegated_work=${state.delegatedWork.length > 0 ? state.delegatedWork.join('; ') : 'none'}`);
  lines.push(`- artifact_blocked=${state.artifactBlocked.length > 0 ? state.artifactBlocked.join('; ') : 'none'}`);
  lines.push(`- review_required=${state.reviewRequired}`);
  lines.push(`- observe_required=${state.observeRequired}`);
  lines.push(`- verify_present=${state.verifyPresent}`);
  lines.push(`- review_present=${state.reviewPresent}`);
  lines.push(`- observe_present=${state.observePresent}`);
  lines.push(`- final_status=${state.finalStatus}`);
  lines.push(`- updated_at=${state.updatedAt || 'unknown'}`);
  return lines.join('\n');
}

function computeDurationMinutes(start, end) {
  const startTimestamp = Date.parse(start);
  const endTimestamp = Date.parse(end);
  if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp) || endTimestamp < startTimestamp) {
    return null;
  }
  return Math.round(((endTimestamp - startTimestamp) / 60000) * 100) / 100;
}

function summarizeTraceStatus(options = {}) {
  const dbPath = normalizeString(options.dbPath, getTelemetryDbPath());
  return withDatabase(db => {
    const limit = Math.max(1, Number(options.limit) || 10);
    const runs = db.prepare(`
      SELECT *
      FROM session_runs
      ORDER BY started_at DESC
      LIMIT ?
    `).all(limit);

    const sessionStartRows = db.prepare(`
      SELECT metadata_json
      FROM session_events
      WHERE event_type = 'session_started'
    `).all();
    const planRows = db.prepare(`
      SELECT run_id, occurred_at, metadata_json
      FROM session_events
      WHERE event_type = 'plan_status_observed'
      ORDER BY occurred_at ASC
    `).all();
    const verificationRows = db.prepare(`
      SELECT run_id, occurred_at
      FROM session_events
      WHERE event_type = 'verification_completed'
      ORDER BY occurred_at ASC
    `).all();
    const reviewRows = db.prepare(`
      SELECT run_id, metadata_json
      FROM session_events
      WHERE event_type = 'review_completed'
      ORDER BY occurred_at DESC
    `).all();

    const planByRun = new Map();
    for (const row of planRows) {
      const metadata = safeJsonParse(row.metadata_json, {});
      if (metadata.plan_status === 'approved' && !planByRun.has(row.run_id)) {
        planByRun.set(row.run_id, row.occurred_at);
      }
    }

    const verificationByRun = new Map();
    for (const row of verificationRows) {
      if (!verificationByRun.has(row.run_id)) {
        verificationByRun.set(row.run_id, row.occurred_at);
      }
    }

    const reviewFindingsByRun = new Map();
    for (const row of reviewRows) {
      if (reviewFindingsByRun.has(row.run_id)) continue;
      const metadata = safeJsonParse(row.metadata_json, {});
      reviewFindingsByRun.set(row.run_id, Number(metadata.findings_count) || 0);
    }

    const startedRuns = runs.filter(run => normalizeString(run.started_at));
    const resumeEvents = sessionStartRows
      .map(row => safeJsonParse(row.metadata_json, {}))
      .filter(Boolean);
    const resumeSuccessCount = resumeEvents.filter(event => event.resume_success === true).length;

    const planDurations = startedRuns
      .map(run => computeDurationMinutes(run.started_at, planByRun.get(run.run_id)))
      .filter(value => value !== null);
    const verifyDurations = startedRuns
      .map(run => computeDurationMinutes(run.started_at, verificationByRun.get(run.run_id)))
      .filter(value => value !== null);
    const reviewFindingCounts = startedRuns
      .map(run => reviewFindingsByRun.get(run.run_id))
      .filter(value => Number.isFinite(value));

    const average = values => {
      if (!values || values.length === 0) return null;
      return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
    };

    const countsByStatus = startedRuns.reduce((acc, run) => {
      const key = normalizeString(run.final_status, DEFAULT_RUN_STATUS);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return {
      dbPath: getTelemetryDbPath(),
      sqliteAvailable: isSqliteAvailable(),
      totalRuns: startedRuns.length,
      countsByStatus,
      kpis: {
        resume_success_rate: resumeEvents.length > 0 ? Math.round((resumeSuccessCount / resumeEvents.length) * 10000) / 100 : null,
        time_to_plan_approval_minutes: average(planDurations),
        time_to_verified_completion_minutes: average(verifyDurations),
        review_findings_per_run: average(reviewFindingCounts),
        human_intervention_rate: startedRuns.length > 0
          ? Math.round((startedRuns.filter(run => Number(run.human_intervention_count) > 0).length / startedRuns.length) * 10000) / 100
          : null,
      },
      recentRuns: startedRuns.map(run => ({
        run_id: run.run_id,
        session_id: run.session_id,
        started_at: run.started_at,
        ended_at: run.ended_at,
        final_status: run.final_status,
        plan_present: Number(run.plan_present) === 1,
        verify_present: Number(run.verify_present) === 1,
        review_present: Number(run.review_present) === 1,
        observe_present: Number(run.observe_present) === 1,
        human_intervention_count: Number(run.human_intervention_count) || 0,
      })),
    };
  }, dbPath) || {
    dbPath,
    sqliteAvailable: isSqliteAvailable(),
    totalRuns: 0,
    countsByStatus: {},
    kpis: {
      resume_success_rate: null,
      time_to_plan_approval_minutes: null,
      time_to_verified_completion_minutes: null,
      review_findings_per_run: null,
      human_intervention_rate: null,
    },
    recentRuns: [],
  };
}

function formatTraceStatus(summary = summarizeTraceStatus()) {
  const lines = ['Trace Status'];
  lines.push(`- db_path=${summary.dbPath}`);
  lines.push(`- sqlite_available=${summary.sqliteAvailable}`);
  lines.push(`- total_runs=${summary.totalRuns}`);
  lines.push(`- counts_by_status=${Object.keys(summary.countsByStatus).length > 0 ? stableJsonStringify(summary.countsByStatus) : '{}'}`);
  lines.push('KPIs:');
  lines.push(`- resume_success_rate=${summary.kpis.resume_success_rate ?? 'n/a'}`);
  lines.push(`- time_to_plan_approval_minutes=${summary.kpis.time_to_plan_approval_minutes ?? 'n/a'}`);
  lines.push(`- time_to_verified_completion_minutes=${summary.kpis.time_to_verified_completion_minutes ?? 'n/a'}`);
  lines.push(`- review_findings_per_run=${summary.kpis.review_findings_per_run ?? 'n/a'}`);
  lines.push(`- human_intervention_rate=${summary.kpis.human_intervention_rate ?? 'n/a'}`);
  if (summary.recentRuns.length > 0) {
    lines.push('Recent runs:');
    for (const run of summary.recentRuns) {
      lines.push(`- ${truncate(run.run_id, 32)} | status=${run.final_status} | plan=${run.plan_present} | verify=${run.verify_present} | review=${run.review_present} | observe=${run.observe_present} | interventions=${run.human_intervention_count}`);
    }
  }
  return lines.join('\n');
}

module.exports = {
  SCHEMA_VERSION,
  getTelemetryDir,
  getTelemetryDbPath,
  getRunId,
  getLatestRunState,
  formatResumeState,
  isSqliteAvailable,
  createDatabase,
  recordSessionEvent,
  recordLifecycleSnapshot,
  recordToolExecution,
  summarizeTraceStatus,
  formatTraceStatus,
  buildLifecycleSnapshot,
  classifyRunStatus,
};
