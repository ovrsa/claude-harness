'use strict';

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

function decision(policyClass, behavior, message, details = {}) {
  return {
    behavior,
    policy_class: policyClass,
    message: policyClass + ': ' + message,
    ...details,
  };
}

function classifyBashPermission(command) {
  const value = String(command || '');
  if (!value.trim()) return null;

  const dangerous = DANGEROUS_BASH
    .filter((entry) => entry.pattern.test(value))
    .map((entry) => entry.label);
  if (dangerous.length > 0) {
    return decision(
      'hard-deny',
      'deny',
      'Denied by personal harness boundary. Use a safer alternative or request an explicit override.',
      { interrupt: true, blocked_actions: dangerous }
    );
  }

  if (SAFE_READONLY_BASH.some((pattern) => pattern.test(value))) {
    return decision('auto-allow', 'allow', 'Safe read-only inspection command.');
  }

  if (AUDIT_ONLY_BASH.some((pattern) => pattern.test(value))) {
    return decision('audit-only', 'allow', 'Low-risk metadata command allowed.');
  }

  return decision(
    'ask-with-justification',
    'ask',
    'Requires explicit human approval with a concrete justification.'
  );
}

module.exports = {
  AUDIT_ONLY_BASH,
  DANGEROUS_BASH,
  SAFE_READONLY_BASH,
  classifyBashPermission,
};
