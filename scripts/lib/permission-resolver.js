'use strict';

const PERMISSION_MODES = new Set(['readonly', 'edit', 'full']);

const BLOCKED_ACTION_PATTERNS = [
  { label: 'push', pattern: /\bpush\b/i },
  { label: 'PR', pattern: /\b(?:PR|pull request)\b/i },
  { label: 'deploy', pattern: /\bdeploy(?:ment)?\b/i },
  { label: 'destructive rm', pattern: /\brm\s+-rf\b/i },
  { label: 'external mutation', pattern: /\b(?:external service|production|prod|database reset|db reset)\b/i },
];

const SAFE_READONLY_BASH = [
  /^\s*pwd\s*$/,
  /^\s*ls(?:\s|$)/,
  /^\s*rg(?:\s|$)/,
  /^\s*sed\s+-n(?:\s|$)/,
  /^\s*cat(?:\s|$)/,
  /^\s*find(?:\s|$)/,
  /^\s*wc(?:\s|$)/,
  /^\s*head(?:\s|$)/,
  /^\s*tail(?:\s|$)/,
  /^\s*stat(?:\s|$)/,
  /^\s*file(?:\s|$)/,
  /^\s*readlink(?:\s|$)/,
  /^\s*which(?:\s|$)/,
  /^\s*git\s+(status|diff|log|show|rev-parse|branch)\b/,
];

const DANGEROUS_BASH = [
  { label: 'destructive rm', pattern: /\brm\s+-rf\b/ },
  { label: 'git reset hard', pattern: /\bgit\s+reset\s+--hard\b/ },
  { label: 'git clean force', pattern: /\bgit\s+clean\s+-fd\b/ },
  { label: 'force push', pattern: /\bgit\s+push\b.*--force\b/ },
  { label: 'world-writable chmod', pattern: /\bchmod\s+-R\s+777\b/ },
];

const AUDIT_ONLY_BASH = [
  /^\s*ps(?:\s|$)/,
  /^\s*whoami\s*$/,
  /^\s*id\s*$/,
  /^\s*date\s*$/,
];

const MODE_RANK = {
  readonly: 0,
  edit: 1,
  full: 2,
};

function detectBlockedActions(content) {
  return BLOCKED_ACTION_PATTERNS
    .filter(entry => entry.pattern.test(String(content || '')))
    .map(entry => entry.label);
}

function makeDecision(mode, source, options = {}) {
  const blockedActions = options.blockedActions || [];
  const reasons = options.reasons || [];
  return {
    mode,
    source,
    requires_explicit_authorization: Boolean(options.requiresExplicitAuthorization),
    blocked_actions: blockedActions,
    reasons,
    provider_options: {
      codex: {},
      claude: {},
      sdk: {},
    },
  };
}

function makeBashDecision(policyClass, behavior, message, options = {}) {
  return {
    behavior,
    policy_class: policyClass,
    message: `${policyClass}: ${message}`,
    permission: makeDecision(options.permissionMode || 'edit', `bash_${policyClass}`, {
      requiresExplicitAuthorization: behavior === 'ask',
      blockedActions: options.blockedActions || [],
      reasons: options.reasons || [],
    }),
    ...(options.interrupt === undefined ? {} : { interrupt: options.interrupt }),
    ...(options.blockedActions ? { blocked_actions: options.blockedActions } : {}),
  };
}

function classifyBashPermission(command) {
  const value = String(command || '');
  if (!value.trim()) return null;

  const dangerous = DANGEROUS_BASH.filter(entry => entry.pattern.test(value)).map(entry => entry.label);
  if (dangerous.length > 0) {
    return makeBashDecision(
      'hard-deny',
      'deny',
      'Denied by personal harness boundary. Use a safer alternative or request an explicit override.',
      {
        permissionMode: 'full',
        interrupt: true,
        blockedActions: dangerous,
        reasons: ['dangerous bash command denied'],
      }
    );
  }

  if (SAFE_READONLY_BASH.some(pattern => pattern.test(value))) {
    return makeBashDecision(
      'auto-allow',
      'allow',
      'Safe read-only inspection command.',
      { permissionMode: 'readonly' }
    );
  }

  if (AUDIT_ONLY_BASH.some(pattern => pattern.test(value))) {
    return makeBashDecision(
      'audit-only',
      'allow',
      'Low-risk metadata command allowed with logging.',
      { permissionMode: 'readonly' }
    );
  }

  return makeBashDecision(
    'ask-with-justification',
    'ask',
    'Requires explicit human approval with a concrete justification.',
    {
      permissionMode: 'edit',
      reasons: ['non-readonly bash command requires approval'],
    }
  );
}

function maxMode(left, right) {
  return MODE_RANK[right] > MODE_RANK[left] ? right : left;
}

function resolvePermission(options = {}) {
  const track = String(options.track || '').trim();
  const workflowStep = options.workflowStep || null;
  const planContent = String(options.planContent || '');
  const heavyRiskyApproved = Boolean(options.heavyRiskyApproved);
  const taskOverride = options.taskOverride || '';
  const blockedActions = detectBlockedActions(planContent);
  const reasons = [];

  let mode = 'readonly';
  let source = 'default';

  if (taskOverride) {
    if (!PERMISSION_MODES.has(taskOverride)) {
      return makeDecision('full', 'invalid_task_override', {
        requiresExplicitAuthorization: true,
        reasons: [`invalid task permission mode: ${taskOverride}`],
      });
    }
    mode = taskOverride;
    source = 'task_override';
  } else if (workflowStep && workflowStep.mode) {
    const workflowMode = String(workflowStep.mode || '').trim();
    if (!PERMISSION_MODES.has(workflowMode)) {
      return makeDecision('full', 'invalid_workflow_step', {
        requiresExplicitAuthorization: true,
        reasons: [`invalid workflow permission mode: ${workflowMode}`],
      });
    }
    mode = workflowMode;
    source = 'workflow_step';
    if (workflowStep.required_permission_mode) {
      const requiredMode = String(workflowStep.required_permission_mode || '').trim();
      if (!PERMISSION_MODES.has(requiredMode)) {
        return makeDecision('full', 'invalid_workflow_step', {
          requiresExplicitAuthorization: true,
          reasons: [`invalid workflow required permission mode: ${requiredMode}`],
        });
      }
      const raisedMode = maxMode(mode, requiredMode);
      if (raisedMode !== mode) {
        mode = raisedMode;
        source = 'workflow_step_required_permission';
      }
    }
  } else if (track === 'standard' || track === 'heavy-risky') {
    mode = 'edit';
    source = 'track_policy';
  }

  if (track === 'heavy-risky' && !heavyRiskyApproved) {
    return makeDecision('full', 'track_policy', {
      requiresExplicitAuthorization: true,
      blockedActions,
      reasons: ['heavy-risky work requires explicit approval'],
    });
  }

  if (blockedActions.length > 0) {
    reasons.push(`permission-sensitive action requires authorization: ${blockedActions.join(', ')}`);
    return makeDecision(maxMode(mode, 'full'), 'plan_text', {
      requiresExplicitAuthorization: true,
      blockedActions,
      reasons,
    });
  }

  return makeDecision(mode, source, {
    requiresExplicitAuthorization: false,
    blockedActions,
    reasons,
  });
}

module.exports = {
  BLOCKED_ACTION_PATTERNS,
  AUDIT_ONLY_BASH,
  DANGEROUS_BASH,
  PERMISSION_MODES,
  SAFE_READONLY_BASH,
  classifyBashPermission,
  detectBlockedActions,
  resolvePermission,
};
