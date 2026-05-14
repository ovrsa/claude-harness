const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  parsePlanState,
  parseProgressState,
  classifyProgressExecutionState,
} = require('../scripts/lib/task-artifacts');
const {
  findLatestPipelineEvidence,
  formatMissingPipelineEvidenceWarning,
  isPipelineEvidenceRequired,
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

function isLinkedWorktree(repo) {
  try {
    const gitDir = execFileSync('git', ['-C', repo, 'rev-parse', '--git-dir'], { encoding: 'utf8' }).trim();
    const commonDir = execFileSync('git', ['-C', repo, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim();
    return path.resolve(repo, gitDir) !== path.resolve(repo, commonDir);
  } catch {
    return false;
  }
}

(async () => {
  const input = await readStdin();
  const fp = input.tool_input && input.tool_input.file_path;
  if (!fp) process.exit(0);
  if (!/\.(ts|tsx|js|jsx|py|go|rs|java|kt|swift|rb|php|c|cc|cpp|h|hpp|cs)$/i.test(fp)) process.exit(0);
  const dir = path.dirname(fp);
  const repo = getRepoRoot(dir) || getRepoRoot(process.cwd());
  if (!repo) process.exit(0);

  const planPath = path.join(repo, 'plan.md');
  if (!fs.existsSync(planPath)) {
    console.error('[Lifecycle Guardrail] Missing plan.md. Run research/plan before editing code.');
    process.exit(2);
  }
  const plan = fs.readFileSync(planPath, 'utf8');
  const meta = parseFrontmatter(plan);
  if (meta.status !== 'approved') {
    console.error('[Lifecycle Guardrail] plan.md is not approved. Set status: approved after human confirmation before editing code.');
    process.exit(2);
  }
  if ((meta.task_type === 'non_trivial' || meta.worktree_required === 'true')) {
    if (meta.worktree_required === 'true') {
      const planState = parsePlanState(plan);
      if (!planState.complete) {
        const details = [];
        if (planState.missingSections.length > 0) details.push(`Missing sections: ${planState.missingSections.join(', ')}`);
        if (planState.missingValues.length > 0) details.push(`Empty sections: ${planState.missingValues.join(', ')}`);
        if (!planState.hasGivenWhenThen) details.push('Behavior Spec needs Given / When / Then');
        if (!planState.hasCaseCoverage) details.push('Behavior Spec needs normal / boundary / abnormal cases');
        if (!planState.hasTddEvidencePlan) details.push('Test Evidence Plan needs RED command, expected failure, and GREEN command');
        if (!planState.hasExecutionCheckboxes) details.push('Execution Todo needs checkbox tasks');
        console.error(`[Lifecycle Guardrail] plan.md is not implementation-ready. ${details.join(' | ')}`);
        process.exit(2);
      }

      if (!isLinkedWorktree(repo)) {
        console.error('[Lifecycle Guardrail] plan.md requires an isolated worktree. Run /worktree-start and edit implementation files from the linked worktree.');
        process.exit(2);
      }
    }

    const hasResearch = fs.existsSync(path.join(repo, 'research.md')) || fs.readdirSync(repo).some(name => /_research\.md$/.test(name));
    if (!hasResearch) {
      console.error('[Lifecycle Guardrail] Missing research artifact for non-trivial task. Create research.md first.');
      process.exit(2);
    }

    const progressPath = path.join(repo, 'progress.md');
    if (!fs.existsSync(progressPath)) {
      console.error('[Lifecycle Guardrail] Missing progress.md. Initialize the durable session log before non-trivial code edits.');
      process.exit(2);
    }

    const progress = parseProgressState(fs.readFileSync(progressPath, 'utf8'));
    if (!progress.currentPhasePresent || !progress.lastCompletedStepPresent || !progress.hasActionableNextAction) {
      console.error('[Lifecycle Guardrail] progress.md is missing actionable session state. Fill Current Phase and Last Completed Step, and provide Next Action directly or via a hook-managed checkpoint before editing code.');
      process.exit(2);
    }

    if (classifyProgressExecutionState(progress) === 'planning_only') {
      console.error('[Lifecycle Guardrail] plan.md is approved, but progress.md still looks like planning state. Update Current Phase / Last Completed Step to execution state before editing code. If planning is not complete, finish /plan-task first.');
      process.exit(2);
    }
  }

  if (isPipelineEvidenceRequired(meta)) {
    const evidence = findLatestPipelineEvidence(repo);
    if (!evidence.found) {
      console.error(formatMissingPipelineEvidenceWarning(evidence));
    }
  }
})();
