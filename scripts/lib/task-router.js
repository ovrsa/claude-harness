'use strict';

const VALID_WEIGHTS = new Set(['trivial', 'exploratory', 'standard', 'behavior-changing', 'heavy-risky']);
const DECISION_KEYWORDS = [
  { pattern: /credential|secret|資格情報|秘密/i, stop: 'credential use requires human decision', approval: 'credential-use approval' },
  { pattern: /deploy|release|デプロイ|リリース/i, stop: 'deploy or release requires human decision', approval: 'deploy/release approval' },
  { pattern: /\bpush\b|git push/i, stop: 'push requires human decision', approval: 'push approval' },
  { pattern: /\bPR\b|pull request|pr creation|PR 作成/i, stop: 'PR creation requires human decision', approval: 'PR creation approval' },
  { pattern: /destructive|delete|削除|破壊/i, stop: 'destructive action requires human decision', approval: 'destructive-action approval' },
  { pattern: /residual-risk|residual risk|残余リスク/i, stop: 'residual-risk acceptance requires human decision', approval: 'residual-risk acceptance' },
];

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeText).filter(Boolean);
  }
  const normalized = normalizeText(value);
  return normalized ? [normalized] : [];
}

function unique(values) {
  return Array.from(new Set((values || []).map(normalizeText).filter(Boolean)));
}

function normalizeTaskWeight(value) {
  const normalized = normalizeText(value).toLowerCase();
  return VALID_WEIGHTS.has(normalized) ? normalized : 'standard';
}

function normalizeTaskBrief(taskBrief = {}) {
  const source = taskBrief && typeof taskBrief === 'object' ? taskBrief : {};
  return {
    objective: normalizeText(source.objective || source.proposedObjective),
    acceptanceCriteria: normalizeList(source.acceptanceCriteria || source.successCriteria),
    taskWeight: normalizeTaskWeight(source.taskWeight),
    constraints: normalizeList(source.constraints),
    nonGoals: normalizeList(source.nonGoals),
    requiredEvidence: normalizeList(source.requiredEvidence || source.evidenceNeeded),
    openQuestions: normalizeList(source.openQuestions),
  };
}

function detectDecisionBoundaries(taskBrief) {
  const haystack = [
    taskBrief.objective,
    ...taskBrief.constraints,
    ...taskBrief.nonGoals,
    ...taskBrief.acceptanceCriteria,
  ].join('\n');

  const stopConditions = [];
  const approvals = [];

  for (const rule of DECISION_KEYWORDS) {
    if (rule.pattern.test(haystack)) {
      stopConditions.push(rule.stop);
      approvals.push(rule.approval);
    }
  }

  return {
    stopConditions: unique(stopConditions),
    approvals: unique(approvals),
  };
}

function hasAcceptance(taskBrief) {
  return taskBrief.acceptanceCriteria.length > 0;
}

function readinessFor(taskBrief, options, boundaries) {
  if (taskBrief.openQuestions.length > 0) return 'needs-shaping';
  if (!taskBrief.objective || !hasAcceptance(taskBrief)) return 'needs-shaping';
  if (boundaries.stopConditions.length > 0) return 'blocked';
  if (taskBrief.taskWeight === 'heavy-risky' && !(options.approved && options.riskApproved)) return 'blocked';
  return 'ready';
}

function destinationFor(taskBrief, options, readiness) {
  if (readiness !== 'ready') return 'human-decision';
  if (taskBrief.taskWeight === 'trivial') return 'main-context';
  if (taskBrief.taskWeight === 'exploratory' && options.preferDelegation && options.readonly) return 'subagent-sidecar';
  if (taskBrief.taskWeight === 'heavy-risky') {
    if (options.queueIntent && options.isolate) return 'isolated-clone';
    if (options.queueIntent) return 'task-queue';
    return 'human-decision';
  }
  if (taskBrief.taskWeight === 'behavior-changing') {
    return options.queueIntent && options.approved ? 'task-queue' : 'main-context';
  }
  if (taskBrief.taskWeight === 'standard') {
    return options.queueIntent && options.approved ? 'task-queue' : 'main-context';
  }
  return 'main-context';
}

function evidenceFor(taskBrief) {
  const evidence = [...taskBrief.requiredEvidence];
  if (taskBrief.taskWeight === 'behavior-changing' && !evidence.includes('observation or manual path evidence')) {
    evidence.push('observation or manual path evidence');
  }
  if (taskBrief.taskWeight === 'heavy-risky') {
    evidence.push('risk review');
    evidence.push('residual-risk acceptance');
  }
  return unique(evidence);
}

function approvalFor(taskBrief, options, boundaries, destination) {
  const approvals = [...boundaries.approvals];
  if (taskBrief.taskWeight !== 'trivial') approvals.push('user approval of shaped task');
  if (destination === 'task-queue' || destination === 'isolated-clone') approvals.push('approved task brief');
  if (taskBrief.taskWeight === 'heavy-risky') approvals.push('risk boundary approval');
  return unique(approvals);
}

function delegationFor(taskBrief, options, readiness, destination) {
  if (readiness !== 'ready') return false;
  if (destination !== 'subagent-sidecar') return false;
  if (!options.readonly && !options.isolatedWriteScope) return false;
  if (!taskBrief.objective || !hasAcceptance(taskBrief)) return false;
  return true;
}

function boundaryFor(destination, delegationEligible) {
  if (!delegationEligible) return 'Do not delegate user-owned decisions or execution authority.';
  if (destination === 'subagent-sidecar') {
    return 'Readonly or isolated sidecar work only; return findings and evidence, not acceptance decisions.';
  }
  return 'Main context retains scope, approval, and acceptance decisions.';
}

function reasoningFor(taskBrief, readiness, destination) {
  if (readiness === 'needs-shaping') return ['Task is not ready because objective, acceptance, or open questions need shaping.'];
  if (readiness === 'blocked') return ['Task requires a human decision before routing can continue.'];
  if (destination === 'subagent-sidecar') return ['Task is bounded, exploratory, and suitable for readonly sidecar work.'];
  if (destination === 'task-queue') return ['Task is approved and benefits from queued pipeline evidence.'];
  if (destination === 'isolated-clone') return ['Task is approved high-risk queued work and should be isolated from the main worktree.'];
  return [`Task can stay in main context as ${taskBrief.taskWeight} work.`];
}

function nextStepFor(readiness, destination) {
  if (readiness === 'needs-shaping') return 'Resolve open questions with /shape-task before routing.';
  if (readiness === 'blocked') return 'Get the required human decision or approval before routing.';
  if (destination === 'subagent-sidecar') return 'Delegate a bounded readonly sidecar task and require a handoff summary.';
  if (destination === 'task-queue') return 'Create or enqueue the approved task with required evidence targets.';
  if (destination === 'isolated-clone') return 'Run through task queue with isolated clone and explicit merge/cleanup approval.';
  return 'Proceed in main context with the required evidence.';
}

function routeTask(taskBrief, options = {}) {
  const normalized = normalizeTaskBrief(taskBrief);
  const boundaries = detectDecisionBoundaries(normalized);
  const inputReadiness = readinessFor(normalized, options, boundaries);
  const recommendedDestination = destinationFor(normalized, options, inputReadiness);
  const requiredEvidence = evidenceFor(normalized);
  const requiredApproval = approvalFor(normalized, options, boundaries, recommendedDestination);
  const delegationEligible = delegationFor(normalized, options, inputReadiness, recommendedDestination);
  const stopConditions = unique([
    ...boundaries.stopConditions,
    ...(inputReadiness === 'needs-shaping' ? ['open questions or missing acceptance criteria require shaping'] : []),
    ...(normalized.taskWeight === 'heavy-risky' && !(options.approved && options.riskApproved)
      ? ['heavy-risky work requires risk boundary approval']
      : []),
  ]);

  return {
    inputReadiness,
    recommendedDestination,
    reasoning: reasoningFor(normalized, inputReadiness, recommendedDestination),
    delegationEligible,
    delegationBoundary: boundaryFor(recommendedDestination, delegationEligible),
    requiredApproval,
    requiredEvidence,
    stopConditions,
    suggestedNextStep: nextStepFor(inputReadiness, recommendedDestination),
    readonly: true,
  };
}

module.exports = {
  routeTask,
  normalizeTaskBrief,
  detectDecisionBoundaries,
};
