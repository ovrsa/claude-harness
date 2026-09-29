'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function runGit(args, cwd) {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function gitOutput(args, cwd) {
  const result = runGit(args, cwd);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(detail || `git ${args.join(' ')} failed`);
  }
  return String(result.stdout || '').trim();
}

function getGitRoot(repoPath) {
  return gitOutput(['-C', repoPath, 'rev-parse', '--show-toplevel'], process.cwd());
}

function safeBranchPart(value, fallback) {
  const safe = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return safe || fallback;
}

function getBaseBranch(repoRoot) {
  const result = runGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], repoRoot);
  if (result.status === 0) return String(result.stdout || '').trim();
  return 'HEAD';
}

function getBaseCommit(repoRoot) {
  return gitOutput(['rev-parse', 'HEAD'], repoRoot);
}

function hasGitDir(repoPath) {
  return fs.existsSync(path.join(repoPath, '.git'));
}

function prepareSharedClone({ sourceRepoRoot, runDir, runId, taskId, appendEvent }) {
  const sourceRoot = getGitRoot(sourceRepoRoot);
  const baseBranch = getBaseBranch(sourceRoot);
  const baseCommit = getBaseCommit(sourceRoot);
  const clonePath = path.join(runDir, 'workspace');
  const branch = `claude/${safeBranchPart(taskId, 'task')}/${safeBranchPart(runId, 'run')}`;
  const occurredAt = new Date().toISOString();

  if (hasGitDir(clonePath)) {
    if (appendEvent) {
      appendEvent({
        type: 'clone_reused',
        occurred_at: occurredAt,
        source_repo_root: sourceRoot,
        clone_path: clonePath,
        branch,
        base_branch: baseBranch,
        base_commit: baseCommit,
      });
    }
    return {
      sourceRepoRoot: sourceRoot,
      clonePath,
      branch,
      baseBranch,
      baseCommit,
      reused: true,
    };
  }

  fs.mkdirSync(path.dirname(clonePath), { recursive: true });
  const clone = runGit(['clone', '--shared', sourceRoot, clonePath], process.cwd());
  if (clone.status !== 0) {
    const detail = (clone.stderr || clone.stdout || '').trim();
    throw new Error(detail || 'git clone --shared failed');
  }

  const checkout = runGit(['checkout', '-B', branch, baseCommit], clonePath);
  if (checkout.status !== 0) {
    const detail = (checkout.stderr || checkout.stdout || '').trim();
    throw new Error(detail || `git checkout -B ${branch} failed`);
  }

  if (appendEvent) {
    appendEvent({
      type: 'clone_created',
      occurred_at: occurredAt,
      source_repo_root: sourceRoot,
      clone_path: clonePath,
      branch,
      base_branch: baseBranch,
      base_commit: baseCommit,
    });
  }

  return {
    sourceRepoRoot: sourceRoot,
    clonePath,
    branch,
    baseBranch,
    baseCommit,
    reused: false,
  };
}

function summarizeCloneDiff(clonePath) {
  const status = gitOutput(['status', '--short'], clonePath);
  const stat = gitOutput(['diff', '--stat'], clonePath);
  return {
    status,
    stat,
  };
}

function ensureCleanSource(sourceRepoRoot) {
  const status = gitOutput(['status', '--short'], sourceRepoRoot);
  if (status) {
    throw new Error(`source repo has uncommitted changes:\n${status}`);
  }
}

function getClonePatch(clonePath, baseCommit) {
  const result = runGit(['diff', '--binary', baseCommit || 'HEAD'], clonePath);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(detail || 'git diff --binary failed');
  }
  const patches = [String(result.stdout || '')];
  const untracked = runGit(['ls-files', '--others', '--exclude-standard', '-z'], clonePath);
  if (untracked.status !== 0) {
    const detail = (untracked.stderr || untracked.stdout || '').trim();
    throw new Error(detail || 'git ls-files --others failed');
  }
  const files = String(untracked.stdout || '')
    .split('\0')
    .filter(Boolean);
  for (const file of files) {
    const addPatch = runGit(['diff', '--binary', '--no-index', '--', '/dev/null', file], clonePath);
    if (addPatch.status !== 0 && addPatch.status !== 1) {
      const detail = (addPatch.stderr || addPatch.stdout || '').trim();
      throw new Error(detail || `git diff --no-index failed for ${file}`);
    }
    patches.push(String(addPatch.stdout || ''));
  }
  return patches.filter(Boolean).join('\n');
}

function applyPatchCheck(sourceRepoRoot, patch) {
  const result = spawnSync('git', ['apply', '--check', '--whitespace=nowarn', '-'], {
    cwd: sourceRepoRoot,
    encoding: 'utf8',
    input: patch,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(detail || 'git apply --check failed');
  }
}

function applyPatch(sourceRepoRoot, patch) {
  const result = spawnSync('git', ['apply', '--whitespace=nowarn', '-'], {
    cwd: sourceRepoRoot,
    encoding: 'utf8',
    input: patch,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(detail || 'git apply failed');
  }
}

function checkCloneMerge({ clonePath, sourceRepoRoot, baseCommit }) {
  if (!clonePath || !fs.existsSync(clonePath)) {
    throw new Error(`clone path is missing: ${clonePath || ''}`);
  }
  const sourceRoot = getGitRoot(sourceRepoRoot);
  ensureCleanSource(sourceRoot);
  const patch = getClonePatch(clonePath, baseCommit);
  if (patch.trim()) {
    applyPatchCheck(sourceRoot, patch);
  }
  return {
    sourceRepoRoot: sourceRoot,
    patchBytes: Buffer.byteLength(patch),
    status: 'mergeable',
  };
}

function mergeCloneChanges({ clonePath, sourceRepoRoot, baseCommit }) {
  const check = checkCloneMerge({ clonePath, sourceRepoRoot, baseCommit });
  if (check.patchBytes > 0) {
    applyPatch(check.sourceRepoRoot, getClonePatch(clonePath, baseCommit));
  }
  return {
    ...check,
    status: 'merged',
  };
}

function deleteCloneWorkspace(clonePath) {
  if (!clonePath || !fs.existsSync(clonePath)) {
    return { status: 'already-deleted' };
  }
  fs.rmSync(clonePath, { recursive: true, force: true });
  return { status: 'deleted' };
}

module.exports = {
  checkCloneMerge,
  deleteCloneWorkspace,
  getGitRoot,
  mergeCloneChanges,
  prepareSharedClone,
  summarizeCloneDiff,
};
