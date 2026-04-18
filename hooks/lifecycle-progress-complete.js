const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  parseObservationState,
  parseProgressState,
  parseReviewState,
  parseVerificationState,
  classifyProgressCompletionState,
} = require('../scripts/lib/task-artifacts');

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

function normalizeExistingPath(filePath) {
  try {
    return fs.realpathSync.native(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

function applyStringEdit(content, edit) {
  const source = String(content || '');
  const oldString = typeof edit.old_string === 'string' ? edit.old_string : null;
  const newString = typeof edit.new_string === 'string' ? edit.new_string : null;
  if (oldString === null || newString === null) {
    return null;
  }

  if (edit.replace_all) {
    if (!oldString || !source.includes(oldString)) {
      return null;
    }
    return source.split(oldString).join(newString);
  }

  const index = source.indexOf(oldString);
  if (index === -1) {
    return null;
  }

  return source.slice(0, index) + newString + source.slice(index + oldString.length);
}

function deriveNextProgressContent(toolInput, progressPath) {
  const currentContent = fs.existsSync(progressPath)
    ? fs.readFileSync(progressPath, 'utf8')
    : '';

  if (typeof toolInput.content === 'string') {
    return toolInput.content;
  }

  if (Array.isArray(toolInput.edits)) {
    let nextContent = currentContent;
    for (const edit of toolInput.edits) {
      nextContent = applyStringEdit(nextContent, edit);
      if (nextContent === null) {
        return null;
      }
    }
    return nextContent;
  }

  if (Object.prototype.hasOwnProperty.call(toolInput, 'old_string') &&
      Object.prototype.hasOwnProperty.call(toolInput, 'new_string')) {
    return applyStringEdit(currentContent, toolInput);
  }

  return null;
}

function addIssue(issues, artifactName, details) {
  issues.push(`${artifactName} ${details}`.trim());
}

function collectCompletionIssues(repo, meta) {
  const issues = [];
  const verificationPath = path.join(repo, 'verification-summary.md');
  if (!fs.existsSync(verificationPath)) {
    addIssue(issues, 'verification-summary.md', 'is missing.');
  } else {
    const verification = parseVerificationState(fs.readFileSync(verificationPath, 'utf8'));
    if (!verification.complete) {
      const details = [];
      if (verification.missingSections.length > 0) details.push(`missing sections: ${verification.missingSections.join(', ')}`);
      if (verification.missingValues.length > 0) details.push(`empty sections: ${verification.missingValues.join(', ')}`);
      addIssue(issues, 'verification-summary.md', `is incomplete (${details.join(' | ')}).`);
    }
  }

  const observeRequired = meta.observe_required === 'true';
  const reviewRequired = meta.review_required === 'true' || observeRequired;

  if (reviewRequired) {
    const reviewPath = path.join(repo, 'review-summary.md');
    if (!fs.existsSync(reviewPath)) {
      addIssue(issues, 'review-summary.md', 'is missing.');
    } else {
      const review = parseReviewState(fs.readFileSync(reviewPath, 'utf8'));
      if (!review.complete) {
        const details = [];
        if (review.missingSections.length > 0) details.push(`missing sections: ${review.missingSections.join(', ')}`);
        if (review.missingValues.length > 0) details.push(`empty sections: ${review.missingValues.join(', ')}`);
        if (review.invalidFindings.length > 0) details.push('findings need severity prefixes');
        addIssue(issues, 'review-summary.md', `is incomplete (${details.join(' | ')}).`);
      } else if (review.hasBlockingFindings) {
        addIssue(issues, 'review-summary.md', 'still has unresolved findings.');
      }
    }
  }

  if (observeRequired) {
    const observationPath = path.join(repo, 'observation-summary.md');
    if (!fs.existsSync(observationPath)) {
      addIssue(issues, 'observation-summary.md', 'is missing.');
    } else {
      const observation = parseObservationState(fs.readFileSync(observationPath, 'utf8'));
      if (!observation.complete) {
        const details = [];
        if (observation.missingSections.length > 0) details.push(`missing sections: ${observation.missingSections.join(', ')}`);
        if (observation.missingValues.length > 0) details.push(`empty sections: ${observation.missingValues.join(', ')}`);
        if (!observation.hasConcreteEvidence) details.push('missing concrete evidence source');
        addIssue(issues, 'observation-summary.md', `is incomplete (${details.join(' | ')}).`);
      }
    }
  }

  return issues;
}

(async () => {
  const input = await readStdin();
  const toolInput = input.tool_input || {};
  const fp = toolInput.file_path;
  if (!fp) process.exit(0);

  const dir = path.dirname(fp);
  const repo = getRepoRoot(dir) || getRepoRoot(process.cwd());
  if (!repo) process.exit(0);

  const progressPath = path.join(repo, 'progress.md');
  if (normalizeExistingPath(fp) !== normalizeExistingPath(progressPath)) {
    process.exit(0);
  }

  const nextContent = deriveNextProgressContent(toolInput, progressPath);
  if (typeof nextContent !== 'string') {
    process.exit(0);
  }

  const currentState = fs.existsSync(progressPath)
    ? parseProgressState(fs.readFileSync(progressPath, 'utf8'))
    : null;
  const nextState = parseProgressState(nextContent);
  const currentCompletionState = classifyProgressCompletionState(currentState);
  const nextCompletionState = classifyProgressCompletionState(nextState);

  if (nextCompletionState !== 'completion_candidate' || currentCompletionState === 'completion_candidate') {
    process.exit(0);
  }

  const planPath = path.join(repo, 'plan.md');
  if (!fs.existsSync(planPath)) {
    console.error('[Lifecycle Guardrail] Missing plan.md. Do not mark a task complete without an approved plan.');
    process.exit(2);
  }

  const meta = parseFrontmatter(fs.readFileSync(planPath, 'utf8'));
  if (meta.status !== 'approved') {
    console.error('[Lifecycle Guardrail] plan.md is not approved. Approve the plan before marking the task complete.');
    process.exit(2);
  }

  const issues = collectCompletionIssues(repo, meta);
  if (issues.length > 0) {
    console.error(`[Lifecycle Guardrail] Completion is blocked because required completion evidence is missing or incomplete. ${issues.join(' | ')} Run verification/review/observation as required and update the summary artifacts before marking the task complete.`);
    process.exit(2);
  }
})();
