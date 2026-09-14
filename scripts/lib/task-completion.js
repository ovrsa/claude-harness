'use strict';

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { execFileSync } = require('child_process');
const { findTaskArtifacts } = require('./task-artifacts');

const EVIDENCE_FILES = new Set(['research.md', 'review-summary.md', 'verification-summary.md', 'observation-summary.md']);
const FINISHING_FIELDS = {
  Refactoring: ['changed', 'unchanged', 'not-applicable'],
  Documents: ['changed', 'unchanged', 'not-applicable'],
  Comments: ['changed', 'unchanged', 'not-applicable'],
  Verification: ['passed'],
  Observation: ['recorded', 'not-required'],
};

function taskFingerprint(repoRoot) {
  const names = execFileSync('git', ['-C', repoRoot, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const hash = createHash('sha256');
  // Evidence and run telemetry change during acceptance; neither changes the work under review.
  for (const name of [...new Set(names.split('\0').filter(Boolean))].sort()) {
    if (EVIDENCE_FILES.has(name) || name.startsWith('runs/')) continue;
    const file = path.join(repoRoot, name);
    hash.update(`${name}\0`);
    let stat;
    try { stat = fs.lstatSync(file); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      hash.update('deleted\0');
      continue;
    }
    if (stat.isSymbolicLink()) hash.update(`symlink\0${fs.readlinkSync(file)}`);
    else if (stat.isFile()) hash.update(`${stat.mode & 0o111}\0`).update(fs.readFileSync(file));
    else throw new Error(`unsupported working-tree entry: ${name}`);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function finishingFields(content) {
  const clean = String(content).replace(/<!--[\s\S]*?-->/g, '');
  const section = clean.match(/^## Code Quality\s*\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/m);
  const fields = {};
  for (const line of (section ? section[1] : '').split(/\r?\n/)) {
    const match = line.match(/^- (Refactoring|Documents|Comments|Verification|Observation|Revision):\s*(.*?)\s*$/);
    if (!match) continue;
    // Duplicate declarations are ambiguous, including a pending line followed by a passed line.
    fields[match[1]] = Object.hasOwn(fields, match[1]) ? '' : match[2];
  }
  return fields;
}

function checkTaskCompletion(repoRoot) {
  const issues = [];
  const artifacts = findTaskArtifacts(repoRoot);
  const review = artifacts.find(a => a.name === 'review-summary.md');
  const verification = artifacts.find(a => a.name === 'verification-summary.md');
  const observation = artifacts.find(a => a.name === 'observation-summary.md');
  if (!review) issues.push('missing review-summary.md');
  else {
    if (!review.review_state.complete) issues.push(`incomplete review-summary.md: ${[...review.review_state.missingSections, ...review.review_state.missingValues, ...review.review_state.invalidFindings].join(', ')}`);
    if (review.review_state.hasBlockingFindings) issues.push('review-summary.md: unresolved CRITICAL/HIGH findings');
    if (review.review_state.nextAction !== 'none') issues.push('review-summary.md: Next Action must be none before completion');
    const fields = finishingFields(fs.readFileSync(review.path, 'utf8'));
    for (const [name, statuses] of Object.entries(FINISHING_FIELDS)) {
      const match = String(fields[name] || '').match(/^([^|]+)\|\s*(.+)$/);
      if (!match || !statuses.includes(match[1].trim()) || /^(?:none|n\/a|todo|tbd|<[^>]*>|\[[^\]]*\])$/i.test(match[2].trim())) {
        issues.push(`Code Quality / ${name}: record an allowed status and a concrete target/reason`);
      }
    }
    if (fields.Revision !== taskFingerprint(repoRoot)) issues.push('Code Quality / Revision: work changed or fingerprint missing; finish and verify the current diff again');
    if (String(fields.Observation || '').startsWith('recorded') && !observation) issues.push('missing observation-summary.md');
  }
  if (!verification) issues.push('missing verification-summary.md');
  else if (!verification.verification_state.complete) issues.push('incomplete verification-summary.md');
  if (observation && !observation.observation_state.complete) issues.push('incomplete observation-summary.md');
  return { ready: issues.length === 0, issues };
}

module.exports = { checkTaskCompletion, taskFingerprint };
