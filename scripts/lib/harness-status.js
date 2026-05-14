'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  findTaskArtifacts,
  buildLifecycleState,
  parseProgressState,
} = require('./task-artifacts');
const { findLatestPipelineEvidence } = require('./pipeline-evidence');

const STATUS_READY = 'READY';
const STATUS_NEEDS_ACTION = 'NEEDS_ACTION';
const STATUS_BLOCKED = 'BLOCKED';

function runGit(repoRoot, args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function getGitRoot(cwd = process.cwd()) {
  const result = runGit(cwd, ['rev-parse', '--show-toplevel']);
  return result.ok ? result.stdout : path.resolve(cwd);
}

function summarizeRepo(repoRoot) {
  const branch = runGit(repoRoot, ['branch', '--show-current']);
  const status = runGit(repoRoot, ['status', '--porcelain']);
  const commit = runGit(repoRoot, ['log', '-1', '--pretty=%h %s']);
  const remotes = runGit(repoRoot, ['remote']);
  const remoteNames = remotes.ok
    ? remotes.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    : [];

  const dirtyFiles = status.ok && status.stdout
    ? status.stdout.split(/\r?\n/).filter(Boolean).length
    : 0;

  return {
    root: repoRoot,
    branch: branch.ok && branch.stdout ? branch.stdout : 'unknown',
    workingTree: status.ok ? (dirtyFiles > 0 ? 'dirty' : 'clean') : 'unknown',
    dirtyFiles,
    latestCommit: commit.ok && commit.stdout ? commit.stdout : 'none',
    remote: remoteNames.length > 0 ? 'present' : 'missing',
    remotes: remoteNames,
  };
}

function summarizeLifecycle(repoRoot) {
  const artifacts = findTaskArtifacts(repoRoot);
  if (artifacts.length === 0) {
    return {
      present: false,
      currentStepId: 'missing',
      nextRequiredAction: 'create plan.md',
      blocked: ['missing plan.md'],
      sessionState: {
        currentPhase: '',
        lastCompletedStep: '',
        nextAction: '',
        blockers: [],
        delegatedWork: [],
      },
      chain: [],
      raw: null,
    };
  }

  const state = buildLifecycleState(artifacts);
  return {
    present: true,
    currentStepId: state.currentStepId,
    nextRequiredAction: state.nextRequiredAction,
    blocked: state.blocked || [],
    sessionState: state.sessionState || {},
    chain: state.chain || [],
    raw: state,
  };
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function summarizeTaskQueue(options = {}) {
  const claudeDir = options.claudeDir || path.join(options.homeDir || process.env.HOME || '', '.claude');
  const indexPath = path.join(claudeDir, 'tasks', 'index.json');
  const index = readJson(indexPath);
  if (!index || !Array.isArray(index.tasks)) {
    return {
      present: false,
      path: indexPath,
      total: 0,
      counts: {},
      running: [],
      blocked: [],
      pending: [],
    };
  }

  const counts = {};
  for (const task of index.tasks) {
    const status = String(task.status || 'unknown');
    counts[status] = (counts[status] || 0) + 1;
  }

  const pick = status => index.tasks
    .filter(task => String(task.status || '') === status)
    .map(task => ({
      taskId: String(task.task_id || task.id || ''),
      title: String(task.title || ''),
      status: String(task.status || ''),
      currentRunId: String(task.current_run_id || ''),
    }));

  return {
    present: true,
    path: indexPath,
    total: index.tasks.length,
    counts,
    running: pick('running'),
    blocked: pick('blocked'),
    pending: pick('pending'),
  };
}

function summarizePipeline(repoRoot, options = {}) {
  const result = findLatestPipelineEvidence(repoRoot, { homeDir: options.homeDir });
  if (!result.found) {
    return {
      found: false,
      reason: result.reason || 'no recent pipeline evidence found for this repo',
      run: null,
    };
  }
  return {
    found: true,
    reason: '',
    run: result.run,
  };
}

function summarizeRuntime(repoRoot, options = {}) {
  const dbPath = options.telemetryDbPath || (
    options.homeDir ? path.join(options.homeDir, '.claude', 'telemetry', 'telemetry.db') : ''
  );
  if (!dbPath || !fs.existsSync(dbPath)) {
    return { present: false, state: null, error: '' };
  }

  try {
    const result = spawnSync('sqlite3', [
      '-json',
      dbPath,
      `
        SELECT
          rs.run_id AS runId,
          rs.session_id AS sessionId,
          rs.repo_root AS repoRoot,
          rs.current_phase AS currentPhase,
          rs.current_step AS currentStep,
          rs.next_action AS nextAction,
          rs.blockers_json AS blockersJson,
          rs.delegated_work_json AS delegatedWorkJson,
          rs.artifact_blocked_json AS artifactBlockedJson,
          sr.final_status AS finalStatus,
          sr.started_at AS startedAt,
          sr.ended_at AS endedAt
        FROM run_state rs
        JOIN session_runs sr ON sr.run_id = rs.run_id
        WHERE rs.repo_root = '${String(repoRoot).replace(/'/g, "''")}'
        ORDER BY rs.updated_at DESC
        LIMIT 1;
      `,
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status !== 0) {
      return { present: false, state: null, error: 'sqlite3 unavailable or telemetry unreadable' };
    }
    const rows = JSON.parse(result.stdout || '[]');
    if (!Array.isArray(rows) || rows.length === 0) {
      return { present: false, state: null, error: '' };
    }
    const row = rows[0];
    const parseArray = value => {
      try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };
    const state = {
      runId: row.runId || '',
      sessionId: row.sessionId || '',
      repoRoot: row.repoRoot || '',
      currentPhase: row.currentPhase || '',
      currentStep: row.currentStep || '',
      nextAction: row.nextAction || '',
      blockers: parseArray(row.blockersJson),
      delegatedWork: parseArray(row.delegatedWorkJson),
      artifactBlocked: parseArray(row.artifactBlockedJson),
      finalStatus: row.finalStatus || '',
      startedAt: row.startedAt || '',
      endedAt: row.endedAt || '',
    };
    if (!state) {
      return { present: false, state: null, error: '' };
    }
    return { present: true, state, error: '' };
  } catch (error) {
    return { present: false, state: null, error: error.message };
  }
}

function readProgressNextAction(repoRoot) {
  const progressPath = path.join(repoRoot, 'progress.md');
  if (!fs.existsSync(progressPath)) return '';
  try {
    const state = parseProgressState(fs.readFileSync(progressPath, 'utf8'));
    return String(state.nextAction || '').trim();
  } catch {
    return '';
  }
}

function firstTaskLabel(tasks) {
  if (!tasks || tasks.length === 0) return '';
  const first = tasks[0];
  return [first.taskId, first.title].filter(Boolean).join(' - ');
}

function buildRecommendation(summary) {
  const secondaryActions = [];
  let status = STATUS_READY;
  let recommendedAction = 'Continue with the next planned harness improvement.';

  if (summary.repo.remote === 'missing') {
    secondaryActions.push('Git remote is missing; configure and push only when off-machine backup or collaboration is needed.');
  }

  if (!summary.pipeline.found) {
    secondaryActions.push('Future standard or non-trivial work should enter through /execute-plan or task queue execution so pipeline evidence is recorded.');
  }

  if (summary.repo.workingTree === 'dirty') {
    status = STATUS_NEEDS_ACTION;
    recommendedAction = 'Review the current working tree, run targeted verification, then commit or continue the active edits.';
  } else if (summary.lifecycle.blocked.length > 0) {
    status = STATUS_BLOCKED;
    recommendedAction = `Resolve lifecycle blocker: ${summary.lifecycle.blocked[0]}.`;
  } else if (summary.taskQueue.blocked.length > 0) {
    status = STATUS_BLOCKED;
    recommendedAction = `Inspect blocked task ${firstTaskLabel(summary.taskQueue.blocked)} before starting new work.`;
  } else if (summary.taskQueue.running.length > 0) {
    status = STATUS_NEEDS_ACTION;
    recommendedAction = `Inspect running task ${firstTaskLabel(summary.taskQueue.running)} and reconcile its latest run state before starting new work.`;
  } else {
    const nextAction = readProgressNextAction(summary.repo.root);
    const lifecycleNext = summary.lifecycle.nextRequiredAction && summary.lifecycle.nextRequiredAction !== 'none'
      ? summary.lifecycle.nextRequiredAction
      : '';
    recommendedAction = nextAction || lifecycleNext || recommendedAction;
  }

  if (summary.runtime.present && summary.runtime.state && summary.runtime.state.nextAction) {
    secondaryActions.push(`Latest runtime checkpoint suggests: ${summary.runtime.state.nextAction}`);
  }

  return {
    status,
    recommendedAction,
    secondaryActions,
  };
}

function summarizeHarnessStatus(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || getGitRoot(options.cwd || process.cwd()));
  const homeDir = options.homeDir || process.env.HOME;
  const claudeDir = options.claudeDir || (homeDir ? path.join(homeDir, '.claude') : undefined);

  const summary = {
    repo: summarizeRepo(repoRoot),
    lifecycle: summarizeLifecycle(repoRoot),
    pipeline: summarizePipeline(repoRoot, { homeDir }),
    taskQueue: summarizeTaskQueue({ homeDir, claudeDir }),
    runtime: summarizeRuntime(repoRoot, { homeDir, telemetryDbPath: options.telemetryDbPath }),
  };

  return {
    ...summary,
    ...buildRecommendation(summary),
  };
}

function formatValue(value) {
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'none';
  if (value === undefined || value === null || value === '') return 'none';
  return String(value);
}

function formatHarnessStatus(summary) {
  const latestRun = summary.pipeline.found && summary.pipeline.run
    ? `${summary.pipeline.run.run_id} (${summary.pipeline.run.status || 'unknown'})`
    : `missing (${summary.pipeline.reason})`;

  const lines = [
    `HARNESS STATUS: ${summary.status}`,
    '',
    'Repo:',
    `- branch=${formatValue(summary.repo.branch)}`,
    `- working_tree=${summary.repo.workingTree}`,
    `- dirty_files=${summary.repo.dirtyFiles}`,
    `- latest_commit=${formatValue(summary.repo.latestCommit)}`,
    `- remote=${summary.repo.remote}`,
    '',
    'Lifecycle:',
    `- current_step=${summary.lifecycle.currentStepId}`,
    `- next_required_action=${formatValue(summary.lifecycle.nextRequiredAction)}`,
    `- blockers=${formatValue(summary.lifecycle.blocked)}`,
    `- current_phase=${formatValue(summary.lifecycle.sessionState.currentPhase)}`,
    `- last_completed_step=${formatValue(summary.lifecycle.sessionState.lastCompletedStep)}`,
    '',
    'Pipeline:',
    `- latest_run=${latestRun}`,
    '',
    'Task Queue:',
    `- total=${summary.taskQueue.total}`,
    `- pending=${summary.taskQueue.pending.length}`,
    `- running=${summary.taskQueue.running.length}`,
    `- blocked=${summary.taskQueue.blocked.length}`,
    '',
    'Recommended next action:',
    `- ${summary.recommendedAction}`,
    '',
    'Secondary actions:',
  ];

  if (summary.secondaryActions.length === 0) {
    lines.push('- none');
  } else {
    for (const action of summary.secondaryActions) {
      lines.push(`- ${action}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

module.exports = {
  STATUS_READY,
  STATUS_NEEDS_ACTION,
  STATUS_BLOCKED,
  summarizeHarnessStatus,
  formatHarnessStatus,
  summarizeRepo,
  summarizeLifecycle,
  summarizeTaskQueue,
};
