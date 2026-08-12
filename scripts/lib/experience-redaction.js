const crypto = require('crypto');

const REDACTED = '[REDACTED]';
const TRUNCATED = '[TRUNCATED]';
const SENSITIVE_KEY = /(authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|password|passwd|secret|credential|cookie|private[-_]?key)/i;
const SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(?:sk|pk|rk|ghp|gho|github_pat|xox[baprs]|AKIA)[-_][A-Za-z0-9._-]{8,}/g,
  /\b(?:API_KEY|TOKEN|PASSWORD|SECRET|AUTHORIZATION)\s*[:=]\s*[^\s,;]+/gi,
];

function looksOpaque(value) {
  return value.length >= 48
    && !value.includes('/')
    && !value.includes(' ')
    && /^[A-Za-z0-9._~+/=-]+$/.test(value);
}

function redactString(value, maxLength = 2048) {
  const safeDigests = [];
  let output = value.replace(/sha256:[a-f0-9]{64}/gi, (digest) => {
    const marker = `[SAFE_DIGEST_${safeDigests.length}]`;
    safeDigests.push(digest);
    return marker;
  });
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, (match) => {
      if (/^Bearer\s/i.test(match)) return `Bearer ${REDACTED}`;
      const separator = match.match(/\s*[:=]\s*/);
      if (separator) return `${match.slice(0, match.indexOf(separator[0]))}${separator[0]}${REDACTED}`;
      return REDACTED;
    });
  }

  output = output.replace(/[A-Za-z0-9._~+/=-]{48,}/g, (match) => (
    looksOpaque(match) ? REDACTED : match
  ));
  output = output.replace(/\[SAFE_DIGEST_(\d+)\]/g, (_, index) => safeDigests[Number(index)] || REDACTED);

  if (output.length > maxLength) {
    return `${output.slice(0, maxLength)}…${TRUNCATED}`;
  }
  return output;
}

function redactValue(value, options = {}, depth = 0, seen = new WeakSet()) {
  const maxDepth = options.maxDepth ?? 8;
  const maxEntries = options.maxEntries ?? 100;
  const maxString = options.maxString ?? 2048;

  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') return redactString(value, maxString);
  if (typeof value !== 'object') return redactString(String(value), maxString);
  if (depth >= maxDepth) return TRUNCATED;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (Array.isArray(value)) {
    const result = value.slice(0, maxEntries).map((item) => redactValue(item, options, depth + 1, seen));
    if (value.length > maxEntries) result.push(TRUNCATED);
    return result;
  }

  const result = {};
  const entries = Object.entries(value).slice(0, maxEntries);
  for (const [key, child] of entries) {
    result[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactValue(child, options, depth + 1, seen);
  }
  if (Object.keys(value).length > maxEntries) result._truncated = true;
  return result;
}

function sanitizeToolInput(toolName, input) {
  const sanitized = redactValue(input, { maxDepth: 6, maxEntries: 60, maxString: 1500 });
  if (typeof toolName === 'string' && /^(Bash|exec_command)$/i.test(toolName) && sanitized && typeof sanitized.command === 'string') {
    const lines = sanitized.command.split(/\r?\n/);
    if (lines.length > 1) {
      sanitized.command = {
        firstLine: redactString(lines[0], 500),
        multiline: true,
        lineCount: lines.length,
        digest: `sha256:${crypto.createHash('sha256').update(input.command).digest('hex').slice(0, 16)}`,
      };
    }
  }
  return sanitized;
}

function sanitizeToolResult(toolName, result) {
  const sanitized = redactValue(result, { maxDepth: 6, maxEntries: 60, maxString: 3000 });
  const serialized = JSON.stringify(sanitized);
  if (serialized.length <= 4096) return sanitized;
  return {
    tool: typeof toolName === 'string' ? toolName.slice(0, 100) : 'unknown',
    preview: redactString(serialized, 3500),
    truncated: TRUNCATED,
  };
}

function classifyFeedbackSignal(prompt) {
  const text = typeof prompt === 'string' ? prompt.trim() : '';
  let outcome = 'unknown';
  let confidence = 'low';

  if (/(?:中止|やめ(?:て|る)?|取り下げ|キャンセル)/i.test(text)) {
    outcome = 'abandoned';
    confidence = 'medium';
  } else if (/(?:違う|間違|ではなく|じゃなく|修正|訂正|意図しない)/i.test(text)) {
    outcome = 'corrected';
    confidence = 'medium';
  } else if (/(?:失敗|動かない|壊れ|エラー|fail(?:ed|ure)?|broken)/i.test(text)) {
    outcome = 'failed';
    confidence = 'medium';
  } else if (/^(?:ok|okay|y|yes|おk|おｋ|了解|承認|進めて|お願いします)[。.!！\s]*$/i.test(text)) {
    outcome = 'accepted';
    confidence = 'medium';
  }

  return {
    outcome,
    confidence,
    source: 'sanitized-user-feedback-signal',
  };
}

module.exports = {
  REDACTED,
  TRUNCATED,
  classifyFeedbackSignal,
  redactString,
  redactValue,
  sanitizeToolInput,
  sanitizeToolResult,
};
