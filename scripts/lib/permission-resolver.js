'use strict';

const { OPAQUE_COMMANDS, splitShellSegments, tokenize, commandNameOf } = require('./shell-split');

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

// 危険判定はフラグ解析で行う。文字列パターンだと大小文字と並び順に依存し、
// rm -Rf（BSD rm で有効）や git push -f が抜ける。
const DANGEROUS_COMMANDS = [
  { label: 'destructive rm', matches: (name, flags) =>
      name === 'rm' && hasFlag(flags, 'r', 'recursive') && hasFlag(flags, 'f', 'force') },
  { label: 'git reset hard', matches: (name, flags, tokens) =>
      name === 'git' && subcommandIs(tokens, 'reset') && hasFlag(flags, null, 'hard') },
  { label: 'git clean force', matches: (name, flags, tokens) =>
      name === 'git' && subcommandIs(tokens, 'clean') && hasFlag(flags, 'f', 'force') },
  { label: 'force push', matches: (name, flags, tokens) =>
      name === 'git' && subcommandIs(tokens, 'push') &&
      (hasFlag(flags, 'f', 'force') || hasFlag(flags, null, 'force-with-lease')) },
  { label: 'world-writable chmod', matches: (name, flags, tokens) =>
      name === 'chmod' && hasFlag(flags, 'r', 'recursive') &&
      tokens.some(token => /^0?777$/.test(token) || /a\+rwx/i.test(token)) },
  { label: 'find with side effects', matches: (name, _flags, tokens) =>
      name === 'find' && tokens.some(token => /^-(?:exec|execdir|ok|okdir|fls|fprintf?)$/i.test(token)) },
];

// 読み取り専用として自動許可してよいのは、副作用フラグを持たない場合だけ。
const UNSAFE_FLAGS_FOR_SAFE_COMMANDS = {
  find: /^-(?:delete|exec|execdir|ok|okdir|fls|fprintf?)$/i,
};

function flagsOf(tokens) {
  return tokens.filter(token => token.startsWith('-')).map(token => token.toLowerCase());
}

// 短縮フラグは束ねられる（-rf）ので、束ねの中の文字も見る。
function hasFlag(flags, shortFlag, longFlag) {
  return flags.some(flag => {
    if (longFlag && flag === `--${longFlag}`) return true;
    if (!shortFlag) return false;
    if (flag.startsWith('--')) return false;
    return flag.slice(1).includes(shortFlag);
  });
}

function subcommandIs(tokens, name) {
  for (const token of tokens.slice(1)) {
    if (token.startsWith('-')) continue;
    return token.toLowerCase() === name;
  }
  return false;
}

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

// セグメント1つの分類。'dangerous' | 'safe' | 'audit' | 'unknown' を返す。
function classifySegment(segment) {
  const tokens = tokenize(segment);
  if (tokens.length === 0) return { kind: 'safe', labels: [] };

  const name = commandNameOf(tokens);
  const flags = flagsOf(tokens);

  // 引数の中身が実行されるコマンドは、何が動くか静的に読めない
  if (OPAQUE_COMMANDS.has(name)) return { kind: 'unknown', labels: [] };

  const labels = DANGEROUS_COMMANDS
    .filter(entry => entry.matches(name, flags, tokens))
    .map(entry => entry.label);
  if (labels.length > 0) return { kind: 'dangerous', labels };

  if (SAFE_READONLY_BASH.some(pattern => pattern.test(segment))) {
    const unsafeFlag = UNSAFE_FLAGS_FOR_SAFE_COMMANDS[name];
    if (unsafeFlag && tokens.some(token => unsafeFlag.test(token))) {
      return { kind: 'unknown', labels: [] };
    }
    return { kind: 'safe', labels: [] };
  }

  if (AUDIT_ONLY_BASH.some(pattern => pattern.test(segment))) {
    return { kind: 'audit', labels: [] };
  }

  return { kind: 'unknown', labels: [] };
}

// 判定はセグメント単位で行い、最も厳しい結果を採る。
// 先頭トークンだけを見ると `git status && rm -Rf ~` が auto-allow を通る。
function classifyBashPermission(command) {
  const value = String(command || '');
  if (!value.trim()) return null;

  const { segments, analyzable } = splitShellSegments(value);

  if (!analyzable) {
    return makeBashDecision(
      'ask-with-justification',
      'ask',
      'Command contains constructs that cannot be analysed statically.',
      {
        permissionMode: 'edit',
        reasons: ['unanalysable shell construct requires approval'],
      }
    );
  }

  const results = segments.map(classifySegment);
  const dangerous = [...new Set(results.flatMap(result => result.labels))];

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

  if (results.every(result => result.kind === 'safe')) {
    return makeBashDecision(
      'auto-allow',
      'allow',
      'Safe read-only inspection command.',
      { permissionMode: 'readonly' }
    );
  }

  if (results.every(result => result.kind === 'safe' || result.kind === 'audit')) {
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
  classifyBashPermission,
  detectBlockedActions,
  resolvePermission,
};
