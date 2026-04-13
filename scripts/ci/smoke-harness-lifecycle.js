#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const {
  buildArtifactContext,
  buildArtifactSnapshot,
  findTaskArtifacts,
  buildLifecycleState,
} = require('../lib/task-artifacts');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function runNode(scriptPath, { cwd, env, input = '' }) {
  return spawnSync('node', [scriptPath], {
    cwd,
    env: { ...process.env, ...env },
    input,
    encoding: 'utf8',
  });
}

function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-harness-smoke-'));
  const repoDir = path.join(tempRoot, 'repo');
  const homeDir = path.join(tempRoot, 'home');
  const sessionsDir = path.join(homeDir, '.claude', 'sessions');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.mkdirSync(sessionsDir, { recursive: true });

  try {
    execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });

    fs.writeFileSync(path.join(repoDir, 'plan.md'), [
      '---',
      'title: Smoke lifecycle test',
      'status: approved',
      'task_type: non_trivial',
      'observe_required: true',
      '---',
      '',
      '# Plan: Smoke lifecycle test',
      '',
      '## Summary',
      '',
      '- verify harness lifecycle',
      ''
    ].join('\n'));
    fs.writeFileSync(path.join(repoDir, 'research.md'), '# Research\n');
    fs.writeFileSync(path.join(repoDir, 'progress.md'), '# Progress\n\n- waiting on verification\n');
    fs.writeFileSync(path.join(sessionsDir, '2026-04-10-main-session.tmp'), '# Session\n');

    const artifacts = findTaskArtifacts(repoDir);
    const state = buildLifecycleState(artifacts);
    assert(state.planStatus === 'approved', 'plan status should be approved');
    assert(state.observeRequired === true, 'observe should be required');
    assert(state.progressPresent === true, 'progress should be present');
    assert(state.blocked.includes('missing verification-summary.md'), 'verification should be blocked');
    assert(state.blocked.includes('missing observation-summary.md'), 'observation should be blocked');

    const context = buildArtifactContext(repoDir);
    assert(context && context.includes('Active repository task artifacts'), 'artifact context should be built');
    assert(context.includes('plan_status=approved'), 'artifact context should include lifecycle state');

    const snapshot = buildArtifactSnapshot(repoDir);
    assert(snapshot && snapshot.includes('### Lifecycle State'), 'artifact snapshot should include lifecycle state');

    const permissionResult = runNode(
      path.join(__dirname, '..', 'hooks', 'permission-request.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
        input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'rm -rf /tmp/nope' } }),
      }
    );
    assert(permissionResult.status === 0, 'permission hook should exit 0');
    const permissionJson = JSON.parse(permissionResult.stdout);
    assert(permissionJson.hookSpecificOutput.decision.behavior === 'deny', 'dangerous command should be denied');

    const compactResult = runNode(
      path.join(__dirname, '..', 'hooks', 'pre-compact.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
      }
    );
    assert(compactResult.status === 0, 'pre-compact should exit 0');
    const sessionAfterCompact = fs.readFileSync(path.join(sessionsDir, '2026-04-10-main-session.tmp'), 'utf8');
    assert(sessionAfterCompact.includes('### Lifecycle State'), 'pre-compact should write lifecycle state');

    const subagentResult = runNode(
      path.join(__dirname, '..', 'hooks', 'subagent-stop.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
        input: JSON.stringify({
          subagent_name: 'docs-writer',
          stop_reason: 'completed',
          next_action: 'Run verification',
          last_assistant_message: 'Updated the authority docs.',
        }),
      }
    );
    assert(subagentResult.status === 0, 'subagent-stop should exit 0');
    const sessionAfterSubagent = fs.readFileSync(path.join(sessionsDir, '2026-04-10-main-session.tmp'), 'utf8');
    assert(sessionAfterSubagent.includes('agent=docs-writer'), 'subagent-stop should record agent');
    assert(sessionAfterSubagent.includes('next_action=Run verification'), 'subagent-stop should record next action');

    const commitGuardResult = runNode(
      path.join(__dirname, '..', '..', 'hooks', 'lifecycle-pre-commit.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
        input: JSON.stringify({ tool_input: { command: 'git commit -m "test"' } }),
      }
    );
    assert(commitGuardResult.status === 2, 'commit guard should block missing verification/observation artifacts');
    assert(commitGuardResult.stderr.includes('verification-summary.md'), 'commit guard should mention verification-summary.md');

    const sessionStartResult = runNode(
      path.join(__dirname, '..', 'hooks', 'session-start.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
      }
    );
    assert(sessionStartResult.status === 0, 'session-start should exit 0');
    assert(sessionStartResult.stdout.includes('Active repository task artifacts'), 'session-start should surface repository artifacts');

    console.log('PASS: harness lifecycle smoke checks');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main();
