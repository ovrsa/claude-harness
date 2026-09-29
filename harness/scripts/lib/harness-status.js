'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  findTaskArtifacts,
  buildLifecycleState,
} = require('./task-artifacts');
const { findLatestPipelineEvidence } = require('./pipeline-evidence');
const { latestRunForRepo } = require('./run-log');

const STATUS_READY = 'READY';
const STATUS_NEEDS_ACTION = 'NEEDS_ACTION';
const STATUS_BLOCKED = 'BLOCKED';

function readJsonFile(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

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
      nextRequiredAction: 'record the decisions in docs/design/ (/docs-build)',
      blocked: [],
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

/**
 * The latest run record for this repository, and the next action it recorded.
 *
 * Was a `sqlite3 -json` subprocess reading run_state.next_action. That column
 * was filled *from* progress.md, retired 2026-08-17, so every row written since
 * is empty -- the last non-empty one is dated 2026-08-17T06:55. The subprocess
 * also interpolated repoRoot into the SQL and needed sqlite3 on PATH.
 *
 * review-summary.md's "## Next Action" is written by hand, is current, and
 * survives worktree removal in evidence/review.json.
 */
function summarizeRuntime(repoRoot, options = {}) {
  try {
    const run = latestRunForRepo({
      repoRoot,
      runsDir: options.runsDir,
      homeDir: options.homeDir,
    });
    if (!run) return { present: false, state: null, error: '' };

    const evidence = readJsonFile(path.join(run.path, 'evidence', 'review.json'));
    const reviewState = (evidence && evidence.state) || {};

    return {
      present: true,
      error: '',
      state: {
        runId: run.runId,
        repoRoot: run.repoRoot,
        branch: run.branch,
        sessionIds: run.sessionIds,
        startedAt: run.startedAt,
        updatedAt: run.updatedAt,
        nextAction: String(reviewState.nextAction || '').trim(),
        residualRisks: Array.isArray(reviewState.residualRisks) ? reviewState.residualRisks : [],
        gates: {
          verification: run.verification,
          review: run.review,
          observation: run.observation,
        },
      },
    };
  } catch (error) {
    return { present: false, state: null, error: error.message };
  }
}

function readRuntimeNextAction(summary) {
  if (!summary.runtime.present || !summary.runtime.state) return '';
  return String(summary.runtime.state.nextAction || '').trim();
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
  let usedRuntimeNextAction = false;

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
  } else if (!summary.lifecycle.present) {
    // 成果物ゼロを READY と呼ぶと、何も検証していないことが緑に見える。
    status = STATUS_NEEDS_ACTION;
    recommendedAction = summary.lifecycle.nextRequiredAction;
  } else if (summary.taskQueue.blocked.length > 0) {
    status = STATUS_BLOCKED;
    recommendedAction = `Inspect blocked task ${firstTaskLabel(summary.taskQueue.blocked)} before starting new work.`;
  } else if (summary.taskQueue.running.length > 0) {
    status = STATUS_NEEDS_ACTION;
    recommendedAction = `Inspect running task ${firstTaskLabel(summary.taskQueue.running)} and reconcile its latest run state before starting new work.`;
  } else {
    const nextAction = readRuntimeNextAction(summary);
    const lifecycleNext = summary.lifecycle.nextRequiredAction && summary.lifecycle.nextRequiredAction !== 'none'
      ? summary.lifecycle.nextRequiredAction
      : '';
    recommendedAction = nextAction || lifecycleNext || recommendedAction;
    usedRuntimeNextAction = Boolean(nextAction);
  }

  // 一次で使った場合は二次に出さない（同じ文字列が2回出ると別の示唆に見える）
  if (!usedRuntimeNextAction && summary.runtime.present && summary.runtime.state && summary.runtime.state.nextAction) {
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
    runtime: summarizeRuntime(repoRoot, { homeDir, runsDir: options.runsDir }),
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
  summarizeHarnessStatus,
  formatHarnessStatus,
  summarizeTaskQueue,
};
