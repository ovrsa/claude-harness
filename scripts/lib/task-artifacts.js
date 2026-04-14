'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ARTIFACT_FILES = [
  'research.md',
  'plan.md',
  'progress.md',
  'review-summary.md',
  'verification-summary.md',
  'observation-summary.md',
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

function parseMarkdownSections(content) {
  const sections = {};
  let current = null;

  for (const line of String(content || '').split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = heading[1].trim();
      sections[current] = [];
      continue;
    }
    if (current) {
      sections[current].push(line);
    }
  }

  return sections;
}

function normalizeSectionLine(line) {
  return String(line || '')
    .replace(/^- \[[xX ]\]\s*/, '')
    .replace(/^- /, '')
    .trim();
}

function firstSectionValue(lines) {
  for (const line of lines || []) {
    const normalized = normalizeSectionLine(line);
    if (normalized) return normalized;
  }
  return '';
}

function listSectionValues(lines) {
  return (lines || [])
    .map(normalizeSectionLine)
    .filter(Boolean)
    .filter(line => !/^none$/i.test(line));
}

function parseProgressState(content) {
  const sections = parseMarkdownSections(content);

  return {
    currentPhase: firstSectionValue(sections['Current Phase']),
    lastCompletedStep: firstSectionValue(sections['Last Completed Step']),
    nextAction: firstSectionValue(sections['Next Action']),
    blockers: listSectionValues(sections.Blockers),
    delegatedWork: listSectionValues(sections['Delegated Work']),
  };
}

function summarizeSectionStatus(sections, requiredHeadings) {
  const missingSections = requiredHeadings.filter(heading => !Object.prototype.hasOwnProperty.call(sections, heading));
  return {
    missingSections,
    complete: missingSections.length === 0,
  };
}

function parseReviewState(content) {
  const sections = parseMarkdownSections(content);
  const status = summarizeSectionStatus(sections, [
    'Review Scope',
    'Findings',
    'Residual Risks',
    'Next Action',
  ]);

  return {
    reviewScope: listSectionValues(sections['Review Scope']),
    findings: listSectionValues(sections.Findings),
    residualRisks: listSectionValues(sections['Residual Risks']),
    nextAction: firstSectionValue(sections['Next Action']),
    ...status,
  };
}

function parseObservationState(content) {
  const sections = parseMarkdownSections(content);
  const status = summarizeSectionStatus(sections, [
    'Behavior Checked',
    'Method',
    'Evidence',
    'Remaining Uncertainty',
  ]);

  return {
    behaviorChecked: listSectionValues(sections['Behavior Checked']),
    method: listSectionValues(sections.Method),
    evidence: listSectionValues(sections.Evidence),
    remainingUncertainty: listSectionValues(sections['Remaining Uncertainty']),
    ...status,
  };
}

function defaultSessionState() {
  return {
    currentPhase: '',
    lastCompletedStep: '',
    nextAction: '',
    blockers: [],
    delegatedWork: [],
  };
}

function formatListValue(values) {
  return values && values.length > 0 ? values.join('; ') : 'none';
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
        review_required: meta.review_required || '',
        review_state: entry.name === 'review-summary.md' ? parseReviewState(content) : null,
        observation_state: entry.name === 'observation-summary.md' ? parseObservationState(content) : null,
        progress_state: entry.name === 'progress.md' ? parseProgressState(content) : null,
        preview,
      };
    });
}

function buildLifecycleState(artifacts) {
  const plan = findArtifactByName(artifacts, 'plan.md');
  const review = findArtifactByName(artifacts, 'review-summary.md');
  const verification = findArtifactByName(artifacts, 'verification-summary.md');
  const observation = findArtifactByName(artifacts, 'observation-summary.md');
  const progress = findArtifactByName(artifacts, 'progress.md');

  const observeRequired = Boolean(plan && /true/i.test(String(plan.observe_required || '')));
  const reviewRequired = Boolean(plan && (/true/i.test(String(plan.review_required || '')) || observeRequired));
  const sessionState = progress && progress.progress_state
    ? progress.progress_state
    : defaultSessionState();
  const blocked = [];

  if (!plan) {
    blocked.push('missing plan.md');
  } else if (plan.status && plan.status !== 'approved') {
    blocked.push(`plan.md status=${plan.status}`);
  }

  if (!verification) {
    blocked.push('missing verification-summary.md');
  }

  if (reviewRequired) {
    if (!review) {
      blocked.push('missing review-summary.md');
    } else if (review.review_state && !review.review_state.complete) {
      blocked.push(`incomplete review-summary.md: missing ${review.review_state.missingSections.join(', ')}`);
    }
  }

  if (observeRequired && !observation) {
    blocked.push('missing observation-summary.md');
  } else if (observeRequired && observation && observation.observation_state && !observation.observation_state.complete) {
    blocked.push(`incomplete observation-summary.md: missing ${observation.observation_state.missingSections.join(', ')}`);
  }

  return {
    planStatus: plan ? (plan.status || 'unknown') : 'missing',
    reviewRequired,
    observeRequired,
    hasReview: Boolean(review),
    hasVerification: Boolean(verification),
    hasObservation: Boolean(observation),
    progressPresent: Boolean(progress),
    sessionState,
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
  lines.push(`- review_required=${state.reviewRequired}`);
  lines.push(`- observe_required=${state.observeRequired}`);
  lines.push(`- review_present=${state.hasReview}`);
  lines.push(`- verification_present=${state.hasVerification}`);
  lines.push(`- observation_present=${state.hasObservation}`);
  lines.push(`- progress_present=${state.progressPresent}`);
  lines.push(`- blocked=${state.blocked.length > 0 ? state.blocked.join(', ') : 'none'}`);
  if (state.progressPresent) {
    lines.push('Session state:');
    lines.push(`- current_phase=${state.sessionState.currentPhase || 'unknown'}`);
    lines.push(`- last_completed_step=${state.sessionState.lastCompletedStep || 'unknown'}`);
    lines.push(`- next_action=${state.sessionState.nextAction || 'unknown'}`);
    lines.push(`- blockers=${formatListValue(state.sessionState.blockers)}`);
    lines.push(`- delegated_work=${formatListValue(state.sessionState.delegatedWork)}`);
  }

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
  lines.push(`- review_required=${state.reviewRequired}`);
  lines.push(`- observe_required=${state.observeRequired}`);
  lines.push(`- review_present=${state.hasReview}`);
  lines.push(`- verification_present=${state.hasVerification}`);
  lines.push(`- observation_present=${state.hasObservation}`);
  lines.push(`- progress_present=${state.progressPresent}`);
  lines.push(`- blocked=${state.blocked.length > 0 ? state.blocked.join(', ') : 'none'}`);
  if (state.progressPresent) {
    lines.push('### Session State');
    lines.push(`- current_phase=${state.sessionState.currentPhase || 'unknown'}`);
    lines.push(`- last_completed_step=${state.sessionState.lastCompletedStep || 'unknown'}`);
    lines.push(`- next_action=${state.sessionState.nextAction || 'unknown'}`);
    lines.push(`- blockers=${formatListValue(state.sessionState.blockers)}`);
    lines.push(`- delegated_work=${formatListValue(state.sessionState.delegatedWork)}`);
  }
  return lines.join('\n');
}

module.exports = {
  ARTIFACT_FILES,
  getRepoRoot,
  findTaskArtifacts,
  buildArtifactContext,
  buildArtifactSnapshot,
  buildLifecycleState,
  parseProgressState,
  parseReviewState,
  parseObservationState,
};
