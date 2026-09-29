'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const PIPELINE_EVENT_TYPES = new Set([
  'pipeline_started',
  'run_started',
  'task_run_started',
  'run_created',
]);


function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readNdjson(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); }
        catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function normalizePath(value) {
  const resolved = path.resolve(String(value || ''));
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function hasPipelineEvent(runDir) {
  const events = readNdjson(path.join(runDir, 'logs', 'events.ndjson'));
  return events.some(event => PIPELINE_EVENT_TYPES.has(String(event.type || '')));
}

function runSortTime(runDir, meta) {
  const timestamp = Date.parse(meta.updated_at || meta.started_at || '');
  if (!Number.isNaN(timestamp)) return timestamp;
  try {
    return fs.statSync(path.join(runDir, 'meta.json')).mtimeMs;
  } catch {
    return 0;
  }
}

// 重み判定は hooks 側の linked worktree 検査が持つ（旧 isPipelineEvidenceRequired は撤去）。

function findLatestPipelineEvidence(repoRoot, options = {}) {
  const normalizedRepo = normalizePath(repoRoot);
  // Pipeline runner and task queue use the global store even for harness worktrees.
  const runsDir = options.runsDir || path.join(options.homeDir || process.env.HOME || os.homedir(), '.claude', 'harness/data/runs');
  if (!repoRoot || !fs.existsSync(runsDir)) {
    return {
      found: false,
      reason: 'no pipeline evidence directory found',
    };
  }

  const matches = [];
  for (const entry of fs.readdirSync(runsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const runDir = path.join(runsDir, entry.name);
    const meta = readJson(path.join(runDir, 'meta.json'));
    if (!meta || !meta.repo_root) continue;
    if (normalizePath(meta.repo_root) !== normalizedRepo) continue;
    if (!hasPipelineEvent(runDir)) continue;
    matches.push({
      run_id: String(meta.run_id || entry.name),
      status: String(meta.status || ''),
      updated_at: String(meta.updated_at || ''),
      workflow: String(meta.workflow || ''),
      current_step: String(meta.current_step || ''),
      sortTime: runSortTime(runDir, meta),
    });
  }

  if (matches.length === 0) {
    return {
      found: false,
      reason: 'no recent pipeline evidence found for this repo',
    };
  }

  matches.sort((left, right) => right.sortTime - left.sortTime || right.run_id.localeCompare(left.run_id));
  // sortTime は並べ替え用の内部フィールドなので、返す run からは落とす
  const { sortTime: _sortTime, ...run } = matches[0];
  return {
    found: true,
    run,
  };
}

function formatMissingPipelineEvidenceWarning(result) {
  const reason = result && result.reason ? result.reason : 'no recent pipeline evidence found for this repo';
  return `[Lifecycle Guardrail] Warning: standard/heavy-risky work has no recent pipeline evidence (${reason}). Prefer /execute-plan or task-queue run so the pipeline records run evidence before implementation.`;
}

module.exports = {
  findLatestPipelineEvidence,
  formatMissingPipelineEvidenceWarning,
};
