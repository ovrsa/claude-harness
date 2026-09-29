#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');

const BEGIN = '<!-- shared-harness:begin -->';
const END = '<!-- shared-harness:end -->';
const HOOK = 'harness/scripts/hooks/runtime-session.js';
const read = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const quote = value => `'${value.replace(/'/g, "'\\''")}'`;

function options(argv) {
  const out = { apply: false, claudeRoot: path.join(os.homedir(), '.claude'), codexHome: process.env.CODEX_HOME || path.join(os.homedir(), '.codex') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') out.apply = true;
    else if (argv[i] === '--check') out.apply = false;
    else if (['--claude-root', '--codex-home'].includes(argv[i])) {
      const key = argv[i] === '--claude-root' ? 'claudeRoot' : 'codexHome';
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`missing value for ${argv[i]}`);
      out[key] = path.resolve(argv[++i]);
    } else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return out;
}

function bridgePlan({ claudeRoot, codexHome }) {
  if (/[\r\n`$"]/u.test(claudeRoot)) throw new Error('canonical path contains unsupported instruction quoting characters');
  for (const name of ['CLAUDE.md', 'rules', 'skills', HOOK, 'harness/scripts/runs-cli.js']) {
    if (!fs.existsSync(path.join(claudeRoot, name))) throw new Error(`missing canonical source: ${name}`);
  }
  if (fs.existsSync(path.join(codexHome, 'AGENTS.override.md'))) throw new Error('AGENTS.override.md shadows the shared entrypoint; review it first');
  const changes = [];
  const agentsFile = path.join(codexHome, 'AGENTS.md');
  const current = read(agentsFile);
  const template = read(path.join(__dirname, '../templates/codex/AGENTS.md')).replaceAll('{{CLAUDE_ROOT}}', claudeRoot).trimEnd();
  if (!template.includes(BEGIN)) throw new Error('missing bridge template');
  const start = current.indexOf(BEGIN);
  const end = current.indexOf(END);
  if ((start < 0) !== (end < 0) || (start >= 0 && (end < start || current.indexOf(BEGIN, start + 1) >= 0 || current.indexOf(END, end + 1) >= 0))) {
    throw new Error('ambiguous managed AGENTS block');
  }
  const agents = start < 0 ? `${current}${current && !current.endsWith('\n') ? '\n' : ''}${current ? '\n' : ''}${template}\n`
    : current.slice(0, start) + template + current.slice(end + END.length);
  if (agents !== current) changes.push({ path: agentsFile, content: agents });

  const hooksFile = path.join(codexHome, 'hooks.json');
  const raw = read(hooksFile);
  const hooks = raw ? JSON.parse(raw) : {};
  if (!hooks || Array.isArray(hooks) || typeof hooks !== 'object') throw new Error('invalid hooks.json');
  hooks.hooks ??= {};
  if (typeof hooks.hooks !== 'object' || Array.isArray(hooks.hooks)) throw new Error('invalid hooks object');
  let hooksChanged = false;
  for (const event of ['SessionStart', 'Stop']) {
    const groups = hooks.hooks[event] || [];
    if (!Array.isArray(groups)) throw new Error(`invalid ${event} groups`);
    const desired = { type: 'command', command: `node ${quote(path.join(claudeRoot, HOOK))} --runtime codex`, timeout: 10 };
    const legacy = { ...desired, command: `node ${quote(path.join(claudeRoot, 'scripts/hooks/runtime-session.js'))} --runtime codex` };
    const owned = groups.flatMap(group => (group.hooks || []).filter(hook => typeof hook.command === 'string' && (hook.command.includes(HOOK) || hook.command.includes('scripts/hooks/runtime-session.js'))));
    if (owned.length > 1) throw new Error(`duplicate harness hooks in ${event}`);
    if (owned.length === 1) {
      // Never silently rewrite a possibly customized hook or its matcher.
      const group = groups.find(g => g.hooks?.includes(owned[0]));
      if (JSON.stringify(owned[0]) === JSON.stringify(legacy) && !group.matcher) {
        Object.assign(owned[0], desired);
        hooksChanged = true;
      } else if (JSON.stringify(owned[0]) !== JSON.stringify(desired) || group.matcher) throw new Error(`conflicting harness hook in ${event}`);
    } else {
      groups.push({ hooks: [desired] });
      hooks.hooks[event] = groups;
      hooksChanged = true;
    }
  }
  if (hooksChanged) changes.push({ path: hooksFile, content: `${JSON.stringify(hooks, null, 2)}\n` });

  const link = path.join(codexHome, 'skills/claude-imported');
  const target = path.join(claudeRoot, 'skills');
  let stat;
  try { stat = fs.lstatSync(link); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (stat) {
    if (!stat.isSymbolicLink() || fs.realpathSync(link) !== fs.realpathSync(target)) throw new Error('shared skills path is not the canonical symlink; review before replacing it');
  } else changes.push({ path: link, target });

  // Do all conflict checks before changing any file. Existing files have durable backups.
  for (const change of changes) {
    let stat;
    try { stat = fs.lstatSync(change.path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new Error(`refusing to overwrite non-regular file: ${change.path}`);
  }
  return changes;
}

function main(argv = process.argv.slice(2)) {
  const opts = options(argv);
  const changes = bridgePlan(opts);
  const backupDir = path.join(opts.codexHome, 'backups', `shared-harness-${Date.now()}-${randomUUID()}`);
  if (opts.apply) {
    for (const change of changes) {
      fs.mkdirSync(path.dirname(change.path), { recursive: true });
      if (change.target) fs.symlinkSync(change.target, change.path, 'dir');
      else {
        if (fs.existsSync(change.path)) {
          fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
          fs.copyFileSync(change.path, path.join(backupDir, path.basename(change.path)), fs.constants.COPYFILE_EXCL);
        }
        const temporary = `${change.path}.${randomUUID()}.tmp`;
        fs.writeFileSync(temporary, change.content, { flag: 'wx', mode: 0o600 });
        fs.renameSync(temporary, change.path);
      }
    }
  }
  const result = { status: changes.length && !opts.apply ? 'drift' : 'aligned', changed: changes.map(c => c.path),
    scope: ['instruction entrypoint', 'shared skills source', 'session recording hook definitions'],
    runtimeChecks: ['Codex hooks must be enabled and trusted via /hooks; definition alignment does not prove execution', 'skill invocation controls and native command/agent registration are runtime-specific'],
    separateSettings: ['Claude settings.json permissions / Codex config.toml approvals and sandbox', 'MCP and plugin connections', 'model selection'],
    backupDir: opts.apply && fs.existsSync(backupDir) ? backupDir : null };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return changes.length && !opts.apply ? 2 : 0;
}
if (require.main === module) {
  try { process.exitCode = main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { main };
