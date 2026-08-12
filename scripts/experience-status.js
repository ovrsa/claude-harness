#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

const OUTCOMES = ['accepted', 'corrected', 'failed', 'abandoned', 'unknown'];

function directorySize(root) {
  if (!fs.existsSync(root)) return 0;
  let total = 0;
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(fullPath);
      else if (entry.isFile()) {
        try {
          total += fs.statSync(fullPath).size;
        } catch {
          // A disappearing file does not make a read-only status fail.
        }
      }
    }
  }
  return total;
}

function childDirectories(root) {
  if (!fs.existsSync(root)) return [];
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function readOutcome(runPath) {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(runPath, 'outcome.json'), 'utf8'));
    return {
      outcome: OUTCOMES.includes(value.outcome) ? value.outcome : 'unknown',
      finalizedAt: typeof value.finalizedAt === 'string' ? value.finalizedAt : null,
    };
  } catch {
    return { outcome: 'unknown', finalizedAt: null };
  }
}

function buildExperienceStatus({
  experienceRoot = path.join(os.homedir(), '.claude', 'experience'),
  experimentsRoot = path.join(os.homedir(), '.claude', 'experiments'),
} = {}) {
  const runsRoot = path.join(experienceRoot, 'runs');
  const runIds = childDirectories(runsRoot);
  const outcomeCounts = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0]));
  let lastFinalizedRun = null;

  for (const runId of runIds) {
    const value = readOutcome(path.join(runsRoot, runId));
    outcomeCounts[value.outcome] += 1;
    if (value.finalizedAt && (!lastFinalizedRun || value.finalizedAt > lastFinalizedRun.finalizedAt)) {
      lastFinalizedRun = { runId, finalizedAt: value.finalizedAt, outcome: value.outcome };
    }
  }

  return {
    schemaVersion: 1,
    experienceRoot,
    runCount: runIds.length,
    totalBytes: directorySize(experienceRoot),
    outcomeCounts,
    unclassifiedRuns: outcomeCounts.unknown,
    lastFinalizedRun,
    experimentCount: childDirectories(experimentsRoot).length,
  };
}

function main() {
  const status = buildExperienceStatus();
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    return;
  }
  process.stdout.write([
    `Experience runs: ${status.runCount}`,
    `Total bytes: ${status.totalBytes}`,
    `Outcomes: ${OUTCOMES.map((key) => `${key}=${status.outcomeCounts[key]}`).join(', ')}`,
    `Unclassified: ${status.unclassifiedRuns}`,
    `Last finalized: ${status.lastFinalizedRun ? status.lastFinalizedRun.runId : 'none'}`,
    `Experiments: ${status.experimentCount}`,
  ].join('\n') + '\n');
}

if (require.main === module) main();

module.exports = {
  OUTCOMES,
  buildExperienceStatus,
  childDirectories,
  directorySize,
};
