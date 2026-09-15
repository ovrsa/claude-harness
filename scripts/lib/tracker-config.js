'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CONFIG_PATH = path.join('.claude', 'tracker.json');
const HOSTED_REMOTE = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^@/]+@)?(github\.com|gitlab\.com)[:/](.+?)(?:\.git)?\/?$/i;
// The repo ends up in API paths such as repos/<owner>/<name>/issues, so "." and ".." are not names.
const GITHUB_REPO = /^[\w-]+\/(?!\.\.?$)[\w.-]+$/;

function remoteUrls(repoRoot) {
  const output = execFileSync('git', ['-C', repoRoot, 'remote', '-v'], { encoding: 'utf8' });
  const byName = new Map();
  for (const line of output.split('\n')) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\(fetch\)$/);
    if (match) byName.set(match[1], match[2]);
  }
  const names = [...byName.keys()].sort((a, b) => (b === 'origin') - (a === 'origin'));
  return names.map(name => byName.get(name));
}

function candidateFromRemote(url) {
  const match = String(url).match(HOSTED_REMOTE);
  if (!match) return null;
  const [, host, location] = match;
  if (host.toLowerCase() === 'github.com') {
    return GITHUB_REPO.test(location) ? { kind: 'github', repo: location } : null;
  }
  return /^[\w.-]+(?:\/[\w.-]+)+$/.test(location) ? { kind: 'gitlab', project: location } : null;
}

function remoteCandidates(repoRoot) {
  const seen = new Set();
  const candidates = [];
  for (const url of remoteUrls(repoRoot)) {
    const candidate = candidateFromRemote(url);
    const key = JSON.stringify(candidate);
    if (!candidate || seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
  }
  return [...candidates, { kind: 'none' }];
}

function invalid(source, error) {
  return { status: 'invalid', source, tracker: null, design_doc: null, error };
}

/**
 * The declaration may be untracked, and a linked worktree only receives tracked files, so a
 * worktree without its own copy reads the main checkout's.
 */
function declarationPath(repoRoot) {
  const own = path.join(repoRoot, CONFIG_PATH);
  if (fs.existsSync(own)) return own;
  const commonDir = execFileSync('git', ['-C', repoRoot, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
  const mainCheckout = path.basename(commonDir) === '.git' ? path.join(path.dirname(commonDir), CONFIG_PATH) : null;
  return mainCheckout && fs.existsSync(mainCheckout) ? mainCheckout : null;
}

function resolveTracker(repoRoot) {
  const source = declarationPath(repoRoot);
  if (!source) {
    return { status: 'unconfigured', source: null, tracker: null, design_doc: null, expected_path: path.join(repoRoot, CONFIG_PATH), candidates: remoteCandidates(repoRoot) };
  }
  let tracker;
  try { tracker = JSON.parse(fs.readFileSync(source, 'utf8')); }
  catch (error) { return invalid(source, `tracker.json is not valid JSON: ${error.message}`); }
  if (!tracker || typeof tracker !== 'object' || Array.isArray(tracker)) return invalid(source, 'tracker.json must be a JSON object');
  if (typeof tracker.kind !== 'string' || !/^[a-z][a-z0-9-]*$/.test(tracker.kind)) {
    return invalid(source, 'kind must be a lowercase identifier such as "github", "linear", or "none"');
  }
  if (tracker.kind === 'none') return { status: 'none', source, tracker, design_doc: 'docs/design' };
  if (tracker.kind === 'github') {
    const repo = tracker.repo ?? (remoteCandidates(repoRoot).find(candidate => candidate.kind === 'github') || {}).repo;
    if (!GITHUB_REPO.test(String(repo))) {
      return invalid(source, 'repo must be "owner/name" for a github tracker, or a GitHub remote must exist');
    }
    return { status: 'configured', source, tracker: { ...tracker, repo }, design_doc: 'parent-issue' };
  }
  return { status: 'configured', source, tracker, design_doc: 'parent-issue' };
}

module.exports = { resolveTracker };
