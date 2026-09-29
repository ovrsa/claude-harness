#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Only stores owned by this harness move. Claude's process files also live in sessions/.
const STORES = [
  ['runs', 'harness/data/runs'],
  ['metrics', 'harness/data/metrics'],
  ['.state/guardrail-candidates.jsonl', 'harness/data/state/guardrail-candidates.jsonl'],
  ['settings.json.bak', 'harness/data/backups/settings.json.bak'],
  ['session-aliases.json', 'harness/data/state/session-aliases.json'],
  ['sessions/compaction-log.txt', 'harness/data/sessions/compaction-log.txt'],
  ['sessions/subagent-stop.log', 'harness/data/sessions/subagent-stop.log'],
  ['sessions/permission-requests.log', 'harness/data/sessions/permission-requests.log'],
  ['telemetry/telemetry.db', 'harness/data/archive/telemetry.db'],
];
const SOURCE_DIRS = ['hooks', 'scripts', 'tests', 'schemas', 'templates', 'facets', 'workflows'];
const CONFIGS = ['eslint.config.js', '.dependency-cruiser.js', 'knip.json', 'tsconfig.json'];
const NATIVE = new Set(['projects', 'plugins', 'daemon', 'jobs', 'feedback', 'file-history', 'cache', 'chrome', 'ide', 'paste-cache', 'image-cache', 'session-env', 'shell-snapshots', 'statsig', 'telemetry', 'todos', 'tasks', 'debug', 'plans', 'history.jsonl', 'stats-cache.json', 'mcp-needs-auth-cache.json', 'daemon.log', 'daemon.lock', 'daemon.status.json', 'remote-settings.json', 'policy-limits.json', '.last-cleanup', '.last-update-result.json', 'gh-pr-status-cache.json', 'state']);
const ENTRY = new Set(['CLAUDE.md', 'AGENTS.md', 'settings.json', 'agents', 'commands', 'rules', 'skills', '.claude', '.claude-plugin']);
function stat(file) { try { return fs.lstatSync(file); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
function safe(root, rel) {
  const absolute = path.resolve(root, rel);
  if (!absolute.startsWith(root + path.sep)) throw new Error(`path escapes root: ${rel}`);
  let current = root;
  for (const part of path.relative(root, absolute).split(path.sep)) {
    current = path.join(current, part);
    if (stat(current)?.isSymbolicLink()) throw new Error(`refusing symlink: ${path.relative(root, current)}`);
  }
  return absolute;
}
function collect(root, source, target, moves) {
  const from = safe(root, source), to = safe(root, target);
  const info = stat(from);
  if (!info) return;
  if (info.isDirectory()) {
    if (stat(to) && !stat(to).isDirectory()) throw new Error(`destination is not a directory: ${target}`);
    for (const name of fs.readdirSync(from)) collect(root, `${source}/${name}`, `${target}/${name}`, moves);
  } else {
    if (!info.isFile()) throw new Error(`not a regular file: ${source}`);
    if (stat(to)) throw new Error(`destination already exists: ${target}`);
    moves.push({ source, target });
  }
}
function plan(root) {
  const moves = [];
  for (const [source, target] of STORES) collect(root, source, target, moves);
  // Keep native .claude.json backups and unknown formats in place. These named
  // snapshot formats are manual harness archives, with no active runtime reader.
  const backups = safe(root, 'backups');
  if (stat(backups)?.isDirectory()) {
    for (const name of fs.readdirSync(backups)) {
      if (/^(?:workspace-cleanup-\d{4}-\d{2}-\d{2}|\d{8}_\d{6}|pre-distribution-\d{4}-\d{2}-\d{2}\.tar\.gz)$/.test(name)) {
        collect(root, `backups/${name}`, `harness/data/backups/${name}`, moves);
      }
    }
  }
  const sessions = safe(root, 'sessions');
  if (stat(sessions)?.isDirectory()) {
    for (const name of fs.readdirSync(sessions)) {
      if (name.endsWith('-session.tmp')) collect(root, `sessions/${name}`, `harness/data/sessions/${name}`, moves);
    }
  }
  return moves;
}
function inventory(root) {
  return fs.readdirSync(root).sort().map(name => {
    let owner, target = name, reason;
    if (SOURCE_DIRS.includes(name) || CONFIGS.includes(name)) {
      owner = 'harness'; target = `harness/${name}`; reason = 'リポジトリで移動し、生成元・参照元も同じ変更で更新';
    } else if (name === 'harness') {
      owner = 'harness'; reason = '実装・検査・用途別データの集約先';
    } else if (['runs', 'metrics', '.state', 'session-aliases.json', 'settings.json.bak', 'sessions'].includes(name)) {
      owner = name === 'sessions' ? 'mixed' : 'harness';
      target = name === 'sessions' ? 'harness/data/sessions/*-session.tmp' : (STORES.find(([s]) => s === name || s.startsWith(name + '/')) || [null, name])[1];
      reason = name === 'sessions' ? 'ハーネスのメモだけ移動。Claude 本体の稼働セッション情報は固定配置' : 'CLI の移行対象。未知の同居ファイルは保持';
    } else if (ENTRY.has(name)) {
      owner = 'configuration'; reason = 'グローバル読み込み、プラグイン認識、プロジェクト設定の入口を維持';
    } else if (NATIVE.has(name) || name === 'backups') {
      owner = 'Claude Code'; reason = '本体の生成・参照・保持期間管理に従う。設定全体を変える CLAUDE_CONFIG_DIR は今回の制約外';
      if (name === 'backups') reason = 'Claude 本体の .claude.json 自動バックアップは残し、命名が確認できる手動スナップショットだけ harness/data/backups へ移す';
      if (name === 'telemetry') reason = 'Claude 本体の送信待ちイベントは残し、廃止済みハーネスDBだけ harness/data/archive へ移す';
      if (name === 'plugins') reason = 'CLAUDE_CODE_PLUGIN_CACHE_DIR は利用可能だが、登録済み絶対パス・両ランタイムの管理済みスキル参照の移行は未検証。内部資産を手で再構成しない制約に従い保持';
    } else if (['.git', '.gitignore', 'README.md', 'LICENSE', 'docs', 'package.json', 'package-lock.json', 'node_modules', 'contexts', 'mcp-configs', 'worktrees', '.worktrees', '.vscode'].includes(name)) {
      owner = 'development'; reason = 'Git・npm・開発環境の入口、既存 worktree、利用者が読む文書や設定を維持';
    } else if (name.endsWith('-summary.md')) {
      owner = 'harness'; reason = '任意の作業リポジトリに置く完了検査の公開入力。固定の成果物名を維持';
    } else {
      owner = 'unresolved'; reason = '生成元の確認が必要。削除・移動・隠蔽を自動適用しない';
    }
    return { name, owner, target, reason, references: owner === 'Claude Code' ? ['https://code.claude.com/docs/en/claude-directory', 'Claude Code 2.1.284 native runtime'] : owner === 'harness' || owner === 'mixed' ? ['harness/scripts/layout.js', 'harness/scripts/lib/utils.js', 'harness/scripts/lib/run-record.js', 'harness/scripts/lib/session-aliases.js'] : ['CLAUDE.md', 'package.json'] };
  });
}
function apply(root, moves) {
  const completed = [];
  try {
    for (const move of moves) {
      const source = safe(root, move.source), target = safe(root, move.target);
      if (stat(target)) throw new Error(`destination appeared during migration: ${move.target}`);
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      fs.renameSync(source, target);
      completed.push(move);
    }
  } catch (error) {
    for (const move of completed.reverse()) fs.renameSync(path.join(root, move.target), path.join(root, move.source));
    throw error;
  }
  // Remove only empty source directories, never native or unknown data.
  const parents = new Set(moves.flatMap(m => {
    const out = []; let dir = path.dirname(m.source);
    while (dir !== '.') { out.push(dir); dir = path.dirname(dir); }
    return out;
  }));
  for (const dir of [...parents].sort((a, b) => b.length - a.length)) {
    const full = safe(root, dir);
    if (stat(full)?.isDirectory() && fs.readdirSync(full).length === 0) fs.rmdirSync(full);
  }
}
function main(args) {
  let root = path.join(os.homedir(), '.claude'), write = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && args[i + 1] && !args[i + 1].startsWith('--')) root = path.resolve(args[++i]);
    else if (args[i] === '--apply') write = true;
    else if (args[i] !== '--check') throw new Error(`unknown or incomplete option: ${args[i]}`);
  }
  root = fs.realpathSync(root);
  const entries = inventory(root), moves = plan(root);
  if (write) apply(root, moves);
  console.log(JSON.stringify({ root, status: write ? 'applied' : 'preview', count: entries.length, entries, moves }, null, 2));
}
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
