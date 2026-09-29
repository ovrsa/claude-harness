#!/usr/bin/env node
/**
 * Prevent shipping user-specific absolute paths anywhere another machine reads.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../..');
// Two kinds of surface, and the scope of this list IS the contract:
//   - execution: a hardcoded home here means the harness silently does nothing
//     on someone else's machine. `settings.json` is the sharpest case — of the 22
//     hook commands it wires, 18 resolved their script through
//     `${CLAUDE_PLUGIN_ROOT:-$HOME/.claude}` and exactly one started from an
//     absolute home, so that one hook could never fire anywhere else. This
//     validator passed green throughout, because settings.json was not listed.
//   - entry: what a new reader opens first, so a stale path misdirects them.
// `tests` is deliberately absent: a home path in a fixture breaks nobody's run,
// and the placeholder homes already in the fixtures would fail on every commit.
// A validator that cries wolf gets switched off, which costs more than the gap.
const TARGETS = [
  // execution
  'settings.json',
  'package.json',
  'harness/hooks',
  'harness/scripts',
  // entry
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
  'rules',
  'harness/templates',
  'skills',
  'commands',
  'agents',
  'docs',
  '.opencode/commands',
];

// Any absolute home path is a leak: it either exposes whose machine produced the file, or
// silently encodes a home directory that does not exist on this one. A stale `/Users/kyo`
// (a different machine's home) sat in plugin config for weeks and broke plugin loading with a
// bare "cache-miss", so match every user home rather than a specific author's name.
// `~/...` and `$HOME/...` are the portable forms and are not matched.
const BLOCK_PATTERNS = [
  /\/(?:Users|home)\/[A-Za-z0-9._-]+\//g,
  /C:\\Users\\[A-Za-z0-9._-]+\\/gi,
];

// Fixture paths that intentionally look like home directories.
const ALLOWED = [
  /\/Users\/(?:test|me|you|example|username)\//i,
];

function collectFiles(targetPath, out) {
  if (!fs.existsSync(targetPath)) return;
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    out.push(targetPath);
    return;
  }

  for (const entry of fs.readdirSync(targetPath)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    collectFiles(path.join(targetPath, entry), out);
  }
}

const files = [];
for (const target of TARGETS) {
  collectFiles(path.join(ROOT, target), files);
}

let failures = 0;
for (const file of files) {
  if (!/\.(md|json|js|ts|sh|toml|yml|yaml)$/i.test(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of BLOCK_PATTERNS) {
    const matches = content.match(pattern);
    if (!matches) continue;
    const offending = [...new Set(matches)].filter(m => !ALLOWED.some(ok => ok.test(m)));
    if (offending.length === 0) continue;
    console.error(
      `ERROR: absolute home path in ${path.relative(ROOT, file)}: ${offending.slice(0, 3).join(', ')}\n` +
      '       Use ~/ or $HOME/ instead so the file works on any machine.'
    );
    failures += offending.length;
    break;
  }
}

if (failures > 0) {
  process.exit(1);
}

console.log(`Validated: no personal absolute paths across ${TARGETS.length} shared surfaces`);
