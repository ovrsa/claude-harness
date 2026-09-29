#!/usr/bin/env node
'use strict';

const { getRepoRoot } = require('./lib/task-artifacts');
const { resolveTracker } = require('./lib/tracker-config');

// 2 is not an error: nobody has declared the tracker yet, and a person must choose before
// any issue is created.
const EXIT_CODES = { configured: 0, none: 0, unconfigured: 2 };

function main(argv) {
  let cwd = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo' && argv[i + 1]) cwd = argv[++i];
    else throw new Error('usage: node harness/scripts/resolve-tracker.js [--repo <path>]');
  }
  const repo = getRepoRoot(cwd);
  if (!repo) throw new Error('a git working tree is required');
  const result = resolveTracker(repo);
  console.log(JSON.stringify(result, null, 2));
  return EXIT_CODES[result.status] ?? 1;
}

try { process.exitCode = main(process.argv.slice(2)); }
catch (error) {
  console.error(`resolve-tracker: ${error.message}`);
  process.exitCode = 1;
}
