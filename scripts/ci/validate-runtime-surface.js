#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HOOKS_FILE = path.join(ROOT, 'hooks', 'hooks.json');

function localNodePath(command) {
  const match = String(command || '').match(/^node\s+"([^"]+)"/);
  if (!match) return null;
  return match[1].replace(/\$\{[^}]+\}/, ROOT);
}

function dependencies(filePath) {
  if (!filePath.endsWith('.js')) return [];
  const source = fs.readFileSync(filePath, 'utf8');
  return [...source.matchAll(/require\(['"](\.\.?\/[^'"]+)['"]\)/g)].map((match) => {
    let target = path.resolve(path.dirname(filePath), match[1]);
    if (!path.extname(target)) target += '.js';
    return target;
  });
}

function assertWithinRoot(filePath) {
  const relative = path.relative(ROOT, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('runtime dependency escapes harness root: ' + filePath);
  }
}

function main() {
  const hooks = JSON.parse(fs.readFileSync(HOOKS_FILE, 'utf8')).hooks;
  const queue = [];
  for (const groups of Object.values(hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks || []) {
        const filePath = localNodePath(hook.command);
        if (filePath) queue.push(filePath);
      }
    }
  }

  const seen = new Set();
  while (queue.length > 0) {
    const candidate = queue.shift();
    assertWithinRoot(candidate);
    const relative = path.relative(ROOT, candidate).replace(/\\/g, '/');
    if (seen.has(relative)) continue;
    seen.add(relative);
    if (!fs.existsSync(candidate)) throw new Error('runtime surface file is missing: ' + relative);
    const real = fs.realpathSync(candidate);
    assertWithinRoot(real);
    for (const dependency of dependencies(real)) queue.push(dependency);
  }

  const source = [...seen].map((relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8')).join('\n');
  if (/session-trace|task-artifacts|telemetry-(?:pre|post)-tool|lifecycle-pre-/i.test(source)) {
    throw new Error('runtime surface still references retired lifecycle code');
  }
  console.log('Validated runtime surface: ' + seen.size + ' files');
}

try {
  main();
} catch (error) {
  console.error('ERROR: ' + error.message);
  process.exit(1);
}
