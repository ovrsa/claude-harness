#!/usr/bin/env node
'use strict';

/**
 * Build the goal for one task issue. The agent fetches the issue with whatever access its runtime
 * has and passes the text, which is why no tracker API is called here. Input (--input <file|->):
 *   { tracker: string, branch?: string,
 *     task: { ref: string, title?: string, body: string },
 *     parent?: { ref: string, title?: string, body: string } }
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { getRepoRoot } = require('./lib/task-artifacts');
const { resolveTracker } = require('./lib/tracker-config');
const { prepareGoal, lineDiff, parseIssue } = require('./lib/task-goal');
const executionGraph = require('./lib/execution-graph');
const { checkTaskCompletion, taskFingerprint } = require('./lib/task-completion');
const { writeRunMeta, captureEvidence } = require('./lib/run-record');
const { getRuntimeSessionId } = require('./lib/utils');

// 3 is not an error: the issue changed after the goal was first built, and a person must
// accept the diff before the goal changes.
const EXIT_SPEC_CHANGED = 3;
// 4 is not an error either: the event did not wake the waiting Graph and was not stored. A runtime
// starts an LLM session only on exit 0 with `wake: true`.
const EXIT_HOLD = 4;

function readInput(file) {
  const input = JSON.parse(fs.readFileSync(file === '-' ? 0 : file, 'utf8'));
  const required = [['tracker', input.tracker], ['task.ref', input.task?.ref], ['task.body', input.task?.body]];
  if (input.parent) required.push(['parent.ref', input.parent.ref], ['parent.body', input.parent.body]);
  const missing = required.filter(([, value]) => typeof value !== 'string' || !value.trim()).map(([name]) => name);
  if (missing.length) throw new Error(`input is missing ${missing.join(', ')}`);
  const optional = [['branch', input.branch], ['task.title', input.task.title], ['parent.title', input.parent?.title]];
  const malformed = optional.filter(([, value]) => value !== null && value !== undefined && typeof value !== 'string').map(([name]) => name);
  if (malformed.length) throw new Error(`input has non-string ${malformed.join(', ')}`);
  return input;
}

/**
 * The spec the goal was built from lives under the worktree's git directory: per worktree, never
 * committed, and still there when a new conversation resumes the same task.
 */
function snapshotPath(repo, tracker, ref) {
  const key = `${tracker}-${ref}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const gitPath = execFileSync('git', ['-C', repo, 'rev-parse', '--git-path', `task-goal/${key}.json`], { encoding: 'utf8' }).trim();
  return path.resolve(repo, gitPath);
}

function main(argv) {
  if (argv[0] === 'graph') return graphMain(argv.slice(1));
  let cwd = process.cwd();
  let inputFile = null;
  let accept = false;
  let checkOnly = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo' && argv[i + 1]) cwd = argv[++i];
    else if (argv[i] === '--input' && argv[i + 1]) inputFile = argv[++i];
    else if (argv[i] === '--accept-change') accept = true;
    else if (argv[i] === '--check') checkOnly = true;
    else throw new Error('usage: node scripts/task-goal.js --input <task.json|-> [--repo <path>] [--accept-change | --check]');
  }
  if (!inputFile) throw new Error('--input is required');
  const repo = getRepoRoot(cwd);
  if (!repo) throw new Error('a git working tree is required');
  const input = readInput(inputFile);
  const { issues, goal, revision, spec } = prepareGoal({ task: input.task, parent: input.parent, repo, branch: input.branch });
  if (issues.length) {
    console.log(JSON.stringify({ status: 'INVALID', issues }, null, 2));
    return 1;
  }
  if (checkOnly) {
    console.log(JSON.stringify({ status: 'READY', state: 'checked', revision, goal, claude_code: `/goal ${goal}` }, null, 2));
    return 0;
  }

  const file = snapshotPath(repo, input.tracker, input.task.ref);
  const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const result = { status: 'READY', state: 'new', revision, goal, claude_code: `/goal ${goal}` };
  if (previous && previous.revision === revision) result.state = 'unchanged';
  else if (previous) {
    Object.assign(result, { previous_revision: previous.revision, diff: lineDiff(previous.spec, spec) });
    if (accept) result.state = 'accepted';
    else {
      console.log(JSON.stringify({ ...result, status: 'SPEC_CHANGED', state: 'changed' }, null, 2));
      return EXIT_SPEC_CHANGED;
    }
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({ revision, spec, goal }, null, 2)}\n`);
  } catch (error) {
    if (!['EACCES', 'EPERM', 'EROFS'].includes(error.code)) throw error;
    // Codex's workspace-write sandbox keeps .git read-only. Without the stored spec a resumed
    // task could not be diffed, so no goal is printed.
    throw new Error(`仕様を保存できない: ${file}（${error.code}）。サンドボックスで .git が読み取り専用なら、承認を得てサンドボックスの外で再実行する`);
  }
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

/** The issue's Graph section picks the definition: 標準 builds it, 個別 brings it, なし has no Graph. */
function createDefinition(plan, input, identity) {
  if (plan.type === 'none') throw new Error('the issue decided 型: なし, so it has no Graph');
  if (plan.type === 'custom') {
    if (input === undefined) throw new Error('a 型: 個別 Graph needs its definition in --graph-input');
    return input;
  }
  if (input !== undefined) throw new Error('a 型: 標準 Graph is built from the issue; pass a definition only for 型: 個別');
  return executionGraph.standardDefinition({ ...identity, limits: plan.limits, question: plan.question });
}

function graphMain(argv) {
  const operation = argv.shift();
  let runDir = null;
  let inputFile = null;
  let session = getRuntimeSessionId() || null;
  let permissions = [];
  let subjectFingerprint = null;
  let repo = null;
  let taskInputFile = null;
  const runtimeSession = getRuntimeSessionId() || null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--run-dir' && argv[i + 1]) runDir = argv[++i];
    else if (argv[i] === '--graph-input' && argv[i + 1]) inputFile = argv[++i];
    else if (argv[i] === '--session' && argv[i + 1]) session = argv[++i];
    else if (argv[i] === '--permissions' && argv[i + 1]) permissions = argv[++i].split(',').filter(Boolean);
    else if (argv[i] === '--subject-fingerprint' && argv[i + 1]) subjectFingerprint = argv[++i];
    else if (argv[i] === '--repo' && argv[i + 1]) repo = getRepoRoot(argv[++i]);
    else if (argv[i] === '--input' && argv[i + 1]) taskInputFile = argv[++i];
    else throw new Error('usage: task-goal.js graph <create|status|ingest|capture|succeed|fail|wait|resume|revise|revalidate> --run-dir <absolute-path> --repo <path> --input <task.json> [--graph-input <json>] [--session <id>]');
  }
  if (!runDir) throw new Error('--run-dir is required');
  if (runtimeSession && session !== runtimeSession) throw new Error('session id must match the current runtime');
  if (!path.isAbsolute(runDir) || [runDir, path.dirname(runDir)].some(part => fs.existsSync(part) && fs.lstatSync(part).isSymbolicLink())) throw new Error('run directory and runs root must be absolute non-symlink paths');
  const input = inputFile ? JSON.parse(fs.readFileSync(inputFile, 'utf8')) : undefined;
  if (!repo || !taskInputFile) throw new Error('graph operations require --repo and task --input');
  const taskInput = readInput(taskInputFile);
  const tracker = resolveTracker(repo);
  if (tracker.status !== 'configured' || tracker.tracker.kind !== taskInput.tracker) throw new Error('configured tracker does not match task input');
  const declaredProject = tracker.tracker.kind === 'github'
    ? `github.com/${tracker.tracker.repo.toLowerCase()}`
    : String(tracker.tracker.project || '').trim();
  if (!declaredProject) throw new Error('Graph requires a declared tracker repository identity');
  const repositoryIdentity = `${tracker.tracker.kind}:${declaredProject}`;
  const taskId = `${repositoryIdentity}:${taskInput.task.ref}`;
  const prepared = prepareGoal({ task: taskInput.task, parent: taskInput.parent, repo, branch: taskInput.branch });
  if (prepared.issues.length) throw new Error(`task specification is invalid: ${prepared.issues.join('; ')}`);
  const metaFile = path.join(runDir, 'meta.json');
  if (fs.existsSync(metaFile)) {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    if (meta.task_id && meta.task_id !== taskId) throw new Error('Run task identity collision');
    if (meta.repository_identity && meta.repository_identity !== repositoryIdentity) throw new Error('Run repository identity collision');
    if (meta.branch && meta.branch !== (taskInput.branch || null)) throw new Error('Run branch identity collision');
  }
  let definition;
  if (operation === 'create' || operation === 'revise') {
    const requiredIds = parseIssue(taskInput.task.body).acceptance.items.map((_, index) => `${prepared.revision}:AC-${index + 1}`);
    const source = tracker.tracker.kind === 'github' && /^#\d+$/.test(taskInput.task.ref)
      ? `https://github.com/${tracker.tracker.repo}/issues/${taskInput.task.ref.slice(1)}`
      : taskId;
    definition = operation === 'revise'
      ? input?.definition
      : createDefinition(prepared.graph, input, { taskId, runId: path.basename(runDir), source, revision: prepared.revision, requirementIds: requiredIds });
    if (definition?.spec?.revision !== prepared.revision) throw new Error(`graph spec revision does not match task-goal revision ${prepared.revision}`);
    if (operation === 'revise') {
      const saved = executionGraph.readGraph(runDir);
      if (saved.task_id !== definition.task_id) throw new Error('revised task identity differs from saved graph');
    }
    if (definition.task_id !== taskId) throw new Error('graph task_id does not match declared repository identity and task ref');
    if (JSON.stringify(definition.requirement_ids) !== JSON.stringify(requiredIds)) throw new Error('graph requirement_ids do not match task acceptance criteria');
  } else {
    const saved = executionGraph.readGraph(runDir);
    if (saved.spec.revision !== prepared.revision && !(operation === 'ingest' && input?.type === 'spec_change_accepted' && input.payload?.revision === prepared.revision)) throw new Error(`SPEC_CHANGED: graph ${saved.spec.revision}, current ${prepared.revision}`);
    if (saved.task_id !== taskId) throw new Error('saved graph does not match declared repository identity and task ref');
  }
  const actualFingerprint = taskFingerprint(repo);
  if (subjectFingerprint && subjectFingerprint !== actualFingerprint) throw new Error('subject fingerprint differs from current task');
  subjectFingerprint = actualFingerprint;
  if (operation === 'succeed') {
    if (!input) throw new Error('succeed requires --graph-input');
    const completion = checkTaskCompletion(repo);
    input.task_completion = { verified: true, exit_code: completion.ready ? 0 : 1, fingerprint: actualFingerprint, issues: completion.issues };
    input.subject_fingerprint = actualFingerprint;
  }
  const options = { runDir, session, permissions, subjectFingerprint, branch: taskInput.branch || null, completion: operation === 'succeed' ? input.task_completion : null };
  let graph;
  let wake;
  let reason;
  if (operation === 'status') {
    graph = executionGraph.readGraph(runDir);
    executionGraph.assertReadyGatesFresh(graph, runDir, subjectFingerprint);
    if (graph.state === 'completed') {
      const completion = checkTaskCompletion(repo);
      executionGraph.assertCurrentCompletion(graph, runDir, subjectFingerprint, { verified: true, exit_code: completion.ready ? 0 : 1, fingerprint: actualFingerprint });
    }
  }
  else {
    fs.mkdirSync(runDir, { recursive: true });
    const lock = path.join(runDir, '.graph.lock');
    const descriptor = fs.openSync(lock, 'wx');
    try {
      if (operation === 'create') {
        graph = executionGraph.createGraph(definition, options);
        writeRunMeta({ runsDir: path.dirname(runDir), runId: path.basename(runDir), fields: { task_id: definition.task_id, repository_identity: definition.task_id.slice(0, definition.task_id.lastIndexOf(':')), branch: taskInput.branch || null }, addSessionId: session });
        if (prepared.graph.question) graph = executionGraph.wait(runDir, executionGraph.standardWait(prepared.graph.question));
      } else if (operation === 'succeed' || operation === 'fail') graph = executionGraph.transition(runDir, operation, input, options);
      else if (operation === 'capture') {
        const kind = input?.kind;
        const names = { verification: 'verification-summary.md', review: 'review-summary.md', observation: 'observation-summary.md' };
        if (!Object.hasOwn(names, kind)) throw new Error('capture kind must be verification, review, or observation');
        const artifactPath = path.join(repo, names[kind]);
        if (!fs.existsSync(artifactPath) || fs.lstatSync(artifactPath).isSymbolicLink()) throw new Error(`missing or unsafe ${names[kind]}`);
        const artifactTime = fs.statSync(artifactPath).mtimeMs;
        const changed = execFileSync('git', ['-C', repo, 'status', '--porcelain', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
        for (const entry of changed) {
          const name = entry.slice(3);
          if (name === names[kind]) continue;
          const changedPath = path.resolve(repo, name);
          if (!changedPath.startsWith(repo + path.sep) || !fs.existsSync(changedPath) || !fs.statSync(changedPath).isFile()) continue;
          if (fs.statSync(changedPath).mtimeMs > artifactTime) throw new Error(`${names[kind]} predates changed file ${name}`);
        }
        const savedGraph = executionGraph.readGraph(runDir);
        const record = captureEvidence({ runsDir: path.dirname(runDir), runId: path.basename(runDir), kind, artifactPath, fingerprint: actualFingerprint, specRevision: savedGraph.spec.revision, definitionRevision: savedGraph.definition_revision });
        if (!record) throw new Error(`missing ${names[kind]}`);
        graph = executionGraph.readGraph(runDir);
      }
      else if (operation === 'wait') graph = executionGraph.wait(runDir, input);
      else if (operation === 'resume') graph = executionGraph.resume(runDir, input, options);
      else if (operation === 'revalidate') graph = executionGraph.revalidate(runDir, subjectFingerprint, checkTaskCompletion(repo), options);
      else if (operation === 'ingest') ({ graph, wake, reason } = executionGraph.ingest(runDir, input));
      else if (operation === 'revise') graph = executionGraph.revise(runDir, input.definition, input.event_id, options);
      else throw new Error(`unknown graph operation: ${operation}`);
    } finally {
      fs.closeSync(descriptor);
      fs.unlinkSync(lock);
    }
  }
  if (reason) {
    console.log(JSON.stringify({ status: 'HOLD', wake: false, reason, ...executionGraph.result(graph) }, null, 2));
    return EXIT_HOLD;
  }
  console.log(JSON.stringify({ ...executionGraph.result(graph), ...(operation === 'ingest' ? { wake } : {}) }, null, 2));
  return 0;
}

try { process.exitCode = main(process.argv.slice(2)); }
catch (error) {
  console.error(`task-goal: ${error.message}`);
  process.exitCode = 1;
}
