const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  parseObservationState,
  parseReviewState,
  parseVerificationState,
} = require('../scripts/lib/task-artifacts');
const {
  appendGuardrailCandidates,
  normalizeGuardrailCandidate,
} = require('../scripts/lib/guardrail-candidates');
const {
  findLatestPipelineEvidence,
  formatMissingPipelineEvidenceWarning,
} = require('../scripts/lib/pipeline-evidence');

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

function isLinkedWorktree(repo) {
  try {
    const gitDir = execFileSync('git', ['-C', repo, 'rev-parse', '--git-dir'], { encoding: 'utf8' }).trim();
    const commonDir = execFileSync('git', ['-C', repo, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim();
    return path.resolve(repo, gitDir) !== path.resolve(repo, commonDir);
  } catch {
    return false;
  }
}

function getGuardrailRegistryPath() {
  const homeDir = process.env.HOME || os.homedir();
  return path.join(homeDir, '.claude', 'harness/data/state', 'guardrail-candidates.jsonl');
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

  // A commit is a checkpoint, not a claim of completion — one task produces many, and each is
  // still reversible (amend, reset, never push). Everything below advises; the only hard
  // gate is harness/hooks/git-push-guard.js.
  //
  // Every check below is unconditional. A linked worktree is the weight signal, and unlike a
  // frontmatter field it cannot be satisfied by writing a file.
  const advisories = [];
  const heavier = isLinkedWorktree(repo);

  const verificationPath = path.join(repo, 'verification-summary.md');
  if (!fs.existsSync(verificationPath)) {
    if (heavier) advisories.push('no verification-summary.md (run /verify)');
  } else {
    const verification = parseVerificationState(fs.readFileSync(verificationPath, 'utf8'));
    if (!verification.complete) {
      const details = [];
      if (verification.missingSections.length > 0) details.push(`missing sections: ${verification.missingSections.join(', ')}`);
      if (verification.missingValues.length > 0) details.push(`empty sections: ${verification.missingValues.join(', ')}`);
      advisories.push(`verification-summary.md is incomplete (${details.join('; ')})`);
    }
  }

  const reviewPath = path.join(repo, 'review-summary.md');
  if (!fs.existsSync(reviewPath)) {
    if (heavier) advisories.push('no review-summary.md (run /review-task)');
  } else {
    const review = parseReviewState(fs.readFileSync(reviewPath, 'utf8'));
    if (!review.complete) {
      const details = [];
      if (review.missingSections.length > 0) details.push(`missing sections: ${review.missingSections.join(', ')}`);
      if (review.missingValues.length > 0) details.push(`empty sections: ${review.missingValues.join(', ')}`);
      if (review.invalidFindings.length > 0) details.push(`findings without severity prefix: ${review.invalidFindings.join('; ')}`);
      advisories.push(`review-summary.md is incomplete (${details.join('; ')})`);
    }
    if (review.hasBlockingFindings) {
      const findingsPreview = review.blockingFindings
        .slice(0, 3)
        .map(finding => `${finding.severity}: ${finding.message}`)
        .join('; ');
      advisories.push(`review-summary.md has unresolved findings (${findingsPreview})`);
    }
  }

  // Absence is flagged once verification-summary.md exists (2026-08-20). Whether behavior
  // changed still cannot be inferred here, but verification evidence means something was
  // built, and over-asking is the safe direction for an advisory. This matches
  // buildLifecycleState: two layers answering the same question differently is how the
  // lifecycle drifted before.
  const observationPath = path.join(repo, 'observation-summary.md');
  if (!fs.existsSync(observationPath)) {
    if (heavier && fs.existsSync(verificationPath)) {
      advisories.push('no observation-summary.md (run /observe if behavior changed)');
    }
  } else {
    const observation = parseObservationState(fs.readFileSync(observationPath, 'utf8'));
    if (!observation.complete) {
      const details = [];
      if (observation.missingSections.length > 0) details.push(`missing sections: ${observation.missingSections.join(', ')}`);
      if (observation.missingValues.length > 0) details.push(`empty sections: ${observation.missingValues.join(', ')}`);
      if (!observation.hasConcreteEvidence) details.push('concrete evidence source required in Method or Evidence');
      advisories.push(`observation-summary.md is incomplete (${details.join('; ')})`);
    }
  }

  if (advisories.length > 0) {
    console.error(`[Lifecycle Advisory] ${advisories.join(' | ')}`);
  }

  if (heavier) {
    const evidence = findLatestPipelineEvidence(repo);
    if (!evidence.found) {
      console.error(formatMissingPipelineEvidenceWarning(evidence));
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
