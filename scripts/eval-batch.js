#!/usr/bin/env node
'use strict';

/**
 * Weekly eval batch.
 *
 * Reads the JSON logs -- Claude Code's transcripts and runs/ -- and emits:
 *   - <output-dir>/eval-weekly-<ISO-week>.json
 *   - <output-dir>/eval-weekly-<ISO-week>.md
 *
 * Output is consumed by /improve-harness as the failure-pattern input
 * for next-task recommendations. Promotion remains human-directed.
 *
 * Usage:
 *   node scripts/eval-batch.js [--week <ISO-week>] [--output-dir <path>]
 *                              [--transcript-dir <path>] [--runs-dir <path>]
 *
 * Examples:
 *   node scripts/eval-batch.js
 *   node scripts/eval-batch.js --week 2026-W17
 *   node scripts/eval-batch.js --output-dir /tmp/eval --runs-dir /tmp/runs
 */

const fs = require('fs');
const path = require('path');

const { aggregateAll, isoWeekKey } = require('./lib/eval-aggregates');

function parseArgs(argv) {
  const options = {
    week: '',
    base: '',
    outputDir: '',
    transcriptDir: '',
    runsDir: '',
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--week') options.week = argv[++i] || '';
    else if (arg === '--base') options.base = argv[++i] || '';
    else if (arg === '--output-dir') options.outputDir = argv[++i] || '';
    else if (arg === '--transcript-dir') options.transcriptDir = argv[++i] || '';
    else if (arg === '--runs-dir') options.runsDir = argv[++i] || '';
  }
  return options;
}

function printHelp() {
  process.stdout.write([
    'Weekly Eval Batch',
    '',
    'Usage:',
    '  node scripts/eval-batch.js [--week <ISO-week>] [--base <ISO-date>] [--output-dir <path>]',
    '                             [--transcript-dir <path>] [--runs-dir <path>]',
    '',
    'Reads the JSONL transcripts and runs/, computes weekly aggregates',
    '(gate coverage, findings, tool failure, token usage, high-turn sessions),',
    'writes JSON + MD to output-dir for /improve-harness consumption.',
    '',
    'Both sources can be overridden: --transcript-dir for the transcripts,',
    '--runs-dir for the run records.',
    '',
  ].join('\n'));
}

function resolveOutputDir(repoRoot, override) {
  if (override) return path.resolve(override);
  return path.join(repoRoot, 'telemetry');
}

function detectRepoRoot() {
  return process.cwd();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function formatPercent(n) {
  if (n == null) return 'n/a';
  return `${(n * 100).toFixed(1)}%`;
}

function buildMarkdown(report) {
  const lines = [];
  lines.push(`# Weekly Eval — ${report.week}`);
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Window: ${report.window.start} → ${report.window.end}`);
  lines.push('');

  lines.push('## Gate Coverage');
  lines.push('');
  const cur = report.gateCoverage.current.totals;
  const prev = report.gateCoverage.previous.totals;
  if (cur.runs === 0) {
    lines.push('- no run records in window');
  } else {
    lines.push(`- current: ${cur.runs} runs — verify=${cur.verification}, review=${cur.review}, observe=${cur.observation}`);
    lines.push(`- previous: ${prev.runs} runs — verify=${prev.verification}, review=${prev.review}, observe=${prev.observation}`);
  }
  lines.push('');

  lines.push('## Findings Severity');
  lines.push('');
  const findings = report.findingsHistogram.current;
  if (findings.reviewsRead === 0) {
    lines.push('- no review evidence in window');
  } else if (findings.total === 0) {
    lines.push(`- ${findings.reviewsRead} review(s) read, no findings`);
  } else {
    for (const [severity, count] of Object.entries(findings.histogram)) {
      lines.push(`- ${severity}: ${count}`);
    }
    lines.push(`- reviews read: ${findings.reviewsRead}`);
  }
  lines.push('');

  lines.push('## Tool Failure Rate (top 10)');
  lines.push('');
  const ranked = report.toolFailureRate.ranked.slice(0, 10);
  if (ranked.length === 0) {
    lines.push('- no tool executions in window');
  } else {
    for (const tool of ranked) {
      lines.push(`- ${tool.tool}: failureRate=${formatPercent(tool.failureRate)} (total=${tool.total}, ok=${tool.ok}, failed=${tool.failed}, pending=${tool.pending})`);
    }
  }
  lines.push('');

  lines.push('## Token Usage');
  lines.push('');
  const tokens = report.tokenUsage;
  if (tokens.totals.records === 0) {
    lines.push('- no usage recorded in window');
  } else {
    lines.push(`- turns with usage: ${tokens.totals.records}`);
    lines.push(`- input: ${tokens.totals.input_tokens.toLocaleString()}, output: ${tokens.totals.output_tokens.toLocaleString()}`);
    lines.push(`- cache read: ${tokens.totals.cache_read_input_tokens.toLocaleString()}, cache create: ${tokens.totals.cache_creation_input_tokens.toLocaleString()}`);
    for (const model of tokens.ranked.slice(0, 5)) {
      lines.push(`- ${model.model}: ${model.records} turns, output=${model.output_tokens.toLocaleString()}`);
    }
  }
  lines.push('');

  lines.push('## High-Turn Sessions');
  lines.push('');
  if (report.highTurnSessions.length === 0) {
    lines.push('- no sessions above the turn threshold in window');
  } else {
    for (const row of report.highTurnSessions.slice(0, 10)) {
      lines.push(`- ${row.sessionId} turns=${row.turns} slash_commands=${row.commands} project=${row.projectSlug || '(unknown)'}`);
    }
  }
  lines.push('');

  lines.push('## Next Action');
  lines.push('');
  lines.push('Feed this file into `/improve-harness` to translate weekly signals into next-task candidates. Promotion remains human-directed.');
  lines.push('');

  return lines.join('\n');
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return 0;
  }

  const repoRoot = detectRepoRoot();
  const outputDir = resolveOutputDir(repoRoot, options.outputDir);
  ensureDir(outputDir);

  const base = options.base ? new Date(options.base) : new Date();
  // No database precondition. An absent transcript directory or runs/ yields an
  // empty report, which is the honest answer; refusing to report at all was a
  // check on a dependency this command no longer has.
  const report = aggregateAll({
    base,
    repoRoot,
    transcriptDir: options.transcriptDir || undefined,
    runsDir: options.runsDir || undefined,
  });

  if (options.week) {
    report.week = options.week;
  } else {
    report.week = isoWeekKey(base);
  }

  const jsonPath = path.join(outputDir, `eval-weekly-${report.week}.json`);
  const mdPath = path.join(outputDir, `eval-weekly-${report.week}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, buildMarkdown(report));

  const gates = report.gateCoverage.current.totals;
  process.stdout.write(`EVAL BATCH: ${report.week}\n`);
  process.stdout.write(`Window:      ${report.window.start} → ${report.window.end}\n`);
  process.stdout.write(`Gates:       ${gates.runs} runs — verify=${gates.verification}, review=${gates.review}, observe=${gates.observation}\n`);
  process.stdout.write(`Findings:    ${report.findingsHistogram.current.total} (${Object.keys(report.findingsHistogram.current.histogram).join(', ') || 'none'}) from ${report.findingsHistogram.current.reviewsRead} review(s)\n`);
  process.stdout.write(`Top tool:    ${report.toolFailureRate.ranked[0] ? `${report.toolFailureRate.ranked[0].tool} (${formatPercent(report.toolFailureRate.ranked[0].failureRate)})` : 'no tool executions'}\n`);
  process.stdout.write(`Tokens:      out=${report.tokenUsage.totals.output_tokens.toLocaleString()} over ${report.tokenUsage.totals.records} turns\n`);
  process.stdout.write(`Output:      ${jsonPath}\n`);
  process.stdout.write(`             ${mdPath}\n`);

  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main, parseArgs, buildMarkdown };
