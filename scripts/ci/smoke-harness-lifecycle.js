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
  fs.mkdirSync(sessionsDir, { recursive: true });

  try {
    // 助言の重み判定は linked worktree かどうかで決まる。repoDir は
    // git worktree add が作るので事前に mkdir しない。
    const baseDir = path.join(tempRoot, 'base');
    fs.mkdirSync(baseDir, { recursive: true });
    execFileSync('git', ['init'], { cwd: baseDir, stdio: 'ignore' });
    execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t',
      'commit', '--allow-empty', '-m', 'init'], { cwd: baseDir, stdio: 'ignore' });
    execFileSync('git', ['worktree', 'add', repoDir, '-b', 'smoke-lifecycle'], { cwd: baseDir, stdio: 'ignore' });

    // plan.md and progress.md were retired 2026-08-17 and left the artifact scan
    // on 2026-08-20. verification-summary.md is what makes the later gates owed.
    fs.writeFileSync(path.join(repoDir, 'research.md'), '# Research\n');
    fs.writeFileSync(path.join(repoDir, 'verification-summary.md'), [
      '# Verification Summary',
      '',
      '## Scope',
      '',
      '- smoke lifecycle',
      '',
      '## Commands Run',
      '',
      '- node scripts/ci/smoke-harness-lifecycle.js',
      '',
      '## Verification Outcome',
      '',
      '- pass',
      '',
      '## Assessment',
      '',
      '- acceptable',
      ''
    ].join('\n'));
    fs.writeFileSync(path.join(sessionsDir, '2026-04-10-main-session.tmp'), '# Session\n');

    const artifacts = findTaskArtifacts(repoDir);
    const state = buildLifecycleState(artifacts);
    assert(state.reviewRequired === true, 'review should be owed once verification exists');
    assert(state.observeRequired === true, 'observe should be owed once verification exists');
    assert(state.hasVerification === true, 'verification should be present');
    assert(state.hasReview === false, 'review should be absent initially');
    assert(state.blocked.includes('missing review-summary.md'), 'review should be blocked');
    assert(state.blocked.includes('missing observation-summary.md'), 'observation should be blocked');
    assert(!state.blocked.some(entry => entry.includes('plan.md')), 'plan.md must not appear');
    assert(!('planStatus' in state), 'planStatus should be gone from the state');

    const context = buildArtifactContext(repoDir);
    assert(context && context.includes('Active repository task chain'), 'compact artifact context should be built');
    assert(context.includes('review_required=true'), 'artifact context should include review requirement');
    assert(!context.includes('plan_status='), 'artifact context should not mention plan status');
    assert(!context.includes('current_phase='), 'artifact context should not mention progress state');
    assert(context.includes('detail=/chain-status'), 'artifact context should point to detail command');
    assert(!context.includes('Lifecycle chain:'), 'artifact context should not include verbose lifecycle chain');

    const snapshot = buildArtifactSnapshot(repoDir);
    assert(snapshot && snapshot.includes('### Lifecycle State'), 'artifact snapshot should include lifecycle state');
    assert(snapshot.includes('### Lifecycle Chain'), 'artifact snapshot should include verbose lifecycle chain');
    assert(!snapshot.includes('### Session State'), 'the Session State block went with progress.md');

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

    // Was `fs.rmSync(progressPath)`. progress.md left the artifact scan on
    // 2026-08-20, so its presence or absence no longer changes any guard.
    const editGuardBlocked = runNode(
      path.join(__dirname, '..', '..', 'hooks', 'lifecycle-pre-edit.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
        input: JSON.stringify({ tool_input: { file_path: path.join(repoDir, 'example.js') } }),
      }
    );
    // Gates are consolidated at completion declaration. Editing is never blocked:
    // it is reversible, and blocking it only produces stale placeholder artifacts.
    assert(editGuardBlocked.status === 0, 'edit guard should not block edits');
    assert(!editGuardBlocked.stderr.includes('[Lifecycle Guardrail] Missing'), 'edit guard should not emit a blocking guardrail error');

    const editGuardAllowed = runNode(
      path.join(__dirname, '..', '..', 'hooks', 'lifecycle-pre-edit.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
        input: JSON.stringify({ tool_input: { file_path: path.join(repoDir, 'example.js') } }),
      }
    );
    assert(editGuardAllowed.status === 0, 'edit guard should allow edits');

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
    // Was `next_action=...`, which came from progress.md's Session State block.
    // pre-compact records which gates exist; it does not summarize state.
    assert(sessionAfterCompact.includes('next_required_action='), 'pre-compact should record the open gate');
    assert(!sessionAfterCompact.includes('### Session State'), 'the Session State block went with progress.md');
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
    assert(commitGuardResult.status === 0, 'commit guard should advise, not block, on missing verification/observation artifacts');
    // The fixture has verification-summary.md, so what is owed is review and
    // observation. Was `verification-summary.md`, which the fixture used to lack.
    assert(commitGuardResult.stderr.includes('review-summary.md'), 'commit guard should mention the owed review');

    fs.writeFileSync(path.join(repoDir, 'verification-summary.md'), '# Verification Summary\n');
    const commitGuardBadVerification = runNode(
      path.join(__dirname, '..', '..', 'hooks', 'lifecycle-pre-commit.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
        input: JSON.stringify({ tool_input: { command: 'git commit -m "test"' } }),
      }
    );
    assert(commitGuardBadVerification.status === 0, 'commit guard should advise on incomplete verification-summary.md');
    assert(commitGuardBadVerification.stderr.includes('verification-summary.md is incomplete'), 'commit guard should mention incomplete verification summary');

    fs.writeFileSync(path.join(repoDir, 'verification-summary.md'), [
      '# Verification Summary',
      '',
      '## Scope',
      '- lifecycle smoke verification',
      '',
      '## Commands Run',
      '- node scripts/ci/smoke-harness-lifecycle.js',
      '',
      '## Verification Outcome',
      '- pass',
      '',
      '## Assessment',
      '- commit guard exercised expected lifecycle blocks',
      ''
    ].join('\n'));
    const commitGuardMissingReview = runNode(
      path.join(__dirname, '..', '..', 'hooks', 'lifecycle-pre-commit.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
        input: JSON.stringify({ tool_input: { command: 'git commit -m "test"' } }),
      }
    );
    assert(commitGuardMissingReview.status === 0, 'commit guard should advise on missing review-summary.md');
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
    assert(commitGuardBadReview.status === 0, 'commit guard should advise on incomplete review-summary.md');
    assert(commitGuardBadReview.stderr.includes('missing sections'), 'commit guard should mention missing review sections');

    fs.writeFileSync(path.join(repoDir, 'review-summary.md'), [
      '# Review Summary',
      '',
      // Complete in every section, so the assertion below isolates the
      // unresolved finding rather than also tripping the missing-section advice.
      '## Review Scope',
      '- lifecycle guard behavior',
      '',
      '## Design Compliance',
      '- matches the design doc',
      '',
      '## Security',
      '- no decision boundary touched',
      '',
      '## Comment Adequacy',
      '- unchanged',
      '',
      '## Code Quality',
      '- acceptable',
      '',
      '## Test Adequacy',
      '- covered',
      '',
      '## Findings',
      '- HIGH: unresolved lifecycle regression remains',
      '',
      '## Residual Risks',
      '- none',
      '',
      '## Guardrail Candidates',
      '- none',
      '',
      '## Next Action',
      '- Fix findings and rerun review',
      ''
    ].join('\n'));
    const commitGuardOpenFindings = runNode(
      path.join(__dirname, '..', '..', 'hooks', 'lifecycle-pre-commit.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
        input: JSON.stringify({ tool_input: { command: 'git commit -m "test"' } }),
      }
    );
    assert(commitGuardOpenFindings.status === 0, 'commit guard should advise on unresolved review findings');
    assert(commitGuardOpenFindings.stderr.includes('unresolved findings'), 'commit guard should mention unresolved findings');

    fs.writeFileSync(path.join(repoDir, 'review-summary.md'), [
      '# Review Summary',
      '',
      '## Review Scope',
      '- lifecycle guard behavior',
      '',
      '## Design Compliance',
      '- matches the design doc',
      '',
      '## Security',
      '- no decision boundary touched',
      '',
      '## Comment Adequacy',
      '- unchanged',
      '',
      '## Code Quality',
      '- acceptable',
      '',
      '## Test Adequacy',
      '- covered',
      '',
      '## Findings',
      '- none',
      '',
      '## Residual Risks',
      '- none',
      '',
      '## Guardrail Candidates',
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
    assert(commitGuardBadObservation.status === 0, 'commit guard should advise on incomplete observation-summary.md');
    assert(commitGuardBadObservation.stderr.includes('observation-summary.md is incomplete'), 'commit guard should mention incomplete observation summary');

    fs.writeFileSync(path.join(repoDir, 'observation-summary.md'), [
      '# Observation Summary',
      '',
      '## Behavior Checked',
      '- commit guard warning path',
      '',
      '## Method',
      '- manual confirmation only',
      '',
      '## Evidence',
      '- looks good',
      '',
      '## Remaining Uncertainty',
      '- none',
      ''
    ].join('\n'));
    const commitGuardBadObservationEvidence = runNode(
      path.join(__dirname, '..', '..', 'hooks', 'lifecycle-pre-commit.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
        input: JSON.stringify({ tool_input: { command: 'git commit -m "test"' } }),
      }
    );
    assert(commitGuardBadObservationEvidence.status === 0, 'commit guard should advise on observation without concrete evidence sources');
    assert(commitGuardBadObservationEvidence.stderr.includes('concrete evidence source required'), 'commit guard should name the concrete evidence requirement');

    fs.writeFileSync(path.join(repoDir, 'observation-summary.md'), [
      '# Observation Summary',
      '',
      '## Behavior Checked',
      '- commit guard warning path',
      '',
      '## Method',
      '- stderr: smoke lifecycle script captured lifecycle-pre-commit output',
      '',
      '## Evidence',
      '- stderr: guard emitted the expected warning',
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
    // 残っているのは verify / review / observe の証拠に対する助言だけ。
    assert(!commitGuardWarn.stderr.includes('Next Action'), 'commit guard should no longer inspect Next Action');

    const commitGuardReady = runNode(
      path.join(__dirname, '..', '..', 'hooks', 'lifecycle-pre-commit.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
        input: JSON.stringify({ tool_input: { command: 'git commit -m "test"' } }),
      }
    );
    assert(commitGuardReady.status === 0, 'commit guard should never block a commit');

    const commitGuardBlocked = runNode(
      path.join(__dirname, '..', '..', 'hooks', 'lifecycle-pre-commit.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
        input: JSON.stringify({ tool_input: { command: 'git commit -m "test"' } }),
      }
    );
    assert(commitGuardBlocked.status === 0, 'commit guard should advise, never block');
    assert(!commitGuardBlocked.stderr.includes('blockers remain'), 'commit guard should no longer read progress blockers');

    const sessionStartResult = runNode(
      path.join(__dirname, '..', 'hooks', 'session-start.js'),
      {
        cwd: repoDir,
        env: { HOME: homeDir, USERPROFILE: homeDir },
      }
    );
    assert(sessionStartResult.status === 0, 'session-start should exit 0');
    assert(sessionStartResult.stdout.includes('Active repository task chain'), 'session-start should surface compact repository chain');
    assert(sessionStartResult.stdout.includes('review-summary.md'), 'session-start should surface review artifacts');

    console.log('PASS: harness lifecycle smoke checks');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main();
