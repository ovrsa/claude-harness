'use strict';

const fs = require('fs');
const path = require('path');

const VALID_LAYERS = new Set(['docs', 'command', 'hook', 'skill']);
const REQUIRED_FIELDS = ['failure_pattern', 'source', 'recommended_layer', 'confidence'];

function normalizeValue(value) {
  return String(value || '').trim();
}

function buildCandidateKey(candidate) {
  return [
    normalizeValue(candidate.source_artifact || candidate.source),
    normalizeValue(candidate.failure_pattern),
    normalizeValue(candidate.recommended_layer).toLowerCase(),
    normalizeValue(candidate.promotion_hint),
  ]
    .filter(Boolean)
    .join('::')
    .toLowerCase();
}

function finalizeCandidate(candidate, candidates, warnings) {
  if (!candidate) return;

  const missingFields = REQUIRED_FIELDS.filter(field => !normalizeValue(candidate[field]));
  const normalizedLayer = normalizeValue(candidate.recommended_layer).toLowerCase();
  if (missingFields.length > 0) {
    warnings.push(`candidate missing required fields: ${missingFields.join(', ')}`);
    return;
  }
  if (!VALID_LAYERS.has(normalizedLayer)) {
    warnings.push(`candidate has invalid recommended_layer: ${candidate.recommended_layer}`);
    return;
  }

  candidates.push({
    ...candidate,
    recommended_layer: normalizedLayer,
  });
}

function parseGuardrailCandidates(lines) {
  const candidates = [];
  const warnings = [];
  let current = null;
  let ignoringMalformedCandidate = false;

  for (const rawLine of lines || []) {
    const line = String(rawLine || '').trim();
    if (!line) continue;
    if (/^-\s*none$/i.test(line)) continue;

    const candidateStart = line.match(/^-\s*failure_pattern:\s*(.+)$/i);
    if (candidateStart) {
      finalizeCandidate(current, candidates, warnings);
      current = { failure_pattern: normalizeValue(candidateStart[1]) };
      ignoringMalformedCandidate = false;
      continue;
    }

    if (/^-\s*/.test(line) && !candidateStart) {
      finalizeCandidate(current, candidates, warnings);
      current = null;
      ignoringMalformedCandidate = true;
      warnings.push(`unrecognized candidate line: ${line}`);
      continue;
    }

    const keyValue = line.match(/^([a-z_]+):\s*(.+)$/i);
    if (keyValue && current) {
      current[keyValue[1].toLowerCase()] = normalizeValue(keyValue[2]);
      continue;
    }

    if (ignoringMalformedCandidate) {
      continue;
    }

    warnings.push(`unrecognized candidate line: ${line}`);
  }

  finalizeCandidate(current, candidates, warnings);

  return { candidates, warnings };
}

function normalizeGuardrailCandidate(candidate, options = {}) {
  const normalized = {
    captured_at: normalizeValue(options.capturedAt) || new Date().toISOString(),
    source_artifact: normalizeValue(options.sourceArtifact || candidate.source_artifact || candidate.source),
    failure_pattern: normalizeValue(candidate.failure_pattern),
    source: normalizeValue(candidate.source || options.sourceArtifact),
    example: normalizeValue(candidate.example),
    recommended_layer: normalizeValue(candidate.recommended_layer).toLowerCase(),
    severity: normalizeValue(candidate.severity),
    confidence: normalizeValue(candidate.confidence),
    false_positive_risk: normalizeValue(candidate.false_positive_risk),
    promotion_hint: normalizeValue(candidate.promotion_hint),
  };
  normalized.candidate_key = buildCandidateKey(normalized);
  return normalized;
}

function appendGuardrailCandidates(registryPath, candidates) {
  if (!registryPath || !Array.isArray(candidates) || candidates.length === 0) return 0;
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  const lines = candidates.map(candidate => `${JSON.stringify(candidate)}\n`).join('');
  fs.appendFileSync(registryPath, lines, 'utf8');
  return candidates.length;
}

function loadGuardrailCandidates(registryPath) {
  if (!registryPath || !fs.existsSync(registryPath)) return [];
  const lines = fs.readFileSync(registryPath, 'utf8').split(/\r?\n/);
  const entries = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        entries.push(parsed);
      }
    } catch {
      // Ignore malformed rows so a single bad line does not poison the registry.
    }
  }

  return entries;
}

function summarizeGuardrailCandidates(candidates) {
  const summary = {
    total: 0,
    byLayer: {},
    topCandidates: [],
  };

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return summary;
  }

  const counts = new Map();
  summary.total = candidates.length;

  for (const candidate of candidates) {
    const layer = normalizeValue(candidate.recommended_layer).toLowerCase() || 'unknown';
    summary.byLayer[layer] = (summary.byLayer[layer] || 0) + 1;
    const key = normalizeValue(candidate.candidate_key) || buildCandidateKey(candidate) || 'unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  summary.topCandidates = Array.from(counts.entries())
    .map(([candidate_key, count]) => ({ candidate_key, count }))
    .sort((a, b) => b.count - a.count || a.candidate_key.localeCompare(b.candidate_key));

  return summary;
}

module.exports = {
  parseGuardrailCandidates,
  normalizeGuardrailCandidate,
  appendGuardrailCandidates,
  loadGuardrailCandidates,
  summarizeGuardrailCandidates,
  buildCandidateKey,
};
