#!/usr/bin/env node
'use strict';

/**
 * PreToolUse(Bash) guard: refuse to push to main/master.
 *
 * `rules/common/worktree-policy.md` has forbidden direct pushes to main/master
 * since the policy was written, but nothing enforced it: the only push hook
 * printed a generic reminder, never looked at a branch name, and was gated to a
 * profile that no code path ever set.
 *
 * Wired directly in settings.json, NOT through run-with-flags.js. A safety stop
 * that a profile flag can switch off is not a safety stop.
 *
 * The implicit form matters most. `git push` with no refspec pushes the current
 * branch, so the string "main" never appears in the command — a regex over the
 * command text cannot see it. The branch has to be resolved from the repository.
 *
 * Fails open. If the command cannot be parsed, or git cannot answer, the push is
 * allowed: git itself will reject a genuinely broken push, and a guard that
 * blocks on its own malfunction would be worse than the drift it replaces.
 */

const { execFileSync } = require('child_process');

const PROTECTED_BRANCHES = new Set(['main', 'master']);
const MAX_STDIN = 1024 * 1024;

/** Options that swallow the following token, so it is not a positional arg. */
const GIT_GLOBAL_VALUE_OPTS = new Set([
  '-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env',
]);
const PUSH_VALUE_OPTS = new Set([
  '-o', '--push-option', '--repo', '--receive-pack', '--exec',
]);
const DRY_RUN_OPTS = new Set(['-n', '--dry-run']);

function readStdin() {
  return new Promise(resolve => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      if (raw.length < MAX_STDIN) raw += chunk.substring(0, MAX_STDIN - raw.length);
    });
    process.stdin.on('end', () => resolve(raw));
    process.stdin.on('error', () => resolve(raw));
  });
}

/**
 * Split a shell command into tokens, honouring quotes so that a quoted
 * "git push origin main" inside a commit message never looks like a push.
 */
function tokenize(segment) {
  const tokens = [];
  let current = '';
  let quote = null;
  let hasContent = false;

  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      hasContent = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current || hasContent) tokens.push(current);
      current = '';
      hasContent = false;
      continue;
    }
    current += ch;
  }
  if (current || hasContent) tokens.push(current);
  return tokens;
}

/** Split on shell separators so `cd /x && git push` is still seen as a push. */
function splitSegments(command) {
  return String(command)
    .split(/(?:&&|\|\||[;\n|])/)
    .map(part => part.trim())
    .filter(Boolean);
}

/**
 * Return { args, repoDir } if this segment invokes `git push`, else null.
 * Requires `push` to be the git subcommand, not a word appearing anywhere.
 *
 * repoDir follows `git -C <path>`: without it, `git -C /elsewhere push` would
 * resolve the implicit branch from the wrong repository and wave the push through.
 */
function extractPush(segment) {
  const tokens = tokenize(segment);
  const gitIndex = tokens.findIndex(token => token === 'git' || /(^|\/)git$/.test(token));
  if (gitIndex === -1) return null;

  let repoDir = null;
  let i = gitIndex + 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (GIT_GLOBAL_VALUE_OPTS.has(token)) {
      if (token === '-C' && i + 1 < tokens.length) repoDir = tokens[i + 1];
      i += 2;
      continue;
    }
    if (token.startsWith('-')) { i += 1; continue; }
    break;
  }
  if (i >= tokens.length || tokens[i] !== 'push') return null;
  return { args: tokens.slice(i + 1), repoDir };
}

/** Separate push options from positional arguments (remote, then refspecs). */
function parsePushArgs(args) {
  const positionals = [];
  const flags = new Set();

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === '--') {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (PUSH_VALUE_OPTS.has(token)) { i += 1; continue; }
    if (token.startsWith('-')) {
      flags.add(token.split('=')[0]);
      continue;
    }
    positionals.push(token);
  }

  return { positionals, flags };
}

/** Reduce a refspec to the branch it would land on. */
function destinationOf(refspec) {
  const withoutForce = refspec.replace(/^\+/, '');
  const parts = withoutForce.split(':');
  const destination = parts.length > 1 ? parts[parts.length - 1] : withoutForce;
  return destination.replace(/^refs\/heads\//, '');
}

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 5000,
  }).trim();
}

function currentBranch(cwd) {
  try {
    const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    return branch === 'HEAD' ? null : branch;
  } catch {
    return null;
  }
}

function localBranchExists(cwd, branch) {
  try {
    git(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

/** Branches this command would push to, or null when it cannot be determined. */
function resolveTargets(args, cwd) {
  const { positionals, flags } = parsePushArgs(args);

  if ([...DRY_RUN_OPTS].some(opt => flags.has(opt))) return [];

  const refspecs = positionals.slice(1);
  if (refspecs.length > 0) return refspecs.map(destinationOf);

  if (flags.has('--all') || flags.has('--mirror')) {
    return [...PROTECTED_BRANCHES].filter(branch => localBranchExists(cwd, branch));
  }

  const branch = currentBranch(cwd);
  return branch ? [branch] : [];
}

(async () => {
  const raw = await readStdin();

  let command = '';
  try {
    command = String(JSON.parse(raw).tool_input?.command || '');
  } catch {
    process.exit(0);
  }
  if (!command) process.exit(0);

  for (const segment of splitSegments(command)) {
    const push = extractPush(segment);
    if (!push) continue;

    let targets;
    try {
      targets = resolveTargets(push.args, push.repoDir || process.cwd());
    } catch {
      continue;
    }

    const blocked = targets.filter(target => PROTECTED_BRANCHES.has(target));
    if (blocked.length > 0) {
      console.error(
        `[Git Guard] Refusing to push to ${blocked.join(', ')}.\n` +
        '       rules/common/worktree-policy.md forbids direct pushes to main/master,\n' +
        '       with or without a PR or CI. Push a topic branch instead.'
      );
      process.exit(2);
    }
  }

  process.exit(0);
})();
