'use strict';

const path = require('path');

const {
  loadGuardrailCandidates,
  buildCandidateKey,
} = require('./guardrail-candidates');
const { loadTelemetryHealthCandidates } = require('./telemetry-health');
const { getClaudeDir } = require('./utils');

function toTimestamp(value) {
  if (!value) return 0;
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function toIsoString(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  return new Date(timestamp).toISOString();
}

function getCandidateKey(candidate) {
  if (candidate && typeof candidate === 'object') {
    const explicitKey = String(candidate.candidate_key || '').trim();
    if (explicitKey) return explicitKey;
    return buildCandidateKey(candidate);
  }
  return '';
}

/**
 * 'telemetry' means the harness measured it; 'artifact' means the agent
 * declared it in a *-summary.md. The prefixes name the substrate the
 * measurement came from -- `telemetry:` was SQLite, `runs:` and `transcript:`
 * are the JSON logs that replaced it -- but all three are measurements, so
 * they classify the same way.
 */
const MEASURED_SOURCE_PREFIXES = ['telemetry:', 'runs:', 'transcript:'];

function getCandidateProvenance(candidate) {
  const source = String(candidate && candidate.source || '').trim().toLowerCase();
  return MEASURED_SOURCE_PREFIXES.some(prefix => source.startsWith(prefix)) ? 'telemetry' : 'artifact';
}

function loadHealthCandidates(registryPath, options = {}) {
  const registryCandidates = loadGuardrailCandidates(registryPath);
  if (!options || options.includeTelemetry !== true) {
    return registryCandidates;
  }
  return registryCandidates.concat(loadTelemetryHealthCandidates(options));
}

function getDefaultGuardrailRegistryPath() {
  return path.join(getClaudeDir(), '.state', 'guardrail-candidates.jsonl');
}

function groupHealthCandidates(candidates = []) {
  const grouped = new Map();

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;

    const candidateKey = getCandidateKey(candidate);
    if (!candidateKey) continue;

    const capturedAt = String(candidate.captured_at || '').trim();
    const capturedTimestamp = toTimestamp(capturedAt);

    const existing = grouped.get(candidateKey) || {
      candidate_key: candidateKey,
      count: 0,
      first_seen: '',
      last_seen: '',
      first_seen_ts: 0,
      last_seen_ts: 0,
      recommended_layer: String(candidate.recommended_layer || '').trim().toLowerCase(),
      failure_pattern: String(candidate.failure_pattern || '').trim(),
      source_artifact: String(candidate.source_artifact || candidate.source || '').trim(),
      provenance_counts: {
        telemetry: 0,
        artifact: 0,
      },
      entries: [],
    };

    existing.count += 1;
    existing.entries.push(candidate);
    const provenance = getCandidateProvenance(candidate);
    existing.provenance_counts[provenance] = (existing.provenance_counts[provenance] || 0) + 1;

    if (!existing.first_seen_ts || (capturedTimestamp && capturedTimestamp < existing.first_seen_ts)) {
      existing.first_seen_ts = capturedTimestamp;
      existing.first_seen = capturedAt;
    }
    if (capturedTimestamp >= existing.last_seen_ts) {
      existing.last_seen_ts = capturedTimestamp;
      existing.last_seen = capturedAt;
      existing.recommended_layer = String(candidate.recommended_layer || existing.recommended_layer || '').trim().toLowerCase();
      existing.failure_pattern = String(candidate.failure_pattern || existing.failure_pattern || '').trim();
      existing.source_artifact = String(candidate.source_artifact || candidate.source || existing.source_artifact || '').trim();
    }

    grouped.set(candidateKey, existing);
  }

  return Array.from(grouped.values()).map(group => ({
    candidate_key: group.candidate_key,
    count: group.count,
    first_seen: group.first_seen || toIsoString(group.first_seen_ts),
    last_seen: group.last_seen || toIsoString(group.last_seen_ts),
    recommended_layer: group.recommended_layer,
    failure_pattern: group.failure_pattern,
    source_artifact: group.source_artifact,
    provenance: (
      group.provenance_counts.telemetry > 0 && group.provenance_counts.artifact > 0
        ? 'mixed'
        : (group.provenance_counts.telemetry > 0 ? 'telemetry' : 'artifact')
    ),
    entries: group.entries,
  }));
}

function hasResolvedEntry(entries = []) {
  return entries.some(entry => {
    const values = [
      entry.status,
      entry.state,
      entry.disposition,
      entry.resolution,
      entry.result,
    ].map(value => String(value || '').trim().toLowerCase());
    return values.includes('resolved');
  });
}

function classifyHealthGroup(group, options = {}) {
  const promotionThreshold = Number(options.promotionThreshold) || 3;
  const recurringThreshold = Number(options.recurringThreshold) || 2;
  const staleAfterDays = Number(options.staleAfterDays) || 14;
  const nowTimestamp = toTimestamp(options.now || new Date().toISOString());
  const lastSeenTimestamp = toTimestamp(group.last_seen);
  const staleThresholdTimestamp = nowTimestamp - (staleAfterDays * 24 * 60 * 60 * 1000);

  if (hasResolvedEntry(group.entries)) {
    return 'resolved';
  }
  if (group.count >= promotionThreshold) {
    return 'promotion-ready';
  }
  if (lastSeenTimestamp && lastSeenTimestamp < staleThresholdTimestamp) {
    return 'stale';
  }
  if (group.count >= recurringThreshold) {
    return 'recurring';
  }
  return 'new';
}

function sortGroups(groups) {
  return groups.sort((a, b) => {
    const lastSeenDiff = toTimestamp(b.last_seen) - toTimestamp(a.last_seen);
    if (lastSeenDiff !== 0) return lastSeenDiff;
    const countDiff = b.count - a.count;
    if (countDiff !== 0) return countDiff;
    return a.candidate_key.localeCompare(b.candidate_key);
  });
}

function summarizeHealthLoop(candidates = [], options = {}) {
  const groups = sortGroups(groupHealthCandidates(candidates)).map(group => ({
    ...group,
    state: classifyHealthGroup(group, options),
  }));

  const byState = {};
  for (const group of groups) {
    byState[group.state] = (byState[group.state] || 0) + 1;
  }

  return {
    totalEntries: Array.isArray(candidates) ? candidates.length : 0,
    totalGroups: groups.length,
    byState,
    groups,
  };
}

function summarizeCurrentHealth(options = {}) {
  const registryPath = String(options.registryPath || getDefaultGuardrailRegistryPath()).trim();
  const candidates = loadHealthCandidates(registryPath, {
    ...options,
    includeTelemetry: options.includeTelemetry !== false,
  });
  return summarizeHealthLoop(candidates, options);
}

function formatHealthStatus(summary = summarizeCurrentHealth(), options = {}) {
  const lines = ['Health Status'];
  lines.push(`- total_entries=${summary.totalEntries}`);
  lines.push(`- total_groups=${summary.totalGroups}`);
  lines.push(`- by_state=${Object.keys(summary.byState || {}).length > 0 ? JSON.stringify(summary.byState) : '{}'}`);

  const groups = Array.isArray(summary.groups) ? summary.groups : [];
  if (groups.length > 0) {
    lines.push('Top groups:');
    const limit = Math.max(1, Number(options.limit) || 5);
    for (const group of groups.slice(0, limit)) {
      lines.push(`- ${group.candidate_key} | state=${group.state} | count=${group.count} | layer=${group.recommended_layer || 'unknown'} | provenance=${group.provenance || 'unknown'} | pattern=${group.failure_pattern || 'unknown'} | last_seen=${group.last_seen || 'n/a'}`);
    }
  }

  return lines.join('\n');
}

module.exports = {
  getDefaultGuardrailRegistryPath,
  loadHealthCandidates,
  groupHealthCandidates,
  classifyHealthGroup,
  summarizeHealthLoop,
  summarizeCurrentHealth,
  formatHealthStatus,
};
