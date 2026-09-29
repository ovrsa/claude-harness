#!/usr/bin/env node
'use strict';

/**
 * Query the run records under harness/data/runs/.
 *
 * Meta-Harness Appendix D: raw filesystem access gets cumbersome as history
 * grows, so a small CLI that lists runs, shows one, diffs two, and resolves a
 * run to its raw transcript saves the reader from navigating by hand.
 *
 * `show` prints evidence bodies verbatim. Summarising here would rebuild the
 * exact condition the paper measured as weakest.
 */

const fs = require('fs');

const { listRunRecords, readRunRecord, getRunsDir } = require('./lib/run-record');
const { listTranscriptFiles } = require('./lib/transcript-log');
const { findCodexRollouts } = require('./lib/codex-transcripts');

// trace exits 2 when a run's transcripts are not all found: a partial trace read as the whole run
// is the failure this exit code guards against. 1 stays for bad input.
const EXIT_TRACE_INCOMPLETE = 2;

function parseArgs(argv) {
  const options = { command: '', args: [], runsDir: '', transcriptDir: '', codexHome: '', limit: 0, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--runs-dir') options.runsDir = argv[++i] || '';
    else if (arg === '--transcript-dir') options.transcriptDir = argv[++i] || '';
    else if (arg === '--codex-home') options.codexHome = argv[++i] || '';
    else if (arg === '--limit') options.limit = Number(argv[++i] || 0) || 0;
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.command = 'help';
    else if (!options.command) options.command = arg;
    else options.args.push(arg);
  }
  return options;
}

function printHelp() {
  process.stdout.write([
    'Run Records',
    '',
    'Usage:',
    '  node harness/scripts/runs-cli.js list [--limit N]',
    '  node harness/scripts/runs-cli.js show <run-id> [--json]',
    '  node harness/scripts/runs-cli.js diff <run-a> <run-b>',
    '  node harness/scripts/runs-cli.js trace <run-id>',
    '',
    'Reads harness/data/runs/<YYYY-MM-DD>-<slug>/ — gate evidence bodies, lifecycle events,',
    'and the session ids that resolve to the raw JSONL transcripts.',
    '',
    'Options:',
    '  --runs-dir <path>        override the run record directory',
    '  --transcript-dir <path>  override where trace resolves Claude Code transcripts',
    '  --codex-home <path>      override the Codex home trace searches (default: $CODEX_HOME or ~/.codex)',
    '',
    'trace exits 0 when every session resolves, 2 when the run is unlinked, missing or partial,',
    'and 1 on bad input.',
    '',
  ].join('\n'));
}

function resolveRunsDir(options) {
  return options.runsDir || getRunsDir({ repoRoot: process.cwd() });
}

function commandList(options) {
  const runsDir = resolveRunsDir(options);
  let runs = listRunRecords({ runsDir });
  if (runs.length === 0) {
    process.stdout.write(`no run records under ${runsDir}\n`);
    return 0;
  }
  if (options.limit > 0) runs = runs.slice(0, options.limit);

  for (const run of runs) {
    const gates = Array.isArray(run.gates) && run.gates.length ? run.gates.join('+') : '-';
    const sessions = Array.isArray(run.session_ids) ? run.session_ids.length : 0;
    process.stdout.write(`${run.run_id}  gates=${gates}  sessions=${sessions}  branch=${run.branch || '-'}\n`);
  }
  return 0;
}

function commandShow(options) {
  const runsDir = resolveRunsDir(options);
  const runId = options.args[0] || '';
  const record = readRunRecord({ runsDir, runId });
  if (!record) {
    process.stderr.write(`runs-cli: no run record for ${runId}\n`);
    return 1;
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    return 0;
  }

  process.stdout.write(`run_id     ${record.run_id}\n`);
  process.stdout.write(`branch     ${record.branch || '-'}\n`);
  process.stdout.write(`repo_root  ${record.repo_root || '-'}\n`);
  process.stdout.write(`sessions   ${(record.session_ids || []).join(', ') || '-'}\n`);
  process.stdout.write(`started    ${record.started_at || '-'}\n`);
  if (record.merge_commit) process.stdout.write(`merge      ${record.merge_commit}\n`);

  if (record.events.length > 0) {
    process.stdout.write('\nevents\n');
    for (const event of record.events) {
      process.stdout.write(`  ${event.occurred_at || '-'}  ${event.type || '-'}  ${event.status || ''}\n`);
    }
  }

  for (const [kind, evidence] of Object.entries(record.evidence)) {
    process.stdout.write(`\n=== evidence: ${kind} (captured ${evidence.captured_at}) ===\n`);
    process.stdout.write(evidence.body.endsWith('\n') ? evidence.body : `${evidence.body}\n`);
  }
  return 0;
}

function commandDiff(options) {
  const runsDir = resolveRunsDir(options);
  const [idA, idB] = options.args;
  const a = readRunRecord({ runsDir, runId: idA });
  const b = readRunRecord({ runsDir, runId: idB });
  if (!a || !b) {
    process.stderr.write(`runs-cli: need two readable run records (${idA}, ${idB})\n`);
    return 1;
  }

  process.stdout.write(`${idA} vs ${idB}\n\n`);

  // meta.gates records which gates ran; evidence records what was captured.
  // They can disagree, so report both rather than inferring one from the other.
  const gatesA = new Set(Array.isArray(a.gates) ? a.gates : []);
  const gatesB = new Set(Array.isArray(b.gates) ? b.gates : []);
  for (const gate of [...new Set([...gatesA, ...gatesB])].sort()) {
    if (gatesA.has(gate) && !gatesB.has(gate)) process.stdout.write(`  gate ${gate}: only in ${idA}\n`);
    else if (!gatesA.has(gate) && gatesB.has(gate)) process.stdout.write(`  gate ${gate}: only in ${idB}\n`);
  }

  const kinds = new Set([...Object.keys(a.evidence), ...Object.keys(b.evidence)]);
  for (const kind of [...kinds].sort()) {
    const left = a.evidence[kind];
    const right = b.evidence[kind];
    if (left && !right) process.stdout.write(`  ${kind}: only in ${idA}\n`);
    else if (!left && right) process.stdout.write(`  ${kind}: only in ${idB}\n`);
    else if (left.body === right.body) process.stdout.write(`  ${kind}: identical\n`);
    else {
      const delta = right.body.length - left.body.length;
      process.stdout.write(`  ${kind}: differs (${delta >= 0 ? '+' : ''}${delta} chars)\n`);
    }
  }

  const eventsA = a.events.map(e => e.type).join(',');
  const eventsB = b.events.map(e => e.type).join(',');
  if (eventsA !== eventsB) {
    process.stdout.write(`\n  events ${idA}: ${eventsA || '-'}\n`);
    process.stdout.write(`  events ${idB}: ${eventsB || '-'}\n`);
  }
  return 0;
}

/**
 * The model a transcript used, at each line where it changed (1-based JSONL lines). Claude Code
 * records it per assistant message, Codex per turn_context. `<synthetic>` is Claude Code's
 * placeholder for messages no model produced.
 */
function modelChanges(filePath) {
  const changes = [];
  let previous = null;
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return changes;
  }
  content.split('\n').forEach((line, index) => {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      return;
    }
    const model = record?.type === 'turn_context' ? record.payload?.model
      : record?.type === 'assistant' ? record.message?.model : null;
    if (typeof model !== 'string' || model === '<synthetic>' || model === previous) return;
    changes.push({ line: index + 1, model });
    previous = model;
  });
  return changes;
}

function commandTrace(options) {
  const runsDir = resolveRunsDir(options);
  const runId = options.args[0] || '';
  const record = readRunRecord({ runsDir, runId });
  if (!record) {
    process.stderr.write(`runs-cli: no run record for ${runId}\n`);
    return 1;
  }

  const sessionIds = Array.isArray(record.session_ids) ? record.session_ids : [];
  if (sessionIds.length === 0) {
    process.stdout.write(`${runId}: unlinked (no session ids recorded, so no transcript can be resolved)\n`);
    return EXIT_TRACE_INCOMPLETE;
  }

  const files = listTranscriptFiles(
    options.transcriptDir ? { transcriptDir: options.transcriptDir } : {}
  );
  const bySession = new Map();
  for (const file of files) {
    if (!bySession.has(file.sessionId)) bySession.set(file.sessionId, []);
    bySession.get(file.sessionId).push(file.path);
  }
  for (const [sessionId, paths] of findCodexRollouts(sessionIds, { codexHome: options.codexHome })) {
    bySession.set(sessionId, [...(bySession.get(sessionId) || []), ...paths]);
  }

  const sessions = sessionIds.map(sessionId => ({ sessionId, paths: bySession.get(sessionId) || [] }));
  const resolvedCount = sessions.filter(session => session.paths.length > 0).length;
  const status = resolvedCount === sessions.length ? 'resolved' : resolvedCount > 0 ? 'partial' : 'missing';
  process.stdout.write(`${runId}: ${status} (${resolvedCount}/${sessions.length} sessions)\n`);

  const models = [];
  for (const { sessionId, paths } of sessions) {
    if (paths.length === 0) {
      // Transcript retention is the runtime's, not the harness's: an older run
      // legitimately has no trace left. Say so instead of omitting the session.
      process.stdout.write(`${sessionId}: missing (no transcript found; retention or different machine)\n`);
      continue;
    }
    for (const filePath of paths) {
      let size = '';
      try {
        size = ` (${Math.round(fs.statSync(filePath).size / 1024)} KB)`;
      } catch {
        size = '';
      }
      process.stdout.write(`${sessionId}: ${filePath}${size}\n`);
      for (const change of modelChanges(filePath)) {
        process.stdout.write(`  line ${change.line}: model=${change.model}\n`);
        if (!models.includes(change.model)) models.push(change.model);
      }
    }
  }
  if (models.length > 0) process.stdout.write(`models: ${models.join(', ')}\n`);
  return status === 'resolved' ? 0 : EXIT_TRACE_INCOMPLETE;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  try {
    switch (options.command) {
      case 'list': return commandList(options);
      case 'show': return commandShow(options);
      case 'diff': return commandDiff(options);
      case 'trace': return commandTrace(options);
      case 'help':
        printHelp();
        return 0;
      default:
        printHelp();
        return 1;
    }
  } catch (err) {
    // Run ids come from argv, so a rejected one is normal input, not a crash.
    process.stderr.write(`runs-cli: ${err.message}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main, parseArgs };
