const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  parseObservationState,
  parseProgressState,
  parseReviewState,
  parseVerificationState,
} = require('../scripts/lib/task-artifacts');
const {
  appendGuardrailCandidates,
  normalizeGuardrailCandidate,
} = require('../scripts/lib/guardrail-candidates');

function readStdin() {
  return new Promise(resolve => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => data += c);
    process.stdin.on('end', () => {
      try { resolve(data.trim() ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
    process.stdin.on('error', () => resolve({}));
  });
}

function getRepoRoot(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

function getGuardrailRegistryPath() {
  const homeDir = process.env.HOME || os.homedir();
  return path.join(homeDir, '.claude', '.state', 'guardrail-candidates.jsonl');
}

function collectGuardrailCandidates(repo) {
  const artifactParsers = [
    ['review-summary.md', parseReviewState],
    ['verification-summary.md', parseVerificationState],
    ['observation-summary.md', parseObservationState],
  ];
  const candidates = [];
  const warnings = [];

  for (const [artifactName, parser] of artifactParsers) {
    const artifactPath = path.join(repo, artifactName);
    if (!fs.existsSync(artifactPath)) continue;
    const state = parser(fs.readFileSync(artifactPath, 'utf8'));
    const parsedCandidates = Array.isArray(state.guardrailCandidates) ? state.guardrailCandidates : [];
    const parsedWarnings = Array.isArray(state.guardrailCandidateWarnings) ? state.guardrailCandidateWarnings : [];

    for (const warning of parsedWarnings) {
      warnings.push(`${artifactName}: ${warning}`);
    }
    for (const candidate of parsedCandidates) {
      candidates.push(normalizeGuardrailCandidate(candidate, { sourceArtifact: artifactName }));
    }
  }

  return { candidates, warnings };
}

(async () => {
  const input = await readStdin();
  const cmd = input.tool_input && input.tool_input.command || '';
  if (!/git\s+commit/.test(cmd)) process.exit(0);
  const repo = getRepoRoot(process.cwd());
  if (!repo) process.exit(0);

  const planPath = path.join(repo, 'plan.md');
  if (!fs.existsSync(planPath)) {
    console.error('[Lifecycle Guardrail] Missing plan.md. Do not commit without a plan.');
    process.exit(2);
  }
  const plan = fs.readFileSync(planPath, 'utf8');
  const meta = parseFrontmatter(plan);
  const reviewRequired = meta.review_required === 'true' || meta.observe_required === 'true';
  if (meta.status !== 'approved') {
    console.error('[Lifecycle Guardrail] plan.md is not approved. Do not commit implementation against a draft plan.');
    process.exit(2);
  }
  if (!fs.existsSync(path.join(repo, 'verification-summary.md'))) {
    console.error('[Lifecycle Guardrail] Missing verification-summary.md. Run verify before commit.');
    process.exit(2);
  }
  if (reviewRequired) {
    const reviewPath = path.join(repo, 'review-summary.md');
    if (!fs.existsSync(reviewPath)) {
      console.error('[Lifecycle Guardrail] Missing review-summary.md for a task that requires review.');
      process.exit(2);
    }
    const review = parseReviewState(fs.readFileSync(reviewPath, 'utf8'));
    if (!review.complete) {
      const details = [];
      if (review.missingSections.length > 0) details.push(`Missing sections: ${review.missingSections.join(', ')}`);
      if (review.missingValues.length > 0) details.push(`Empty sections: ${review.missingValues.join(', ')}`);
      if (review.invalidFindings.length > 0) details.push(`Findings without severity prefix: ${review.invalidFindings.join('; ')}`);
      console.error(`[Lifecycle Guardrail] review-summary.md is incomplete. ${details.join(' | ')}`);
      process.exit(2);
    }
    if (review.hasBlockingFindings) {
      const findingsPreview = review.blockingFindings
        .slice(0, 3)
        .map(finding => `${finding.severity}: ${finding.message}`)
        .join(' | ');
      console.error(`[Lifecycle Guardrail] review-summary.md still has unresolved findings. Move accepted concerns to Residual Risks and clear Findings before commit. ${findingsPreview}`);
      process.exit(2);
    }
  }
  if (meta.observe_required === 'true') {
    const observationPath = path.join(repo, 'observation-summary.md');
    if (!fs.existsSync(observationPath)) {
      console.error('[Lifecycle Guardrail] Missing observation-summary.md for a task that requires observation.');
      process.exit(2);
    }
    const observation = parseObservationState(fs.readFileSync(observationPath, 'utf8'));
    if (!observation.complete) {
      const details = [];
      if (observation.missingSections.length > 0) details.push(`Missing sections: ${observation.missingSections.join(', ')}`);
      if (observation.missingValues.length > 0) details.push(`Empty sections: ${observation.missingValues.join(', ')}`);
      if (!observation.hasConcreteEvidence) details.push('Concrete evidence source required in Method or Evidence (browser, logs, runtime health, stderr/stdout, trace, screenshot, metrics, or process state).');
      console.error(`[Lifecycle Guardrail] observation-summary.md is incomplete. ${details.join(' | ')}`);
      process.exit(2);
    }
  }

  if (meta.task_type === 'non_trivial' || meta.worktree_required === 'true') {
    const progressPath = path.join(repo, 'progress.md');
    if (!fs.existsSync(progressPath)) {
      console.error('[Lifecycle Guardrail] Missing progress.md. Non-trivial implementation work must keep a durable session log.');
      process.exit(2);
    }

    const progress = parseProgressState(fs.readFileSync(progressPath, 'utf8'));
    if (!progress.currentPhasePresent || !progress.lastCompletedStepPresent || !progress.nextActionPresent) {
      console.error('[Lifecycle Guardrail] progress.md is incomplete. Fill Current Phase and Last Completed Step, and set Next Action to an active step or `none` before commit.');
      process.exit(2);
    }

    if (progress.blockers.length > 0) {
      console.error(`[Lifecycle Guardrail] Blockers remain in progress.md: ${progress.blockers.join('; ')}`);
      process.exit(2);
    }

    if (progress.hasActionableNextAction) {
      console.error(`[Lifecycle Guardrail] Warning: Next Action in progress.md is still active: ${progress.nextAction}`);
    }
  }

  const { candidates, warnings } = collectGuardrailCandidates(repo);
  if (warnings.length > 0) {
    console.error(`[Lifecycle Guardrail] Warning: malformed guardrail candidates skipped. ${warnings.join(' | ')}`);
  }
  if (candidates.length > 0) {
    try {
      appendGuardrailCandidates(getGuardrailRegistryPath(), candidates);
      console.error(`[Lifecycle Guardrail] Captured ${candidates.length} guardrail candidates.`);
    } catch (err) {
      console.error(`[Lifecycle Guardrail] Warning: failed to record guardrail candidates. ${err.message}`);
    }
  }
})();
