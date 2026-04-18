'use strict';

const { summarizeCurrentHealth } = require('./health-loop');

const HIGH_PRIORITY_PATTERNS = new Set([
  'resume_failed',
  'plan_missing_or_skipped',
  'verification_missing_before_completion',
]);

function getLatestEntryField(group, field) {
  const entries = Array.isArray(group && group.entries) ? group.entries : [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const value = String(entries[index] && entries[index][field] || '').trim();
    if (value) return value;
  }
  return '';
}

function buildSuggestedTask(group) {
  const explicitHint = getLatestEntryField(group, 'promotion_hint');
  if (explicitHint) return explicitHint;

  switch (String(group.failure_pattern || '').trim()) {
    case 'resume_failed':
      return 'improve session resume and artifact rehydration';
    case 'plan_missing_or_skipped':
      return 'enforce approved plan before execution';
    case 'verification_missing_before_completion':
      return 'enforce verification before completion';
    case 'high_human_intervention_run':
      return 'clarify task and recovery guidance before execution';
    default:
      return 'review the recurring pattern and choose the narrowest durable fix';
  }
}

function getPriority(group) {
  if (group.state === 'promotion-ready') return 'high';
  if (HIGH_PRIORITY_PATTERNS.has(String(group.failure_pattern || '').trim())) return 'high';
  return 'medium';
}

function toTriageItem(group) {
  return {
    candidate_key: String(group.candidate_key || '').trim(),
    state: String(group.state || '').trim(),
    count: Number(group.count) || 0,
    last_seen: String(group.last_seen || '').trim(),
    recommended_layer: String(group.recommended_layer || '').trim() || 'unknown',
    failure_pattern: String(group.failure_pattern || '').trim() || 'unknown',
    source_artifact: String(group.source_artifact || '').trim() || 'unknown',
    priority: getPriority(group),
    suggested_task: buildSuggestedTask(group),
  };
}

function compareTriageItems(left, right) {
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const stateOrder = { 'promotion-ready': 0, recurring: 1, new: 2, stale: 3, resolved: 4 };

  const priorityDiff = (priorityOrder[left.priority] ?? 9) - (priorityOrder[right.priority] ?? 9);
  if (priorityDiff !== 0) return priorityDiff;

  const stateDiff = (stateOrder[left.state] ?? 9) - (stateOrder[right.state] ?? 9);
  if (stateDiff !== 0) return stateDiff;

  const countDiff = right.count - left.count;
  if (countDiff !== 0) return countDiff;

  return right.last_seen.localeCompare(left.last_seen);
}

function summarizeTriage(healthSummary = {}) {
  const groups = Array.isArray(healthSummary.groups) ? healthSummary.groups : [];
  const candidateGroupsReviewed = groups.map(group => toTriageItem(group));

  const recommendedNextTasks = [];
  const monitorOnly = [];
  const resolvedOrStale = [];

  for (const item of candidateGroupsReviewed) {
    if (item.state === 'resolved' || item.state === 'stale') {
      resolvedOrStale.push(item);
      continue;
    }
    if (item.state === 'promotion-ready' || item.state === 'recurring') {
      recommendedNextTasks.push(item);
      continue;
    }
    monitorOnly.push(item);
  }

  recommendedNextTasks.sort(compareTriageItems);
  monitorOnly.sort(compareTriageItems);
  resolvedOrStale.sort(compareTriageItems);

  return {
    totalEntries: Number(healthSummary.totalEntries) || 0,
    totalGroups: Number(healthSummary.totalGroups) || candidateGroupsReviewed.length,
    byState: healthSummary.byState || {},
    candidateGroupsReviewed,
    recommendedNextTasks,
    monitorOnly,
    resolvedOrStale,
  };
}

function summarizeCurrentTriage(options = {}) {
  return summarizeTriage(summarizeCurrentHealth({
    ...options,
    includeTelemetry: options.includeTelemetry !== false,
  }));
}

function formatSection(lines, heading, items, formatter) {
  lines.push(`${heading}:`);
  if (!Array.isArray(items) || items.length === 0) {
    lines.push('- none');
    return;
  }
  for (const item of items) {
    lines.push(formatter(item));
  }
}

function formatTriageStatus(summary = summarizeCurrentTriage(), options = {}) {
  const limit = Math.max(1, Number(options.limit) || 5);
  const lines = ['Triage Loop'];
  lines.push(`- reviewed_groups=${summary.totalGroups}`);
  lines.push(`- recommended_next_tasks=${summary.recommendedNextTasks.length}`);
  lines.push(`- monitor_only=${summary.monitorOnly.length}`);
  lines.push(`- resolved_or_stale=${summary.resolvedOrStale.length}`);

  formatSection(
    lines,
    'Candidate Groups Reviewed',
    summary.candidateGroupsReviewed.slice(0, limit),
    item => `- ${item.candidate_key} | state=${item.state} | count=${item.count} | layer=${item.recommended_layer} | pattern=${item.failure_pattern}`
  );
  formatSection(
    lines,
    'Recommended Next Tasks',
    summary.recommendedNextTasks.slice(0, limit),
    item => `- [${item.priority}] ${item.recommended_layer} :: ${item.failure_pattern} :: ${item.suggested_task} (state=${item.state} count=${item.count} last_seen=${item.last_seen || 'n/a'})`
  );
  formatSection(
    lines,
    'Monitor Only',
    summary.monitorOnly.slice(0, limit),
    item => `- ${item.recommended_layer} :: ${item.failure_pattern} :: monitor recurrence (state=${item.state} count=${item.count} last_seen=${item.last_seen || 'n/a'})`
  );
  formatSection(
    lines,
    'Resolved Or Stale',
    summary.resolvedOrStale.slice(0, limit),
    item => `- ${item.recommended_layer} :: ${item.failure_pattern} :: ${item.state} (count=${item.count} last_seen=${item.last_seen || 'n/a'})`
  );

  return lines.join('\n');
}

module.exports = {
  summarizeTriage,
  summarizeCurrentTriage,
  formatTriageStatus,
};
