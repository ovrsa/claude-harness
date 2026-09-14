#!/usr/bin/env node
'use strict';

const { getRepoRoot } = require('./lib/task-artifacts');
const { checkTaskCompletion, taskFingerprint } = require('./lib/task-completion');

function main(argv) {
  let cwd = process.cwd();
  let fingerprint = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo' && argv[i + 1]) cwd = argv[++i];
    else if (argv[i] === '--fingerprint') fingerprint = true;
    else throw new Error('usage: node scripts/task-completion.js [--repo <path>] [--fingerprint]');
  }
  const repo = getRepoRoot(cwd);
  if (!repo) throw new Error('a git working tree is required');
  if (fingerprint) {
    console.log(taskFingerprint(repo));
    return 0;
  }
  const result = checkTaskCompletion(repo);
  console.log(JSON.stringify({ status: result.ready ? 'READY' : 'NEEDS_WORK', ...result }, null, 2));
  return result.ready ? 0 : 1;
}

try { process.exitCode = main(process.argv.slice(2)); }
catch (error) {
  console.error(`Task completion check failed: ${error.message}`);
  process.exitCode = 1;
}
