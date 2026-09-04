/**
 * Tests for scripts/lib/task-artifacts.js
 *
 * Run with: node tests/lib/task-artifacts.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  buildLifecycleState,
  parsePlanState,
  parseReviewState,
  parseObservationState,
  parseVerificationState,
  getRepoRoot,
  findTaskArtifacts,
  buildArtifactContext,
  buildArtifactSnapshot,
} = require('../../scripts/lib/task-artifacts');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

// Fixtures go to a temp dir, never the working tree: these helpers write real artifact
// filenames (plan.md / progress.md), which the lifecycle hooks read from the repo root.
function withTempRepo(fn, { git = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-artifacts-'));
  if (git) execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  try {
    return fn(fs.realpathSync(dir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeArtifact(repoRoot, name, lines) {
  fs.writeFileSync(path.join(repoRoot, name), lines.join('\n'), 'utf8');
}

const APPROVED_PLAN = [
  '---',
  'title: Parser hardening',
  'status: approved',
  'task_type: non_trivial',
  'observe_required: false',
  '---',
  '',
  '# Plan: Parser hardening',
  '',
  '## Summary',
  '',
  '- tighten the section parser',
];

const EXECUTING_PROGRESS = [
  '# Progress',
  '',
  '## Current Phase',
  '- Phase 2: implement the parser',
  '',
  '## Last Completed Step',
  '- Added the failing test',
  '',
  '## Next Action',
  '- Make the parser accept CRLF input',
  '',
  '## Blockers',
  '- none',
  '',
  '## Delegated Work',
  '- none',
];

// The three gate artifacts, each satisfying its parser's canonical headings.
const COMPLETE_VERIFICATION = [
  '# Verification Summary',
  '',
  '## Scope',
  '',
  '- the parser change',
  '',
  '## Commands Run',
  '',
  '- `node tests/run-all.js`',
  '',
  '## Verification Outcome',
  '',
  '- all green',
  '',
  '## Assessment',
  '',
  '- acceptable',
];

const COMPLETE_REVIEW = [
  '# Review Summary',
  '',
  '## Review Scope',
  '',
  '- the parser change',
  '',
  '## Design Compliance',
  '',
  '- matches the design doc',
  '',
  '## Security',
  '',
  '- no decision boundary touched',
  '',
  '## Comment Adequacy',
  '',
  '- unchanged',
  '',
  '## Code Quality',
  '',
  '- acceptable',
  '',
  '## Test Adequacy',
  '',
  '- covered',
  '',
  '## Findings',
  '',
  'INFO: nothing blocking',
  '',
  '## Residual Risks',
  '',
  '- none',
  '',
  '## Guardrail Candidates',
  '',
  '- none',
  '',
  '## Next Action',
  '',
  'Merge it.',
];

const COMPLETE_OBSERVATION = [
  '# Observation Summary',
  '',
  '## Behavior Checked',
  '',
  '- CRLF input',
  '',
  '## Method',
  '',
  '- ran the parser against a CRLF file',
  '',
  '## Evidence',
  '',
  '- stdout showed the parsed sections',
  '',
  '## Remaining Uncertainty',
  '',
  '- none',
];

function runTests() {
  console.log('\n=== Testing task-artifacts.js ===\n');

  let passed = 0;
  let failed = 0;

  if (test('parses implementation-ready plan evidence fields', () => {
    const plan = parsePlanState([
      '---',
      'status: approved',
      '---',
      '',
      '# Plan',
      '',
      '## Summary',
      '- implement the change',
      '',
      '## Acceptance Criteria',
      '- behavior works',
      '',
      '## Touched Files',
      '- src/example.js',
      '',
      '## Behavior Spec',
      '- Given state',
      '- When action',
      '- Then result',
      '- normal: standard case',
      '- boundary: edge case',
      '- abnormal: error case',
      '',
      '## Verify',
      '- npm test',
      '',
      '## Test Evidence Plan',
      '- RED command: npm test -- failing',
      '- expected failure: assertion fails',
      '- GREEN command: npm test',
      '',
      '## Evaluate',
      '- review findings resolved',
      '',
      '## Observe',
      '- required: no',
      '',
      '## Execution Todo',
      '- [ ] write failing test',
    ].join('\n'));

    assert.strictEqual(plan.complete, true);
    assert.strictEqual(plan.hasGivenWhenThen, true);
    assert.strictEqual(plan.hasTddEvidencePlan, true);
  })) passed++; else failed++;

  if (test('detects incomplete plan evidence fields', () => {
    const plan = parsePlanState([
      '# Plan',
      '',
      '## Summary',
      '- implement the change',
      '',
      '## Acceptance Criteria',
      '- behavior works',
    ].join('\n'));

    assert.strictEqual(plan.complete, false);
    assert.ok(plan.missingSections.includes('Behavior Spec'));
    assert.strictEqual(plan.hasTddEvidencePlan, false);
  })) passed++; else failed++;

  if (test('builds ordered lifecycle chain without plan or progress steps', () => {
    // plan.md and progress.md were retired 2026-08-17. Every routing flag came
    // from plan.md's front matter, so all four went permanently false and the
    // review / observation gates reported themselves as "not required by plan
    // metadata" on every run.
    const state = buildLifecycleState([
      { name: 'research.md', status: '' },
      { name: 'verification-summary.md', verification_state: { complete: true, missingSections: [] } },
    ]);

    assert.deepStrictEqual(state.chain.map(step => step.id), [
      'research',
      'implementation',
      'verification',
      'review',
      'observation',
      'completion',
    ]);
    // verification exists, so the work was implemented and the later gates are owed.
    assert.strictEqual(state.reviewRequired, true);
    assert.strictEqual(state.observeRequired, true);
    assert.ok(state.blocked.includes('missing review-summary.md'));
    assert.ok(state.blocked.includes('missing observation-summary.md'));
    assert.ok(!state.blocked.some(entry => entry.includes('plan.md')));
    assert.strictEqual(state.currentStepId, 'review');
  })) passed++; else failed++;

  if (test('nothing is owed when there is no verification evidence', () => {
    const state = buildLifecycleState([{ name: 'research.md', status: '' }]);
    // A read-only investigation must not report three open gates: an advisory
    // that always fires stops being read.
    assert.strictEqual(state.reviewRequired, false);
    assert.strictEqual(state.observeRequired, false);
    assert.deepStrictEqual(state.blocked, ['missing verification-summary.md']);
    assert.strictEqual(state.chain.find(step => step.id === 'review').status, 'skipped');
    assert.strictEqual(state.chain.find(step => step.id === 'observation').status, 'skipped');
  })) passed++; else failed++;

  if (test('marks lifecycle chain complete when every gate artifact is complete', () => {
    const state = buildLifecycleState([
      { name: 'research.md', status: '' },
      { name: 'verification-summary.md', verification_state: { complete: true, missingSections: [] } },
      { name: 'review-summary.md', review_state: { complete: true, hasBlockingFindings: false, missingSections: [] } },
      { name: 'observation-summary.md', observation_state: { complete: true, missingSections: [], missingValues: [], hasConcreteEvidence: true } },
    ]);

    assert.strictEqual(state.currentStepId, 'complete');
    assert.strictEqual(state.nextRequiredAction, 'none');
    assert.deepStrictEqual(state.blocked, []);
    assert.strictEqual(state.chain.find(step => step.id === 'completion').status, 'complete');
  })) passed++; else failed++;

  if (test('only CRITICAL and HIGH findings block', () => {
    // hasBlockingFindings was `parsedFindings.length > 0`, so an
    // `INFO: nothing blocking` line blocked the chain. Nobody noticed because
    // the check was unreachable from 2026-08-17. Two of this task chain's own
    // review summaries carried only INFO findings and would have blocked.
    const severityBlocks = severity => {
      const state = parseReviewState([
        '# Review Summary',
        '',
        '## Review Scope',
        '',
        '- x',
        '',
        '## Findings',
        '',
        `${severity}: something`,
        '',
        '## Residual Risks',
        '',
        '- none',
        '',
        '## Next Action',
        '',
        'Merge.',
      ].join('\n'));
      return state.hasBlockingFindings;
    };

    assert.strictEqual(severityBlocks('CRITICAL'), true);
    assert.strictEqual(severityBlocks('HIGH'), true);
    assert.strictEqual(severityBlocks('MEDIUM'), false);
    assert.strictEqual(severityBlocks('LOW'), false);
    assert.strictEqual(severityBlocks('INFO'), false);
  })) passed++; else failed++;

  if (test('unresolved review findings block regardless of whether review was required', () => {
    // hasBlockingFindings was computed but the check sat inside `if
    // (reviewRequired)`, which has been false since 2026-08-17. A
    // review-summary.md carrying an unresolved CRITICAL reported nothing.
    const state = buildLifecycleState([
      { name: 'verification-summary.md', verification_state: { complete: true, missingSections: [] } },
      { name: 'review-summary.md', review_state: { complete: true, hasBlockingFindings: true, missingSections: [] } },
    ]);
    assert.ok(
      state.blocked.includes('review-summary.md still has unresolved findings'),
      `expected the finding to block, got ${JSON.stringify(state.blocked)}`
    );
    assert.strictEqual(state.chain.find(step => step.id === 'review').status, 'blocked');
  })) passed++; else failed++;

  if (test('a review with unresolved findings blocks even with no verification', () => {
    // Whether review was owed is a separate question from whether the review
    // that exists found something unresolved.
    const state = buildLifecycleState([
      { name: 'review-summary.md', review_state: { complete: true, hasBlockingFindings: true, missingSections: [] } },
    ]);
    assert.strictEqual(state.reviewRequired, false);
    assert.ok(state.blocked.includes('review-summary.md still has unresolved findings'));
  })) passed++; else failed++;

  if (test('the retired routing keys are gone from the returned state', () => {
    const state = buildLifecycleState([
      { name: 'verification-summary.md', verification_state: { complete: true, missingSections: [] } },
    ]);
    // Their only source was plan.md / progress.md. Keeping them would report a
    // constant.
    for (const key of ['planStatus', 'worktreeRequired', 'nonTrivial', 'progressPresent', 'progressExecutionState', 'sessionState']) {
      assert.ok(!(key in state), `${key} should be gone from buildLifecycleState`);
    }
  })) passed++; else failed++;

  console.log('\ngetRepoRoot:');

  if (test('resolves the repository root from a nested working directory', () => {
    withTempRepo(repoRoot => {
      const nested = path.join(repoRoot, 'scripts', 'lib');
      fs.mkdirSync(nested, { recursive: true });
      assert.strictEqual(getRepoRoot(nested), repoRoot);
    }, { git: true });
  })) passed++; else failed++;

  if (test('returns null instead of throwing when the path is not a working tree', () => {
    assert.strictEqual(getRepoRoot(path.join(os.tmpdir(), 'task-artifacts-does-not-exist-12345')), null);
  })) passed++; else failed++;

  console.log('\nfindTaskArtifacts:');

  if (test('returns an empty list without a repository root', () => {
    assert.deepStrictEqual(findTaskArtifacts(''), []);
    assert.deepStrictEqual(findTaskArtifacts(null), []);
    assert.deepStrictEqual(findTaskArtifacts(undefined), []);
  })) passed++; else failed++;

  if (test('reads only the artifacts that exist, in canonical order', () => {
    withTempRepo(repoRoot => {
      // written observation-first on purpose: the order must come from the canonical
      // list, not from directory order.
      writeArtifact(repoRoot, 'observation-summary.md', COMPLETE_OBSERVATION);
      writeArtifact(repoRoot, 'research.md', ['# Research', '', '## Options', '', '- reuse the parser']);

      const artifacts = findTaskArtifacts(repoRoot);
      assert.deepStrictEqual(artifacts.map(a => a.name), ['research.md', 'observation-summary.md']);
    });
  })) passed++; else failed++;

  if (test('plan.md and progress.md are no longer scanned', () => {
    withTempRepo(repoRoot => {
      // Retired 2026-08-17. A stray copy must not appear in the chain: listing it
      // implied it still routed something, which it had not since that date.
      writeArtifact(repoRoot, 'plan.md', APPROVED_PLAN);
      writeArtifact(repoRoot, 'progress.md', EXECUTING_PROGRESS);

      assert.deepStrictEqual(findTaskArtifacts(repoRoot), []);
      assert.strictEqual(buildArtifactContext(repoRoot), null);
    });
  })) passed++; else failed++;

  if (test('attaches frontmatter and the parser matching each artifact name', () => {
    withTempRepo(repoRoot => {
      writeArtifact(repoRoot, 'verification-summary.md', COMPLETE_VERIFICATION);
      writeArtifact(repoRoot, 'review-summary.md', COMPLETE_REVIEW);

      const [review, verification] = findTaskArtifacts(repoRoot);

      assert.ok(verification.verification_state, 'verification-summary.md should carry verification_state');
      assert.strictEqual(verification.review_state, null, 'verification-summary.md should not carry review_state');
      // preview starts at the first content line
      assert.strictEqual(verification.preview[0], '# Verification Summary');

      assert.ok(review.review_state, 'review-summary.md should carry review_state');
      assert.strictEqual(review.verification_state, null, 'review-summary.md should not carry verification_state');
    });
  })) passed++; else failed++;

  console.log('\nbuildArtifactContext / buildArtifactSnapshot:');

  if (test('return null when the repository carries no artifacts', () => {
    withTempRepo(repoRoot => {
      assert.strictEqual(buildArtifactContext(repoRoot), null);
      assert.strictEqual(buildArtifactSnapshot(repoRoot), null);
    });
  })) passed++; else failed++;

  if (test('context reports the open gate without any retired field', () => {
    withTempRepo(repoRoot => {
      writeArtifact(repoRoot, 'research.md', ['# Research', '', '## Options', '', '- reuse the parser']);
      writeArtifact(repoRoot, 'verification-summary.md', COMPLETE_VERIFICATION);

      const context = buildArtifactContext(repoRoot);
      const lines = context.split('\n');

      assert.strictEqual(lines[0], 'Active repository task chain:');
      assert.ok(lines.includes('- artifacts=research.md, verification-summary.md'), context);
      assert.ok(lines.includes('- review_required=true'), context);
      assert.ok(lines.includes('- observe_required=true'), context);
      assert.ok(lines.includes('- current_step=review'), context);
      assert.ok(lines.includes('- blocked=missing review-summary.md, missing observation-summary.md'), context);
      assert.ok(lines.includes('- detail=/chain-status'), context);

      // Their only source was plan.md / progress.md, so they printed a constant.
      // `create plan.md` was injected into every session until 2026-08-20.
      for (const retired of ['plan_status', 'current_phase', 'next_action', 'blockers']) {
        assert.ok(!lines.some(line => line.startsWith(`- ${retired}=`)), `${retired} still printed: ${context}`);
      }
      assert.ok(!context.includes('plan.md'), context);
    });
  })) passed++; else failed++;

  if (test('snapshot lists every chain step with its status', () => {
    withTempRepo(repoRoot => {
      writeArtifact(repoRoot, 'verification-summary.md', COMPLETE_VERIFICATION);
      writeArtifact(repoRoot, 'review-summary.md', COMPLETE_REVIEW);

      const snapshot = buildArtifactSnapshot(repoRoot);
      const lines = snapshot.split('\n');

      assert.ok(lines.includes('### Artifact Snapshot'), snapshot);
      assert.ok(lines.includes('### Lifecycle Chain'), snapshot);
      // research.md is absent, and it is optional at every task weight, so it never blocks the chain
      assert.ok(lines.includes('- research: skipped | optional; findings belong in docs/design/ when they need to survive'), snapshot);
      assert.ok(!lines.some(line => line.startsWith('- research: pending')), snapshot);
      assert.ok(lines.includes('- implementation: complete | implementation has verification evidence'), snapshot);
      assert.ok(lines.includes('- verification: complete | verification-summary.md complete'), snapshot);
      assert.ok(lines.includes('- review: complete | review-summary.md complete'), snapshot);
      assert.ok(lines.includes('- observation: pending | write observation-summary.md with runtime evidence'), snapshot);

      // The Session State block came from progress.md, retired 2026-08-17.
      assert.ok(!snapshot.includes('### Session State'), snapshot);
      assert.ok(!lines.some(line => line.startsWith('- plan_status=')), snapshot);
      assert.ok(!lines.some(line => line.startsWith('- progress_present=')), snapshot);
      assert.ok(!lines.some(line => line.startsWith('- plan:')), snapshot);
    });
  })) passed++; else failed++;

  if (test('snapshot still recognizes research.md when it is present', () => {
    withTempRepo(repoRoot => {
      writeArtifact(repoRoot, 'research.md', ['# Research', '', '## Options', '', '- reuse the parser']);
      writeArtifact(repoRoot, 'plan.md', APPROVED_PLAN);
      writeArtifact(repoRoot, 'progress.md', EXECUTING_PROGRESS);

      const lines = buildArtifactSnapshot(repoRoot).split('\n');

      // dropping the requirement must not drop the recognition: /research still has a reason to run
      assert.ok(lines.includes('- research: complete | research.md present'), lines.join('\n'));
    });
  })) passed++; else failed++;

  console.log('\nparseReviewState:');

  const reviewSections = (findings) => [
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
    '- covered by the parser tests',
    '',
    '## Findings',
    ...findings,
    '',
    '## Residual Risks',
    '- environment differences remain untested',
    '',
    '## Guardrail Candidates',
    '- none',
    '',
    '## Next Action',
    '- none',
  ].join('\n');

  if (test('treats an explicit "none" findings list as complete and non-blocking', () => {
    const review = parseReviewState(reviewSections(['- none']));
    assert.strictEqual(review.complete, true);
    assert.strictEqual(review.hasBlockingFindings, false);
    assert.deepStrictEqual(review.missingSections, []);
    assert.deepStrictEqual(review.missingValues, []);
    assert.strictEqual(review.nextAction, 'none');
  })) passed++; else failed++;

  if (test('parses severity prefixes and still reports the findings as blocking', () => {
    const review = parseReviewState(reviewSections([
      '- HIGH: missing runtime evidence',
      '- low: naming is inconsistent',
    ]));
    assert.strictEqual(review.complete, true, 'well-formed findings do not make the artifact incomplete');
    assert.strictEqual(review.hasBlockingFindings, true);
    assert.deepStrictEqual(
      review.parsedFindings.map(f => [f.severity, f.message]),
      [['HIGH', 'missing runtime evidence'], ['LOW', 'naming is inconsistent']]
    );
  })) passed++; else failed++;

  if (test('rejects findings written without a severity prefix', () => {
    const review = parseReviewState(reviewSections(['- the parser looks fragile']));
    assert.strictEqual(review.complete, false);
    assert.deepStrictEqual(review.invalidFindings, ['the parser looks fragile']);
    assert.deepStrictEqual(review.parsedFindings, []);
  })) passed++; else failed++;

  if (test('separates a missing section from a present but empty one', () => {
    const review = parseReviewState([
      '# Review Summary',
      '',
      '## Review Scope',
      '- lifecycle guard behavior',
      '',
      '## Findings',
      '- none',
      '',
      '## Residual Risks',
    ].join('\n'));

    assert.deepStrictEqual(review.missingSections, [
      'Design Compliance', 'Security', 'Comment Adequacy', 'Code Quality',
      'Test Adequacy', 'Guardrail Candidates', 'Next Action',
    ], 'absent headings');
    assert.deepStrictEqual(review.missingValues, ['Residual Risks', 'Next Action'],
      'Residual Risks is present with an empty body, which is a different defect');
    assert.strictEqual(review.complete, false);
  })) passed++; else failed++;

  console.log('\nparseObservationState:');

  const observationSections = (evidence) => [
    '# Observation Summary',
    '',
    '## Behavior Checked',
    '- session-start injection order',
    '',
    '## Method',
    '- ran the hook against a scratch repository',
    '',
    '## Evidence',
    `- ${evidence}`,
    '',
    '## Remaining Uncertainty',
    '- none',
  ].join('\n');

  if (test('requires a concrete evidence source, not just filled sections', () => {
    const vague = parseObservationState(observationSections('it looked right when I tried it'));
    assert.deepStrictEqual(vague.missingSections, []);
    assert.deepStrictEqual(vague.missingValues, []);
    assert.strictEqual(vague.hasConcreteEvidence, false);
    assert.strictEqual(vague.complete, false, 'filled sections alone must not pass the observation gate');
  })) passed++; else failed++;

  if (test('accepts a named evidence channel', () => {
    const concrete = parseObservationState(observationSections('stderr: [SessionStart] Found 1 recent session'));
    assert.strictEqual(concrete.hasConcreteEvidence, true);
    assert.strictEqual(concrete.complete, true);
    assert.strictEqual(concrete.concreteEvidenceLines.length, 1);
  })) passed++; else failed++;

  console.log('\nparseVerificationState:');

  if (test('is complete only when all four sections carry entries', () => {
    const complete = parseVerificationState([
      '# Verification Summary',
      '',
      '## Scope',
      '- tests/hooks/hooks.test.js',
      '',
      '## Commands Run',
      '- node tests/hooks/hooks.test.js',
      '',
      '## Verification Outcome',
      '- Passed: 217, Failed: 0',
      '',
      '## Assessment',
      '- the hook surface is covered',
    ].join('\n'));

    assert.strictEqual(complete.complete, true);
    assert.deepStrictEqual(complete.commandsRun, ['node tests/hooks/hooks.test.js']);

    const empty = parseVerificationState([
      '# Verification Summary',
      '',
      '## Scope',
      '- tests/hooks/hooks.test.js',
      '',
      '## Commands Run',
      '',
      '## Verification Outcome',
      '- Passed: 217, Failed: 0',
      '',
      '## Assessment',
      '- the hook surface is covered',
    ].join('\n'));

    assert.strictEqual(empty.complete, false);
    assert.deepStrictEqual(empty.missingSections, [], 'the heading is present, only its body is empty');
    assert.deepStrictEqual(empty.missingValues, ['Commands Run']);
  })) passed++; else failed++;

  if (test('a review missing the Security pass is incomplete', () => {
    // Security and Comment Adequacy are passes, not prose: their absence is
    // invisible unless the parser asks for them. Measured on 2026-08-21, all
    // six captured reviews carried both sections -- but only because the
    // template lists them, and the parser required four headings out of ten.
    const withoutSecurity = parseReviewState([
      '# Review Summary',
      '',
      '## Review Scope',
      '- x',
      '',
      '## Design Compliance',
      '- follows the design doc',
      '',
      '## Comment Adequacy',
      '- no change needed',
      '',
      '## Code Quality',
      '- fine',
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
      'Merge.',
    ].join('\n'));

    assert.ok(withoutSecurity.missingSections.includes('Security'),
      `Security should be reported missing, got ${JSON.stringify(withoutSecurity.missingSections)}`);
    assert.strictEqual(withoutSecurity.complete, false);
  })) passed++; else failed++;

  if (test('the required review sections match the template', () => {
    // The parser's list and the template are two copies of one contract. This
    // test is what keeps them from drifting; without it, adding a section to
    // the template would silently leave it optional.
    const { REVIEW_REQUIRED_HEADINGS } = require('../../scripts/lib/task-artifacts');
    const templatePath = path.join(__dirname, '..', '..', 'templates', 'review-summary-template.md');
    const templateHeadings = (fs.readFileSync(templatePath, 'utf8').match(/^## .*/gm) || [])
      .map(line => line.slice(3).trim());

    assert.deepStrictEqual(REVIEW_REQUIRED_HEADINGS, templateHeadings);
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
