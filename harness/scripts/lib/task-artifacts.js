'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseGuardrailCandidates } = require('./guardrail-candidates');

// plan.md and progress.md were retired 2026-08-17 and left the scan on
// 2026-08-20: nothing routed on them any more, so listing them only made a
// stray copy look like part of the chain.
const ARTIFACT_FILES = [
  'research.md',
  'review-summary.md',
  'verification-summary.md',
  'observation-summary.md',
];

const REVIEW_FINDING_PATTERN = /^(CRITICAL|HIGH|MEDIUM|LOW|INFO)\s*:\s+(.+)$/i;
/** Severities that hold the chain. MEDIUM and below are recorded, not blocking. */
const BLOCKING_SEVERITIES = new Set(['CRITICAL', 'HIGH']);
const OBSERVATION_EVIDENCE_SOURCE_PATTERN = /\b(browser|screenshot|log|logs|stderr|stdout|trace|traces|metric|metrics|health|process)\b/i;
/**
 * Every section the template defines, not just the four the chain reads.
 *
 * Until 2026-08-21 this was Review Scope / Findings / Residual Risks / Next
 * Action, so `Security` and `Comment Adequacy` -- which record passes rather
 * than prose -- could be dropped without anything noticing. All six captured
 * reviews happened to carry them, but that was the template's doing, not a
 * check. Requiring the full set is what makes a skipped pass visible.
 *
 * Kept in step with `harness/templates/review-summary-template.md` by a test that
 * compares this list against the template's own headings.
 */
const REVIEW_REQUIRED_HEADINGS = [
  'Review Scope',
  'Design Compliance',
  'Security',
  'Comment Adequacy',
  'Code Quality',
  'Test Adequacy',
  'Findings',
  'Residual Risks',
  'Guardrail Candidates',
  'Next Action',
];
const PLAN_REQUIRED_HEADINGS = [
  'Summary',
  'Acceptance Criteria',
  'Touched Files',
  'Behavior Spec',
  'Verify',
  'Test Evidence Plan',
  'Evaluate',
  'Observe',
  'Execution Todo',
];
const LIFECYCLE_CHAIN_LABELS = {
  research: 'Research artifact',
  implementation: 'Implementation batch',
  verification: 'Verification evidence',
  review: 'Review evidence',
  observation: 'Observation evidence',
  completion: 'Completion-ready artifact chain',
};
function findArtifactByName(artifacts, name) {
  return artifacts.find(artifact => artifact.name === name) || null;
}

function makeLifecycleStep(id, status, summary, artifact = '') {
  return {
    id,
    label: LIFECYCLE_CHAIN_LABELS[id] || id,
    status,
    artifact,
    summary,
  };
}

function firstOpenLifecycleStep(chain) {
  return chain.find(step => step.status === 'blocked' || step.status === 'pending' || step.status === 'active') || null;
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

function parseSectionState(lines) {
  const rawValues = (lines || [])
    .map(normalizeSectionLine)
    .filter(Boolean);
  const values = rawValues.filter(line => !/^none$/i.test(line));
  return {
    rawValues,
    values,
    firstValue: values[0] || '',
    hasEntries: rawValues.length > 0,
    explicitNone: rawValues.some(line => /^none$/i.test(line)),
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
  const sections = parseMarkdownSections(String(content || '').replace(/<!--[\s\S]*?-->/g, ''));
  const status = summarizeSectionStatus(sections, REVIEW_REQUIRED_HEADINGS);
  const reviewScopeState = parseSectionState(sections['Review Scope']);
  const findingsState = parseSectionState(sections.Findings);
  const residualRiskState = parseSectionState(sections['Residual Risks']);
  const nextActionState = parseSectionState(sections['Next Action']);
  const guardrailCandidatesState = parseGuardrailCandidates(sections['Guardrail Candidates']);
  const parsedFindings = findingsState.values
    .map(line => {
      const match = line.match(REVIEW_FINDING_PATTERN);
      return match
        ? {
            severity: match[1].toUpperCase(),
            message: match[2].trim(),
            raw: line,
          }
        : null;
    })
    .filter(Boolean);
  // Only the top two severities hold the chain. This was `parsedFindings`
  // wholesale, so an `INFO: nothing blocking` line blocked the chain -- unnoticed
  // because the consumer sat behind `if (reviewRequired)`, false since
  // 2026-08-17. `Findings` lists what is still unresolved; a fixed defect
  // belongs in the body, not here.
  const blockingFindings = parsedFindings
    .filter(finding => BLOCKING_SEVERITIES.has(finding.severity));
  const invalidFindings = findingsState.values.filter(line => !REVIEW_FINDING_PATTERN.test(line));
  const missingValues = [];
  if (!reviewScopeState.hasEntries) missingValues.push('Review Scope');
  if (!findingsState.hasEntries) missingValues.push('Findings');
  if (!residualRiskState.hasEntries) missingValues.push('Residual Risks');
  if (!nextActionState.hasEntries) missingValues.push('Next Action');
  for (const heading of ['Design Compliance', 'Security', 'Comment Adequacy', 'Code Quality', 'Test Adequacy']) {
    if (sections[heading] && !parseSectionState(sections[heading]).values.some(value => !/^(?:-|[^:]+:\s*)$/.test(value))) {
      missingValues.push(heading);
    }
  }
  const complete = status.complete && missingValues.length === 0 && invalidFindings.length === 0;

  return {
    reviewScope: reviewScopeState.values,
    findings: findingsState.values,
    residualRisks: residualRiskState.values,
    nextAction: nextActionState.explicitNone ? 'none' : nextActionState.firstValue,
    guardrailCandidates: guardrailCandidatesState.candidates,
    guardrailCandidateWarnings: guardrailCandidatesState.warnings,
    parsedFindings,
    invalidFindings,
    missingValues,
    blockingFindings,
    hasBlockingFindings: blockingFindings.length > 0,
    ...status,
    complete,
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
  const behaviorCheckedState = parseSectionState(sections['Behavior Checked']);
  const methodState = parseSectionState(sections.Method);
  const evidenceState = parseSectionState(sections.Evidence);
  const remainingUncertaintyState = parseSectionState(sections['Remaining Uncertainty']);
  const guardrailCandidatesState = parseGuardrailCandidates(sections['Guardrail Candidates']);
  const concreteEvidenceLines = [
    ...methodState.values,
    ...evidenceState.values,
  ].filter(line => OBSERVATION_EVIDENCE_SOURCE_PATTERN.test(line));
  const missingValues = [];
  if (!behaviorCheckedState.hasEntries) missingValues.push('Behavior Checked');
  if (!methodState.hasEntries) missingValues.push('Method');
  if (!evidenceState.hasEntries) missingValues.push('Evidence');
  if (!remainingUncertaintyState.hasEntries) missingValues.push('Remaining Uncertainty');
  const complete =
    status.complete &&
    missingValues.length === 0 &&
    concreteEvidenceLines.length > 0;

  return {
    behaviorChecked: behaviorCheckedState.values,
    method: methodState.values,
    evidence: evidenceState.values,
    remainingUncertainty: remainingUncertaintyState.values,
    guardrailCandidates: guardrailCandidatesState.candidates,
    guardrailCandidateWarnings: guardrailCandidatesState.warnings,
    missingValues,
    concreteEvidenceLines,
    hasConcreteEvidence: concreteEvidenceLines.length > 0,
    ...status,
    complete,
  };
}

function parseVerificationState(content) {
  const sections = parseMarkdownSections(content);
  const status = summarizeSectionStatus(sections, [
    'Scope',
    'Commands Run',
    'Verification Outcome',
    'Assessment',
  ]);
  const scopeState = parseSectionState(sections.Scope);
  const commandsRunState = parseSectionState(sections['Commands Run']);
  const verificationOutcomeState = parseSectionState(sections['Verification Outcome']);
  const assessmentState = parseSectionState(sections.Assessment);
  const guardrailCandidatesState = parseGuardrailCandidates(sections['Guardrail Candidates']);
  const missingValues = [];
  if (!scopeState.hasEntries) missingValues.push('Scope');
  if (!commandsRunState.hasEntries) missingValues.push('Commands Run');
  if (!verificationOutcomeState.hasEntries) missingValues.push('Verification Outcome');
  if (!assessmentState.hasEntries) missingValues.push('Assessment');
  const complete = status.complete && missingValues.length === 0;

  return {
    scope: scopeState.values,
    commandsRun: commandsRunState.values,
    verificationOutcome: verificationOutcomeState.values,
    assessment: assessmentState.values,
    guardrailCandidates: guardrailCandidatesState.candidates,
    guardrailCandidateWarnings: guardrailCandidatesState.warnings,
    missingValues,
    ...status,
    complete,
  };
}

function parsePlanState(content) {
  const sections = parseMarkdownSections(content);
  const status = summarizeSectionStatus(sections, PLAN_REQUIRED_HEADINGS);
  const missingValues = [];
  const requiredSectionStates = {};

  for (const heading of PLAN_REQUIRED_HEADINGS) {
    const sectionState = parseSectionState(sections[heading]);
    requiredSectionStates[heading] = sectionState;
    if (!sectionState.hasEntries) missingValues.push(heading);
  }

  const behaviorSpec = sections['Behavior Spec'] || [];
  const testEvidencePlan = sections['Test Evidence Plan'] || [];
  const executionTodo = sections['Execution Todo'] || [];
  const raw = String(content || '');
  const hasGivenWhenThen =
    /\bGiven\b/i.test(behaviorSpec.join('\n')) &&
    /\bWhen\b/i.test(behaviorSpec.join('\n')) &&
    /\bThen\b/i.test(behaviorSpec.join('\n'));
  const hasCaseCoverage =
    /\bnormal\b/i.test(behaviorSpec.join('\n')) &&
    /\bboundary\b/i.test(behaviorSpec.join('\n')) &&
    /\babnormal\b/i.test(behaviorSpec.join('\n'));
  const hasTddEvidencePlan =
    /\bRED command\b/i.test(testEvidencePlan.join('\n')) &&
    /\bexpected failure\b/i.test(testEvidencePlan.join('\n')) &&
    /\bGREEN command\b/i.test(testEvidencePlan.join('\n'));
  const hasExecutionCheckboxes = executionTodo.some(line => /- \[[ xX]\]/.test(line));
  const hasApproval = parseFrontmatter(raw).status === 'approved';
  const complete =
    status.complete &&
    missingValues.length === 0 &&
    hasGivenWhenThen &&
    hasCaseCoverage &&
    hasTddEvidencePlan &&
    hasExecutionCheckboxes;

  return {
    missingValues,
    requiredSectionStates,
    hasGivenWhenThen,
    hasCaseCoverage,
    hasTddEvidencePlan,
    hasExecutionCheckboxes,
    hasApproval,
    ...status,
    complete,
  };
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
        // task_type / worktree_required / observe_required / review_required were
        // plan.md front matter. plan.md is no longer scanned, so they would be
        // '' on every artifact -- a field that reports a constant.
        review_state: entry.name === 'review-summary.md' ? parseReviewState(content) : null,
        observation_state: entry.name === 'observation-summary.md' ? parseObservationState(content) : null,
        verification_state: entry.name === 'verification-summary.md' ? parseVerificationState(content) : null,
        preview,
      };
    });
}

/**
 * The gate chain, derived from the artifacts on disk.
 *
 * Until 2026-08-20 every routing flag came from plan.md's front matter:
 *
 *   observe_required / review_required / worktree_required / task_type
 *
 * plan.md was retired on 2026-08-17, so all four went permanently false and the
 * review and observation gates reported "not required by plan metadata" on
 * every run -- while nextRequiredAction told each session to "create plan.md".
 * The requirement is now derived from verification-summary.md: if the work was
 * implemented and verified, the later gates are owed. A read-only
 * investigation has no verification evidence and is owed nothing, because an
 * advisory that always fires stops being read.
 *
 * See docs/design/2026-08-20-lifecycle-without-plan.md.
 */
function buildLifecycleState(artifacts) {
  const review = findArtifactByName(artifacts, 'review-summary.md');
  const verification = findArtifactByName(artifacts, 'verification-summary.md');
  const observation = findArtifactByName(artifacts, 'observation-summary.md');
  const research = findArtifactByName(artifacts, 'research.md');

  // Verification evidence is the signal that something was built. observe is
  // held to the same condition as review: CLAUDE.md says "when behavior
  // changed", which is not derivable from disk, so this over-asks rather than
  // under-asks.
  const reviewRequired = Boolean(verification);
  const observeRequired = Boolean(verification);

  const blocked = [];
  const chain = [];

  // Optional at every task weight since 2026-08-12. research.md had no parser, so `pending` here
  // was asking for a file that an empty placeholder would satisfy, and its content duplicated the
  // design doc. Recognized when present; never requested.
  chain.push(makeLifecycleStep(
    'research',
    research ? 'complete' : 'skipped',
    research ? 'research.md present' : 'optional; findings belong in docs/design/ when they need to survive',
    'research.md'
  ));

  // No artifact of its own: docs/design/ holds the decisions and
  // findTaskArtifacts does not scan directories. The step survives because its
  // summary says what to do next, which the verification step does not.
  chain.push(makeLifecycleStep(
    'implementation',
    verification ? 'complete' : 'pending',
    verification
      ? 'implementation has verification evidence'
      : 'execute the design doc in small TDD batches',
    ''
  ));

  let verificationStatus = 'pending';
  let verificationSummary = 'write verification-summary.md with rerunnable command evidence';
  if (!verification) {
    blocked.push('missing verification-summary.md');
  } else if (verification.verification_state && !verification.verification_state.complete) {
    verificationStatus = 'blocked';
    verificationSummary = 'verification-summary.md incomplete';
    blocked.push(`incomplete verification-summary.md: missing ${verification.verification_state.missingSections.join(', ')}`);
  } else {
    verificationStatus = 'complete';
    verificationSummary = 'verification-summary.md complete';
  }
  chain.push(makeLifecycleStep('verification', verificationStatus, verificationSummary, 'verification-summary.md'));

  // Unresolved findings are checked whether or not review was owed. The check
  // used to sit inside `if (reviewRequired)`, so from 2026-08-17 a
  // review-summary.md carrying an unresolved CRITICAL reported nothing at all.
  const reviewHasBlockingFindings = Boolean(review && review.review_state && review.review_state.hasBlockingFindings);
  if (reviewHasBlockingFindings) {
    blocked.push('review-summary.md still has unresolved findings');
  }

  if (review && review.review_state && !review.review_state.complete) {
    blocked.push(`incomplete review-summary.md: ${[...review.review_state.missingSections, ...(review.review_state.missingValues || []), ...(review.review_state.invalidFindings || [])].join(', ')}`);
    chain.push(makeLifecycleStep('review', 'blocked', 'review-summary.md incomplete', 'review-summary.md'));
  } else if (reviewHasBlockingFindings) {
    chain.push(makeLifecycleStep('review', 'blocked', 'review-summary.md has unresolved findings', 'review-summary.md'));
  } else if (review) {
    chain.push(makeLifecycleStep('review', 'complete', 'review-summary.md complete', 'review-summary.md'));
  } else if (reviewRequired) {
    blocked.push('missing review-summary.md');
    chain.push(makeLifecycleStep('review', 'pending', 'write review-summary.md', 'review-summary.md'));
  } else {
    chain.push(makeLifecycleStep('review', 'skipped', 'nothing implemented yet', 'review-summary.md'));
  }

  if (observation && observation.observation_state && !observation.observation_state.complete) {
    const details = [];
    if (observation.observation_state.missingSections.length > 0) {
      details.push(`missing sections ${observation.observation_state.missingSections.join(', ')}`);
    }
    if (observation.observation_state.missingValues.length > 0) {
      details.push(`empty sections ${observation.observation_state.missingValues.join(', ')}`);
    }
    if (!observation.observation_state.hasConcreteEvidence) {
      details.push('no concrete evidence source');
    }
    blocked.push(`incomplete observation-summary.md: ${details.join(' | ')}`);
    chain.push(makeLifecycleStep('observation', 'blocked', `observation-summary.md incomplete: ${details.join(' | ')}`, 'observation-summary.md'));
  } else if (observation) {
    chain.push(makeLifecycleStep('observation', 'complete', 'observation-summary.md complete', 'observation-summary.md'));
  } else if (observeRequired) {
    blocked.push('missing observation-summary.md');
    chain.push(makeLifecycleStep('observation', 'pending', 'write observation-summary.md with runtime evidence', 'observation-summary.md'));
  } else {
    chain.push(makeLifecycleStep('observation', 'skipped', 'nothing implemented yet', 'observation-summary.md'));
  }

  const completionStatus = blocked.length > 0 ? 'pending' : 'complete';
  chain.push(makeLifecycleStep(
    'completion',
    completionStatus,
    blocked.length > 0 ? 'chain has open gates before commit' : 'artifact chain is commit-ready',
    ''
  ));

  const currentStep = firstOpenLifecycleStep(chain);

  return {
    reviewRequired,
    observeRequired,
    hasReview: Boolean(review),
    hasVerification: Boolean(verification),
    hasObservation: Boolean(observation),
    hasResearch: Boolean(research),
    chain,
    currentStep,
    currentStepId: currentStep ? currentStep.id : 'complete',
    nextRequiredAction: currentStep ? currentStep.summary : 'none',
    blocked,
  };
}

function buildArtifactContext(repoRoot) {
  const artifacts = findTaskArtifacts(repoRoot);
  if (artifacts.length === 0) return null;

  const state = buildLifecycleState(artifacts);
  const artifactNames = artifacts.map(artifact => artifact.name).join(', ');
  const lines = ['Active repository task chain:'];
  lines.push(`- artifacts=${artifactNames}`);
  lines.push(`- review_required=${state.reviewRequired}`);
  lines.push(`- observe_required=${state.observeRequired}`);
  lines.push(`- current_step=${state.currentStepId}`);
  lines.push(`- next_required_action=${state.nextRequiredAction}`);
  lines.push(`- blocked=${state.blocked.length > 0 ? state.blocked.join(', ') : 'none'}`);
  lines.push('- detail=/chain-status');

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
  lines.push(`- review_required=${state.reviewRequired}`);
  lines.push(`- observe_required=${state.observeRequired}`);
  lines.push(`- review_present=${state.hasReview}`);
  lines.push(`- verification_present=${state.hasVerification}`);
  lines.push(`- observation_present=${state.hasObservation}`);
  lines.push(`- research_present=${state.hasResearch}`);
  lines.push(`- current_step=${state.currentStepId}`);
  lines.push(`- next_required_action=${state.nextRequiredAction}`);
  lines.push(`- blocked=${state.blocked.length > 0 ? state.blocked.join(', ') : 'none'}`);
  lines.push('### Lifecycle Chain');
  for (const step of state.chain) {
    lines.push(`- ${step.id}: ${step.status} | ${step.summary}`);
  }
  return lines.join('\n');
}

// progress.md の読み書きは全て撤去した（2026-08-20）。書き込み側は先に消えており、
// 最後の読み手だった buildLifecycleState が progress 段ごと無くなった。
// もう1つの利用者 session-trace.js も同日撤去済み。
//
// parsePlanState だけは残す。pipeline-runner.js が `--plan <path>` の入力として
// 直接呼ぶ。パイプラインの引数としての plan ファイルは、リポジトリ直下の
// ライフサイクル成果物とは別物。

module.exports = {
  getRepoRoot,
  findTaskArtifacts,
  buildArtifactContext,
  buildArtifactSnapshot,
  buildLifecycleState,
  parseReviewState,
  parseObservationState,
  parseVerificationState,
  parsePlanState,
  REVIEW_REQUIRED_HEADINGS,
};
