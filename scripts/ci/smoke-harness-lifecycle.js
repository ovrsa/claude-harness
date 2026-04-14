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
    const progressPath = path.join(repoDir, 'progress.md');
    fs.writeFileSync(progressPath, [
      '# Progress',
      '',
      '## Current Phase',
      '- Phase 2: durable session state',
      '',
      '## Last Completed Step',
      '- Added the managed-session plan',
      '',
      '## Next Action',
      '- Expand smoke verification',
      '',
      '## Blockers',
      '- waiting on verification',
      '',
      '## Delegated Work',
      '- docs-writer: documented session semantics',
      ''
    ].join('\n'));
    fs.writeFileSync(path.join(sessionsDir, '2026-04-10-main-session.tmp'), '# Session\n');

    const artifacts = findTaskArtifacts(repoDir);
    const state = buildLifecycleState(artifacts);
    assert(state.planStatus === 'approved', 'plan status should be approved');
    assert(state.reviewRequired === true, 'review should be required when observation is required');
    assert(state.observeRequired === true, 'observe should be required');
    assert(state.hasReview === false, 'review should be absent initially');
    assert(state.progressPresent === true, 'progress should be present');
    assert(state.sessionState.currentPhase === 'Phase 2: durable session state', 'current phase should be parsed');
    assert(state.sessionState.nextAction === 'Expand smoke verification', 'next action should be parsed');
    assert(state.blocked.includes('missing review-summary.md'), 'review should be blocked');
    assert(state.blocked.includes('missing verification-summary.md'), 'verification should be blocked');
    assert(state.blocked.includes('missing observation-summary.md'), 'observation should be blocked');

    const context = buildArtifactContext(repoDir);
    assert(context && context.includes('Active repository task artifacts'), 'artifact context should be built');
    assert(context.includes('plan_status=approved'), 'artifact context should include lifecycle state');
    assert(context.includes('review_required=true'), 'artifact context should include review requirement');
    assert(context.includes('current_phase=Phase 2: durable session state'), 'artifact context should include session state');

    const snapshot = buildArtifactSnapshot(repoDir);
    assert(snapshot && snapshot.includes('### Lifecycle State'), 'artifact snapshot should include lifecycle state');
    assert(snapshot.includes('### Session State'), 'artifact snapshot should include session state section');

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

    fs.rmSync(progressPath);
    const editGuardBlocked = runNode(
      path.join(__dirname, '..', '..', 'hooks', 'lifecycle-pre-edit.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
        input: JSON.stringify({ tool_input: { file_path: path.join(repoDir, 'example.js') } }),
      }
    );
    assert(editGuardBlocked.status === 2, 'edit guard should block non-trivial edits without progress.md');
    assert(editGuardBlocked.stderr.includes('progress.md'), 'edit guard should mention progress.md');

    fs.writeFileSync(progressPath, [
      '# Progress',
      '',
      '## Current Phase',
      '- Phase 2: durable session state',
      '',
      '## Last Completed Step',
      '- Added the managed-session plan',
      '',
      '## Next Action',
      '- Expand smoke verification',
      '',
      '## Blockers',
      '- none',
      '',
      '## Delegated Work',
      '- docs-writer: documented session semantics',
      ''
    ].join('\n'));
    const editGuardAllowed = runNode(
      path.join(__dirname, '..', '..', 'hooks', 'lifecycle-pre-edit.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
        input: JSON.stringify({ tool_input: { file_path: path.join(repoDir, 'example.js') } }),
      }
    );
    assert(editGuardAllowed.status === 0, 'edit guard should allow edits once progress.md exists');

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
    assert(sessionAfterCompact.includes('next_action=Expand smoke verification'), 'pre-compact should preserve next action');
    assert(sessionAfterCompact.includes('missing review-summary.md'), 'pre-compact should preserve missing review state');

    const subagentResult = runNode(
      path.join(__dirname, '..', 'hooks', 'subagent-stop.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
        input: JSON.stringify({
          subagent_name: 'docs-writer',
          stop_reason: 'completed',
          goal: 'Document the managed session contract',
          open_risks: 'Need interrupted-session coverage',
          next_action: 'Run verification',
          files_touched: ['HARNESS.md', 'SESSION.md'],
          verification_run: ['node smoke-harness-lifecycle.js'],
          last_assistant_message: 'Updated the authority docs.',
        }),
      }
    );
    assert(subagentResult.status === 0, 'subagent-stop should exit 0');
    const sessionAfterSubagent = fs.readFileSync(path.join(sessionsDir, '2026-04-10-main-session.tmp'), 'utf8');
    assert(sessionAfterSubagent.includes('agent=docs-writer'), 'subagent-stop should record agent');
    assert(sessionAfterSubagent.includes('goal=Document the managed session contract'), 'subagent-stop should record goal');
    assert(sessionAfterSubagent.includes('open_risks=Need interrupted-session coverage'), 'subagent-stop should record open risks');
    assert(sessionAfterSubagent.includes('next_action=Run verification'), 'subagent-stop should record next action');
    assert(sessionAfterSubagent.includes('files_touched=HARNESS.md, SESSION.md'), 'subagent-stop should record files touched');
    assert(sessionAfterSubagent.includes('verification_run=node smoke-harness-lifecycle.js'), 'subagent-stop should record verification run');

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

    fs.writeFileSync(path.join(repoDir, 'verification-summary.md'), '# Verification Summary\n');
    const commitGuardMissingReview = runNode(
      path.join(__dirname, '..', '..', 'hooks', 'lifecycle-pre-commit.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
        input: JSON.stringify({ tool_input: { command: 'git commit -m "test"' } }),
      }
    );
    assert(commitGuardMissingReview.status === 2, 'commit guard should block missing review-summary.md');
    assert(commitGuardMissingReview.stderr.includes('review-summary.md'), 'commit guard should mention review-summary.md');

    fs.writeFileSync(path.join(repoDir, 'review-summary.md'), '# Review Summary\n');
    const commitGuardBadReview = runNode(
      path.join(__dirname, '..', '..', 'hooks', 'lifecycle-pre-commit.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
        input: JSON.stringify({ tool_input: { command: 'git commit -m "test"' } }),
      }
    );
    assert(commitGuardBadReview.status === 2, 'commit guard should block incomplete review-summary.md');
    assert(commitGuardBadReview.stderr.includes('Missing sections'), 'commit guard should mention missing review sections');

    fs.writeFileSync(path.join(repoDir, 'review-summary.md'), [
      '# Review Summary',
      '',
      '## Review Scope',
      '- lifecycle guard behavior',
      '',
      '## Findings',
      '- none',
      '',
      '## Residual Risks',
      '- none',
      '',
      '## Next Action',
      '- Run verification and commit',
      ''
    ].join('\n'));
    fs.writeFileSync(path.join(repoDir, 'observation-summary.md'), '# Observation Summary\n');
    const commitGuardBadObservation = runNode(
      path.join(__dirname, '..', '..', 'hooks', 'lifecycle-pre-commit.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
        input: JSON.stringify({ tool_input: { command: 'git commit -m "test"' } }),
      }
    );
    assert(commitGuardBadObservation.status === 2, 'commit guard should block incomplete observation-summary.md');
    assert(commitGuardBadObservation.stderr.includes('observation-summary.md is incomplete'), 'commit guard should mention incomplete observation summary');

    fs.writeFileSync(path.join(repoDir, 'observation-summary.md'), [
      '# Observation Summary',
      '',
      '## Behavior Checked',
      '- commit guard warning path',
      '',
      '## Method',
      '- smoke lifecycle script',
      '',
      '## Evidence',
      '- guard emitted the expected warning',
      '',
      '## Remaining Uncertainty',
      '- none',
      ''
    ].join('\n'));
    const commitGuardWarn = runNode(
      path.join(__dirname, '..', '..', 'hooks', 'lifecycle-pre-commit.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
        input: JSON.stringify({ tool_input: { command: 'git commit -m "test"' } }),
      }
    );
    assert(commitGuardWarn.status === 0, 'commit guard should allow review/verify/observe complete commits');
    assert(commitGuardWarn.stderr.includes('Next Action'), 'commit guard should warn on stale progress next action');

    fs.writeFileSync(progressPath, [
      '# Progress',
      '',
      '## Current Phase',
      '- Phase 4: verification',
      '',
      '## Last Completed Step',
      '- Completed verification and observation',
      '',
      '## Next Action',
      '- none',
      '',
      '## Blockers',
      '- waiting on reviewer sign-off',
      '',
      '## Delegated Work',
      '- none',
      ''
    ].join('\n'));
    const commitGuardBlocked = runNode(
      path.join(__dirname, '..', '..', 'hooks', 'lifecycle-pre-commit.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
        input: JSON.stringify({ tool_input: { command: 'git commit -m "test"' } }),
      }
    );
    assert(commitGuardBlocked.status === 2, 'commit guard should block when blockers remain in progress.md');
    assert(commitGuardBlocked.stderr.includes('Blockers'), 'commit guard should mention blockers');

    const sessionStartResult = runNode(
      path.join(__dirname, '..', 'hooks', 'session-start.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
      }
    );
    assert(sessionStartResult.status === 0, 'session-start should exit 0');
    assert(sessionStartResult.stdout.includes('Active repository task artifacts'), 'session-start should surface repository artifacts');
    assert(sessionStartResult.stdout.includes('review-summary.md'), 'session-start should surface review artifacts');

    console.log('PASS: harness lifecycle smoke checks');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main();
