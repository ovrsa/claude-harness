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
const { prepareGoal, lineDiff } = require('./lib/task-goal');

// 3 is not an error: the issue changed after the goal was first built, and a person must
// accept the diff before the goal changes.
const EXIT_SPEC_CHANGED = 3;

function readInput(file) {
  const input = JSON.parse(fs.readFileSync(file === '-' ? 0 : file, 'utf8'));
  const required = [['tracker', input.tracker], ['task.ref', input.task?.ref], ['task.body', input.task?.body]];
  if (input.parent) required.push(['parent.ref', input.parent.ref], ['parent.body', input.parent.body]);
  const missing = required.filter(([, value]) => typeof value !== 'string' || !value.trim()).map(([name]) => name);
  if (missing.length) throw new Error(`input is missing ${missing.join(', ')}`);
  const optional = [['branch', input.branch], ['task.title', input.task.title], ['parent.title', input.parent?.title]];
  const malformed = optional.filter(([, value]) => value != null && typeof value !== 'string').map(([name]) => name);
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

try { process.exitCode = main(process.argv.slice(2)); }
catch (error) {
  console.error(`task-goal: ${error.message}`);
  process.exitCode = 1;
}
