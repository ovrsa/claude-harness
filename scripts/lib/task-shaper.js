'use strict';

const TASK_WEIGHTS = ['trivial', 'exploratory', 'standard', 'behavior-changing', 'heavy-risky'];

const KEYWORDS = {
  risky: [
    'auth', 'authentication', 'authorization', 'credential', 'secret', 'security',
    'migration', 'deploy', 'release', 'production', 'delete', 'destructive',
    '認証', '認可', '資格情報', '秘密', 'セキュリティ', 'マイグレーション',
    'デプロイ', '本番', '削除', '破壊',
  ],
  behavior: [
    'ui', 'ux', 'runtime', 'browser', 'integration', 'api', 'workflow', 'hook',
    '挙動', '画面', 'ブラウザ', '連携', 'api', 'フロー', 'ワークフロー', 'hook',
  ],
  implementation: [
    'add', 'build', 'create', 'fix', 'implement', 'improve', 'modify', 'refactor', 'update',
    'write', 'wire', 'test', 'document', '追加', '作成', '修正', '実装', '変更',
    '更新', '改善', 'リファクタ', 'テスト', '文書化', '対応',
  ],
  exploratory: [
    'research', 'investigate', 'explore', 'read', 'understand', 'compare',
    '調査', '探索', '読解', '理解', '比較', '検討', '確認',
  ],
  ambiguous: [
    'think', 'brainstorm', 'discuss', 'strategy', 'what should', 'how should',
    '考えたい', 'ブレスト', '議論', '戦略', 'どうしたら', 'どうすべき',
    '何をすべき', '整理したい',
  ],
  prioritization: [
    'prioritize', 'priority', 'which improvement', 'decide next', '優先', 'どの改善',
    'next improvement', 'should proceed', 'whether to proceed', '次に何', '次の改善',
    '進むべき', '判断したい', '整理したい',
  ],
  harnessContext: [
    '.claude', 'harness', 'agentic development pipeline', 'shape-task', 'route-task',
    'subagent', 'progress.md', 'ハーネス', 'パイプライン', 'サブエージェント',
  ],
  shapeTaskQuality: [
    'task shaping quality', 'output quality', '出力品質', '品質',
  ],
  heavyContext: [
    'large file', 'large files', 'long log', 'long logs', 'heavy context',
    'generated artifact', 'generated artifacts', 'external doc', 'external docs',
    'broad search', 'many files', 'read many', 'summarize logs',
    '大量ファイル', '大きなファイル', '長いログ', 'ログ', '重い文脈',
    '外部資料', '生成物', '広範な探索', '要約', '読んで',
  ],
};

function normalizeText(value) {
  return String(value || '').trim();
}

function lower(value) {
  return normalizeText(value).toLowerCase();
}

function includesAny(text, words) {
  return words.some(word => text.includes(lower(word)));
}

function sentenceFromInput(input) {
  const compact = normalizeText(input).replace(/\s+/g, ' ');
  if (!compact) return 'Clarify the requested work before choosing a workflow.';
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean).map(value => normalizeText(value)).filter(Boolean)));
}

function detectSignals(text) {
  return {
    risky: includesAny(text, KEYWORDS.risky),
    behavior: includesAny(text, KEYWORDS.behavior),
    implementation: includesAny(text, KEYWORDS.implementation),
    exploratory: includesAny(text, KEYWORDS.exploratory),
    ambiguous: includesAny(text, KEYWORDS.ambiguous),
    prioritization: includesAny(text, KEYWORDS.prioritization),
    harnessContext: includesAny(text, KEYWORDS.harnessContext),
    shapeTaskQuality: includesAny(text, KEYWORDS.shapeTaskQuality),
    heavyContext: includesAny(text, KEYWORDS.heavyContext),
  };
}

function decideTaskWeight(signals, text) {
  if (!text) return 'exploratory';
  if (signals.risky) return 'heavy-risky';
  if (signals.behavior && signals.implementation) return 'behavior-changing';
  if (signals.harnessContext && signals.prioritization) return 'exploratory';
  if (signals.shapeTaskQuality && signals.implementation) return 'standard';
  if (signals.exploratory && !signals.implementation) return 'exploratory';
  if (signals.ambiguous && !signals.implementation) return 'exploratory';
  if (text.length < 80 && signals.implementation && !signals.behavior) return 'standard';
  if (signals.implementation) return 'standard';
  return 'exploratory';
}

function decideSpecNeed(taskWeight, signals) {
  if (taskWeight === 'heavy-risky') return 'required';
  if (taskWeight === 'behavior-changing') return 'recommended';
  if (taskWeight === 'standard') return 'optional';
  if (signals.ambiguous || signals.exploratory) return 'no';
  return 'no';
}

function decideSuggestedArtifact(taskWeight, specNeeded) {
  if (specNeeded === 'required') return 'approved plan or design spec';
  if (specNeeded === 'recommended') return 'task brief plus observation plan';
  if (taskWeight === 'standard') return 'short task brief or plan.md when durable approval is needed';
  if (taskWeight === 'exploratory') return 'conversation summary or research.md only if durability is needed';
  return 'none';
}

function decideReviewWeight(taskWeight) {
  if (taskWeight === 'heavy-risky') return 'strong acceptance, evidence, and residual-risk review';
  if (taskWeight === 'behavior-changing') return 'acceptance and runtime evidence review';
  if (taskWeight === 'standard') return 'focused diff and evidence review';
  if (taskWeight === 'exploratory') return 'claim-quality review';
  return 'sanity check';
}

function decideSuggestedTrack(taskWeight, signals) {
  if (signals.harnessContext && signals.prioritization) return 'continue-discussion';
  if (signals.ambiguous && !signals.implementation) return 'continue-discussion';
  if (signals.exploratory && !signals.implementation) return 'research';
  if (taskWeight === 'heavy-risky') return 'plan';
  if (taskWeight === 'behavior-changing') return 'plan';
  if (taskWeight === 'standard') return 'plan-or-route';
  return 'direct';
}

function evidenceFor(taskWeight, signals) {
  const evidence = [];
  if (taskWeight === 'exploratory') {
    evidence.push('source claims or observations');
    evidence.push('adopt / hold / reject decision');
    if (signals.harnessContext) {
      evidence.push('progress.md next action alignment');
      evidence.push('docs/development-task-pipeline.md alignment');
      evidence.push('existing command surface comparison');
    }
    return evidence;
  }
  evidence.push('changed-files summary');
  if (taskWeight !== 'trivial') evidence.push('focused tests or validators');
  if (signals.shapeTaskQuality) evidence.push('/shape-task sample output before/after');
  if (signals.behavior || taskWeight === 'behavior-changing') evidence.push('manual path or runtime observation evidence');
  if (taskWeight === 'heavy-risky') {
    evidence.push('risk review');
    evidence.push('residual-risk acceptance');
  }
  return evidence;
}

function buildOpenQuestions(taskWeight, signals) {
  const questions = [];
  if (signals.harnessContext && signals.prioritization) {
    questions.push('Should the next improvement target the entrance, routing/delegation, evidence, or documentation layer?');
    questions.push('Which candidate should be adopted, held, or rejected now?');
    return questions;
  }
  if (signals.ambiguous) {
    questions.push('What outcome should be accepted as success?');
    questions.push('What should stay out of scope?');
  }
  if (taskWeight === 'heavy-risky') {
    questions.push('Who approves the risk boundary and rollback posture?');
  }
  if (!signals.implementation && !signals.exploratory) {
    questions.push('Is this a discussion, research, implementation, or routing request?');
  }
  return questions;
}

function decisionCandidatesFor(signals) {
  if (!signals.harnessContext) return [];
  if (signals.prioritization) {
    return [
      'Improve /shape-task output quality',
      'Design /route-task after shaping',
      'Add an always-on suggestion for ambiguous requests',
    ];
  }
  if (signals.shapeTaskQuality) {
    return [
      'Improve contextual objective generation',
      'Improve harness-specific open questions',
      'Improve evidence and next-step generation',
    ];
  }
  return [];
}

function objectiveFor(rawInput, taskWeight, suggestedTrack, signals) {
  if (signals.harnessContext && signals.prioritization) {
    return 'Compare the next harness improvement candidates and decide adopt / hold / reject for each.';
  }
  if (signals.shapeTaskQuality && signals.implementation) {
    return 'Improve /shape-task so it produces contextual objectives, open questions, evidence, and next steps for harness work.';
  }
  if (suggestedTrack === 'continue-discussion') {
    return 'Turn the discussion into an explicit objective, acceptance criteria, and next workflow step.';
  }
  return `Complete the requested work within a ${taskWeight} workflow.`;
}

function nextStepFor(suggestedTrack, signals, decisionCandidates) {
  if (decisionCandidates.length > 0 && signals.harnessContext && signals.prioritization) {
    return `Compare decision candidates and decide adopt / hold / reject: ${decisionCandidates.join('; ')}.`;
  }
  if (signals.shapeTaskQuality && signals.implementation) {
    return 'Write focused tests for contextual /shape-task output, then update the shaper implementation.';
  }
  if (suggestedTrack === 'continue-discussion') {
    return 'Continue discussion until objective, scope, and acceptance are clear.';
  }
  if (suggestedTrack === 'research') return 'Run a bounded research or sensemaking pass.';
  if (suggestedTrack === 'plan') return 'Create or update an approval-ready plan before execution.';
  if (suggestedTrack === 'plan-or-route') {
    return 'Choose planning for local execution or routing if delegation boundaries are clear.';
  }
  return 'Proceed directly with minimal evidence.';
}

function decideCanDelegateReadOnly(signals, taskWeight) {
  if (!signals.heavyContext) return false;
  return taskWeight === 'exploratory' || signals.exploratory || !signals.implementation;
}

function delegationTaskFor(signals, canDelegateReadOnly) {
  if (!signals.heavyContext || !canDelegateReadOnly) return 'none';
  return 'Ask a read-only sidecar to read the heavy context, extract relevant findings, and return 要点 with evidence sources; main context keeps scope and acceptance.';
}

function shapeTask(input, options = {}) {
  const rawInput = normalizeText(input);
  const text = lower(rawInput);
  const signals = detectSignals(text);
  const taskWeight = TASK_WEIGHTS.includes(options.taskWeight) ? options.taskWeight : decideTaskWeight(signals, text);
  const specNeeded = options.specNeeded || decideSpecNeed(taskWeight, signals);
  const suggestedTrack = options.suggestedTrack || decideSuggestedTrack(taskWeight, signals);
  const requiredEvidence = unique([...(options.requiredEvidence || []), ...evidenceFor(taskWeight, signals)]);
  const openQuestions = unique([...(options.openQuestions || []), ...buildOpenQuestions(taskWeight, signals)]);
  const decisionCandidates = unique([...(options.decisionCandidates || []), ...decisionCandidatesFor(signals)]);
  const heavyContext = Boolean(options.heavyContext ?? signals.heavyContext);
  const canDelegateReadOnly = Boolean(options.canDelegateReadOnly ?? (heavyContext && decideCanDelegateReadOnly(signals, taskWeight)));
  const delegationTask = options.delegationTask || delegationTaskFor({ ...signals, heavyContext }, canDelegateReadOnly);

  const interpretedPurpose = options.interpretedPurpose || sentenceFromInput(rawInput);
  const proposedObjective = options.proposedObjective || objectiveFor(rawInput, taskWeight, suggestedTrack, signals);

  const successCriteria = unique([
    ...(options.successCriteria || []),
    suggestedTrack === 'continue-discussion'
      ? 'The user can approve or revise a concrete objective.'
      : 'The proposed objective is satisfied.',
    'Acceptance criteria and required evidence are explicit.',
  ]);

  const acceptanceCriteria = unique([
    ...(options.acceptanceCriteria || []),
    ...successCriteria,
  ]);

  const constraints = unique([
    ...(options.constraints || []),
    'Human-owned purpose, scope, and acceptance remain explicit.',
    'Do not spawn subagents, create queued work, or mutate repositories during shaping.',
    heavyContext ? 'Delegate only reading, summarization, extraction, or evidence collection when heavy context is present.' : '',
  ]);

  const nonGoals = unique([
    ...(options.nonGoals || []),
    'Do not replace approval with automation.',
    specNeeded === 'no' ? 'Do not force a full spec for this task.' : '',
  ]);

  const assumptions = unique([
    ...(options.assumptions || []),
    rawInput ? 'Input text is the primary source of task intent.' : 'No task intent has been provided yet.',
  ]);

  const suggestedNextStep = options.suggestedNextStep || nextStepFor(suggestedTrack, signals, decisionCandidates);

  return {
    interpretedPurpose,
    proposedObjective,
    successCriteria,
    constraints,
    nonGoals,
    assumptions,
    openQuestions,
    decisionCandidates,
    taskWeight,
    specNeeded,
    suggestedArtifact: options.suggestedArtifact || decideSuggestedArtifact(taskWeight, specNeeded),
    acceptanceCriteria,
    requiredEvidence,
    reviewWeight: options.reviewWeight || decideReviewWeight(taskWeight),
    humanApprovalNeeded: taskWeight !== 'trivial',
    heavyContext,
    canDelegateReadOnly,
    delegationTask,
    suggestedTrack,
    suggestedNextStep,
    delegationReady: ['plan-or-route'].includes(suggestedTrack) && openQuestions.length === 0,
    readonly: true,
  };
}

module.exports = {
  TASK_WEIGHTS,
  shapeTask,
  detectSignals,
  decideTaskWeight,
  decideSpecNeed,
  decideSuggestedTrack,
};
