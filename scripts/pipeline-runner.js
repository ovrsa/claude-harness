#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const {
  getRepoRoot,
  parsePlanState,
} = require('./lib/task-artifacts');
const { checkTaskCompletion } = require('./lib/task-completion');
const { resolveBranch } = require('./lib/run-record');
const { recordLifecycleGates } = require('./lib/lifecycle-record');
const {
  getRuntimeSessionId,
  getRuntimeKind,
  ensureDir,
  getClaudeDir,
} = require('./lib/utils');
const {
  parseYamlSubset,
} = require('./workflow-doctor');
const {
  detectBlockedActions,
  resolvePermission,
} = require('./lib/permission-resolver');
const {
  assemblePrompt,
  formatPrompt,
} = require('./prompt-assemble');

const VALID_TRACKS = new Set(['trivial', 'standard', 'heavy-risky']);
const VALID_RUNTIMES = new Set(['claude', 'codex', 'sdk']);

function parseArgs(argv) {
  const options = {
    repo: '',
    plan: '',
    track: '',
    runtime: '',
    taskId: '',
    execute: false,
    loop: false,
    adapterCommand: '',
    workflow: '',
    step: '',
    runId: '',
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
    } else if (arg === '--loop') {
      options.loop = true;
    } else if (arg === '--adapter-command' || arg === '--engine-command') {
      options.adapterCommand = argv[++i] || '';
    } else if (arg === '--workflow') {
      options.workflow = argv[++i] || '';
    } else if (arg === '--step') {
      options.step = argv[++i] || '';
    } else if (arg === '--run-id') {
      options.runId = argv[++i] || '';
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
    '  node scripts/pipeline-runner.js --repo <path> --plan <path> --track <trivial|standard|heavy-risky> --runtime <claude|codex|sdk> [--task-id <id>] [--run-id <id>] [--workflow <path>] [--step <name>] [--execute --adapter-command <path>] [--loop] [--heavy-risky-approved]',
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
  return detectBlockedActions(content);
}

function normalizeTaskId(options, planPath) {
  if (options.taskId) return options.taskId;
  if (planPath) return path.basename(planPath, path.extname(planPath));
  return 'pipeline-runner-task';
}

function adapterLabel(adapterCommand) {
  const command = String(adapterCommand || '').trim();
  if (!command) return 'not-selected';
  const baseName = path.basename(command);
  const extension = path.extname(baseName);
  return extension ? baseName.slice(0, -extension.length) : baseName;
}

function nowIso() {
  return new Date().toISOString();
}

function getWorkflowName(workflow) {
  return workflow && workflow.name ? String(workflow.name) : '';
}

function findWorkflowStep(workflow, stepName) {
  const steps = workflow && Array.isArray(workflow.steps) ? workflow.steps : [];
  return steps.find(step => step.name === stepName) || null;
}

function getObjectParallelSubsteps(step) {
  return step && Array.isArray(step.parallel)
    ? step.parallel.filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

function hasObjectParallelReviewers(step) {
  return step && step.name === 'review' && getObjectParallelSubsteps(step).length > 0;
}

function getRunDir(runId) {
  return path.join(getClaudeDir(), 'runs', runId);
}

function createRunEvidence(result, workflow, initialStep) {
  if (!result.runId) return null;
  const runDir = getRunDir(result.runId);
  ensureDir(path.join(runDir, 'logs'));
  ensureDir(path.join(runDir, 'reports'));
  ensureDir(path.join(runDir, 'context'));
  const eventsPath = path.join(runDir, 'logs', 'events.ndjson');
  if (!fs.existsSync(eventsPath)) {
    fs.writeFileSync(eventsPath, '');
  }
  const occurredAt = nowIso();
  const meta = {
    run_id: result.runId,
    task_id: result.taskId,
    status: 'running',
    workflow: getWorkflowName(workflow),
    initial_step: initialStep,
    current_step: initialStep,
    final_step: '',
    step_count: 0,
    repo_root: result.repoRoot,
    started_at: occurredAt,
    updated_at: occurredAt,
  };
  writeRunMeta(runDir, meta);
  appendRunEvent(runDir, {
    type: 'run_started',
    occurred_at: occurredAt,
    run_id: result.runId,
    task_id: result.taskId,
    workflow: meta.workflow,
    step: initialStep,
  });
  return { runDir, meta };
}

function writeRunMeta(runDir, meta) {
  fs.writeFileSync(path.join(runDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
}

function appendRunEvent(runDir, event) {
  fs.appendFileSync(path.join(runDir, 'logs', 'events.ndjson'), `${JSON.stringify(event)}\n`);
}

/**
 * Pipeline events go into the run record this pipeline already writes
 * (`runs/<runId>/logs/events.ndjson`, the same log createRunEvidence starts).
 *
 * Was a session_events insert. Measured across the store's whole life: not one
 * `pipeline_*` row was ever recorded, so the pipeline has not run since these
 * calls were added -- the events were being written to a table nobody read from
 * a code path nobody reached.
 *
 * ensureDir because preflight events fire before createRunEvidence. Silent on
 * failure: a telemetry line must not abort a pipeline step.
 */
function recordPipelineEvent(context, eventType, status, metadata = {}) {
  if (!context || !context.runId) return;
  try {
    const runDir = getRunDir(context.runId);
    ensureDir(path.join(runDir, 'logs'));
    appendRunEvent(runDir, {
      occurred_at: nowIso(),
      type: eventType,
      status,
      session_id: context.sessionId,
      repo_root: context.repoRoot,
      task_id: context.taskId,
      track: context.track,
      runtime: context.runtime,
      plan_path: context.planInput || context.planPath,
      ...metadata,
    });
  } catch {
    // Intentionally silent.
  }
}

function safeEvidenceName(value, fallback = 'step') {
  return String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function updateRunEvidence(evidence, updates, event = null) {
  if (!evidence) return;
  evidence.meta = {
    ...evidence.meta,
    ...updates,
    updated_at: nowIso(),
  };
  writeRunMeta(evidence.runDir, evidence.meta);
  if (event) {
    appendRunEvent(evidence.runDir, {
      occurred_at: evidence.meta.updated_at,
      ...event,
    });
  }
}

function writePromptSnapshot(evidence, result, workflowPath, stepName) {
  if (!evidence) return;
  try {
    const prompt = assemblePrompt({
      root: path.join(__dirname, '..'),
      workflow: workflowPath,
      step: stepName,
      task: result.planPath,
    });
    const fileName = `prompt-preview.${safeEvidenceName(stepName)}.md`;
    const filePath = path.join(evidence.runDir, 'context', fileName);
    fs.writeFileSync(filePath, formatPrompt(prompt));
    updateRunEvidence(evidence, {}, {
      type: 'prompt_snapshot_written',
      step: stepName,
      path: path.relative(evidence.runDir, filePath),
    });
  } catch (error) {
    updateRunEvidence(evidence, {}, {
      type: 'prompt_snapshot_failed',
      step: stepName,
      error: error.message,
    });
  }
}

function writePreviousResponseSnapshot(evidence, stepName, adapterResult) {
  if (!evidence || !adapterResult) return;
  const fileName = `previous-response.${safeEvidenceName(stepName)}.json`;
  const filePath = path.join(evidence.runDir, 'context', fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(adapterResult, null, 2)}\n`);
  updateRunEvidence(evidence, {}, {
    type: 'previous_response_written',
    step: stepName,
    path: path.relative(evidence.runDir, filePath),
  });
}

function recordArtifactEvents(evidence, stepName, adapterResult) {
  if (!evidence || !adapterResult || !Array.isArray(adapterResult.artifacts)) return;
  for (const artifact of adapterResult.artifacts.filter(Boolean)) {
    updateRunEvidence(evidence, {}, {
      type: 'artifact_written',
      step: stepName,
      artifact: String(artifact),
    });
  }
}

function getStepReports(step) {
  const reports = step && step.output_contracts && step.output_contracts.report;
  return Array.isArray(reports) ? reports : [];
}

function writeReportProjection(evidence, stepName, step, adapterResult) {
  if (!evidence) return;
  for (const report of getStepReports(step)) {
    const reportName = safeEvidenceName(report && report.name, '');
    if (!reportName) continue;
    const filePath = path.join(evidence.runDir, 'reports', reportName);
    const occurredAt = nowIso();
    const lines = [
      `## ${occurredAt}`,
      '',
      `step: ${stepName}`,
      `format: ${report.format || ''}`,
    ];
    if (adapterResult && adapterResult.summary) {
      lines.push('', 'summary:', String(adapterResult.summary));
    }
    lines.push('');
    if (fs.existsSync(filePath)) {
      fs.appendFileSync(filePath, `\n${lines.join('\n')}`);
    } else {
      fs.writeFileSync(filePath, `${lines.join('\n')}`);
    }
  }
}

function createExecutionEnv(options, result, stepContext = {}) {
  return {
    ...process.env,
    PIPELINE_RUNNER_REPO: result.repoRoot,
    PIPELINE_RUNNER_PLAN: result.planPath,
    PIPELINE_RUNNER_TRACK: result.track,
    PIPELINE_RUNNER_RUNTIME: result.runtime,
    PIPELINE_RUNNER_TASK_ID: result.taskId,
    PIPELINE_RUNNER_WORKFLOW: stepContext.workflowName || '',
    PIPELINE_RUNNER_STEP: stepContext.stepName || '',
    PIPELINE_RUNNER_STEP_INDEX: Number.isInteger(stepContext.stepIndex) ? String(stepContext.stepIndex) : '',
    PIPELINE_RUNNER_RUN_ID: result.runId || '',
    PIPELINE_RUNNER_RUN_DIR: stepContext.runDir || '',
  };
}

function executionFromAdapterStatus(status, stdout, adapterCommand) {
  const execution = {
    status: 'not-run',
    eventType: '',
    eventStatus: '',
    decision: '',
    blocker: '',
    adapterCommand,
    exitCode: status,
    stdout: stdout || '',
    result: parseAdapterResult(stdout || ''),
  };

  if (status === 0) {
    execution.status = 'complete';
    execution.eventType = 'pipeline_execution_completed';
    execution.eventStatus = 'completed';
  } else if (status === 2) {
    execution.status = 'blocked';
    execution.decision = 'adapter command requested a decision';
    execution.eventType = 'pipeline_execution_blocked';
    execution.eventStatus = 'blocked';
  } else {
    const exitCode = status === null ? 'unknown' : status;
    execution.status = 'failed';
    execution.blocker = `adapter command failed with exit code ${exitCode}`;
    execution.eventType = 'pipeline_execution_failed';
    execution.eventStatus = 'failed';
  }

  return execution;
}

function buildExecutionArgs(result, stepContext = {}) {
  const args = [
    '--repo', result.repoRoot,
    '--plan', result.planPath,
    '--track', result.track,
    '--runtime', result.runtime,
    '--task-id', result.taskId,
  ];
  if (stepContext.workflowPath) {
    args.push('--workflow', stepContext.workflowPath);
  }
  if (stepContext.stepName) {
    args.push('--step', stepContext.stepName);
  }
  if (stepContext.includeRunId && result.runId) {
    args.push('--run-id', result.runId);
  }
  return args;
}

function runExecutionAdapter(options, result, stepContext = {}) {
  const adapterCommand = path.resolve(options.adapterCommand);
  const execution = {
    status: 'not-run',
    eventType: '',
    eventStatus: '',
    decision: '',
    blocker: '',
    adapterCommand,
    exitCode: null,
    stdout: '',
    result: null,
  };

  if (!options.adapterCommand) {
    execution.decision = 'adapter command is required for execution';
    return execution;
  }

  if (!fs.existsSync(adapterCommand)) {
    execution.blocker = 'adapter command file is missing';
    execution.status = 'failed';
    recordPipelineEvent(result, 'pipeline_execution_failed', 'failed', {
      adapter_command: adapterCommand,
      exit_code: null,
    });
    return execution;
  }

  const args = buildExecutionArgs(result, stepContext);
  recordPipelineEvent(result, 'pipeline_execution_started', 'started', {
    adapter_command: adapterCommand,
    workflow: stepContext.workflowName || '',
    step: stepContext.stepName || '',
    step_index: Number.isInteger(stepContext.stepIndex) ? stepContext.stepIndex : null,
  });

  const adapterResult = spawnSync(adapterCommand, args, {
    cwd: result.repoRoot,
    encoding: 'utf8',
    env: createExecutionEnv(options, result, stepContext),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  Object.assign(execution, executionFromAdapterStatus(adapterResult.status, adapterResult.stdout || '', adapterCommand));

  if (execution.eventType) {
    recordPipelineEvent(result, execution.eventType, execution.eventStatus, {
      adapter_command: adapterCommand,
      exit_code: execution.exitCode,
      workflow: stepContext.workflowName || '',
      step: stepContext.stepName || '',
      step_index: Number.isInteger(stepContext.stepIndex) ? stepContext.stepIndex : null,
    });
  }

  return execution;
}

function runExecutionAdapterAsync(options, result, stepContext = {}) {
  const adapterCommand = path.resolve(options.adapterCommand);
  if (!options.adapterCommand) {
    return Promise.resolve({
      status: 'not-run',
      eventType: '',
      eventStatus: '',
      decision: 'adapter command is required for execution',
      blocker: '',
      adapterCommand,
      exitCode: null,
      stdout: '',
      result: null,
    });
  }

  if (!fs.existsSync(adapterCommand)) {
    recordPipelineEvent(result, 'pipeline_execution_failed', 'failed', {
      adapter_command: adapterCommand,
      exit_code: null,
    });
    return Promise.resolve({
      status: 'failed',
      eventType: '',
      eventStatus: '',
      decision: '',
      blocker: 'adapter command file is missing',
      adapterCommand,
      exitCode: null,
      stdout: '',
      result: null,
    });
  }

  const args = buildExecutionArgs(result, stepContext);
  recordPipelineEvent(result, 'pipeline_execution_started', 'started', {
    adapter_command: adapterCommand,
    workflow: stepContext.workflowName || '',
    step: stepContext.stepName || '',
    step_index: Number.isInteger(stepContext.stepIndex) ? stepContext.stepIndex : null,
  });

  return new Promise(resolve => {
    const child = spawn(adapterCommand, args, {
      cwd: result.repoRoot,
      env: createExecutionEnv(options, result, stepContext),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    child.on('error', error => {
      const execution = {
        status: 'failed',
        eventType: 'pipeline_execution_failed',
        eventStatus: 'failed',
        decision: '',
        blocker: error.message,
        adapterCommand,
        exitCode: null,
        stdout,
        result: null,
      };
      recordPipelineEvent(result, execution.eventType, execution.eventStatus, {
        adapter_command: adapterCommand,
        exit_code: null,
        workflow: stepContext.workflowName || '',
        step: stepContext.stepName || '',
        step_index: Number.isInteger(stepContext.stepIndex) ? stepContext.stepIndex : null,
      });
      resolve(execution);
    });
    child.on('close', code => {
      const execution = executionFromAdapterStatus(code, stdout, adapterCommand);
      if (execution.eventType) {
        recordPipelineEvent(result, execution.eventType, execution.eventStatus, {
          adapter_command: adapterCommand,
          exit_code: execution.exitCode,
          workflow: stepContext.workflowName || '',
          step: stepContext.stepName || '',
          step_index: Number.isInteger(stepContext.stepIndex) ? stepContext.stepIndex : null,
        });
      }
      resolve(execution);
    });
  });
}

function normalizeReviewerResult(reviewerStep, execution) {
  const name = reviewerStep.name;
  const payload = execution.result;
  if (execution.status !== 'complete') {
    return {
      name,
      status: 'blocked',
      condition: 'blocked',
      findings: [],
      residual_risks: [],
      blocker: execution.decision || execution.blocker || 'reviewer adapter execution failed',
      adapter_exit_code: execution.exitCode,
    };
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      name,
      status: 'blocked',
      condition: 'blocked',
      findings: [],
      residual_risks: [],
      blocker: 'reviewer adapter output is malformed',
      adapter_exit_code: execution.exitCode,
    };
  }
  const status = String(payload.status || payload.condition || '').trim() || 'blocked';
  return {
    name,
    status,
    condition: String(payload.condition || status).trim() || status,
    summary: payload.summary || '',
    findings: Array.isArray(payload.findings) ? payload.findings : [],
    residual_risks: Array.isArray(payload.residual_risks) ? payload.residual_risks : [],
    artifacts: Array.isArray(payload.artifacts) ? payload.artifacts : [],
    blocker: payload.blocker || '',
    adapter_exit_code: execution.exitCode,
  };
}

function createBlockedReviewerExecution(reviewerStep, blocker) {
  return {
    status: 'complete',
    eventType: '',
    eventStatus: '',
    decision: '',
    blocker: '',
    adapterCommand: '',
    exitCode: null,
    stdout: '',
    result: {
      name: reviewerStep.name,
      status: 'blocked',
      condition: 'blocked',
      findings: [],
      residual_risks: [],
      blocker,
    },
  };
}

function writeReviewerEvidence(evidence, reviewerStep, execution) {
  if (!evidence) return;
  writePreviousResponseSnapshot(evidence, reviewerStep.name, execution.result);
  recordArtifactEvents(evidence, reviewerStep.name, execution.result);
  writeReportProjection(evidence, reviewerStep.name, reviewerStep, execution.result);
}

async function runParallelReviewAdapters(options, result, step, stepContext, evidence) {
  const reviewers = getObjectParallelSubsteps(step);
  const startedAt = nowIso();
  for (const reviewerStep of reviewers) {
    updateRunEvidence(evidence, {}, {
      type: 'reviewer_started',
      step: step.name,
      reviewer: reviewerStep.name,
    });
  }

  const executions = await Promise.all(reviewers.map((reviewerStep, reviewerIndex) => {
    const permission = resolvePermission({
      track: result.track,
      runtime: result.runtime,
      workflowStep: reviewerStep,
      planContent: result.planContent,
      heavyRiskyApproved: options.heavyRiskyApproved,
    });
    if (permission.mode !== 'readonly' || permission.requires_explicit_authorization) {
      const blocker = permission.reasons[0] || `reviewer substep must be readonly: ${reviewerStep.name}`;
      updateRunEvidence(evidence, {}, {
        type: 'reviewer_blocked',
        step: step.name,
        reviewer: reviewerStep.name,
        blocker,
      });
      return Promise.resolve(createBlockedReviewerExecution(reviewerStep, blocker));
    }
    return runExecutionAdapterAsync(options, result, {
      ...stepContext,
      stepName: reviewerStep.name,
      stepIndex: reviewerIndex,
    });
  }));

  const normalized = executions.map((execution, index) => normalizeReviewerResult(reviewers[index], execution));
  executions.forEach((execution, index) => {
    const reviewerStep = reviewers[index];
    writeReviewerEvidence(evidence, reviewerStep, execution);
    const reviewer = normalized[index];
    const eventType = reviewer.status === 'blocked' || reviewer.condition === 'blocked'
      ? 'reviewer_blocked'
      : 'reviewer_completed';
    updateRunEvidence(evidence, {}, {
      type: eventType,
      step: step.name,
      reviewer: reviewerStep.name,
      status: reviewer.status,
      condition: reviewer.condition,
      finding_count: reviewer.findings.length,
      blocker: reviewer.blocker || '',
    });
  });

  const aggregate = aggregateReviewResult({ reviewers: normalized });
  return {
    status: 'complete',
    eventType: 'pipeline_execution_completed',
    eventStatus: 'completed',
    decision: '',
    blocker: '',
    adapterCommand: path.resolve(options.adapterCommand || ''),
    exitCode: aggregate.condition === 'blocked' ? 1 : 0,
    stdout: '',
    result: {
      condition: aggregate.condition,
      status: aggregate.condition,
      reviewers: normalized,
      started_at: startedAt,
      completed_at: nowIso(),
    },
  };
}

async function runStepExecution(options, result, workflow, step, stepContext, evidence) {
  if (hasObjectParallelReviewers(step)) {
    return runParallelReviewAdapters(options, result, step, stepContext, evidence);
  }
  return runExecutionAdapter(options, result, stepContext);
}

function conditionFromExecution(execution, stepName) {
  const reviewAggregation = stepName === 'review'
    ? aggregateReviewResult(execution.result || {})
    : null;
  return {
    reviewAggregation,
    condition: reviewAggregation
      ? reviewAggregation.condition
      : (execution.result && execution.result.condition
        ? String(execution.result.condition)
        : ''),
  };
}

async function runWorkflowLoop(options, result, workflow, initialStep) {
  let currentStep = initialStep;
  let stepCount = 0;
  let lastTransition = null;
  let lastReviewAggregation = null;
  const workflowName = getWorkflowName(workflow);
  const workflowPath = options.workflow ? path.resolve(options.workflow) : '';
  const runEvidence = createRunEvidence(result, workflow, initialStep);

  while (stepCount < workflow.max_steps) {
    const stepIndex = stepCount;
    const step = findWorkflowStep(workflow, currentStep);
    const permission = resolvePermission({
      track: result.track,
      runtime: result.runtime,
      workflowStep: step,
      planContent: result.planContent,
      heavyRiskyApproved: options.heavyRiskyApproved,
    });
    const stepContext = {
      workflowName,
      workflowPath,
      stepName: currentStep,
      stepIndex,
      runDir: runEvidence ? runEvidence.runDir : '',
      includeRunId: true,
    };
    writePromptSnapshot(runEvidence, result, workflowPath, currentStep);
    updateRunEvidence(runEvidence, {
      status: 'running',
      current_step: currentStep,
      step_count: stepCount,
    }, {
      type: 'step_started',
      step: currentStep,
      step_index: stepIndex,
    });
    updateRunEvidence(runEvidence, {}, {
      type: permission.requires_explicit_authorization ? 'permission_requested' : 'permission_resolved',
      step: currentStep,
      mode: permission.mode,
      source: permission.source,
      blocked_actions: permission.blocked_actions,
      reasons: permission.reasons,
    });

    if (permission.requires_explicit_authorization) {
      const blocker = permission.reasons[0] || 'permission requires explicit authorization';
      updateRunEvidence(runEvidence, {
        status: 'blocked',
        final_step: currentStep,
        step_count: stepCount,
      }, {
        type: 'run_blocked',
        step: currentStep,
        blocker,
      });
      return {
        status: 'NEEDS_DECISION',
        executionStatus: 'not-run',
        workflowTransition: lastTransition,
        reviewAggregation: lastReviewAggregation,
        permissionDecision: permission,
        stepCount,
        finalTarget: '',
        finalStep: currentStep,
        blocker: '',
        decision: blocker,
      };
    }

    const execution = await runStepExecution(options, result, workflow, step, stepContext, runEvidence);
    stepCount += 1;
    writePreviousResponseSnapshot(runEvidence, currentStep, execution.result);
    recordArtifactEvents(runEvidence, currentStep, execution.result);
    writeReportProjection(runEvidence, currentStep, step, execution.result);
    updateRunEvidence(runEvidence, {
      current_step: currentStep,
      step_count: stepCount,
    }, {
      type: 'step_completed',
      step: currentStep,
      step_index: stepIndex,
      status: execution.status,
      exit_code: execution.exitCode,
    });

    if (execution.status !== 'complete') {
      const blocker = execution.decision || execution.blocker || 'workflow adapter execution failed';
      updateRunEvidence(runEvidence, {
        status: execution.decision ? 'blocked' : 'blocked',
        final_step: currentStep,
        step_count: stepCount,
      }, {
        type: 'run_blocked',
        step: currentStep,
        blocker,
      });
      return {
        status: execution.decision ? 'NEEDS_DECISION' : 'BLOCKED',
        executionStatus: execution.status,
        workflowTransition: lastTransition,
        reviewAggregation: lastReviewAggregation,
        permissionDecision: null,
        stepCount,
        finalTarget: '',
        finalStep: currentStep,
        blocker: execution.blocker,
        decision: execution.decision,
      };
    }

    const { reviewAggregation, condition } = conditionFromExecution(execution, currentStep);
    if (reviewAggregation) {
      lastReviewAggregation = reviewAggregation;
      updateRunEvidence(runEvidence, {}, {
        type: 'review_aggregated',
        step: currentStep,
        condition: reviewAggregation.condition,
        reviewer_count: reviewAggregation.reviewerCount,
        finding_count: reviewAggregation.findingCount,
        residual_risk_count: reviewAggregation.residualRiskCount,
        blocker: reviewAggregation.blocker,
      });
    }
    if (currentStep === 'verify') {
      updateRunEvidence(runEvidence, {}, {
        type: 'verification_run',
        step: currentStep,
        condition,
        status: execution.status,
        exit_code: execution.exitCode,
      });
    }
    if (!condition) {
      const blocker = 'workflow adapter result must include condition';
      updateRunEvidence(runEvidence, {
        status: 'blocked',
        final_step: currentStep,
        step_count: stepCount,
      }, {
        type: 'run_blocked',
        step: currentStep,
        blocker,
      });
      return {
        status: 'BLOCKED',
        executionStatus: execution.status,
        workflowTransition: lastTransition,
        reviewAggregation: lastReviewAggregation,
        permissionDecision: null,
        stepCount,
        finalTarget: '',
        finalStep: currentStep,
        blocker,
        decision: '',
      };
    }

    const transition = checkCompletionTransition(workflow, resolveWorkflowTransition(workflow, currentStep, condition), result.repoRoot);
    if (reviewAggregation && reviewAggregation.blocker) {
      transition.blocker = reviewAggregation.blocker;
    }
    lastTransition = transition;
    updateRunEvidence(runEvidence, {}, {
      type: 'rule_matched',
      from: currentStep,
      to: transition.to || '',
      condition,
      status: transition.status,
    });

    if (transition.status === 'blocked' || transition.status === 'aborted') {
      updateRunEvidence(runEvidence, {
        status: 'blocked',
        final_step: currentStep,
        step_count: stepCount,
      }, {
        type: 'run_blocked',
        step: currentStep,
        blocker: transition.blocker,
      });
      return {
        status: 'BLOCKED',
        executionStatus: execution.status,
        workflowTransition: transition,
        reviewAggregation: lastReviewAggregation,
        permissionDecision: null,
        stepCount,
        finalTarget: transition.to || '',
        finalStep: currentStep,
        blocker: transition.blocker,
        decision: '',
      };
    }
    if (transition.status === 'complete') {
      updateRunEvidence(runEvidence, {
        status: 'done',
        final_step: currentStep,
        step_count: stepCount,
      }, {
        type: 'run_completed',
        step: currentStep,
        target: transition.to,
      });
      return {
        status: 'DONE',
        executionStatus: execution.status,
        workflowTransition: {
          ...transition,
          from: initialStep,
        },
        reviewAggregation: lastReviewAggregation,
        permissionDecision: permission,
        stepCount,
        finalTarget: transition.to,
        finalStep: currentStep,
        blocker: '',
        decision: '',
      };
    }

    currentStep = transition.to;
  }

  const blocker = `workflow max steps exceeded: ${workflow.max_steps}`;
  updateRunEvidence(runEvidence, {
    status: 'blocked',
    final_step: currentStep,
    step_count: stepCount,
  }, {
    type: 'run_blocked',
    step: currentStep,
    blocker,
  });
  return {
    status: 'BLOCKED',
    executionStatus: 'complete',
    workflowTransition: lastTransition,
    reviewAggregation: lastReviewAggregation,
    permissionDecision: null,
    stepCount,
    finalTarget: '',
    finalStep: currentStep,
    blocker,
    decision: '',
  };
}

function parseAdapterResult(stdout) {
  const trimmed = String(stdout || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed.split(/\r?\n/).find(Boolean) || '{}');
  } catch {
    return null;
  }
}

function loadWorkflow(workflowPath) {
  const resolved = path.resolve(workflowPath);
  return {
    path: resolved,
    definition: parseYamlSubset(fs.readFileSync(resolved, 'utf8')),
  };
}

function checkCompletionTransition(workflow, transition, repoRoot) {
  if (transition.status !== 'complete' || workflow.completion_check !== 'task-finishing') return transition;
  try {
    const completion = checkTaskCompletion(repoRoot);
    if (completion.ready) return transition;
    return { ...transition, status: 'blocked', blocker: `task finishing incomplete: ${completion.issues.join(' | ')}` };
  } catch (error) {
    return { ...transition, status: 'blocked', blocker: `task finishing check failed: ${error.message}` };
  }
}

function resolveWorkflowTransition(workflow, stepName, condition) {
  const steps = Array.isArray(workflow.steps) ? workflow.steps : [];
  const step = steps.find(entry => entry.name === stepName);
  if (!step) {
    return {
      status: 'blocked',
      blocker: `unknown workflow step: ${stepName}`,
      from: stepName,
      to: '',
      condition,
    };
  }
  const rule = Array.isArray(step.rules)
    ? step.rules.find(entry => entry.condition === condition)
    : null;
  if (!rule) {
    return {
      status: 'blocked',
      blocker: `no workflow rule matched condition: ${condition}`,
      from: stepName,
      to: '',
      condition,
    };
  }
  return {
    status: rule.next === 'COMPLETE' ? 'complete' : (rule.next === 'ABORT' ? 'aborted' : 'next'),
    blocker: rule.next === 'ABORT' ? `workflow routed to ABORT from step: ${stepName}` : '',
    from: stepName,
    to: rule.next,
    condition,
  };
}

function aggregateReviewResult(adapterResult) {
  const reviewers = adapterResult && adapterResult.reviewers;
  if (!Array.isArray(reviewers)) {
    return {
      condition: 'blocked',
      reviewerCount: 0,
      findingCount: 0,
      residualRiskCount: 0,
      blocker: 'review aggregation payload is malformed',
    };
  }

  let findingCount = 0;
  let residualRiskCount = 0;
  let hasBlockedReviewer = false;
  let hasNeedsFixReviewer = false;
  for (const reviewer of reviewers) {
    if (!reviewer || typeof reviewer !== 'object' || Array.isArray(reviewer)) {
      hasBlockedReviewer = true;
      continue;
    }
    const reviewerStatus = String(reviewer.status || '').trim();
    const reviewerCondition = String(reviewer.condition || '').trim();
    if (reviewerStatus === 'blocked' || reviewerCondition === 'blocked') {
      hasBlockedReviewer = true;
    }
    if (reviewerStatus === 'needs_fix' || reviewerCondition === 'needs_fix') {
      hasNeedsFixReviewer = true;
    }
    if (Array.isArray(reviewer.findings)) {
      findingCount += reviewer.findings.filter(Boolean).length;
    }
    if (Array.isArray(reviewer.residual_risks)) {
      residualRiskCount += reviewer.residual_risks.filter(Boolean).length;
    }
  }

  if (hasBlockedReviewer || String(adapterResult.condition || '').trim() === 'blocked') {
    return {
      condition: 'blocked',
      reviewerCount: reviewers.length,
      findingCount,
      residualRiskCount,
      blocker: 'review aggregation blocked',
    };
  }

  return {
    condition: findingCount > 0 || hasNeedsFixReviewer ? 'needs_fix' : 'approved',
    reviewerCount: reviewers.length,
    findingCount,
    residualRiskCount,
    blocker: '',
  };
}

async function buildResult(options) {
  const repoInput = options.repo ? path.resolve(options.repo) : '';
  const planInput = options.plan ? path.resolve(options.plan) : '';
  const runtime = options.runtime || getRuntimeKind();
  const track = options.track || '';
  const taskId = normalizeTaskId(options, planInput);
  const workflowInput = options.workflow ? path.resolve(options.workflow) : '';
  const workflowStep = options.step || '';
  const blockers = [];
  const decisions = [];
  const evidence = [];
  let workflowTransition = null;
  let reviewAggregation = null;
  let workflowInitialStep = '';
  let workflowStepCount = 0;
  let workflowFinalTarget = '';
  let planContent = '';
  let permissionDecision = null;
  let telemetryStatus = 'missing';
  let executionStatus = 'not-run';
  let repoRoot = '';
  let workflow = null;

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

  if (workflowInput) {
    if (!fs.existsSync(workflowInput)) {
      blockers.push('workflow file is missing');
    } else {
      try {
        workflow = loadWorkflow(workflowInput).definition;
        const selectedStep = workflowStep || workflow.initial_step;
        workflowInitialStep = selectedStep;
        if (!selectedStep) {
          blockers.push('workflow step is required');
        } else if (!Array.isArray(workflow.steps) || !workflow.steps.some(step => step.name === selectedStep)) {
          blockers.push(`unknown workflow step: ${selectedStep}`);
        }
      } catch (error) {
        blockers.push(`workflow parse failed: ${error.message}`);
      }
    }
  }

  const selectedPermissionStep = workflow && workflowInitialStep
    ? findWorkflowStep(workflow, workflowInitialStep)
    : null;
  permissionDecision = resolvePermission({
    track,
    runtime,
    workflowStep: selectedPermissionStep,
    planContent,
    heavyRiskyApproved: options.heavyRiskyApproved,
  });
  const sensitiveActions = permissionDecision.blocked_actions;
  if (permissionDecision.requires_explicit_authorization && !(options.loop && workflow)) {
    decisions.push(...permissionDecision.reasons);
  }
  if (options.execute && !options.adapterCommand && blockers.length === 0 && decisions.length === 0) {
    decisions.push('adapter command is required for execution');
  }

  let status = blockers.length > 0 ? 'BLOCKED' : (decisions.length > 0 ? 'NEEDS_DECISION' : 'READY');
  const preflight = status === 'READY' ? 'pass' : 'fail';
  const sessionId = getRuntimeSessionId('pipeline-runner');
  // getRunId was an identity function over the session id; the wrapper went
  // with session-trace.js.
  const runId = String(options.runId || '').trim() || sessionId;
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
    permission: permissionDecision,
  };

  try {
    recordPipelineEvent(context, 'pipeline_started', 'started');
    recordPipelineEvent(context, 'pipeline_preflight_completed', status.toLowerCase(), metadata);
    if (repoRoot) {
      recordLifecycleGates({
        repoRoot,
        runId,
        sessionId,
        branch: resolveBranch(repoRoot),
        cwd: repoRoot,
      });
    }

    if (options.execute && status === 'READY') {
      const executionContext = {
        sessionId,
        runId,
        taskId,
        track,
        runtime,
        repoRoot,
        planPath: planInput,
        planContent,
      };

      if (options.loop && workflow) {
        const loopResult = await runWorkflowLoop(options, executionContext, workflow, workflowInitialStep);
        executionStatus = loopResult.executionStatus;
        workflowTransition = loopResult.workflowTransition;
        reviewAggregation = loopResult.reviewAggregation;
        permissionDecision = loopResult.permissionDecision || permissionDecision;
        workflowStepCount = loopResult.stepCount;
        workflowFinalTarget = loopResult.finalTarget;
        status = loopResult.status;
        evidence.push(`adapter_command=${path.resolve(options.adapterCommand)}`);
        if (loopResult.decision) {
          decisions.push(loopResult.decision);
        }
        if (loopResult.blocker) {
          blockers.push(loopResult.blocker);
        }
      } else {
        const selectedWorkflowStep = workflow ? (workflowStep || workflow.initial_step) : '';
        const stepPermissionDecision = workflow
          ? resolvePermission({
              track,
              runtime,
              workflowStep: findWorkflowStep(workflow, selectedWorkflowStep),
              planContent,
              heavyRiskyApproved: options.heavyRiskyApproved,
            })
          : permissionDecision;
        permissionDecision = stepPermissionDecision;
        if (stepPermissionDecision.requires_explicit_authorization) {
          status = 'NEEDS_DECISION';
          decisions.push(...stepPermissionDecision.reasons);
        }
        if (status !== 'READY') {
          executionStatus = 'not-run';
        } else {
          const selectedStepObject = workflow ? findWorkflowStep(workflow, selectedWorkflowStep) : null;
          const runEvidence = workflow && options.runId
            ? createRunEvidence(executionContext, workflow, selectedWorkflowStep)
            : null;
          const stepContext = workflow ? {
            workflowName: getWorkflowName(workflow),
            workflowPath: workflowInput,
            stepName: selectedWorkflowStep,
            stepIndex: 0,
            runDir: runEvidence ? runEvidence.runDir : (options.runId ? getRunDir(runId) : ''),
            includeRunId: Boolean(options.runId),
          } : {};
          if (runEvidence) {
            writePromptSnapshot(runEvidence, executionContext, workflowInput, selectedWorkflowStep);
            updateRunEvidence(runEvidence, {
              status: 'running',
              current_step: selectedWorkflowStep,
              step_count: 0,
            }, {
              type: 'step_started',
              step: selectedWorkflowStep,
              step_index: 0,
            });
          }
          const execution = await runStepExecution(options, executionContext, workflow, selectedStepObject, stepContext, runEvidence);
          executionStatus = execution.status;
          if (runEvidence && !hasObjectParallelReviewers(selectedStepObject)) {
            writePreviousResponseSnapshot(runEvidence, selectedWorkflowStep, execution.result);
            recordArtifactEvents(runEvidence, selectedWorkflowStep, execution.result);
            writeReportProjection(runEvidence, selectedWorkflowStep, selectedStepObject, execution.result);
          }
          if (runEvidence) {
            updateRunEvidence(runEvidence, {
              current_step: selectedWorkflowStep,
              step_count: 1,
            }, {
              type: 'step_completed',
              step: selectedWorkflowStep,
              step_index: 0,
              status: execution.status,
              exit_code: execution.exitCode,
            });
          }
          if (execution.status === 'complete') {
            evidence.push(`adapter_command=${execution.adapterCommand}`);
            if (workflow) {
              const aggregate = conditionFromExecution(execution, selectedWorkflowStep);
              reviewAggregation = aggregate.reviewAggregation;
              if (runEvidence && reviewAggregation) {
                updateRunEvidence(runEvidence, {}, {
                  type: 'review_aggregated',
                  step: selectedWorkflowStep,
                  condition: reviewAggregation.condition,
                  reviewer_count: reviewAggregation.reviewerCount,
                  finding_count: reviewAggregation.findingCount,
                  residual_risk_count: reviewAggregation.residualRiskCount,
                  blocker: reviewAggregation.blocker,
                });
              }
              if (!aggregate.condition) {
                status = 'BLOCKED';
                blockers.push('workflow adapter result must include condition');
              } else {
                workflowTransition = checkCompletionTransition(workflow, resolveWorkflowTransition(workflow, selectedWorkflowStep, aggregate.condition), repoRoot);
                if (reviewAggregation && reviewAggregation.blocker) {
                  workflowTransition.blocker = reviewAggregation.blocker;
                }
                if (workflowTransition.status === 'blocked' || workflowTransition.status === 'aborted') {
                  status = 'BLOCKED';
                  blockers.push(workflowTransition.blocker);
                } else if (workflowTransition.status === 'complete') {
                  status = 'DONE';
                } else {
                  status = 'READY';
                }
                if (runEvidence) {
                  updateRunEvidence(runEvidence, {}, {
                    type: 'rule_matched',
                    from: selectedWorkflowStep,
                    to: workflowTransition.to || '',
                    condition: aggregate.condition,
                    status: workflowTransition.status,
                  });
                  updateRunEvidence(runEvidence, {
                    status: status === 'BLOCKED' ? 'blocked' : (status === 'DONE' ? 'done' : 'running'),
                    final_step: selectedWorkflowStep,
                    step_count: 1,
                  }, status === 'BLOCKED' ? {
                    type: 'run_blocked',
                    step: selectedWorkflowStep,
                    blocker: workflowTransition.blocker,
                  } : (status === 'DONE' ? {
                    type: 'run_completed',
                    step: selectedWorkflowStep,
                    target: workflowTransition.to,
                  } : null));
                }
              }
            } else {
              const completion = checkCompletionTransition(
                { completion_check: 'task-finishing' }, { status: 'complete' }, repoRoot
              );
              status = completion.status === 'complete' ? 'DONE' : 'BLOCKED';
              if (completion.blocker) blockers.push(completion.blocker);
            }
          } else if (execution.decision) {
            status = 'NEEDS_DECISION';
            decisions.push(execution.decision);
          } else if (execution.blocker) {
            status = 'BLOCKED';
            blockers.push(execution.blocker);
          }
        }
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
    runId,
    adapter: adapterLabel(options.adapterCommand),
    workflowTransition,
    reviewAggregation,
    permissionDecision,
    workflowInitialStep,
    workflowStepCount,
    workflowFinalTarget,
    workflowLoop: Boolean(options.loop && workflow),
    nextAction: status === 'READY'
      ? (workflowTransition && workflowTransition.to
          ? `Run workflow step: ${workflowTransition.to}`
          : 'Run again with --execute and an approved engine adapter when ready.')
      : (status === 'DONE' ? 'Execution complete; follow the operator-authorized handoff.' : (blockers[0] || decisions[0] || 'Resolve runner stop condition')),
  };
}

function formatResult(result) {
  const lines = [];
  lines.push(`PIPELINE RUNNER: ${result.status}`);
  lines.push('');
  lines.push(`Task:        ${result.taskId}`);
  lines.push(`Track:       ${result.track || 'unknown'}`);
  lines.push(`Runtime:     ${result.runtime || 'unknown'}`);
  if (result.permissionDecision) {
    lines.push(`Permission:  ${result.permissionDecision.mode} (source=${result.permissionDecision.source})`);
  }
  if (result.workflowTransition) {
    if (result.workflowLoop) {
      lines.push(`Workflow:    ${result.workflowInitialStep || result.workflowTransition.from} -> ${result.workflowFinalTarget || result.workflowTransition.to || 'none'} (condition=${result.workflowTransition.condition || 'unknown'})`);
    } else {
      lines.push(`Workflow:    ${result.workflowTransition.from} -> ${result.workflowTransition.to || 'none'} (condition=${result.workflowTransition.condition || 'unknown'})`);
    }
  }
  if (result.workflowLoop) {
    lines.push(`Steps:       ${result.workflowStepCount}`);
  }
  lines.push(`Adapter:     ${result.adapter || 'not-selected'}`);
  lines.push(`Preflight:   ${result.preflight}`);
  lines.push(`Execution:   ${result.executionStatus}`);
  lines.push('Verify:      not-run');
  if (result.reviewAggregation) {
    lines.push(`Review:      ${result.reviewAggregation.condition} (reviewers=${result.reviewAggregation.reviewerCount} findings=${result.reviewAggregation.findingCount})`);
  } else {
    lines.push('Review:      not-run');
  }
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

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return 0;
  }

  const result = await buildResult(options);
  process.stdout.write(`${formatResult(result)}\n`);
  return result.status === 'BLOCKED' ? 1 : 0;
}

if (require.main === module) {
  main().then(code => {
    process.exit(code);
  }).catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  buildResult,
  detectPermissionSensitiveActions,
  formatResult,
  main,
  parseArgs,
  aggregateReviewResult,
  resolveWorkflowTransition,
};
