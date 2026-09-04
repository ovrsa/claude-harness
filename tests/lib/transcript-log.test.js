/**
 * Tests for scripts/lib/transcript-log.js
 *
 * Run with: node tests/lib/transcript-log.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  collectToolEvents,
  toolFailureRateFromEvents,
  toolFailureRate,
  listTranscriptFiles,
  tokenUsage,
  sessionTurnCounts,
  commandInvocations,
} = require('../../scripts/lib/transcript-log');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'transcript-log-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** One assistant turn that calls a tool. */
function toolUse(at, sessionId, id, name) {
  return JSON.stringify({
    type: 'assistant',
    timestamp: at,
    sessionId,
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input: { a: 1 } }] },
  });
}

/** The matching result turn. */
function toolResult(at, sessionId, id, isError, body = 'out') {
  return JSON.stringify({
    type: 'user',
    timestamp: at,
    sessionId,
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: body }],
    },
  });
}

/** An assistant turn carrying the usage block Claude Code records. */
function assistantUsage(at, sessionId, model, usage) {
  return JSON.stringify({
    type: 'assistant',
    timestamp: at,
    sessionId,
    message: { role: 'assistant', model, usage, content: [{ type: 'text', text: 'ok' }] },
  });
}

/** A human turn. */
function userText(at, sessionId, text) {
  return JSON.stringify({
    type: 'user',
    timestamp: at,
    sessionId,
    message: { role: 'user', content: [{ type: 'text', text }] },
  });
}

function writeTranscript(dir, slug, sessionId, lines) {
  const projectDir = path.join(dir, slug);
  fs.mkdirSync(projectDir, { recursive: true });
  const file = path.join(projectDir, `${sessionId}.jsonl`);
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  return file;
}

function runTests() {
  console.log('\n=== Testing transcript-log.js ===\n');
  let passed = 0;
  let failed = 0;

  if (test('joins tool_use to tool_result by tool_use_id and records the error flag', () => {
    const dir = createTempDir();
    try {
      writeTranscript(dir, 'proj-a', 'sess-1', [
        toolUse('2026-08-10T00:00:00.000Z', 'sess-1', 'toolu_1', 'Bash'),
        toolResult('2026-08-10T00:00:01.000Z', 'sess-1', 'toolu_1', false),
        toolUse('2026-08-10T00:00:02.000Z', 'sess-1', 'toolu_2', 'Bash'),
        toolResult('2026-08-10T00:00:03.000Z', 'sess-1', 'toolu_2', true, 'Exit code 1'),
      ]);
      const events = collectToolEvents({
        transcriptDir: dir,
        window: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
      });
      assert.strictEqual(events.length, 2);
      const byId = new Map(events.map(e => [e.toolUseId, e]));
      assert.strictEqual(byId.get('toolu_1').status, 'ok');
      assert.strictEqual(byId.get('toolu_1').tool, 'Bash');
      assert.strictEqual(byId.get('toolu_1').sessionId, 'sess-1');
      assert.strictEqual(byId.get('toolu_2').status, 'failed');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('a tool_use with no result is pending, not a failure', () => {
    const dir = createTempDir();
    try {
      writeTranscript(dir, 'proj-a', 'sess-1', [
        toolUse('2026-08-10T00:00:00.000Z', 'sess-1', 'toolu_open', 'Read'),
      ]);
      const events = collectToolEvents({
        transcriptDir: dir,
        window: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
      });
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].status, 'pending');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('window filters on the tool_use timestamp', () => {
    const dir = createTempDir();
    try {
      writeTranscript(dir, 'proj-a', 'sess-1', [
        toolUse('2026-07-01T00:00:00.000Z', 'sess-1', 'old', 'Bash'),
        toolResult('2026-07-01T00:00:01.000Z', 'sess-1', 'old', false),
        toolUse('2026-08-10T00:00:00.000Z', 'sess-1', 'now', 'Bash'),
        toolResult('2026-08-10T00:00:01.000Z', 'sess-1', 'now', false),
      ]);
      const events = collectToolEvents({
        transcriptDir: dir,
        window: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
      });
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].toolUseId, 'now');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('malformed lines are skipped without throwing', () => {
    const dir = createTempDir();
    try {
      writeTranscript(dir, 'proj-a', 'sess-1', [
        '{ this is not json',
        '',
        toolUse('2026-08-10T00:00:00.000Z', 'sess-1', 'toolu_1', 'Edit'),
        toolResult('2026-08-10T00:00:01.000Z', 'sess-1', 'toolu_1', false),
        'null',
      ]);
      const events = collectToolEvents({
        transcriptDir: dir,
        window: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
      });
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].tool, 'Edit');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('reads across multiple project directories and sessions', () => {
    const dir = createTempDir();
    try {
      writeTranscript(dir, 'proj-a', 'sess-1', [
        toolUse('2026-08-10T00:00:00.000Z', 'sess-1', 'a1', 'Bash'),
        toolResult('2026-08-10T00:00:01.000Z', 'sess-1', 'a1', false),
      ]);
      writeTranscript(dir, 'proj-b', 'sess-2', [
        toolUse('2026-08-10T00:00:00.000Z', 'sess-2', 'b1', 'Write'),
        toolResult('2026-08-10T00:00:01.000Z', 'sess-2', 'b1', true),
      ]);
      const files = listTranscriptFiles({ transcriptDir: dir });
      assert.strictEqual(files.length, 2);
      const events = collectToolEvents({
        transcriptDir: dir,
        window: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
      });
      assert.strictEqual(events.length, 2);
      assert.deepStrictEqual(events.map(e => e.tool).sort(), ['Bash', 'Write']);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('subagent transcripts under <session>/subagents/ are included', () => {
    const dir = createTempDir();
    try {
      writeTranscript(dir, 'proj-a', 'sess-1', [
        toolUse('2026-08-10T00:00:00.000Z', 'sess-1', 'main1', 'Bash'),
        toolResult('2026-08-10T00:00:01.000Z', 'sess-1', 'main1', false),
      ]);
      // Real layout: projects/<slug>/<session-id>/subagents/agent-<id>.jsonl
      const subDir = path.join(dir, 'proj-a', 'sess-1', 'subagents');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(subDir, 'agent-abc123.jsonl'), `${[
        toolUse('2026-08-10T00:00:02.000Z', 'sess-1', 'sub1', 'Grep'),
        toolResult('2026-08-10T00:00:03.000Z', 'sess-1', 'sub1', true),
      ].join('\n')}\n`);

      const files = listTranscriptFiles({ transcriptDir: dir });
      assert.strictEqual(files.length, 2, `expected main + subagent, got ${files.length}`);
      const events = collectToolEvents({
        transcriptDir: dir,
        window: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
      });
      assert.deepStrictEqual(events.map(e => e.tool).sort(), ['Bash', 'Grep']);
      const grep = events.find(e => e.tool === 'Grep');
      assert.strictEqual(grep.status, 'failed');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('a missing transcript directory yields no events instead of throwing', () => {
    const events = collectToolEvents({
      transcriptDir: path.join(os.tmpdir(), 'transcript-log-does-not-exist-1234'),
      window: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
    });
    assert.deepStrictEqual(events, []);
  })) passed++; else failed++;

  if (test('toolFailureRateFromEvents uses real error flags, not a dangling proxy', () => {
    const events = [
      { tool: 'Bash', toolUseId: '1', occurredAt: 'x', sessionId: 's', status: 'ok' },
      { tool: 'Bash', toolUseId: '2', occurredAt: 'x', sessionId: 's', status: 'failed' },
      { tool: 'Bash', toolUseId: '3', occurredAt: 'x', sessionId: 's', status: 'ok' },
      { tool: 'Bash', toolUseId: '4', occurredAt: 'x', sessionId: 's', status: 'ok' },
      { tool: 'Read', toolUseId: '5', occurredAt: 'x', sessionId: 's', status: 'ok' },
    ];
    const { byTool, ranked } = toolFailureRateFromEvents(events);
    assert.strictEqual(byTool.Bash.total, 4);
    assert.strictEqual(byTool.Bash.failed, 1);
    assert.strictEqual(byTool.Bash.ok, 3);
    assert.strictEqual(byTool.Bash.failureRate, 0.25);
    assert.strictEqual(byTool.Read.failureRate, 0);
    // ranked is sorted by failureRate desc, so the failing tool leads.
    assert.strictEqual(ranked[0].tool, 'Bash');
    assert.strictEqual(ranked.length, 2);
  })) passed++; else failed++;

  if (test('pending calls are excluded from the failure rate denominator', () => {
    const events = [
      { tool: 'Bash', toolUseId: '1', occurredAt: 'x', sessionId: 's', status: 'ok' },
      { tool: 'Bash', toolUseId: '2', occurredAt: 'x', sessionId: 's', status: 'pending' },
    ];
    const { byTool } = toolFailureRateFromEvents(events);
    assert.strictEqual(byTool.Bash.total, 2);
    assert.strictEqual(byTool.Bash.pending, 1);
    // 0 failures out of 1 settled call.
    assert.strictEqual(byTool.Bash.failureRate, 0);
  })) passed++; else failed++;

  if (test('a tool named __proto__ is counted, not silently dropped', () => {
    const events = [
      { tool: '__proto__', toolUseId: '1', occurredAt: 'x', sessionId: 's', status: 'failed' },
      { tool: 'Bash', toolUseId: '2', occurredAt: 'x', sessionId: 's', status: 'ok' },
    ];
    const { byTool, ranked } = toolFailureRateFromEvents(events);
    // On a plain object, byTool['__proto__'] = {...} sets the prototype instead
    // of a key, so the entry vanishes from Object.entries and from the ranking.
    assert.strictEqual(ranked.length, 2, `expected both tools, got ${ranked.map(r => r.tool).join(',')}`);
    assert.ok(ranked.some(r => r.tool === '__proto__'));
    assert.strictEqual(Object.getPrototypeOf(byTool), null, 'byTool must not be prototype-mutable');
  })) passed++; else failed++;

  if (test('no events yields an empty ranking rather than NaN', () => {
    const { byTool, ranked } = toolFailureRateFromEvents([]);
    // Own keys, not deepStrictEqual({}) — byTool has a null prototype by design.
    assert.deepStrictEqual(Object.keys(byTool), []);
    assert.deepStrictEqual(ranked, []);
  })) passed++; else failed++;

  if (test('toolFailureRate composes collection and aggregation', () => {
    const dir = createTempDir();
    try {
      writeTranscript(dir, 'proj-a', 'sess-1', [
        toolUse('2026-08-10T00:00:00.000Z', 'sess-1', 'x1', 'Bash'),
        toolResult('2026-08-10T00:00:01.000Z', 'sess-1', 'x1', true),
      ]);
      const { ranked } = toolFailureRate({
        transcriptDir: dir,
        window: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
      });
      assert.strictEqual(ranked.length, 1);
      assert.strictEqual(ranked[0].tool, 'Bash');
      assert.strictEqual(ranked[0].failureRate, 1);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  // --- tokenUsage -----------------------------------------------------------
  // SQLite recorded 3,113 token_usage_observed events, every one of them with
  // input_tokens=null and status='missing'. The transcript carries the real
  // numbers, so this is not a port: it is the only place the data exists.

  if (test('tokenUsage sums input, output and cache tokens from message.usage', () => {
    const dir = createTempDir();
    try {
      writeTranscript(dir, 'proj-a', 'sess-1', [
        assistantUsage('2026-08-10T00:00:00.000Z', 'sess-1', 'claude-opus-5', {
          input_tokens: 10,
          output_tokens: 200,
          cache_read_input_tokens: 5000,
          cache_creation_input_tokens: 300,
        }),
        assistantUsage('2026-08-10T00:01:00.000Z', 'sess-1', 'claude-opus-5', {
          input_tokens: 4,
          output_tokens: 50,
          cache_read_input_tokens: 1000,
          cache_creation_input_tokens: 0,
        }),
      ]);
      const usage = tokenUsage({
        transcriptDir: dir,
        window: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
      });
      assert.strictEqual(usage.totals.records, 2);
      assert.strictEqual(usage.totals.input_tokens, 14);
      assert.strictEqual(usage.totals.output_tokens, 250);
      assert.strictEqual(usage.totals.cache_read_input_tokens, 6000);
      assert.strictEqual(usage.totals.cache_creation_input_tokens, 300);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('tokenUsage breaks totals down by model', () => {
    const dir = createTempDir();
    try {
      writeTranscript(dir, 'proj-a', 'sess-1', [
        assistantUsage('2026-08-10T00:00:00.000Z', 'sess-1', 'claude-opus-5', { input_tokens: 10, output_tokens: 100 }),
        assistantUsage('2026-08-10T00:01:00.000Z', 'sess-1', 'claude-haiku-4-5-20251001', { input_tokens: 2, output_tokens: 5 }),
      ]);
      const usage = tokenUsage({
        transcriptDir: dir,
        window: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
      });
      assert.strictEqual(usage.byModel['claude-opus-5'].output_tokens, 100);
      assert.strictEqual(usage.byModel['claude-haiku-4-5-20251001'].output_tokens, 5);
      // Ranked by output tokens so the model doing the work leads.
      assert.strictEqual(usage.ranked[0].model, 'claude-opus-5');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('tokenUsage filters on the turn timestamp', () => {
    const dir = createTempDir();
    try {
      writeTranscript(dir, 'proj-a', 'sess-1', [
        assistantUsage('2026-07-01T00:00:00.000Z', 'sess-1', 'claude-opus-5', { input_tokens: 999, output_tokens: 999 }),
        assistantUsage('2026-08-10T00:00:00.000Z', 'sess-1', 'claude-opus-5', { input_tokens: 1, output_tokens: 2 }),
      ]);
      const usage = tokenUsage({
        transcriptDir: dir,
        window: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
      });
      assert.strictEqual(usage.totals.records, 1);
      assert.strictEqual(usage.totals.output_tokens, 2);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('turns without a usage block are not counted as zero-token records', () => {
    const dir = createTempDir();
    try {
      writeTranscript(dir, 'proj-a', 'sess-1', [
        userText('2026-08-10T00:00:00.000Z', 'sess-1', 'do the thing'),
        toolUse('2026-08-10T00:00:01.000Z', 'sess-1', 't1', 'Bash'),
        assistantUsage('2026-08-10T00:00:02.000Z', 'sess-1', 'claude-opus-5', { input_tokens: 1, output_tokens: 2 }),
      ]);
      const usage = tokenUsage({
        transcriptDir: dir,
        window: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
      });
      // Only the one turn that actually reported usage.
      assert.strictEqual(usage.totals.records, 1);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('tokenUsage with no transcripts yields zeros, not NaN', () => {
    const usage = tokenUsage({
      transcriptDir: path.join(os.tmpdir(), 'transcript-log-none-9876'),
      window: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
    });
    assert.strictEqual(usage.totals.records, 0);
    assert.strictEqual(usage.totals.output_tokens, 0);
    assert.deepStrictEqual(usage.ranked, []);
  })) passed++; else failed++;

  if (test('a model named __proto__ is counted, not silently dropped', () => {
    const dir = createTempDir();
    try {
      writeTranscript(dir, 'proj-a', 'sess-1', [
        assistantUsage('2026-08-10T00:00:00.000Z', 'sess-1', '__proto__', { input_tokens: 1, output_tokens: 1 }),
        assistantUsage('2026-08-10T00:00:01.000Z', 'sess-1', 'claude-opus-5', { input_tokens: 1, output_tokens: 1 }),
      ]);
      const usage = tokenUsage({
        transcriptDir: dir,
        window: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
      });
      assert.strictEqual(usage.ranked.length, 2, `expected both models, got ${usage.ranked.map(r => r.model).join(',')}`);
      assert.strictEqual(Object.getPrototypeOf(usage.byModel), null, 'byModel must not be prototype-mutable');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  // --- sessionTurnCounts ----------------------------------------------------

  if (test('sessionTurnCounts counts human turns per session', () => {
    const dir = createTempDir();
    try {
      writeTranscript(dir, 'proj-a', 'sess-1', [
        userText('2026-08-10T00:00:00.000Z', 'sess-1', 'first ask'),
        assistantUsage('2026-08-10T00:00:01.000Z', 'sess-1', 'claude-opus-5', { output_tokens: 5 }),
        userText('2026-08-10T00:00:02.000Z', 'sess-1', 'second ask'),
      ]);
      const counts = sessionTurnCounts({
        transcriptDir: dir,
        window: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
      });
      assert.strictEqual(counts.bySession['sess-1'].turns, 2);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('tool results are not human turns', () => {
    const dir = createTempDir();
    try {
      writeTranscript(dir, 'proj-a', 'sess-1', [
        userText('2026-08-10T00:00:00.000Z', 'sess-1', 'only ask'),
        toolUse('2026-08-10T00:00:01.000Z', 'sess-1', 't1', 'Bash'),
        // Recorded with type 'user', which is why a naive type check turns a
        // tool-heavy session into a high-intervention one.
        toolResult('2026-08-10T00:00:02.000Z', 'sess-1', 't1', false, 'output text'),
        toolUse('2026-08-10T00:00:03.000Z', 'sess-1', 't2', 'Bash'),
        toolResult('2026-08-10T00:00:04.000Z', 'sess-1', 't2', false, 'more output'),
      ]);
      const counts = sessionTurnCounts({
        transcriptDir: dir,
        window: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
      });
      assert.strictEqual(counts.bySession['sess-1'].turns, 1, 'tool results must not inflate the turn count');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('harness-injected user turns are not human turns', () => {
    const dir = createTempDir();
    try {
      // Measured across 269 transcripts: 542 of 1,818 counted "user turns"
      // (30%) were injected by the harness, not typed by anyone. In one
      // tool-heavy session the overcount was 3.25x.
      const inject = (at, text, extra = {}) => JSON.stringify({
        type: 'user',
        timestamp: at,
        sessionId: 'sess-1',
        ...extra,
        message: { role: 'user', content: [{ type: 'text', text }] },
      });
      writeTranscript(dir, 'proj-a', 'sess-1', [
        userText('2026-08-10T00:00:00.000Z', 'sess-1', 'the only thing a human said'),
        inject('2026-08-10T00:00:01.000Z', '<task-notification>\n<task-id>abc</task-id>\n</task-notification>'),
        inject('2026-08-10T00:00:02.000Z', '<local-command-stdout>output</local-command-stdout>'),
        inject('2026-08-10T00:00:03.000Z', '<local-command-caveat>Caveat</local-command-caveat>', { isMeta: true }),
        inject('2026-08-10T00:00:04.000Z', 'This session is being continued from a previous conversation that ran out of context.'),
        inject('2026-08-10T00:00:05.000Z', '<system-reminder>background context</system-reminder>'),
      ]);
      const counts = sessionTurnCounts({
        transcriptDir: dir,
        window: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
      });
      assert.strictEqual(counts.bySession['sess-1'].turns, 1, 'injected turns must not count as human');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('slash commands are counted separately from prose turns', () => {
    const dir = createTempDir();
    try {
      writeTranscript(dir, 'proj-a', 'sess-1', [
        userText('2026-08-10T00:00:00.000Z', 'sess-1', 'do the thing'),
        JSON.stringify({
          type: 'user',
          timestamp: '2026-08-10T00:00:01.000Z',
          sessionId: 'sess-1',
          message: { role: 'user', content: [{ type: 'text', text: '<command-name>/verify</command-name>' }] },
        }),
      ]);
      const counts = sessionTurnCounts({
        transcriptDir: dir,
        window: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
      });
      // A slash command is an interaction but not a correction, and /compact is
      // session maintenance. Kept as its own field rather than folded into a
      // number that would then mean two things.
      assert.strictEqual(counts.bySession['sess-1'].turns, 1);
      assert.strictEqual(counts.bySession['sess-1'].commands, 1);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('sessions above the threshold are ranked, empty when none qualify', () => {
    const dir = createTempDir();
    try {
      writeTranscript(dir, 'proj-a', 'quiet', [
        userText('2026-08-10T00:00:00.000Z', 'quiet', 'one'),
      ]);
      writeTranscript(dir, 'proj-a', 'busy', [
        userText('2026-08-10T00:00:00.000Z', 'busy', 'one'),
        userText('2026-08-10T00:00:01.000Z', 'busy', 'two'),
        userText('2026-08-10T00:00:02.000Z', 'busy', 'three'),
      ]);
      const window = { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' };
      const counts = sessionTurnCounts({ transcriptDir: dir, window, threshold: 2 });
      assert.deepStrictEqual(counts.ranked.map(r => r.sessionId), ['busy']);
      const none = sessionTurnCounts({ transcriptDir: dir, window, threshold: 99 });
      assert.deepStrictEqual(none.ranked, []);
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  // --- commandInvocations ---------------------------------------------------
  // Replaces the command-telemetry.js hook, retired 2026-08-20. Measured before
  // removal: the hook had recorded 3 invocations since 2026-08-18, while the
  // transcripts held 151 across 10+ commands since 2026-07-10 -- the hook saw
  // about 2%, because built-in commands like /effort and /model never reach a
  // UserPromptSubmit hook.

  if (test('commandInvocations counts slash commands from the transcript', () => {
    const dir = createTempDir();
    try {
      const cmd = (at, name) => JSON.stringify({
        type: 'user',
        timestamp: at,
        sessionId: 'sess-1',
        message: {
          role: 'user',
          content: [{ type: 'text', text: `<command-name>/${name}</command-name>\n<command-message>${name}</command-message>` }],
        },
      });
      writeTranscript(dir, 'proj-a', 'sess-1', [
        cmd('2026-08-10T00:00:00.000Z', 'verify'),
        cmd('2026-08-10T00:01:00.000Z', 'verify'),
        cmd('2026-08-10T00:02:00.000Z', 'docs-build'),
        userText('2026-08-10T00:03:00.000Z', 'sess-1', 'not a command'),
        // A path is not a command; the old hook's pattern excluded these too.
        userText('2026-08-10T00:04:00.000Z', 'sess-1', '/Users/someone/notes.md'),
      ]);
      const result = commandInvocations({
        transcriptDir: dir,
        window: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
      });
      assert.strictEqual(result.total, 3);
      assert.strictEqual(result.byCommand.verify, 2);
      assert.strictEqual(result.byCommand['docs-build'], 1);
      assert.strictEqual(result.ranked[0].command, 'verify');
      assert.strictEqual(Object.getPrototypeOf(result.byCommand), null, 'byCommand must not be prototype-mutable');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('commandInvocations with no transcripts yields zero, not NaN', () => {
    const result = commandInvocations({
      transcriptDir: path.join(os.tmpdir(), 'transcript-log-nocmd-5555'),
      window: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
    });
    assert.strictEqual(result.total, 0);
    assert.deepStrictEqual(result.ranked, []);
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
