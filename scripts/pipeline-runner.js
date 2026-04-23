#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  getRepoRoot,
  parsePlanState,
} = require('./lib/task-artifacts');
const {
  recordSessionEvent,
  recordLifecycleSnapshot,
  getRunId,
} = require('./lib/session-trace');
const {
  getRuntimeSessionId,
  getRuntimeKind,
} = require('./lib/utils');

const VALID_TRACKS = new Set(['trivial', 'standard', 'heavy-risky']);
const VALID_RUNTIMES = new Set(['claude', 'codex', 'sdk']);
const PERMISSION_PATTERNS = [
  { label: 'commit', pattern: /\bcommit\b/i },
  { label: 'push', pattern: /\bpush\b/i },
  { label: 'PR', pattern: /\b(?:PR|pull request)\b/i },
  { label: 'deploy', pattern: /\bdeploy(?:ment)?\b/i },
  { label: 'destructive rm', pattern: /\brm\s+-rf\b/i },
  { label: 'external mutation', pattern: /\b(?:external service|production|prod|database reset|db reset)\b/i },
];

function parseArgs(argv) {
  const options = {
    repo: '',
    plan: '',
    track: '',
    runtime: '',
    taskId: '',
    execute: false,
    engineCommand: '',
    heavyRiskyApproved: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--repo') {
      options.repo = argv[++i] || '';
    } else if (arg === '--plan') {
      options.plan = argv[++i] || '';
    } else if (arg === '--track') {
      options.track = argv[++i] || '';
    } else if (arg === '--runtime') {
      options.runtime = argv[++i] || '';
    } else if (arg === '--task-id') {
      options.taskId = argv[++i] || '';
    } else if (arg === '--execute') {
      options.execute = true;
    } else if (arg === '--engine-command') {
      options.engineCommand = argv[++i] || '';
    } else if (arg === '--heavy-risky-approved') {
      options.heavyRiskyApproved = true;
    }
  }

  return options;
}

function printHelp() {
  process.stdout.write([
    'Pipeline Runner v0',
    '',
    'Usage:',
    '  node scripts/pipeline-runner.js --repo <path> --plan <path> --track <trivial|standard|heavy-risky> --runtime <claude|codex|sdk> [--task-id <id>] [--execute --engine-command <path>] [--heavy-risky-approved]',
    '',
    'This runner performs preflight, optional execution adapter handoff, summary, and telemetry. It does not implement directly, commit, push, create PRs, deploy, or run destructive actions.',
    '',
  ].join('\n'));
}

function isGitRepository(repoPath) {
  if (!repoPath || !fs.existsSync(repoPath)) return false;
  const result = spawnSync('git', ['-C', repoPath, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return result.status === 0;
}

function detectPermissionSensitiveActions(content) {
  return PERMISSION_PATTERNS
    .filter(entry => entry.pattern.test(content))
    .map(entry => entry.label);
}

function normalizeTaskId(options, planPath) {
  if (options.taskId) return options.taskId;
  if (planPath) return path.basename(planPath, path.extname(planPath));
  return 'pipeline-runner-task';
}

function recordPipelineEvent(context, eventType, status, metadata = {}) {
  recordSessionEvent({
    sessionId: context.sessionId,
    runId: context.runId,
    eventType,
    status,
    repoRoot: context.repoRoot,
    cwd: context.repoRoot || process.cwd(),
    metadata: {
      task_id: context.taskId,
      track: context.track,
      runtime: context.runtime,
      plan_path: context.planInput || context.planPath,
      ...metadata,
    },
    createdBy: 'pipeline-runner',
  });
}

function createExecutionEnv(options, result) {
  return {
    ...process.env,
    PIPELINE_RUNNER_REPO: result.repoRoot,
    PIPELINE_RUNNER_PLAN: result.planPath,
    PIPELINE_RUNNER_TRACK: result.track,
    PIPELINE_RUNNER_RUNTIME: result.runtime,
    PIPELINE_RUNNER_TASK_ID: result.taskId,
  };
}

function buildExecutionArgs(result) {
  return [
    '--repo', result.repoRoot,
    '--plan', result.planPath,
    '--track', result.track,
    '--runtime', result.runtime,
    '--task-id', result.taskId,
  ];
}

function runExecutionAdapter(options, result) {
  const engineCommand = path.resolve(options.engineCommand);
  const execution = {
    status: 'not-run',
    eventType: '',
    eventStatus: '',
    decision: '',
    blocker: '',
    engineCommand,
    exitCode: null,
  };

  if (!options.engineCommand) {
    execution.decision = 'engine command is required for execution';
    return execution;
  }

  if (!fs.existsSync(engineCommand)) {
    execution.blocker = 'engine command file is missing';
    execution.status = 'failed';
    recordPipelineEvent(result, 'pipeline_execution_failed', 'failed', {
      engine_command: engineCommand,
      exit_code: null,
    });
    return execution;
  }

  const args = buildExecutionArgs(result);
  recordPipelineEvent(result, 'pipeline_execution_started', 'started', {
    engine_command: engineCommand,
  });

  const adapterResult = spawnSync(engineCommand, args, {
    cwd: result.repoRoot,
    encoding: 'utf8',
    env: createExecutionEnv(options, result),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  execution.exitCode = adapterResult.status;

  if (adapterResult.status === 0) {
    execution.status = 'complete';
    execution.eventType = 'pipeline_execution_completed';
    execution.eventStatus = 'completed';
  } else if (adapterResult.status === 2) {
    execution.status = 'blocked';
    execution.decision = 'engine command requested a decision';
    execution.eventType = 'pipeline_execution_blocked';
    execution.eventStatus = 'blocked';
  } else {
    const exitCode = adapterResult.status === null ? 'unknown' : adapterResult.status;
    execution.status = 'failed';
    execution.blocker = `engine command failed with exit code ${exitCode}`;
    execution.eventType = 'pipeline_execution_failed';
    execution.eventStatus = 'failed';
  }

  if (execution.eventType) {
    recordPipelineEvent(result, execution.eventType, execution.eventStatus, {
      engine_command: engineCommand,
      exit_code: execution.exitCode,
    });
  }

  return execution;
}

function buildResult(options) {
  const repoInput = options.repo ? path.resolve(options.repo) : '';
  const planInput = options.plan ? path.resolve(options.plan) : '';
  const runtime = options.runtime || getRuntimeKind();
  const track = options.track || '';
  const taskId = normalizeTaskId(options, planInput);
  const blockers = [];
  const decisions = [];
  const evidence = [];
  let planContent = '';
  let telemetryStatus = 'missing';
  let executionStatus = 'not-run';
  let repoRoot = '';

  if (!repoInput) {
    blockers.push('repo is required');
  } else if (!fs.existsSync(repoInput)) {
    blockers.push('repo path is missing');
  } else if (!isGitRepository(repoInput)) {
    blockers.push('repo is not a git repository');
  } else {
    repoRoot = getRepoRoot(repoInput) || repoInput;
    evidence.push(`repo=${repoRoot}`);
  }

  if (!planInput) {
    blockers.push('plan is required');
  } else if (!fs.existsSync(planInput)) {
    blockers.push('plan file is missing');
  } else {
    planContent = fs.readFileSync(planInput, 'utf8');
    const planState = parsePlanState(planContent);
    if (!planState.hasApproval) {
      blockers.push('plan is not approved');
    } else {
      evidence.push(`plan=${planInput}`);
    }
  }

  if (!VALID_TRACKS.has(track)) {
    blockers.push('invalid track');
  }

  if (!VALID_RUNTIMES.has(runtime)) {
    blockers.push('invalid runtime');
  }

  const sensitiveActions = planContent ? detectPermissionSensitiveActions(planContent) : [];
  if (track === 'heavy-risky' && !options.heavyRiskyApproved) {
    decisions.push('heavy-risky work requires explicit approval');
  }
  if (sensitiveActions.length > 0) {
    decisions.push(`permission-sensitive action requires authorization: ${sensitiveActions.join(', ')}`);
  }
  if (options.execute && !options.engineCommand && blockers.length === 0 && decisions.length === 0) {
    decisions.push('engine command is required for execution');
  }

  let status = blockers.length > 0 ? 'BLOCKED' : (decisions.length > 0 ? 'NEEDS_DECISION' : 'READY');
  const preflight = status === 'READY' ? 'pass' : 'fail';
  const sessionId = getRuntimeSessionId('pipeline-runner');
  const runId = getRunId(sessionId);
  const context = {
    sessionId,
    runId,
    taskId,
    track,
    runtime,
    planInput,
    repoRoot,
  };
  const metadata = {
    task_id: taskId,
    track,
    runtime,
    plan_path: planInput,
    status: status.toLowerCase(),
    blockers,
    decisions,
    sensitive_actions: sensitiveActions,
  };

  try {
    recordPipelineEvent(context, 'pipeline_started', 'started');
    recordPipelineEvent(context, 'pipeline_preflight_completed', status.toLowerCase(), metadata);
    if (repoRoot) {
      recordLifecycleSnapshot({
        sessionId,
        runId,
        repoRoot,
        cwd: repoRoot,
        includeArtifactContextLoaded: false,
        createdBy: 'pipeline-runner',
      });
    }

    if (options.execute && status === 'READY') {
      const execution = runExecutionAdapter(options, {
        sessionId,
        runId,
        taskId,
        track,
        runtime,
        repoRoot,
        planPath: planInput,
      });
      executionStatus = execution.status;
      if (execution.status === 'complete') {
        status = 'DONE';
        evidence.push(`engine_command=${execution.engineCommand}`);
      } else if (execution.decision) {
        status = 'NEEDS_DECISION';
        decisions.push(execution.decision);
      } else if (execution.blocker) {
        status = 'BLOCKED';
        blockers.push(execution.blocker);
      }
    }

    telemetryStatus = 'recorded';
  } catch {
    telemetryStatus = 'partial';
  }

  return {
    status,
    taskId,
    track,
    runtime,
    preflight,
    executionStatus,
    telemetryStatus,
    blockers,
    decisions,
    evidence,
    repoRoot,
    planPath: planInput,
    nextAction: status === 'READY'
      ? 'Run again with --execute and an approved engine adapter when ready.'
      : (status === 'DONE' ? 'Proceed to verification and review gates; commit, push, PR, and deploy still require explicit authorization.' : (blockers[0] || decisions[0] || 'Resolve runner stop condition')),
  };
}

function formatResult(result) {
  const lines = [];
  lines.push(`PIPELINE RUNNER: ${result.status}`);
  lines.push('');
  lines.push(`Task:        ${result.taskId}`);
  lines.push(`Track:       ${result.track || 'unknown'}`);
  lines.push(`Runtime:     ${result.runtime || 'unknown'}`);
  lines.push('Engine:      Superpowers');
  lines.push(`Preflight:   ${result.preflight}`);
  lines.push(`Execution:   ${result.executionStatus}`);
  lines.push('Verify:      not-run');
  lines.push('Review:      not-run');
  lines.push('Observe:     not-required');
  lines.push(`Telemetry:   ${result.telemetryStatus}`);
  lines.push('');
  lines.push('Evidence:');
  const evidence = result.evidence.length > 0 ? result.evidence : ['none'];
  for (const item of evidence) lines.push(`- ${item}`);
  lines.push('');
  lines.push('Residual Risks:');
  const residual = [...result.blockers, ...result.decisions];
  for (const item of (residual.length > 0 ? residual : ['none'])) lines.push(`- ${item}`);
  lines.push('');
  lines.push('Next Action:');
  lines.push(`- ${result.nextAction}`);
  return lines.join('\n');
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return 0;
  }

  const result = buildResult(options);
  process.stdout.write(`${formatResult(result)}\n`);
  return result.status === 'BLOCKED' ? 1 : 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  buildResult,
  detectPermissionSensitiveActions,
  formatResult,
  main,
  parseArgs,
};
