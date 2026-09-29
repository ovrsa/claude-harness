#!/usr/bin/env node
'use strict';

/**
 * Fails when a tracked source file is not text.
 *
 * Why this exists: on 2026-08-20 a source file was committed with two raw NUL
 * bytes in it (a composite-key separator written as a literal rather than an
 * escape). `file` classified it as binary data, so **grep skipped it entirely**
 * -- and grep exits 1 on a skipped file exactly as it does on no match. Every
 * grep-based verification against that file passed vacuously, including the
 * check that no SQLite reference remained.
 *
 * The tests still passed and the code still ran. That is the whole problem: the
 * failure was invisible to the tools used to verify it.
 *
 * Usage:
 *   node harness/scripts/ci/validate-text-sources.js [--root <path>]
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.json', '.md', '.yml', '.yaml', '.sh', '.txt']);

function trackedFiles(root) {
  try {
    return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
      .split(String.fromCharCode(0))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function findControlBytes(buffer) {
  const offsets = [];
  for (let i = 0; i < buffer.length; i += 1) {
    const byte = buffer[i];
    // Tab (9), LF (10), CR (13) and form feed (12) are legitimate in text.
    const allowed = byte === 9 || byte === 10 || byte === 12 || byte === 13;
    if (byte < 32 && !allowed) offsets.push({ offset: i, byte });
  }
  return offsets;
}

function main(argv = process.argv.slice(2)) {
  let root = process.cwd();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') root = argv[++i] || root;
  }

  const failures = [];
  for (const relative of trackedFiles(root)) {
    if (!TEXT_EXTENSIONS.has(path.extname(relative))) continue;
    const full = path.join(root, relative);
    let buffer;
    try {
      buffer = fs.readFileSync(full);
    } catch {
      continue;
    }
    const found = findControlBytes(buffer);
    if (found.length === 0) continue;
    const summary = found.slice(0, 3)
      .map(entry => `offset ${entry.offset} (0x${entry.byte.toString(16).padStart(2, '0')})`)
      .join(', ');
    failures.push(`${relative}: ${found.length} control byte(s) — ${summary}`);
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      process.stderr.write(`ERROR: ${failure}\n`);
    }
    process.stderr.write('A control byte makes the file binary to grep, which then skips it silently.\n');
    process.stderr.write('Write the byte as an escape sequence instead of a literal.\n');
    return 1;
  }

  process.stdout.write('PASS: all tracked text sources are text\n');
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main, findControlBytes };
