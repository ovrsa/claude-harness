#!/usr/bin/env node
/**
 * Validate rule markdown files, and the total size of the always-loaded instructions
 */

const fs = require('fs');
const path = require('path');

const RULES_DIR = path.join(__dirname, '../../../rules');
// Read at every session start: CLAUDE.md beside the rules directory, plus every rule that
// `paths` does not scope. A written rule alone did not keep these short, so the size is checked.
// Files pulled in with `@path` imports load at launch too, but are not followed here.
const CLAUDE_FILE = path.join(RULES_DIR, '..', 'CLAUDE.md');
const ALWAYS_LOADED_LIMIT = 12000;

/**
 * Recursively collect markdown rule files.
 * Uses explicit traversal for portability across Node versions.
 * @param {string} dir - Directory to scan
 * @returns {string[]} Relative file paths from RULES_DIR
 */
function collectRuleFiles(dir) {
  const files = [];

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectRuleFiles(absolute));
      continue;
    }

    if (entry.name.endsWith('.md')) {
      files.push(path.relative(RULES_DIR, absolute));
    }

    // Non-markdown files are ignored.
  }

  return files;
}

/**
 * A rule loads on demand only when its frontmatter names at least one path pattern.
 * No frontmatter, no `paths`, or an empty `paths` all mean it is read at every session start,
 * so a rule cannot leave the count by mentioning `paths` without scoping anything.
 * @param {string} content - Rule file content
 * @returns {boolean}
 */
function isPathScoped(content) {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatter) return false;

  const lines = frontmatter[1].split(/\r?\n/);
  const index = lines.findIndex(line => /^paths\s*:/.test(line));
  if (index === -1) return false;

  const inline = lines[index].replace(/^paths\s*:/, '').replace(/(^|\s)#.*$/, '').trim();
  const next = lines[index + 1] || '';
  // A bare key or a block scalar puts the patterns on the lines that follow.
  if (inline === '') return /^\s*-\s*(?:[^\s"']|["'][^"'])/.test(next);
  if (/^[>|][+-]?$/.test(inline)) return /^\s+\S/.test(next);
  if (/^(?:~|null)$/i.test(inline)) return false;
  return inline.replace(/[[\]"',\s]/g, '') !== '';
}

function validateRules() {
  if (!fs.existsSync(RULES_DIR)) {
    console.log('No rules directory found, skipping validation');
    process.exit(0);
  }

  const files = collectRuleFiles(RULES_DIR);
  let hasErrors = false;
  let validatedCount = 0;
  const alwaysLoaded = [];

  try {
    alwaysLoaded.push({ file: 'CLAUDE.md', chars: fs.readFileSync(CLAUDE_FILE, 'utf-8').length });
  } catch {
    // No CLAUDE.md beside the rules: only the rules count.
  }

  for (const file of files) {
    const filePath = path.join(RULES_DIR, file);
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;

      const content = fs.readFileSync(filePath, 'utf-8');
      if (!isPathScoped(content)) {
        alwaysLoaded.push({ file: ['rules', ...file.split(path.sep)].join('/'), chars: content.length });
      }
      if (content.trim().length === 0) {
        console.error(`ERROR: ${file} - Empty rule file`);
        hasErrors = true;
        continue;
      }
      validatedCount++;
    } catch (err) {
      console.error(`ERROR: ${file} - ${err.message}`);
      hasErrors = true;
    }
  }

  const total = alwaysLoaded.reduce((sum, entry) => sum + entry.chars, 0);
  if (total > ALWAYS_LOADED_LIMIT) {
    console.error(`ERROR: always-loaded instructions are ${total} chars, over the ${ALWAYS_LOADED_LIMIT} limit`);
    for (const entry of [...alwaysLoaded].sort((a, b) => b.chars - a.chars)) {
      console.error(`  ${String(entry.chars).padStart(6)}  ${entry.file}`);
    }
    hasErrors = true;
  }

  if (hasErrors) {
    process.exit(1);
  }

  console.log(`Validated ${validatedCount} rule files`);
  console.log(`Always-loaded instructions: ${total} / ${ALWAYS_LOADED_LIMIT} chars`);
}

validateRules();
