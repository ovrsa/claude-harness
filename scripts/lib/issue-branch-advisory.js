'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveTracker } = require('./tracker-config');
const { getCurrentSessionId } = require('./utils');

function git(dir, ...args) {
  const result = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

/**
 * Whether a branch name carries an issue identifier. start-issue names branches issue-<n> for
 * GitHub and the lowercase identifier (pri-251) for Linear; GitHub and GitLab also create
 * <n>-<title> from an issue. On GitHub and GitLab a bare <word>-<n> is not an issue, so
 * fix/trace-entry-20260924 still gets the advisory.
 */
function namesIssue(branch, kind) {
  if (/(?:^|[^a-z0-9])(?:issue[-_]?|#)\d+(?!\d)/i.test(branch)) return true;
  if (/(?:^|\/)\d+-/.test(branch)) return true;
  if (kind === 'github' || kind === 'gitlab') return false;
  return /(?:^|[^a-z0-9])[a-z][a-z0-9]*-\d+(?!\d)/i.test(branch);
}

function nearestDirectory(file) {
  let dir = path.dirname(file);
  while (!fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  return dir;
}

/**
 * The advice for a write to `filePath`, or null. It is given at most once per session: the marker
 * in the temp directory is created with O_EXCL, so of several hooks started by parallel edits only
 * one gets it. Nothing here stops the write.
 */
function issueBranchAdvisory({ filePath, sessionId, cwd }) {
  const session = String(sessionId || getCurrentSessionId(`ppid-${process.ppid}`)).replace(/[^A-Za-z0-9_-]/g, '') || 'default';
  const marker = path.join(os.tmpdir(), `claude-draft-issue-advisory-${session}`);
  if (fs.existsSync(marker)) return null;

  const file = path.resolve(cwd || process.cwd(), filePath);
  const dir = nearestDirectory(file);
  const repo = git(dir, 'rev-parse', '--show-toplevel');
  if (!repo) return null;
  // A detached HEAD (rebase, bisect) is not the start of new work.
  const branch = git(repo, 'symbolic-ref', '--quiet', '--short', 'HEAD');
  if (!branch) return null;

  let tracker;
  try { tracker = resolveTracker(repo); } catch { return null; }
  if (tracker.status !== 'configured' || namesIssue(branch, tracker.tracker.kind)) return null;
  // Ignored files (scratch notes, local state) are not the work an issue would describe.
  if (spawnSync('git', ['-C', dir, 'check-ignore', '-q', '--', path.relative(dir, file)]).status === 0) return null;

  try { fs.closeSync(fs.openSync(marker, 'wx')); } catch { return null; }
  return `[Lifecycle Advisory] ブランチ ${branch} の名前に Issue 番号が無い。このリポジトリは管理先（${tracker.tracker.kind}）を宣言している。`
    + 'Issue の無い作業なら、実装の前に `draft-issue` スキルで Issue を下書きし、人の承認を得てから起票する。'
    + '書き込みは止めていない。この案内はセッションに1回だけ出る。';
}

module.exports = { issueBranchAdvisory };
