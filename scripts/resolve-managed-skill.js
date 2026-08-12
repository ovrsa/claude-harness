#!/usr/bin/env node

const {
  resolveManagedSkill,
} = require('./lib/managed-skill-resolver');

function boundedMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, ' ').slice(0, 400);
}

try {
  const result = resolveManagedSkill({ skillName: process.argv[2] });
  process.stdout.write(`${result.skillPath}\n`);
} catch (error) {
  process.stderr.write(`resolve-managed-skill: ${boundedMessage(error)}\n`);
  process.exitCode = 1;
}
