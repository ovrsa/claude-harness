'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseGuardrailCandidates } = require('./guardrail-candidates');

const ARTIFACT_FILES = [
  'research.md',
  'plan.md',
  'progress.md',
  'review-summary.md',
  'verification-summary.md',
  'observation-summary.md',
];

const PROGRESS_SECTION_LATEST_CHECKPOINT = 'Latest Checkpoint';
const PROGRESS_SECTION_LATEST_HANDOFF = 'Latest Delegated Handoff';
const REVIEW_FINDING_PATTERN = /^(CRITICAL|HIGH|MEDIUM|LOW|INFO)\s*:\s+(.+)$/i;
const OBSERVATION_EVIDENCE_SOURCE_PATTERN = /\b(browser|screenshot|log|logs|stderr|stdout|trace|traces|metric|metrics|health|process)\b/i;
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
  plan: 'Approved implementation-ready plan',
  progress: 'Execution session state',
  implementation: 'Implementation batch',
  verification: 'Verification evidence',
  review: 'Review evidence',
  observation: 'Observation evidence',
  completion: 'Completion-ready artifact chain',
};
const PROGRESS_PLANNING_PATTERNS = [
  /\bresearch\b/i,
  /\bplanning\b/i,
  /\bscoping\b/i,
  /\bapproval\b/i,
  /\bplan(?:ning)?\s+(?:review|approval|draft|drafting|pending|ready|state)\b/i,
];
const PROGRESS_EXECUTION_PATTERNS = [
  /\bimplement(?:ation)?\b/i,
  /\bexecut(?:e|ion)\b/i,
  /\bbuild\b/i,
  /\bfix\b/i,
  /\bverif(?:y|ication)\b/i,
  /\breview\b/i,
  /\bobserv(?:e|ation)\b/i,
];
const PROGRESS_COMPLETION_PATTERNS = [
  /\bdone\b/i,
  /\bcomplete(?:d)?\b/i,
  /\bfinished\b/i,
  /\bverified\b/i,
  /\bready to (?:finish|complete|commit)\b/i,
];

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

function parseDelimitedValues(rawValue, delimiterPattern) {
  const value = String(rawValue || '').trim();
  if (!value || /^none$/i.test(value)) return [];
  return value
    .split(delimiterPattern)
    .map(part => part.trim())
    .filter(Boolean)
    .filter(part => !/^none$/i.test(part));
}

function parseKeyValueSection(lines) {
  const keyValues = {};
  for (const line of parseSectionState(lines).rawValues) {
    if (/^none$/i.test(line)) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    keyValues[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return keyValues;
}

function parseProgressAutomationState(content) {
  const sections = parseMarkdownSections(content);
  const checkpoint = parseKeyValueSection(sections[PROGRESS_SECTION_LATEST_CHECKPOINT]);
  const handoff = parseKeyValueSection(sections[PROGRESS_SECTION_LATEST_HANDOFF]);

  return {
    checkpoint: {
      updatedAt: checkpoint.updated_at || '',
      event: checkpoint.event || '',
      currentPhase: checkpoint.current_phase || '',
      lastCompletedStep: checkpoint.last_completed_step || '',
      suggestedNextAction: checkpoint.suggested_next_action || '',
      blockers: parseDelimitedValues(checkpoint.blockers, /\s*;\s*/),
      delegatedWork: parseDelimitedValues(checkpoint.delegated_work, /\s*;\s*/),
    },
    latestHandoff: {
      updatedAt: handoff.updated_at || '',
      agent: handoff.agent || '',
      status: handoff.status || '',
      goal: handoff.goal || '',
      result: handoff.result || '',
      filesTouched: parseDelimitedValues(handoff.files_touched, /\s*,\s*/),
      verificationRun: parseDelimitedValues(handoff.verification_run, /\s*\|\s*/),
      openRisks: handoff.open_risks || '',
      nextAction: handoff.next_action || '',
    },
  };
}

function parseProgressState(content) {
  const sections = parseMarkdownSections(content);
  const currentPhaseState = parseSectionState(sections['Current Phase']);
  const lastCompletedState = parseSectionState(sections['Last Completed Step']);
  const nextActionState = parseSectionState(sections['Next Action']);
  const blockerState = parseSectionState(sections.Blockers);
  const delegatedState = parseSectionState(sections['Delegated Work']);
  const automation = parseProgressAutomationState(content);

  const resolvedCurrentPhase = currentPhaseState.firstValue || automation.checkpoint.currentPhase;
  const resolvedLastCompletedStep =
    lastCompletedState.firstValue ||
    automation.checkpoint.lastCompletedStep ||
    automation.latestHandoff.result;
  const resolvedNextAction = nextActionState.explicitNone
    ? ''
    : (
        nextActionState.firstValue ||
        automation.latestHandoff.nextAction ||
        automation.checkpoint.suggestedNextAction
      );
  const resolvedBlockers = blockerState.hasEntries
    ? blockerState.values
    : automation.checkpoint.blockers;
  const resolvedDelegatedWork = delegatedState.hasEntries
    ? delegatedState.values
    : (
        automation.checkpoint.delegatedWork.length > 0
          ? automation.checkpoint.delegatedWork
          : (automation.latestHandoff.goal
              ? [`${automation.latestHandoff.agent || 'subagent'}: ${automation.latestHandoff.goal}`]
              : [])
      );

  return {
    currentPhase: resolvedCurrentPhase,
    lastCompletedStep: resolvedLastCompletedStep,
    nextAction: resolvedNextAction,
    blockers: resolvedBlockers,
    delegatedWork: resolvedDelegatedWork,
    currentPhasePresent: Boolean(resolvedCurrentPhase),
    lastCompletedStepPresent: Boolean(resolvedLastCompletedStep),
    nextActionPresent: nextActionState.hasEntries || Boolean(automation.latestHandoff.nextAction) || Boolean(automation.checkpoint.suggestedNextAction),
    nextActionExplicitNone: nextActionState.explicitNone,
    hasActionableNextAction: Boolean(resolvedNextAction),
    automation,
  };
}

function classifyProgressExecutionState(progressState) {
  if (!progressState || typeof progressState !== 'object') {
    return 'unknown';
  }

  const currentPhase = String(progressState.currentPhase || '').trim();
  const lastCompletedStep = String(progressState.lastCompletedStep || '').trim();
  const combined = [currentPhase, lastCompletedStep]
    .filter(Boolean)
    .join('\n');

  if (!combined) {
    return 'unknown';
  }

  const hasExecutionSignals = PROGRESS_EXECUTION_PATTERNS.some(pattern => pattern.test(combined));
  if (hasExecutionSignals) {
    return 'execution';
  }

  const currentPhaseLooksPlanning = PROGRESS_PLANNING_PATTERNS.some(pattern => pattern.test(currentPhase));
  const lastCompletedLooksPlanning =
    /\bapproved (?:the )?plan\b/i.test(lastCompletedStep) ||
    /\bfinished planning\b/i.test(lastCompletedStep) ||
    /\bcompleted research\b/i.test(lastCompletedStep) ||
    /\bdrafted (?:the )?plan\b/i.test(lastCompletedStep) ||
    /\bplan(?:ning)?\b/i.test(lastCompletedStep);

  if (currentPhaseLooksPlanning || lastCompletedLooksPlanning) {
    return 'planning_only';
  }

  return 'unknown';
}

function classifyProgressCompletionState(progressState) {
  if (!progressState || typeof progressState !== 'object') {
    return 'unknown';
  }

  const currentPhase = String(progressState.currentPhase || '').trim();
  const lastCompletedStep = String(progressState.lastCompletedStep || '').trim();
  const combined = [currentPhase, lastCompletedStep]
    .filter(Boolean)
    .join('\n');

  if (!combined) {
    return 'unknown';
  }

  const currentPhaseHasExecutionSignals = PROGRESS_EXECUTION_PATTERNS.some(pattern => pattern.test(currentPhase));
  const currentPhaseHasPlanningSignals = PROGRESS_PLANNING_PATTERNS.some(pattern => pattern.test(currentPhase));
  const combinedHasExecutionSignals = PROGRESS_EXECUTION_PATTERNS.some(pattern => pattern.test(combined));
  const combinedHasPlanningSignals = PROGRESS_PLANNING_PATTERNS.some(pattern => pattern.test(combined));
  const currentPhaseHasCompletionSignals = PROGRESS_COMPLETION_PATTERNS.some(pattern => pattern.test(currentPhase));
  const lastCompletedHasCompletionSignals = PROGRESS_COMPLETION_PATTERNS.some(pattern => pattern.test(lastCompletedStep));

  if (currentPhaseHasCompletionSignals && !currentPhaseHasExecutionSignals && !currentPhaseHasPlanningSignals) {
    return 'completion_candidate';
  }

  if (currentPhaseHasExecutionSignals || currentPhaseHasPlanningSignals) {
    return 'not_complete';
  }

  if (lastCompletedHasCompletionSignals && !combinedHasExecutionSignals && !combinedHasPlanningSignals) {
    return 'completion_candidate';
  }

  return 'unknown';
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
  const invalidFindings = findingsState.values.filter(line => !REVIEW_FINDING_PATTERN.test(line));
  const missingValues = [];
  if (!reviewScopeState.hasEntries) missingValues.push('Review Scope');
  if (!findingsState.hasEntries) missingValues.push('Findings');
  if (!residualRiskState.hasEntries) missingValues.push('Residual Risks');
  if (!nextActionState.hasEntries) missingValues.push('Next Action');
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
    blockingFindings: parsedFindings,
    hasBlockingFindings: parsedFindings.length > 0,
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

function defaultSessionState() {
  return {
    currentPhase: '',
    lastCompletedStep: '',
    nextAction: '',
    blockers: [],
    delegatedWork: [],
    currentPhasePresent: false,
    lastCompletedStepPresent: false,
    nextActionPresent: false,
    nextActionExplicitNone: false,
    hasActionableNextAction: false,
    automation: {
      checkpoint: {
        updatedAt: '',
        event: '',
        currentPhase: '',
        lastCompletedStep: '',
        suggestedNextAction: '',
        blockers: [],
        delegatedWork: [],
      },
      latestHandoff: {
        updatedAt: '',
        agent: '',
        status: '',
        goal: '',
        result: '',
        filesTouched: [],
        verificationRun: [],
        openRisks: '',
        nextAction: '',
      },
    },
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
        task_type: meta.task_type || '',
        worktree_required: meta.worktree_required || '',
        observe_required: meta.observe_required || '',
        review_required: meta.review_required || '',
        review_state: entry.name === 'review-summary.md' ? parseReviewState(content) : null,
        observation_state: entry.name === 'observation-summary.md' ? parseObservationState(content) : null,
        verification_state: entry.name === 'verification-summary.md' ? parseVerificationState(content) : null,
        plan_state: entry.name === 'plan.md' ? parsePlanState(content) : null,
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
  const research = findArtifactByName(artifacts, 'research.md');

  const observeRequired = Boolean(plan && /true/i.test(String(plan.observe_required || '')));
  const reviewRequired = Boolean(plan && (/true/i.test(String(plan.review_required || '')) || observeRequired));
  const worktreeRequired = Boolean(plan && /true/i.test(String(plan.worktree_required || '')));
  const nonTrivial = Boolean(plan && (/non_trivial/i.test(String(plan.task_type || '')) || worktreeRequired));
  const sessionState = progress && progress.progress_state
    ? progress.progress_state
    : defaultSessionState();
  const progressExecutionState = progress && progress.progress_state
    ? classifyProgressExecutionState(progress.progress_state)
    : 'missing';
  const blocked = [];
  const chain = [];

  if (!plan) {
    blocked.push('missing plan.md');
  } else if (plan.status && plan.status !== 'approved') {
    blocked.push(`plan.md status=${plan.status}`);
  }

  chain.push(makeLifecycleStep(
    'research',
    research ? 'complete' : (nonTrivial ? 'pending' : 'skipped'),
    research ? 'research.md present' : (nonTrivial ? 'create research.md before planning/implementation' : 'not required for trivial work'),
    'research.md'
  ));

  let planStepStatus = 'pending';
  let planStepSummary = 'create plan.md';
  if (plan) {
    if (plan.status !== 'approved') {
      planStepStatus = 'blocked';
      planStepSummary = `plan.md status=${plan.status || 'unknown'}`;
    } else if (worktreeRequired && plan.plan_state && !plan.plan_state.complete) {
      planStepStatus = 'blocked';
      planStepSummary = 'plan.md approved but missing implementation-ready evidence';
    } else {
      planStepStatus = 'complete';
      planStepSummary = 'plan.md approved';
    }
  }
  chain.push(makeLifecycleStep('plan', planStepStatus, planStepSummary, 'plan.md'));

  let progressStepStatus = 'skipped';
  let progressStepSummary = 'not required for trivial work';
  if (nonTrivial) {
    if (!progress) {
      progressStepStatus = 'pending';
      progressStepSummary = 'create progress.md execution state';
    } else if (
      !progress.progress_state.currentPhasePresent ||
      !progress.progress_state.lastCompletedStepPresent ||
      (!progress.progress_state.hasActionableNextAction && !progress.progress_state.nextActionExplicitNone)
    ) {
      progressStepStatus = 'blocked';
      progressStepSummary = 'progress.md missing actionable execution state';
    } else if (progressExecutionState === 'planning_only') {
      progressStepStatus = 'blocked';
      progressStepSummary = 'progress.md still looks like planning state';
    } else {
      progressStepStatus = 'complete';
      progressStepSummary = `progress.md current_phase=${sessionState.currentPhase || 'unknown'}`;
    }
  }
  chain.push(makeLifecycleStep('progress', progressStepStatus, progressStepSummary, 'progress.md'));

  const implementationStatus = verification ? 'complete' : (progressStepStatus === 'complete' ? 'active' : 'pending');
  const implementationSummary = verification
    ? 'implementation has verification evidence'
    : (progressStepStatus === 'complete' ? 'execute approved plan in small TDD batches' : 'wait for executable progress state');
  chain.push(makeLifecycleStep('implementation', implementationStatus, implementationSummary, 'progress.md'));

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

  if (reviewRequired) {
    if (!review) {
      blocked.push('missing review-summary.md');
      chain.push(makeLifecycleStep('review', 'pending', 'write review-summary.md', 'review-summary.md'));
    } else if (review.review_state && !review.review_state.complete) {
      blocked.push(`incomplete review-summary.md: missing ${review.review_state.missingSections.join(', ')}`);
      chain.push(makeLifecycleStep('review', 'blocked', 'review-summary.md incomplete', 'review-summary.md'));
    } else if (review.review_state && review.review_state.hasBlockingFindings) {
      blocked.push('review-summary.md still has unresolved findings');
      chain.push(makeLifecycleStep('review', 'blocked', 'review-summary.md has unresolved findings', 'review-summary.md'));
    } else {
      chain.push(makeLifecycleStep('review', 'complete', 'review-summary.md complete', 'review-summary.md'));
    }
  } else {
    chain.push(makeLifecycleStep('review', 'skipped', 'review not required by plan metadata', 'review-summary.md'));
  }

  if (observeRequired && !observation) {
    blocked.push('missing observation-summary.md');
    chain.push(makeLifecycleStep('observation', 'pending', 'write observation-summary.md with runtime evidence', 'observation-summary.md'));
  } else if (observeRequired && observation && observation.observation_state && !observation.observation_state.complete) {
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
  } else if (observeRequired) {
    chain.push(makeLifecycleStep('observation', 'complete', 'observation-summary.md complete', 'observation-summary.md'));
  } else {
    chain.push(makeLifecycleStep('observation', 'skipped', 'observation not required by plan metadata', 'observation-summary.md'));
  }

  const completionStatus = blocked.length > 0 ? 'pending' : 'complete';
  chain.push(makeLifecycleStep(
    'completion',
    completionStatus,
    blocked.length > 0 ? 'chain has open gates before commit' : 'artifact chain is commit-ready',
    'progress.md'
  ));

  const currentStep = firstOpenLifecycleStep(chain);

  return {
    planStatus: plan ? (plan.status || 'unknown') : 'missing',
    reviewRequired,
    observeRequired,
    worktreeRequired,
    nonTrivial,
    hasReview: Boolean(review),
    hasVerification: Boolean(verification),
    hasObservation: Boolean(observation),
    hasResearch: Boolean(research),
    progressPresent: Boolean(progress),
    sessionState,
    progressExecutionState,
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
  lines.push(`- plan_status=${state.planStatus}`);
  lines.push(`- review_required=${state.reviewRequired}`);
  lines.push(`- observe_required=${state.observeRequired}`);
  lines.push(`- current_step=${state.currentStepId}`);
  lines.push(`- next_required_action=${state.nextRequiredAction}`);
  lines.push(`- blocked=${state.blocked.length > 0 ? state.blocked.join(', ') : 'none'}`);
  if (state.progressPresent) {
    lines.push(`- current_phase=${state.sessionState.currentPhase || 'unknown'}`);
    lines.push(`- next_action=${state.sessionState.nextAction || (state.sessionState.nextActionExplicitNone ? 'none' : 'unknown')}`);
    lines.push(`- blockers=${formatListValue(state.sessionState.blockers)}`);
  }
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
  lines.push(`- plan_status=${state.planStatus}`);
  lines.push(`- review_required=${state.reviewRequired}`);
  lines.push(`- observe_required=${state.observeRequired}`);
  lines.push(`- review_present=${state.hasReview}`);
  lines.push(`- verification_present=${state.hasVerification}`);
  lines.push(`- observation_present=${state.hasObservation}`);
  lines.push(`- research_present=${state.hasResearch}`);
  lines.push(`- progress_present=${state.progressPresent}`);
  lines.push(`- current_step=${state.currentStepId}`);
  lines.push(`- next_required_action=${state.nextRequiredAction}`);
  lines.push(`- blocked=${state.blocked.length > 0 ? state.blocked.join(', ') : 'none'}`);
  lines.push('### Lifecycle Chain');
  for (const step of state.chain) {
    lines.push(`- ${step.id}: ${step.status} | ${step.summary}`);
  }
  if (state.progressPresent) {
    lines.push('### Session State');
    lines.push(`- current_phase=${state.sessionState.currentPhase || 'unknown'}`);
    lines.push(`- last_completed_step=${state.sessionState.lastCompletedStep || 'unknown'}`);
    lines.push(`- next_action=${state.sessionState.nextAction || (state.sessionState.nextActionExplicitNone ? 'none' : 'unknown')}`);
    lines.push(`- blockers=${formatListValue(state.sessionState.blockers)}`);
    lines.push(`- delegated_work=${formatListValue(state.sessionState.delegatedWork)}`);
    if (state.sessionState.automation.checkpoint.event) {
      lines.push(`- checkpoint_event=${state.sessionState.automation.checkpoint.event}`);
      lines.push(`- checkpoint_next_action=${state.sessionState.automation.checkpoint.suggestedNextAction || 'none'}`);
    }
    if (state.sessionState.automation.latestHandoff.agent) {
      lines.push(`- latest_handoff_agent=${state.sessionState.automation.latestHandoff.agent}`);
      lines.push(`- latest_handoff_next_action=${state.sessionState.automation.latestHandoff.nextAction || 'none'}`);
    }
  }
  return lines.join('\n');
}

function buildManagedSectionContent(heading, lines) {
  return [`## ${heading}`, '', ...(lines.length > 0 ? lines : ['- none']), ''].join('\n');
}

function replaceMarkdownSection(content, heading, replacementLines) {
  const sectionHeading = `## ${heading}`;
  const replacement = buildManagedSectionContent(heading, replacementLines);
  const normalized = String(content || '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const startIndex = lines.findIndex(line => line.trim() === sectionHeading);

  if (startIndex !== -1) {
    let endIndex = lines.length;
    for (let i = startIndex + 1; i < lines.length; i += 1) {
      if (/^##\s+/.test(lines[i])) {
        endIndex = i;
        break;
      }
    }
    const replacementBlock = replacement.replace(/\n$/, '').split('\n');
    const updatedLines = [
      ...lines.slice(0, startIndex),
      ...replacementBlock,
      ...lines.slice(endIndex),
    ];
    const updated = updatedLines.join('\n').replace(/\n{3,}/g, '\n\n');
    return updated.endsWith('\n') ? updated : `${updated}\n`;
  }

  const trimmed = normalized.replace(/\s*$/, '');
  const prefix = trimmed ? `${trimmed}\n\n` : '';
  return `${prefix}${replacement}`;
}

function serializeSectionValue(value, delimiter = '; ') {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(delimiter) : 'none';
  }
  const normalized = String(value || '').trim();
  return normalized ? normalized : 'none';
}

function updateProgressManagedSection(progressPath, heading, entries) {
  if (!progressPath || !fs.existsSync(progressPath)) return false;
  const content = fs.readFileSync(progressPath, 'utf8');
  const lines = entries
    .map(([key, value, delimiter]) => [`${key}=${serializeSectionValue(value, delimiter)}`])
    .map(([line]) => `- ${line}`);
  const updated = replaceMarkdownSection(content, heading, lines);
  if (updated !== content) {
    fs.writeFileSync(progressPath, updated, 'utf8');
    return true;
  }
  return false;
}

function writeProgressCheckpoint(progressPath, checkpoint) {
  return updateProgressManagedSection(progressPath, PROGRESS_SECTION_LATEST_CHECKPOINT, [
    ['updated_at', checkpoint.updatedAt],
    ['event', checkpoint.event],
    ['current_phase', checkpoint.currentPhase],
    ['last_completed_step', checkpoint.lastCompletedStep],
    ['suggested_next_action', checkpoint.suggestedNextAction],
    ['blockers', checkpoint.blockers, '; '],
    ['delegated_work', checkpoint.delegatedWork, '; '],
  ]);
}

function writeProgressDelegatedHandoff(progressPath, handoff) {
  return updateProgressManagedSection(progressPath, PROGRESS_SECTION_LATEST_HANDOFF, [
    ['updated_at', handoff.updatedAt],
    ['agent', handoff.agent],
    ['status', handoff.status],
    ['goal', handoff.goal],
    ['result', handoff.result],
    ['files_touched', handoff.filesTouched, ', '],
    ['verification_run', handoff.verificationRun, ' | '],
    ['open_risks', handoff.openRisks],
    ['next_action', handoff.nextAction],
  ]);
}

module.exports = {
  getRepoRoot,
  findTaskArtifacts,
  buildArtifactContext,
  buildArtifactSnapshot,
  buildLifecycleState,
  parseProgressState,
  classifyProgressExecutionState,
  classifyProgressCompletionState,
  parseReviewState,
  parseObservationState,
  parseVerificationState,
  parsePlanState,
  writeProgressCheckpoint,
  writeProgressDelegatedHandoff,
};
