'use strict';

/**
 * Reads Claude Code's own JSONL transcripts as the execution-trace log.
 *
 * Layout: <home>/.claude/projects/<project-slug>/<session-id>.jsonl
 * One file per session; a tool call and its result always live in the same file,
 * so joins never cross files.
 *
 * This replaces the `tool_executions` SQLite table, which recorded only
 * started/completed and inferred failure from start records that had no
 * matching completion. The transcript carries the real `is_error` flag.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { inWindow } = require('./log-window');

function getTranscriptDir(homeDir = os.homedir()) {
  return path.join(homeDir, '.claude', 'projects');
}

/**
 * Two layouts exist and both carry real tool calls:
 *   projects/<slug>/<session-id>.jsonl                        main session
 *   projects/<slug>/<session-id>/subagents/agent-<id>.jsonl    subagent
 * so the walk recurses rather than reading a fixed depth.
 */
function listTranscriptFiles(options = {}) {
  const root = options.transcriptDir || getTranscriptDir(options.homeDir);
  const files = [];

  const walk = (dir, relative) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, [...relative, entry.name]);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;

      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(full).mtimeMs;
      } catch {
        continue;
      }
      const base = entry.name.replace(/\.jsonl$/, '');
      const isSubagent = relative.length > 1;
      files.push({
        path: full,
        projectSlug: relative[0] || '',
        sessionId: isSubagent ? relative[1] : base,
        agentId: isSubagent ? base : null,
        mtimeMs,
      });
    }
  };

  walk(root, []);
  return files;
}

function parseLines(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const records = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (parsed && typeof parsed === 'object') records.push(parsed);
  }
  return records;
}

function contentBlocks(record) {
  const content = record && record.message && record.message.content;
  return Array.isArray(content) ? content : [];
}

/**
 * mtime is the last write, so a file untouched before the window opened cannot
 * hold in-window records.
 */
function predatesWindow(file, window) {
  return Boolean(window && window.start && file.mtimeMs && file.mtimeMs < Date.parse(window.start));
}

/**
 * Collect one event per tool call, joined to its result.
 * status: 'ok' | 'failed' | 'pending' (no result recorded yet)
 *
 * The window filters on the tool call's timestamp, so a call near the window
 * edge keeps its verdict even when the result lands after the window ends.
 */
function collectToolEvents(options = {}) {
  const { window } = options;
  const files = options.files || listTranscriptFiles(options);
  const events = [];

  for (const file of files) {
    if (predatesWindow(file, window)) continue;

    const records = parseLines(file.path);
    const results = new Map();
    for (const record of records) {
      for (const block of contentBlocks(record)) {
        if (block && block.type === 'tool_result' && block.tool_use_id) {
          results.set(block.tool_use_id, block.is_error === true ? 'failed' : 'ok');
        }
      }
    }

    for (const record of records) {
      const at = typeof record.timestamp === 'string' ? record.timestamp : '';
      if (!inWindow(at, window)) continue;
      for (const block of contentBlocks(record)) {
        if (!block || block.type !== 'tool_use' || !block.id) continue;
        events.push({
          tool: typeof block.name === 'string' ? block.name : 'unknown',
          toolUseId: block.id,
          occurredAt: at,
          sessionId: record.sessionId || file.sessionId,
          projectSlug: file.projectSlug,
          status: results.get(block.id) || 'pending',
        });
      }
    }
  }

  return events;
}

/**
 * Per-tool failure rates. Pending calls count toward `total` but are excluded
 * from the rate, so an in-flight call never reads as a failure.
 */
function toolFailureRateFromEvents(events = []) {
  // Null-prototype: tool names come from the transcript, and on a plain object
  // byTool['__proto__'] = {...} would set the prototype instead of a key,
  // dropping that tool from Object.entries and from the ranking.
  const byTool = Object.create(null);
  for (const event of events) {
    const name = event.tool || 'unknown';
    if (!byTool[name]) byTool[name] = { total: 0, ok: 0, failed: 0, pending: 0, failureRate: 0 };
    const entry = byTool[name];
    entry.total += 1;
    if (event.status === 'failed') entry.failed += 1;
    else if (event.status === 'pending') entry.pending += 1;
    else entry.ok += 1;
  }

  for (const entry of Object.values(byTool)) {
    const settled = entry.ok + entry.failed;
    entry.failureRate = settled > 0 ? entry.failed / settled : 0;
  }

  const ranked = Object.entries(byTool)
    .map(([tool, stats]) => ({ tool, ...stats }))
    .sort((a, b) => b.failureRate - a.failureRate || b.total - a.total);

  return { byTool, ranked };
}

function toolFailureRate(options = {}) {
  return toolFailureRateFromEvents(collectToolEvents(options));
}

/** The usage fields Claude Code records on an assistant turn. */
const TOKEN_FIELDS = [
  'input_tokens',
  'output_tokens',
  'cache_read_input_tokens',
  'cache_creation_input_tokens',
];

function emptyTokenBucket() {
  const bucket = { records: 0 };
  for (const field of TOKEN_FIELDS) bucket[field] = 0;
  return bucket;
}

/**
 * Token counts per model, from `message.usage`.
 *
 * This is not a port of the SQLite metric. `token_usage_observed` recorded 3,113
 * events and every one carried input_tokens=null / status='missing', so the KPI
 * had 0% coverage for its whole life. The transcript is where the numbers are.
 *
 * No cost estimate: unit prices change and would become a maintained value in
 * the harness. Token counts are the fact; pricing is not.
 */
function tokenUsage(options = {}) {
  const { window } = options;
  const files = options.files || listTranscriptFiles(options);
  // Null-prototype: model names come from the transcript, and a model literally
  // named __proto__ would set the prototype instead of a key on a plain object.
  const byModel = Object.create(null);
  const totals = emptyTokenBucket();

  for (const file of files) {
    if (predatesWindow(file, window)) continue;

    for (const record of parseLines(file.path)) {
      const at = typeof record.timestamp === 'string' ? record.timestamp : '';
      if (!inWindow(at, window)) continue;

      const message = record.message;
      const usage = message && message.usage;
      if (!usage || typeof usage !== 'object') continue;

      // A turn that reported no field at all is not a zero-token turn, it is a
      // turn with no usage block. Counting it would dilute the record count the
      // same way the SQLite metric did.
      const present = TOKEN_FIELDS.filter(field => Number.isFinite(Number(usage[field])));
      if (present.length === 0) continue;

      const model = typeof message.model === 'string' && message.model ? message.model : 'unknown';
      if (!byModel[model]) byModel[model] = emptyTokenBucket();

      byModel[model].records += 1;
      totals.records += 1;
      for (const field of present) {
        const value = Number(usage[field]);
        byModel[model][field] += value;
        totals[field] += value;
      }
    }
  }

  const ranked = Object.entries(byModel)
    .map(([model, stats]) => ({ model, ...stats }))
    .sort((a, b) => b.output_tokens - a.output_tokens || b.records - a.records);

  return { totals, byModel, ranked };
}

/**
 * A block contributes human text only if it carries a `text` field. A
 * `tool_result` block carries `content`, so it is recorded with type 'user' but
 * is not a human turn — counting it turns a tool-heavy session into a
 * high-intervention one.
 */
function humanTurnText(record) {
  const raw = (record.message && record.message.content) ?? record.content;
  if (typeof raw === 'string') return raw.trim();
  if (!Array.isArray(raw)) return '';
  return raw.map(block => (block && typeof block.text === 'string' ? block.text : '')).join(' ').trim();
}

/**
 * Markers on text the harness injected into the user role. Measured across 269
 * transcripts: 542 of 1,818 turns that a naive `type === 'user'` check counted
 * were injected, not typed. Nobody intervened; the harness reported to itself.
 */
const INJECTED_PREFIXES = [
  '<task-notification>',
  '<local-command-stdout>',
  '<local-command-caveat>',
  '<system-reminder>',
  'This session is being continued from a previous conversation',
];

/** A slash command the operator typed, which is an interaction but not a correction. */
const COMMAND_PREFIXES = ['<command-name>', '<command-message>', '<command-args>'];

function classifyUserTurn(record) {
  // isMeta marks harness plumbing outright.
  if (record.isMeta) return 'injected';
  const text = humanTurnText(record);
  if (!text) return 'none';
  if (COMMAND_PREFIXES.some(prefix => text.startsWith(prefix))) return 'command';
  if (INJECTED_PREFIXES.some(prefix => text.startsWith(prefix))) return 'injected';
  return 'human';
}

/**
 * Human turns per session.
 *
 * session-end.js persisted this as `human_intervention_count`
 * (userMessages.length - 1) and it was renamed to a turn count on 2026-08-19.
 * Both names overstated it: the count included task notifications, local
 * command output, compact continuations and system reminders. `turns` is prose
 * a human wrote; `commands` is slash invocations, kept apart so one number does
 * not mean two things.
 */
function sessionTurnCounts(options = {}) {
  const { window } = options;
  const threshold = Number.isFinite(Number(options.threshold)) ? Number(options.threshold) : 0;
  const files = options.files || listTranscriptFiles(options);
  const bySession = Object.create(null);

  for (const file of files) {
    if (predatesWindow(file, window)) continue;

    for (const record of parseLines(file.path)) {
      const at = typeof record.timestamp === 'string' ? record.timestamp : '';
      if (!inWindow(at, window)) continue;

      const isUser = record.type === 'user' || record.role === 'user'
        || (record.message && record.message.role === 'user');
      if (!isUser) continue;

      const kind = classifyUserTurn(record);
      if (kind !== 'human' && kind !== 'command') continue;

      const sessionId = record.sessionId || file.sessionId || 'unknown';
      if (!bySession[sessionId]) {
        bySession[sessionId] = {
          sessionId,
          turns: 0,
          commands: 0,
          firstAt: at,
          lastAt: at,
          projectSlug: file.projectSlug,
        };
      }
      const entry = bySession[sessionId];
      if (kind === 'human') entry.turns += 1;
      else entry.commands += 1;
      if (at && (!entry.firstAt || at < entry.firstAt)) entry.firstAt = at;
      if (at && at > entry.lastAt) entry.lastAt = at;
    }
  }

  const ranked = Object.values(bySession)
    .filter(entry => entry.turns >= threshold)
    .sort((a, b) => b.turns - a.turns || String(b.lastAt).localeCompare(String(a.lastAt)));

  return { bySession, ranked };
}

/**
 * `<command-name>/verify</command-name>` as Claude Code records it. The old
 * hook matched the raw prompt with /^\/([a-z][a-z0-9-]*)(?:\s|$)/i to keep
 * filesystem paths out; the tag does that on its own.
 */
const COMMAND_TAG = /<command-name>\/?([a-z][a-z0-9-]*)<\/command-name>/i;

/**
 * Which slash commands were actually invoked.
 *
 * Replaces the command-telemetry.js UserPromptSubmit hook, retired 2026-08-20.
 * Measured before removal: the hook had 3 rows since 2026-08-18 while the
 * transcripts held 151 invocations across 10+ commands since 2026-07-10. It saw
 * roughly 2%, because built-in commands (/effort, /model, /compact, /clear --
 * the four most used) never reach a hook.
 *
 * This is the instrument that retires commands: /worktree-start was demoted on
 * the evidence of two invocations in six months.
 */
function commandInvocations(options = {}) {
  const { window } = options;
  const files = options.files || listTranscriptFiles(options);
  const byCommand = Object.create(null);
  let total = 0;

  for (const file of files) {
    if (predatesWindow(file, window)) continue;

    for (const record of parseLines(file.path)) {
      const at = typeof record.timestamp === 'string' ? record.timestamp : '';
      if (!inWindow(at, window)) continue;

      const isUser = record.type === 'user' || record.role === 'user'
        || (record.message && record.message.role === 'user');
      if (!isUser) continue;

      const match = COMMAND_TAG.exec(humanTurnText(record));
      if (!match) continue;

      const command = match[1].toLowerCase();
      byCommand[command] = (byCommand[command] || 0) + 1;
      total += 1;
    }
  }

  const ranked = Object.entries(byCommand)
    .map(([command, count]) => ({ command, count }))
    .sort((a, b) => b.count - a.count || a.command.localeCompare(b.command));

  return { total, byCommand, ranked };
}

module.exports = {
  getTranscriptDir,
  listTranscriptFiles,
  collectToolEvents,
  toolFailureRateFromEvents,
  toolFailureRate,
  tokenUsage,
  sessionTurnCounts,
  commandInvocations,
};
