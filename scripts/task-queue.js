#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const { ensureDir, getClaudeDir } = require('./lib/utils');
const { recordTaskRun } = require('./lib/session-trace');
const {
  checkCloneMerge,
  deleteCloneWorkspace,
  mergeCloneChanges,
  prepareSharedClone,
  summarizeCloneDiff,
} = require('./lib/shared-clone-manager');

const INDEX_VERSION = 1;

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  const options = { command: argv[0] || 'help' };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const next = argv[index + 1] || '';
      if (!next || next.startsWith('--')) {
        options[key] = true;
      } else {
        options[key] = next;
        index += 1;
      }
    }
  }
  return options;
}

function slugify(value, fallback = 'task') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || fallback;
}

function makeId(prefix, seed) {
  const hash = crypto.createHash('sha1').update(`${seed}:${Date.now()}`).digest('hex').slice(0, 8);
  return `${prefix}-${slugify(seed, prefix)}-${hash}`;
}

function getTasksDir(claudeDir = getClaudeDir()) {
  return path.join(claudeDir, 'tasks');
}

function getRunsDir(claudeDir = getClaudeDir()) {
  return path.join(claudeDir, 'runs');
}

function getIndexPath(claudeDir = getClaudeDir()) {
  return path.join(getTasksDir(claudeDir), 'index.json');
}

function readIndex(claudeDir = getClaudeDir()) {
  const indexPath = getIndexPath(claudeDir);
  if (!fs.existsSync(indexPath)) {
    return { version: INDEX_VERSION, tasks: [] };
  }
  const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  return {
    version: Number(parsed.version) || INDEX_VERSION,
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
  };
}

function writeIndex(index, claudeDir = getClaudeDir()) {
  ensureDir(getTasksDir(claudeDir));
  fs.writeFileSync(getIndexPath(claudeDir), `${JSON.stringify(index, null, 2)}\n`);
}

function getTaskDir(claudeDir, taskId) {
  return path.join(getTasksDir(claudeDir), taskId);
}

function getRunDir(claudeDir, runId) {
  return path.join(getRunsDir(claudeDir), runId);
}

function findTask(index, taskId) {
  return index.tasks.find(task => task.task_id === taskId) || null;
}

function addTask(options, claudeDir = getClaudeDir()) {
  const title = String(options.title || '').trim();
  const order = String(options.order || '').trim();
  if (!title) return { status: 'BLOCKED', message: 'title is required' };
  if (!order) return { status: 'BLOCKED', message: 'order is required' };

  const taskId = String(options.taskId || '').trim() || makeId('task', title);
  const index = readIndex(claudeDir);
  if (findTask(index, taskId)) {
    return { status: 'BLOCKED', message: `task already exists: ${taskId}` };
  }

  const occurredAt = nowIso();
  const taskDir = path.join(getTasksDir(claudeDir), taskId);
  ensureDir(path.join(taskDir, 'attachments'));
  fs.writeFileSync(path.join(taskDir, 'order.md'), `${order}\n`);

  const task = {
    task_id: taskId,
    title,
    status: 'pending',
    task_dir: path.relative(claudeDir, taskDir),
    current_run_id: '',
    created_at: occurredAt,
    updated_at: occurredAt,
  };
  index.tasks.push(task);
  writeIndex(index, claudeDir);

  return {
    status: 'ADDED',
    task,
    message: `task_id=${taskId}`,
  };
}

function listTasks(claudeDir = getClaudeDir()) {
  const index = readIndex(claudeDir);
  return {
    status: 'LIST',
    tasks: index.tasks,
    message: `tasks=${index.tasks.length}`,
  };
}

function appendRunEvent(runDir, event) {
  const logPath = path.join(runDir, 'logs', 'events.ndjson');
  fs.appendFileSync(logPath, `${JSON.stringify(event)}\n`);
}

function readRunMeta(claudeDir, runId) {
  const metaPath = path.join(getRunDir(claudeDir, runId), 'meta.json');
  if (!fs.existsSync(metaPath)) return null;
  return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
}

function updateRunMeta(claudeDir, runId, updates) {
  const existing = readRunMeta(claudeDir, runId) || {};
  const next = {
    ...existing,
    ...updates,
    updated_at: nowIso(),
  };
  writeRunMeta(claudeDir, runId, next);
  return next;
}

function writeRunMeta(claudeDir, runId, meta) {
  const runDir = getRunDir(claudeDir, runId);
  ensureDir(runDir);
  fs.writeFileSync(path.join(runDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
}

function shouldIsolateRun(options) {
  if (options.noIsolate) return false;
  if (options.isolate) return true;
  return ['standard', 'heavy-risky'].includes(String(options.track || 'standard'));
}

function cloneMeta(clone) {
  if (!clone) return {};
  return {
    source_repo_root: clone.sourceRepoRoot,
    clone_path: clone.clonePath,
    branch: clone.branch,
    base_branch: clone.baseBranch,
    base_commit: clone.baseCommit,
    isolation: {
      mode: 'shared-clone',
      source_repo_root: clone.sourceRepoRoot,
      clone_path: clone.clonePath,
      branch: clone.branch,
      base_branch: clone.baseBranch,
      base_commit: clone.baseCommit,
      reused: Boolean(clone.reused),
    },
  };
}

function appendTaskNote(claudeDir, taskId, fileName, note, eventName) {
  const value = String(note || '').trim();
  if (!value) return { status: 'BLOCKED', message: 'note is required' };
  const index = readIndex(claudeDir);
  const task = findTask(index, taskId);
  if (!task) return { status: 'BLOCKED', message: `unknown task: ${taskId}` };

  const occurredAt = nowIso();
  const taskDir = getTaskDir(claudeDir, taskId);
  ensureDir(taskDir);
  fs.appendFileSync(path.join(taskDir, fileName), `\n## ${occurredAt}\n\n${value}\n`);
  task.updated_at = occurredAt;
  if (task.current_run_id) {
    const runDir = getRunDir(claudeDir, task.current_run_id);
    if (fs.existsSync(runDir)) {
      appendRunEvent(runDir, {
        type: eventName === 'INSTRUCTED' ? 'task_instruction_added' : 'task_retry_note_added',
        occurred_at: occurredAt,
        task_id: taskId,
        run_id: task.current_run_id,
      });
    }
  }
  writeIndex(index, claudeDir);

  return {
    status: eventName,
    task,
    message: `task_id=${taskId}`,
  };
}

function parsePipelineStatus(stdout) {
  const text = String(stdout || '');
  const status = (text.match(/^PIPELINE RUNNER:\s+([A-Z_]+)/m) || [])[1] || 'BLOCKED';
  const condition = (text.match(/condition=([^)]+)/) || [])[1] || '';
  return { status, condition };
}

function finalizeTaskRun({
  claudeDir,
  task,
  runId,
  repoRoot,
  sourceRepoRoot,
  runMetadata = {},
  pipelineStatus,
  pipelineStdout,
  pipelineExitCode,
}) {
  const occurredAt = nowIso();
  const runDir = getRunDir(claudeDir, runId);
  const existing = readRunMeta(claudeDir, runId) || {
    run_id: runId,
    task_id: task.task_id,
    repo_root: repoRoot,
    started_at: occurredAt,
  };
  const finalStatus = pipelineStatus.status === 'DONE' ? 'done' : 'blocked';
  const meta = {
    ...existing,
    task_id: task.task_id,
    run_id: runId,
    repo_root: repoRoot,
    source_repo_root: sourceRepoRoot || existing.source_repo_root || repoRoot,
    ...runMetadata,
    status: finalStatus,
    ended_at: occurredAt,
    updated_at: occurredAt,
    last_condition: pipelineStatus.condition || existing.last_condition || '',
    pipeline_exit_code: pipelineExitCode,
  };
  writeRunMeta(claudeDir, runId, meta);
  ensureDir(path.join(runDir, 'logs'));
  appendRunEvent(runDir, {
    type: finalStatus === 'done' ? 'task_run_completed' : 'task_run_blocked',
    occurred_at: occurredAt,
    task_id: task.task_id,
    run_id: runId,
    status: finalStatus,
    pipeline_status: pipelineStatus.status,
  });
  fs.writeFileSync(path.join(runDir, 'logs', 'pipeline-runner.stdout'), pipelineStdout || '');

  task.status = finalStatus;
  task.current_run_id = runId;
  task.updated_at = occurredAt;

  recordTaskRun({
    taskId: task.task_id,
    runId,
    repoRoot,
    objective: task.title,
    status: finalStatus,
    occurredAt,
  });

  return meta;
}

function startTask(options, claudeDir = getClaudeDir()) {
  const taskId = String(options.taskId || '').trim();
  if (!taskId) return { status: 'BLOCKED', message: 'task-id is required' };

  const index = readIndex(claudeDir);
  const task = findTask(index, taskId);
  if (!task) return { status: 'BLOCKED', message: `unknown task: ${taskId}` };

  const runId = String(options.runId || '').trim() || makeId('run', taskId);
  const repoRoot = String(options.repo || process.cwd()).trim();
  const occurredAt = nowIso();
  const runDir = path.join(getRunsDir(claudeDir), runId);
  ensureDir(path.join(runDir, 'logs'));
  ensureDir(path.join(runDir, 'reports'));
  ensureDir(path.join(runDir, 'context'));

  const meta = {
    run_id: runId,
    task_id: taskId,
    status: 'running',
    repo_root: repoRoot,
    started_at: occurredAt,
    updated_at: occurredAt,
  };
  fs.writeFileSync(path.join(runDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  fs.writeFileSync(path.join(runDir, 'logs', 'events.ndjson'), '');
  appendRunEvent(runDir, {
    type: 'run_created',
    occurred_at: occurredAt,
    task_id: taskId,
    run_id: runId,
    status: 'running',
  });

  task.status = 'running';
  task.current_run_id = runId;
  task.updated_at = occurredAt;
  writeIndex(index, claudeDir);

  recordTaskRun({
    taskId,
    runId,
    repoRoot,
    objective: task.title,
    status: 'running',
    occurredAt,
  });

  return {
    status: 'RUN_CREATED',
    task,
    run: meta,
    message: `task_id=${taskId} run_id=${runId}`,
  };
}

function buildPipelineArgs(options, task, runId, claudeDir) {
  const args = [
    path.join(__dirname, 'pipeline-runner.js'),
    '--repo', String(options.executionRepo || options.repo || process.cwd()),
    '--plan', String(options.plan || path.join(getTaskDir(claudeDir, task.task_id), 'order.md')),
    '--track', String(options.track || 'standard'),
    '--runtime', String(options.runtime || 'codex'),
    '--task-id', task.task_id,
    '--run-id', runId,
    '--execute',
    '--loop',
    '--engine-command', String(options.engineCommand || ''),
  ];
  if (options.workflow) {
    args.push('--workflow', String(options.workflow));
  }
  if (options.step || options.fromStep) {
    args.push('--step', String(options.step || options.fromStep));
  }
  if (options.heavyRiskyApproved) {
    args.push('--heavy-risky-approved');
  }
  return args;
}

function executeTaskRun(options, claudeDir = getClaudeDir(), isRetry = false) {
  const taskId = String(options.taskId || '').trim();
  if (!taskId) return { status: 'BLOCKED', message: 'task-id is required' };
  if (!options.engineCommand) return { status: 'BLOCKED', message: 'engine-command is required' };

  const index = readIndex(claudeDir);
  const task = findTask(index, taskId);
  if (!task) return { status: 'BLOCKED', message: `unknown task: ${taskId}` };

  if (isRetry && options.note) {
    appendTaskNote(claudeDir, taskId, 'retry-notes.md', options.note, 'RETRY_NOTE_ADDED');
  }

  const started = startTask(options, claudeDir);
  if (started.status === 'BLOCKED') return started;
  const runId = started.run.run_id;
  const runDir = getRunDir(claudeDir, runId);
  appendRunEvent(runDir, {
    type: isRetry ? 'task_retry_requested' : 'task_run_started',
    occurred_at: nowIso(),
    task_id: taskId,
    run_id: runId,
    from_step: options.fromStep || options.step || '',
  });

  let executionRepo = String(options.repo || process.cwd());
  let sourceRepoRoot = executionRepo;
  let runMetadata = {};
  if (shouldIsolateRun(options)) {
    try {
      const clone = prepareSharedClone({
        sourceRepoRoot: executionRepo,
        runDir,
        runId,
        taskId,
        appendEvent: event => appendRunEvent(runDir, { task_id: taskId, run_id: runId, ...event }),
      });
      executionRepo = clone.clonePath;
      sourceRepoRoot = clone.sourceRepoRoot;
      runMetadata = cloneMeta(clone);
      const existingMeta = readRunMeta(claudeDir, runId) || {};
      writeRunMeta(claudeDir, runId, {
        ...existingMeta,
        repo_root: executionRepo,
        ...runMetadata,
        updated_at: nowIso(),
      });
    } catch (error) {
      const occurredAt = nowIso();
      appendRunEvent(runDir, {
        type: 'clone_failed',
        occurred_at: occurredAt,
        task_id: taskId,
        run_id: runId,
        source_repo_root: sourceRepoRoot,
        error: error.message,
      });
      const refreshedIndex = readIndex(claudeDir);
      const refreshedTask = findTask(refreshedIndex, taskId);
      finalizeTaskRun({
        claudeDir,
        task: refreshedTask,
        runId,
        repoRoot: sourceRepoRoot,
        sourceRepoRoot,
        pipelineStatus: { status: 'BLOCKED', condition: 'clone_failed' },
        pipelineStdout: `PIPELINE RUNNER: BLOCKED (condition=clone_failed)\n`,
        pipelineExitCode: 1,
      });
      writeIndex(refreshedIndex, claudeDir);
      return {
        status: 'BLOCKED',
        task: refreshedTask,
        run: readRunMeta(claudeDir, runId),
        message: `task_id=${taskId} run_id=${runId} clone_failed`,
      };
    }
  }

  const pipelineOptions = {
    ...options,
    executionRepo,
  };
  const pipeline = spawnSync(process.execPath, buildPipelineArgs(pipelineOptions, task, runId, claudeDir), {
    cwd: executionRepo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  const pipelineStatus = parsePipelineStatus(pipeline.stdout);
  const refreshedIndex = readIndex(claudeDir);
  const refreshedTask = findTask(refreshedIndex, taskId);
  finalizeTaskRun({
    claudeDir,
    task: refreshedTask,
    runId,
    repoRoot: executionRepo,
    sourceRepoRoot,
    runMetadata,
    pipelineStatus,
    pipelineStdout: pipeline.stdout || '',
    pipelineExitCode: pipeline.status === null ? -1 : pipeline.status,
  });
  writeIndex(refreshedIndex, claudeDir);

  const status = pipelineStatus.status === 'DONE' ? 'DONE' : 'BLOCKED';
  return {
    status,
    task: refreshedTask,
    run: readRunMeta(claudeDir, runId),
    message: `task_id=${taskId} run_id=${runId} pipeline_status=${pipelineStatus.status}`,
  };
}

function instructTask(options, claudeDir = getClaudeDir()) {
  const taskId = String(options.taskId || '').trim();
  if (!taskId) return { status: 'BLOCKED', message: 'task-id is required' };
  return appendTaskNote(claudeDir, taskId, 'instructions.md', options.note, 'INSTRUCTED');
}

function recoverRunningTasks(claudeDir = getClaudeDir()) {
  const index = readIndex(claudeDir);
  let recovered = 0;
  const occurredAt = nowIso();

  for (const task of index.tasks) {
    if (task.status !== 'running') continue;
    const runId = task.current_run_id || '';
    const meta = runId ? readRunMeta(claudeDir, runId) : null;
    if (meta && (meta.status === 'done' || meta.status === 'blocked')) {
      task.status = meta.status;
      task.updated_at = occurredAt;
      recordTaskRun({
        taskId: task.task_id,
        runId,
        repoRoot: meta.repo_root || '',
        objective: task.title,
        status: meta.status,
        occurredAt,
      });
      recovered += 1;
      continue;
    }
    task.status = 'pending';
    task.current_run_id = '';
    task.updated_at = occurredAt;
    recovered += 1;
    if (runId) {
      const runDir = getRunDir(claudeDir, runId);
      if (fs.existsSync(runDir)) {
        appendRunEvent(runDir, {
          type: 'task_recovered',
          occurred_at: occurredAt,
          task_id: task.task_id,
          run_id: runId,
          status: 'pending',
        });
      }
    }
  }
  writeIndex(index, claudeDir);
  return {
    status: 'RECOVERED',
    tasks: index.tasks,
    message: `recovered=${recovered}`,
  };
}

function reconcileRuns(claudeDir = getClaudeDir()) {
  const index = readIndex(claudeDir);
  let reconciled = 0;
  const occurredAt = nowIso();

  for (const task of index.tasks) {
    const runId = task.current_run_id || '';
    if (!runId) continue;

    const runDir = getRunDir(claudeDir, runId);
    const meta = fs.existsSync(runDir) ? readRunMeta(claudeDir, runId) : null;
    if (!meta) {
      task.status = 'pending';
      task.current_run_id = '';
      task.updated_at = occurredAt;
      reconciled += 1;
      continue;
    }

    const metaStatus = String(meta.status || '').trim();
    const nextStatus = ['done', 'blocked', 'running'].includes(metaStatus) ? metaStatus : task.status;
    if (task.status !== nextStatus) {
      task.status = nextStatus;
      task.updated_at = occurredAt;
    }
    if (task.current_run_id !== runId) {
      task.current_run_id = runId;
      task.updated_at = occurredAt;
    }
    recordTaskRun({
      taskId: task.task_id,
      runId,
      repoRoot: meta.repo_root || '',
      objective: task.title,
      status: nextStatus,
      occurredAt,
    });
    appendRunEvent(runDir, {
      type: 'run_reconciled',
      occurred_at: occurredAt,
      task_id: task.task_id,
      run_id: runId,
      status: nextStatus,
    });
    reconciled += 1;
  }

  writeIndex(index, claudeDir);
  return {
    status: 'RECONCILED',
    tasks: index.tasks,
    message: `reconciled=${reconciled}`,
  };
}

function collectCloneRuns(claudeDir = getClaudeDir()) {
  const runsDir = getRunsDir(claudeDir);
  if (!fs.existsSync(runsDir)) return [];
  return fs.readdirSync(runsDir)
    .map(runId => {
      const meta = readRunMeta(claudeDir, runId);
      if (!meta || !meta.clone_path) return null;
      return {
        run_id: meta.run_id || runId,
        task_id: meta.task_id || '',
        status: meta.status || '',
        branch: meta.branch || '',
        clone_path: meta.clone_path || '',
        source_repo_root: meta.source_repo_root || '',
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.run_id.localeCompare(right.run_id));
}

function listClones(claudeDir = getClaudeDir()) {
  const clones = collectCloneRuns(claudeDir);
  return {
    status: 'CLONES',
    clones,
    message: `clones=${clones.length}`,
  };
}

function findRunForDiff(options, claudeDir) {
  const runId = String(options.runId || '').trim();
  if (runId) return readRunMeta(claudeDir, runId);

  const taskId = String(options.taskId || '').trim();
  if (!taskId) return null;
  const index = readIndex(claudeDir);
  const task = findTask(index, taskId);
  if (!task || !task.current_run_id) return null;
  return readRunMeta(claudeDir, task.current_run_id);
}

function findRunForCloneCommand(options, claudeDir) {
  const runId = String(options.runId || '').trim();
  if (!runId) return null;
  return readRunMeta(claudeDir, runId);
}

function requireCloneMeta(meta) {
  if (!meta) return 'run-id is required';
  if (!meta.clone_path) return `run has no clone metadata: ${meta.run_id || ''}`;
  return '';
}

function diffClone(options, claudeDir = getClaudeDir()) {
  const meta = findRunForDiff(options, claudeDir);
  if (!meta) return { status: 'BLOCKED', message: 'run-id or task-id with current run is required' };
  if (!meta.clone_path) return { status: 'BLOCKED', message: `run has no clone metadata: ${meta.run_id || ''}` };
  if (!fs.existsSync(meta.clone_path)) return { status: 'BLOCKED', message: `clone path is missing: ${meta.clone_path}` };

  const diff = summarizeCloneDiff(meta.clone_path);
  const runDir = getRunDir(claudeDir, meta.run_id);
  appendRunEvent(runDir, {
    type: 'clone_diff_summarized',
    occurred_at: nowIso(),
    task_id: meta.task_id || '',
    run_id: meta.run_id || '',
    clone_path: meta.clone_path,
    branch: meta.branch || '',
  });

  return {
    status: 'DIFF',
    run: meta,
    diff,
    message: `run_id=${meta.run_id || ''}`,
  };
}

function tryMergeClone(options, claudeDir = getClaudeDir()) {
  const meta = findRunForCloneCommand(options, claudeDir);
  const cloneError = requireCloneMeta(meta);
  if (cloneError) return { status: 'BLOCKED', message: cloneError };
  const runDir = getRunDir(claudeDir, meta.run_id);
  const target = String(options.target || meta.base_branch || 'HEAD');
  try {
    const check = checkCloneMerge({
      clonePath: meta.clone_path,
      sourceRepoRoot: meta.source_repo_root || meta.repo_root,
      baseCommit: meta.base_commit,
      target,
    });
    const updatedMeta = updateRunMeta(claudeDir, meta.run_id, {
      merge_target: target,
      merge_status: check.status,
    });
    appendRunEvent(runDir, {
      type: 'clone_merge_checked',
      occurred_at: nowIso(),
      task_id: meta.task_id || '',
      run_id: meta.run_id || '',
      clone_path: meta.clone_path,
      source_repo_root: check.sourceRepoRoot,
      target,
      status: check.status,
      patch_bytes: check.patchBytes,
    });
    return {
      status: 'MERGE_CHECK',
      run: updatedMeta,
      merge: check,
      message: `run_id=${meta.run_id} status=${check.status}`,
    };
  } catch (error) {
    const updatedMeta = updateRunMeta(claudeDir, meta.run_id, {
      merge_target: target,
      merge_status: 'blocked',
      merge_blocker: error.message,
    });
    appendRunEvent(runDir, {
      type: 'clone_merge_blocked',
      occurred_at: nowIso(),
      task_id: meta.task_id || '',
      run_id: meta.run_id || '',
      clone_path: meta.clone_path,
      target,
      error: error.message,
    });
    return {
      status: 'BLOCKED',
      run: updatedMeta,
      message: error.message,
    };
  }
}

function mergeCleanupClone(options, claudeDir = getClaudeDir()) {
  if (!options.confirmMergeCleanup) {
    return { status: 'BLOCKED', message: 'merge-cleanup requires --confirm-merge-cleanup' };
  }
  const meta = findRunForCloneCommand(options, claudeDir);
  const cloneError = requireCloneMeta(meta);
  if (cloneError) return { status: 'BLOCKED', message: cloneError };
  const runDir = getRunDir(claudeDir, meta.run_id);
  const target = String(options.target || meta.base_branch || 'HEAD');
  try {
    const merge = mergeCloneChanges({
      clonePath: meta.clone_path,
      sourceRepoRoot: meta.source_repo_root || meta.repo_root,
      baseCommit: meta.base_commit,
      target,
    });
    const occurredAt = nowIso();
    const updatedMeta = updateRunMeta(claudeDir, meta.run_id, {
      merge_target: target,
      merge_status: merge.status,
      merged_at: occurredAt,
    });
    appendRunEvent(runDir, {
      type: 'clone_merged',
      occurred_at: occurredAt,
      task_id: meta.task_id || '',
      run_id: meta.run_id || '',
      clone_path: meta.clone_path,
      source_repo_root: merge.sourceRepoRoot,
      target,
      status: merge.status,
      patch_bytes: merge.patchBytes,
    });
    return {
      status: 'MERGED',
      run: updatedMeta,
      merge,
      message: `run_id=${meta.run_id} status=${merge.status}`,
    };
  } catch (error) {
    const updatedMeta = updateRunMeta(claudeDir, meta.run_id, {
      merge_target: target,
      merge_status: 'blocked',
      merge_blocker: error.message,
    });
    appendRunEvent(runDir, {
      type: 'clone_merge_blocked',
      occurred_at: nowIso(),
      task_id: meta.task_id || '',
      run_id: meta.run_id || '',
      clone_path: meta.clone_path,
      target,
      error: error.message,
    });
    return {
      status: 'BLOCKED',
      run: updatedMeta,
      message: error.message,
    };
  }
}

function deleteClone(options, claudeDir = getClaudeDir()) {
  if (!options.confirmDeleteClone) {
    return { status: 'BLOCKED', message: 'delete-clone requires --confirm-delete-clone' };
  }
  const meta = findRunForCloneCommand(options, claudeDir);
  const cloneError = requireCloneMeta(meta);
  if (cloneError) return { status: 'BLOCKED', message: cloneError };
  const runDir = getRunDir(claudeDir, meta.run_id);
  const deletion = deleteCloneWorkspace(meta.clone_path);
  const occurredAt = nowIso();
  const updatedMeta = updateRunMeta(claudeDir, meta.run_id, {
    clone_delete_status: deletion.status,
    clone_deleted_at: deletion.status === 'deleted' ? occurredAt : (meta.clone_deleted_at || occurredAt),
  });
  appendRunEvent(runDir, {
    type: deletion.status === 'deleted' ? 'clone_deleted' : 'clone_delete_blocked',
    occurred_at: occurredAt,
    task_id: meta.task_id || '',
    run_id: meta.run_id || '',
    clone_path: meta.clone_path,
    status: deletion.status,
  });
  return {
    status: 'CLONE_DELETED',
    run: updatedMeta,
    deletion,
    message: `run_id=${meta.run_id} status=${deletion.status}`,
  };
}

function formatResult(result) {
  if (result.format === 'json') {
    return JSON.stringify(result.payload, null, 2);
  }
  if (result.status === 'LIST') {
    const lines = ['TASK QUEUE'];
    lines.push(`- tasks=${result.tasks.length}`);
    for (const task of result.tasks) {
      lines.push(`- ${task.task_id} | status=${task.status} | title=${task.title} | run=${task.current_run_id || 'none'}`);
    }
    return lines.join('\n');
  }
  if (result.status === 'CLONES') {
    const lines = ['TASK CLONES'];
    lines.push(`- clones=${result.clones.length}`);
    for (const clone of result.clones) {
      lines.push(`- ${clone.run_id} | task=${clone.task_id} | status=${clone.status} | branch=${clone.branch} | path=${clone.clone_path}`);
    }
    return lines.join('\n');
  }
  if (result.status === 'DIFF') {
    return [
      'TASK CLONE DIFF',
      `- run=${result.run.run_id || ''}`,
      `- task=${result.run.task_id || ''}`,
      `- branch=${result.run.branch || ''}`,
      `- path=${result.run.clone_path || ''}`,
      '',
      'status:',
      result.diff.status || '(clean)',
      '',
      'stat:',
      result.diff.stat || '(no diff)',
    ].join('\n');
  }
  if (result.status === 'MERGE_CHECK') {
    return [
      'TASK CLONE MERGE CHECK',
      `- run=${result.run.run_id || ''}`,
      `- task=${result.run.task_id || ''}`,
      `- target=${result.run.merge_target || ''}`,
      `- status=${result.merge.status}`,
      `- patch_bytes=${result.merge.patchBytes}`,
    ].join('\n');
  }
  if (result.status === 'MERGED') {
    return [
      'TASK CLONE MERGED',
      `- run=${result.run.run_id || ''}`,
      `- task=${result.run.task_id || ''}`,
      `- target=${result.run.merge_target || ''}`,
      `- status=${result.merge.status}`,
      `- patch_bytes=${result.merge.patchBytes}`,
    ].join('\n');
  }
  if (result.status === 'CLONE_DELETED') {
    return [
      'TASK CLONE DELETED',
      `- run=${result.run.run_id || ''}`,
      `- task=${result.run.task_id || ''}`,
      `- path=${result.run.clone_path || ''}`,
      `- status=${result.deletion.status}`,
    ].join('\n');
  }
  return `TASK QUEUE: ${result.status}\n- ${result.message}`;
}

function printHelp() {
  return [
    'Task Queue',
    '',
    'Usage:',
    '  node scripts/task-queue.js add --title <title> --order <text> [--task-id <id>]',
    '  node scripts/task-queue.js list',
    '  node scripts/task-queue.js start --task-id <id> [--run-id <id>] [--repo <path>]',
    '  node scripts/task-queue.js run --task-id <id> --repo <path> --plan <path> --workflow <path> --engine-command <path> [--run-id <id>]',
    '  node scripts/task-queue.js retry --task-id <id> --repo <path> --plan <path> --workflow <path> --engine-command <path> [--from-step <name>] [--note <text>]',
    '  node scripts/task-queue.js list --format json',
    '  node scripts/task-queue.js list-clones [--format json]',
    '  node scripts/task-queue.js diff [--task-id <id> | --run-id <id>]',
    '  node scripts/task-queue.js try-merge --run-id <id> [--target <branch>]',
    '  node scripts/task-queue.js merge-cleanup --run-id <id> --confirm-merge-cleanup [--target <branch>]',
    '  node scripts/task-queue.js delete-clone --run-id <id> --confirm-delete-clone',
    '  node scripts/task-queue.js instruct --task-id <id> --note <text>',
    '  node scripts/task-queue.js recover-running',
    '  node scripts/task-queue.js reconcile-runs',
    '',
    'Isolation: standard and heavy-risky run/retry default to shared clone execution. Use --no-isolate to run in place. Merge, push, PR, and delete remain explicit human authorization boundaries.',
    '',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  let result;

  if (options.command === 'add') {
    result = addTask(options);
  } else if (options.command === 'list') {
    result = listTasks();
    if (options.format === 'json') result = { format: 'json', payload: result };
  } else if (options.command === 'start') {
    result = startTask(options);
  } else if (options.command === 'run') {
    result = executeTaskRun(options);
  } else if (options.command === 'retry') {
    result = executeTaskRun(options, getClaudeDir(), true);
  } else if (options.command === 'list-clones') {
    result = listClones();
    if (options.format === 'json') result = { format: 'json', payload: result };
  } else if (options.command === 'diff') {
    result = diffClone(options);
  } else if (options.command === 'try-merge') {
    result = tryMergeClone(options);
  } else if (options.command === 'merge-cleanup') {
    result = mergeCleanupClone(options);
  } else if (options.command === 'delete-clone') {
    result = deleteClone(options);
  } else if (options.command === 'instruct') {
    result = instructTask(options);
  } else if (options.command === 'recover-running') {
    result = recoverRunningTasks();
  } else if (options.command === 'reconcile-runs') {
    result = reconcileRuns();
  } else {
    process.stdout.write(printHelp());
    return options.command === 'help' || options.command === '--help' ? 0 : 1;
  }

  process.stdout.write(`${formatResult(result)}\n`);
  return result.status === 'BLOCKED' ? 1 : 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  addTask,
  deleteClone,
  formatResult,
  listClones,
  listTasks,
  mergeCleanupClone,
  main,
  parseArgs,
  readIndex,
  reconcileRuns,
  recoverRunningTasks,
  executeTaskRun,
  diffClone,
  instructTask,
  startTask,
  tryMergeClone,
};
