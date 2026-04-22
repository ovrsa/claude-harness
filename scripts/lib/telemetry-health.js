'use strict';

const fs = require('fs');

const {
  createDatabase,
  getTelemetryDbPath,
  isSqliteAvailable,
} = require('./session-trace');
const { normalizeGuardrailCandidate } = require('./guardrail-candidates');

const DEFAULT_HIGH_INTERVENTION_THRESHOLD = 2;

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function buildTelemetryCandidate(candidate, options = {}) {
  return normalizeGuardrailCandidate(candidate, {
    capturedAt: options.capturedAt,
    sourceArtifact: options.sourceArtifact,
  });
}

function getResumeFailedCandidates(db) {
  const rows = db.prepare(`
    SELECT occurred_at, run_id, session_id, metadata_json
    FROM session_events
    WHERE event_type = 'session_started'
    ORDER BY occurred_at DESC
  `).all();

  return rows
    .map(row => ({
      row,
      metadata: safeJsonParse(row.metadata_json, {}),
    }))
    .filter(({ metadata }) => metadata.resume_success === false)
    .map(({ row, metadata }) => buildTelemetryCandidate({
      failure_pattern: 'resume_failed',
      source: 'telemetry:session_started',
      source_artifact: 'progress.md',
      example: `run_id=${row.run_id}; session_id=${row.session_id}; resume_reason=${String(metadata.resume_reason || 'unknown')}`,
      recommended_layer: 'hook',
      severity: 'high',
      confidence: 'high',
      false_positive_risk: 'low',
      promotion_hint: 'improve session resume and artifact rehydration',
    }, {
      capturedAt: row.occurred_at,
      sourceArtifact: 'progress.md',
    }));
}

function getPlanMissingCandidates(db) {
  const rows = db.prepare(`
    SELECT run_id, session_id, started_at, ended_at, final_status
    FROM session_runs
    WHERE plan_present = 0
    ORDER BY started_at DESC
  `).all();

  return rows.map(row => buildTelemetryCandidate({
    failure_pattern: 'plan_missing_or_skipped',
    source: 'telemetry:session_runs',
    source_artifact: 'plan.md',
    example: `run_id=${row.run_id}; session_id=${row.session_id}; final_status=${String(row.final_status || 'unknown')}`,
    recommended_layer: 'hook',
    severity: 'high',
    confidence: 'high',
    false_positive_risk: 'low',
    promotion_hint: 'enforce approved plan before execution',
  }, {
    capturedAt: row.ended_at || row.started_at,
    sourceArtifact: 'plan.md',
  }));
}

function getVerificationMissingCandidates(db) {
  const rows = db.prepare(`
    SELECT run_id, session_id, started_at, ended_at, final_status
    FROM session_runs
    WHERE plan_present = 1 AND verify_present = 0
    ORDER BY started_at DESC
  `).all();

  return rows.map(row => buildTelemetryCandidate({
    failure_pattern: 'verification_missing_before_completion',
    source: 'telemetry:session_runs',
    source_artifact: 'verification-summary.md',
    example: `run_id=${row.run_id}; session_id=${row.session_id}; final_status=${String(row.final_status || 'unknown')}`,
    recommended_layer: 'hook',
    severity: 'high',
    confidence: 'high',
    false_positive_risk: 'low',
    promotion_hint: 'enforce verification before completion',
  }, {
    capturedAt: row.ended_at || row.started_at,
    sourceArtifact: 'verification-summary.md',
  }));
}

function getHighInterventionCandidates(db, threshold = DEFAULT_HIGH_INTERVENTION_THRESHOLD) {
  const rows = db.prepare(`
    SELECT run_id, session_id, started_at, ended_at, final_status, human_intervention_count
    FROM session_runs
    WHERE human_intervention_count >= ?
    ORDER BY started_at DESC
  `).all(threshold);

  return rows.map(row => buildTelemetryCandidate({
    failure_pattern: 'high_human_intervention_run',
    source: 'telemetry:session_runs',
    source_artifact: 'progress.md',
    example: `run_id=${row.run_id}; session_id=${row.session_id}; interventions=${Number(row.human_intervention_count) || 0}; final_status=${String(row.final_status || 'unknown')}`,
    recommended_layer: 'docs',
    severity: 'medium',
    confidence: 'medium',
    false_positive_risk: 'medium',
    promotion_hint: 'clarify task and recovery guidance before execution',
  }, {
    capturedAt: row.ended_at || row.started_at,
    sourceArtifact: 'progress.md',
  }));
}

function getManualBridgeLimitedObservabilityCandidates(db) {
  const rows = db.prepare(`
    SELECT
      r.run_id,
      r.session_id,
      r.started_at,
      r.ended_at,
      r.final_status,
      r.plan_present,
      r.verify_present,
      r.review_present,
      e.metadata_json,
      COUNT(t.id) AS tool_execution_count
    FROM session_runs r
    JOIN session_events e
      ON e.run_id = r.run_id
     AND e.event_type = 'session_started'
    LEFT JOIN tool_executions t
      ON t.run_id = r.run_id
    GROUP BY r.run_id, r.session_id, r.started_at, r.ended_at, r.final_status, r.plan_present, r.verify_present, r.review_present, e.metadata_json
    ORDER BY r.started_at DESC
  `).all();

  return rows
    .map(row => ({
      row,
      metadata: safeJsonParse(row.metadata_json, {}),
    }))
    .filter(({ row, metadata }) => (
      (Number(row.tool_execution_count) || 0) === 0
      && (
        String(metadata.bridge_mode || '').trim().toLowerCase() === 'manual'
        || (
          Number(row.plan_present) === 1
          && Number(row.verify_present) === 1
          && Number(row.review_present) === 1
        )
      )
    ))
    .map(({ row, metadata }) => {
      const bridgeMode = String(metadata.bridge_mode || '').trim().toLowerCase();
      const isManualBridge = bridgeMode === 'manual';
      return buildTelemetryCandidate({
        failure_pattern: isManualBridge ? 'manual_bridge_session_level_only' : 'session_level_observability_only',
        source: 'telemetry:session_started',
        source_artifact: 'docs/codex-telemetry-bridge.md',
        example: `run_id=${row.run_id}; session_id=${row.session_id}; runtime=${String(metadata.runtime || 'unknown')}; bridge_mode=${bridgeMode || 'unknown'}; final_status=${String(row.final_status || 'unknown')}; tool_executions=${Number(row.tool_execution_count) || 0}`,
        recommended_layer: 'command',
        severity: 'medium',
        confidence: 'high',
        false_positive_risk: 'low',
        promotion_hint: isManualBridge
          ? 'derive improvement recommendations from manual-bridge session telemetry before adding more autonomy'
          : 'close the session-level observability gap before increasing autonomy',
      }, {
        capturedAt: row.ended_at || row.started_at,
        sourceArtifact: 'docs/codex-telemetry-bridge.md',
      });
    });
}

function loadTelemetryHealthCandidates(options = {}) {
  const dbPath = String(options.dbPath || getTelemetryDbPath()).trim();
  if (!dbPath || !isSqliteAvailable() || !fs.existsSync(dbPath)) return [];

  let db = null;
  try {
    db = createDatabase(dbPath);
    return [
      ...getResumeFailedCandidates(db),
      ...getPlanMissingCandidates(db),
      ...getVerificationMissingCandidates(db),
      ...getHighInterventionCandidates(
        db,
        Number.isFinite(Number(options.highInterventionThreshold))
          ? Number(options.highInterventionThreshold)
          : DEFAULT_HIGH_INTERVENTION_THRESHOLD
      ),
      ...getManualBridgeLimitedObservabilityCandidates(db),
    ];
  } catch {
    return [];
  } finally {
    if (db && typeof db.close === 'function') {
      db.close();
    }
  }
}

module.exports = {
  loadTelemetryHealthCandidates,
};
