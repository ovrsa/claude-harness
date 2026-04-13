'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ARTIFACT_FILES = [
  'research.md',
  'plan.md',
  'verification-summary.md',
  'observation-summary.md',
  'progress.md',
];

function findArtifactByName(artifacts, name) {
  return artifacts.find(artifact => artifact.name === name) || null;
}

function getRepoRoot(cwd = process.cwd()) {
  try {
    const result = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (result.status !== 0) return null;
    return String(result.stdout || '').trim() || null;
  } catch {
    return null;
  }
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  const meta = {};
  if (!match) return meta;

  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }

  return meta;
}

function buildPreview(content, maxLines = 3) {
  const lines = content.split(/\r?\n/);
  const preview = [];
  let inFrontmatter = false;
  let frontmatterClosed = false;

  for (const line of lines) {
    if (!frontmatterClosed && line.trim() === '---') {
      inFrontmatter = !inFrontmatter;
      if (!inFrontmatter) frontmatterClosed = true;
      continue;
    }
    if (inFrontmatter) continue;
    const trimmed = line.trim();
    if (!trimmed) continue;
    preview.push(trimmed);
    if (preview.length >= maxLines) break;
  }

  return preview;
}

function findTaskArtifacts(repoRoot) {
  if (!repoRoot) return [];

  return ARTIFACT_FILES
    .map(name => ({ name, path: path.join(repoRoot, name) }))
    .filter(entry => fs.existsSync(entry.path))
    .map(entry => {
      const content = fs.readFileSync(entry.path, 'utf8');
      const meta = parseFrontmatter(content);
      const preview = buildPreview(content);
      return {
        ...entry,
        title: meta.title || '',
        status: meta.status || '',
        observe_required: meta.observe_required || '',
        preview,
      };
    });
}

function buildLifecycleState(artifacts) {
  const plan = findArtifactByName(artifacts, 'plan.md');
  const verification = findArtifactByName(artifacts, 'verification-summary.md');
  const observation = findArtifactByName(artifacts, 'observation-summary.md');
  const progress = findArtifactByName(artifacts, 'progress.md');

  const observeRequired = Boolean(plan && /true/i.test(String(plan.observe_required || '')));
  const blocked = [];

  if (!plan) {
    blocked.push('missing plan.md');
  } else if (plan.status && plan.status !== 'approved') {
    blocked.push(`plan.md status=${plan.status}`);
  }

  if (!verification) {
    blocked.push('missing verification-summary.md');
  }

  if (observeRequired && !observation) {
    blocked.push('missing observation-summary.md');
  }

  return {
    planStatus: plan ? (plan.status || 'unknown') : 'missing',
    observeRequired,
    hasVerification: Boolean(verification),
    hasObservation: Boolean(observation),
    progressPresent: Boolean(progress),
    blocked,
  };
}

function buildArtifactContext(repoRoot) {
  const artifacts = findTaskArtifacts(repoRoot);
  if (artifacts.length === 0) return null;

  const lines = ['Active repository task artifacts:'];
  for (const artifact of artifacts) {
    const parts = [`- ${artifact.name}`];
    if (artifact.title) parts.push(`title=${artifact.title}`);
    if (artifact.status) parts.push(`status=${artifact.status}`);
    lines.push(parts.join(' | '));
    for (const line of artifact.preview) {
      lines.push(`  ${line}`);
    }
  }

  const state = buildLifecycleState(artifacts);
  lines.push('Lifecycle state:');
  lines.push(`- plan_status=${state.planStatus}`);
  lines.push(`- observe_required=${state.observeRequired}`);
  lines.push(`- verification_present=${state.hasVerification}`);
  lines.push(`- observation_present=${state.hasObservation}`);
  lines.push(`- progress_present=${state.progressPresent}`);
  lines.push(`- blocked=${state.blocked.length > 0 ? state.blocked.join(', ') : 'none'}`);

  return lines.join('\n');
}

function buildArtifactSnapshot(repoRoot) {
  const artifacts = findTaskArtifacts(repoRoot);
  if (artifacts.length === 0) return null;

  const lines = ['### Artifact Snapshot'];
  for (const artifact of artifacts) {
    const parts = [`- ${artifact.name}`];
    if (artifact.status) parts.push(`status=${artifact.status}`);
    if (artifact.title) parts.push(`title=${artifact.title}`);
    lines.push(parts.join(' | '));
  }
  const state = buildLifecycleState(artifacts);
  lines.push('### Lifecycle State');
  lines.push(`- plan_status=${state.planStatus}`);
  lines.push(`- observe_required=${state.observeRequired}`);
  lines.push(`- verification_present=${state.hasVerification}`);
  lines.push(`- observation_present=${state.hasObservation}`);
  lines.push(`- progress_present=${state.progressPresent}`);
  lines.push(`- blocked=${state.blocked.length > 0 ? state.blocked.join(', ') : 'none'}`);
  return lines.join('\n');
}

module.exports = {
  ARTIFACT_FILES,
  getRepoRoot,
  findTaskArtifacts,
  buildArtifactContext,
  buildArtifactSnapshot,
  buildLifecycleState,
};
