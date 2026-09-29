#!/usr/bin/env node
/**
 * Validate machine-local runtime config that git does not track.
 *
 * `plugins/` is gitignored, so no repository validator can see it — yet a stale
 * `installLocation` carrying a truncated home from another machine (`/Users/<partial>`
 * where the real account was longer) silently broke plugin loading, surfacing only as
 * "Marketplace ... failed to load: cache-miss". Paths that leave this home, or that
 * point at nothing, are the failure mode worth checking every run.
 *
 * Missing files are fine: a machine may simply have no plugins installed.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '../../..');
const HOME = os.homedir();

// file -> [ [containerDescription, pathFieldName] ]
const CHECKS = [
  { file: 'plugins/known_marketplaces.json', collect: collectMarketplacePaths },
  { file: 'plugins/installed_plugins.json', collect: collectInstalledPaths },
];

function collectMarketplacePaths(data) {
  const out = [];
  for (const [name, entry] of Object.entries(data || {})) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.installLocation) out.push({ label: name, field: 'installLocation', value: entry.installLocation });
  }
  return out;
}

function collectInstalledPaths(data) {
  const out = [];
  for (const [name, entries] of Object.entries((data && data.plugins) || {})) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (entry && entry.installPath) out.push({ label: name, field: 'installPath', value: entry.installPath });
    }
  }
  return out;
}

let failures = 0;
let checked = 0;

for (const { file, collect } of CHECKS) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;

  let data;
  try {
    data = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    console.error(`ERROR: ${file} is not valid JSON: ${err.message}`);
    failures++;
    continue;
  }

  for (const { label, field, value } of collect(data)) {
    checked++;
    const resolved = path.resolve(value);
    if (!resolved.startsWith(HOME + path.sep)) {
      console.error(
        `ERROR: ${file} ${label}.${field} points outside this home\n` +
        `       ${value}\n` +
        `       expected a path under ${HOME}. This usually means the file was copied from\n` +
        '       another machine. For a marketplace, run:\n' +
        `         claude plugin marketplace remove ${label} && claude plugin marketplace add <source>`
      );
      failures++;
      continue;
    }
    if (!fs.existsSync(resolved)) {
      console.error(
        `ERROR: ${file} ${label}.${field} does not exist\n` +
        `       ${value}`
      );
      failures++;
    }
  }
}

if (failures > 0) process.exit(1);

console.log(`Validated ${checked} local config paths`);
