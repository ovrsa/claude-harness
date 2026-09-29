#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  assemblePrompt,
  formatPrompt,
} = require('../../prompt-assemble');

function parseArgs(argv) {
  const options = {
    repo: '',
    plan: '',
    track: '',
    runtime: '',
    taskId: '',
    workflow: '',
    step: '',
    runId: '',
    providerCommand: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo') {
      options.repo = argv[++index] || '';
    } else if (arg === '--plan') {
      options.plan = argv[++index] || '';
    } else if (arg === '--track') {
      options.track = argv[++index] || '';
    } else if (arg === '--runtime') {
      options.runtime = argv[++index] || '';
    } else if (arg === '--task-id') {
      options.taskId = argv[++index] || '';
    } else if (arg === '--workflow') {
      options.workflow = argv[++index] || '';
    } else if (arg === '--step') {
      options.step = argv[++index] || '';
    } else if (arg === '--run-id') {
      options.runId = argv[++index] || '';
    } else if (arg === '--provider-command') {
      options.providerCommand = argv[++index] || '';
    }
  }

  return options;
}

function parseCommandLine(command) {
  const tokens = [];
  let current = '';
  let quote = null;

  for (let index = 0; index < String(command || '').length; index += 1) {
    const char = command[index];
    if (quote) {
      if (char === '\\' && index + 1 < command.length) {
        current += command[index + 1];
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    if (char === '\\' && index + 1 < command.length) {
      current += command[index + 1];
      index += 1;
      continue;
    }
    current += char;
  }

  if (current) tokens.push(current);
  return tokens;
}

function safeStepName(value) {
  return String(value || 'step')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'step';
}

function writeRunContextFile(runDir, stepName, name, content) {
  if (!runDir) return '';
  const contextDir = path.join(runDir, 'context');
  if (!fs.existsSync(contextDir)) return '';
  const filePath = path.join(contextDir, `${name}.${safeStepName(stepName)}.${name === 'provider-prompt' ? 'md' : 'txt'}`);
  fs.writeFileSync(filePath, content);
  return path.relative(runDir, filePath);
}

function extractJsonObject(text) {
  const value = String(text || '');
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Continue looking for the first valid JSON result.
    }
  }

  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced[1].trim());
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function isStepResult(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    String(value.condition || '').trim() &&
    String(value.status || '').trim()
  );
}

function blockedResult(blocker, details = {}) {
  return {
    condition: 'blocked',
    status: 'blocked',
    blockers: [blocker],
    ...details,
  };
}

function resolveProviderCommand(options, defaults, env) {
  const override = options.providerCommand || env.PROVIDER_ADAPTER_COMMAND || '';
  if (override) return parseCommandLine(override);
  return defaults.slice();
}

function buildPrompt(options) {
  const root = path.join(__dirname, '../../../..');
  const prompt = assemblePrompt({
    root,
    workflow: path.resolve(options.workflow),
    step: options.step,
    task: path.resolve(options.plan),
  });
  return [
    formatPrompt(prompt).trimEnd(),
    '',
    'ADAPTER OUTPUT CONTRACT',
    'Return exactly one JSON object as the final answer. The JSON object must include:',
    '- "condition": non-empty workflow routing condition',
    '- "status": non-empty execution status',
    'Optional fields: "summary", "artifacts", "blockers", "permission_requests", "reviewers".',
    'Do not wrap the JSON in prose unless the JSON is also present on its own line or in a fenced json block.',
    '',
  ].join('\n');
}

function runProviderStepAdapter(config, argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  const stepName = options.step || env.PIPELINE_RUNNER_STEP || '';
  const runDir = env.PIPELINE_RUNNER_RUN_DIR || '';
  let prompt = '';

  try {
    prompt = buildPrompt({
      ...options,
      step: stepName,
    });
  } catch (error) {
    const result = blockedResult(`prompt assembly failed: ${error.message}`);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 1;
  }

  writeRunContextFile(runDir, stepName, 'provider-prompt', prompt);

  const command = resolveProviderCommand(options, config.defaultCommand, env);
  if (command.length === 0) {
    const result = blockedResult('provider command is required');
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 1;
  }

  const [executable, ...args] = command;
  const provider = spawnSync(executable, args, {
    cwd: options.repo || process.cwd(),
    encoding: 'utf8',
    input: prompt,
    env: {
      ...env,
      PIPELINE_RUNNER_STEP: stepName,
      PIPELINE_RUNNER_RUN_DIR: runDir,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stdout = provider.stdout || '';
  const stderr = provider.stderr || '';

  writeRunContextFile(runDir, stepName, 'provider-stdout', stdout);
  writeRunContextFile(runDir, stepName, 'provider-stderr', stderr);

  if (provider.error) {
    const result = blockedResult(`provider command failed to start: ${provider.error.message}`, {
      provider: config.provider,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 1;
  }

  const parsed = extractJsonObject(stdout);
  if (!isStepResult(parsed)) {
    const result = blockedResult('provider output did not include step-result JSON', {
      provider: config.provider,
      provider_exit_code: provider.status === null ? -1 : provider.status,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 1;
  }

  if (provider.status !== 0) {
    const result = blockedResult(`provider command exited with code ${provider.status}`, {
      provider: config.provider,
      provider_result: parsed,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 1;
  }

  process.stdout.write(`${JSON.stringify(parsed)}\n`);
  return 0;
}

module.exports = {
  blockedResult,
  extractJsonObject,
  isStepResult,
  parseArgs,
  parseCommandLine,
  runProviderStepAdapter,
};
