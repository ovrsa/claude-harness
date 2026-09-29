#!/usr/bin/env node
'use strict';

const path = require('path');

const {
  summarizeHarnessStatus,
  formatHarnessStatus,
} = require('./lib/harness-status');

function printHelp() {
  process.stdout.write([
    'Harness Status',
    '',
    'Usage:',
    '  node harness/scripts/harness-status.js [--format text|json] [--repo PATH] [--home PATH]',
    '',
    'Options:',
    '  --format   Output format. Defaults to text.',
    '  --repo     Repository root to inspect. Defaults to current git root.',
    '  --home     Home directory for .claude queue and run evidence lookup.',
    '  --help     Show this help.',
    '',
  ].join('\n'));
}

function parseArgs(argv) {
  const parsed = {
    format: 'text',
    repoRoot: '',
    homeDir: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--format') {
      parsed.format = argv[++i] || '';
    } else if (arg === '--repo') {
      parsed.repoRoot = argv[++i] || '';
    } else if (arg === '--home') {
      parsed.homeDir = argv[++i] || '';
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!['text', 'json'].includes(parsed.format)) {
    throw new Error(`Unsupported format: ${parsed.format || 'missing'}`);
  }

  return parsed;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    return;
  }

  const summary = summarizeHarnessStatus({
    repoRoot: args.repoRoot ? path.resolve(args.repoRoot) : '',
    homeDir: args.homeDir ? path.resolve(args.homeDir) : '',
  });

  if (args.format === 'json') {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(formatHarnessStatus(summary));
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
};
