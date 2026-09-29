#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CLAUDE_ROOT = path.resolve(__dirname, '../../..');
// 定数名は HOOKS_FILE のまま（tests が定数名でパスを差し替える）。
// 実際に読まれる設定は settings.json であり、harness/hooks/hooks.json は 2026-08-15 に撤去した。
const HOOKS_FILE = path.join(CLAUDE_ROOT, 'settings.json');

function toHarnessRelative(absPath) {
  return path.relative(CLAUDE_ROOT, absPath).replace(/\\/g, '/');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getTrackedFiles() {
  try {
    const output = execFileSync('git', ['-C', CLAUDE_ROOT, 'ls-files'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return new Set(
      String(output || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
    );
  } catch (error) {
    console.error(`ERROR: failed to read tracked files from git: ${error.message}`);
    process.exit(1);
  }
}

function extractHookEntryFiles(command) {
  const refs = new Set();
  const value = String(command || '');
  for (const match of value.matchAll(/harness\/scripts\/hooks\/[A-Za-z0-9._-]+/g)) {
    refs.add(match[0]);
  }
  return refs;
}

function normalizeLocalJsDependency(filePath, rawRef) {
  let resolved = path.resolve(path.dirname(filePath), rawRef);
  if (!path.extname(resolved)) {
    resolved += '.js';
  }
  return resolved;
}

function extractLocalDependencies(filePath) {
  const deps = new Set();
  const content = fs.readFileSync(filePath, 'utf8');

  if (filePath.endsWith('.js')) {
    for (const match of content.matchAll(/require\(['"](\.\.?\/[^'"]+)['"]\)/g)) {
      deps.add(normalizeLocalJsDependency(filePath, match[1]));
    }
  }

  if (filePath.endsWith('.sh')) {
    for (const match of content.matchAll(/harness\/scripts\/hooks\/[A-Za-z0-9._-]+/g)) {
      deps.add(path.join(CLAUDE_ROOT, match[0]));
    }
  }

  return [...deps];
}

function collectRuntimeSurface() {
  if (!fs.existsSync(HOOKS_FILE)) {
    console.log('No settings.json found, skipping runtime surface validation');
    process.exit(0);
  }

  const hooks = readJson(HOOKS_FILE).hooks || {};
  const queue = [];
  const seen = new Set();

  for (const matcherGroup of Object.values(hooks)) {
    for (const matcher of matcherGroup || []) {
      for (const hook of matcher.hooks || []) {
        for (const ref of extractHookEntryFiles(hook.command)) {
          queue.push(path.join(CLAUDE_ROOT, ref));
        }
      }
    }
  }

  while (queue.length > 0) {
    const current = queue.shift();
    const repoRelative = toHarnessRelative(current);
    if (seen.has(repoRelative)) continue;
    seen.add(repoRelative);

    if (!fs.existsSync(current)) {
      continue;
    }

    for (const dep of extractLocalDependencies(current)) {
      const depRelative = toHarnessRelative(dep);
      if (!seen.has(depRelative)) {
        queue.push(dep);
      }
    }
  }

  return [...seen].sort();
}

function validateRuntimeSurface() {
  const tracked = getTrackedFiles();
  const runtimeFiles = collectRuntimeSurface();
  const missing = [];
  const untracked = [];

  for (const relativePath of runtimeFiles) {
    const absPath = path.join(CLAUDE_ROOT, relativePath);
    if (!fs.existsSync(absPath)) {
      missing.push(relativePath);
      continue;
    }
    if (!tracked.has(relativePath)) {
      untracked.push(relativePath);
    }
  }

  if (missing.length > 0 || untracked.length > 0) {
    for (const relativePath of missing) {
      console.error(`ERROR: runtime surface file is missing: ${relativePath}`);
    }
    for (const relativePath of untracked) {
      console.error(`ERROR: runtime surface file is not tracked by git: ${relativePath}`);
    }
    process.exit(1);
  }

  console.log(`Validated runtime surface: ${runtimeFiles.length} files`);
}

validateRuntimeSurface();
