const path = require('path');
const { execFileSync } = require('child_process');
const {
  findLatestPipelineEvidence,
  formatMissingPipelineEvidenceWarning,
} = require('../scripts/lib/pipeline-evidence');
const { issueBranchAdvisory } = require('../scripts/lib/issue-branch-advisory');

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

(async () => {
  const input = await readStdin();
  const fp = input.tool_input && input.tool_input.file_path;
  if (!fp) process.exit(0);

  // Any file, not only source: writing is where work without an issue begins. Stderr from a hook
  // that exits 0 never reaches the agent, so this advice goes out as additionalContext.
  const advice = issueBranchAdvisory({ filePath: fp, sessionId: input.session_id, cwd: input.cwd });
  if (advice) {
    process.stdout.write(JSON.stringify({
      systemMessage: advice,
      hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: advice },
    }));
  }

  if (!/\.(ts|tsx|js|jsx|py|go|rs|java|kt|swift|rb|php|c|cc|cpp|h|hpp|cs)$/i.test(fp)) process.exit(0);
  const dir = path.dirname(fp);
  const repo = getRepoRoot(dir) || getRepoRoot(process.cwd());
  if (!repo) process.exit(0);

  // Nothing here blocks. The only hard gate is hooks/git-push-guard.js.
  //
  // A linked worktree is the weight signal: the worktree policy has the agent create one
  // exactly when the work is standard or heavy-risky, and unlike a frontmatter field it
  // cannot be satisfied by writing a file.
  if (isLinkedWorktree(repo)) {
    const evidence = findLatestPipelineEvidence(repo);
    if (!evidence.found) {
      console.error(formatMissingPipelineEvidenceWarning(evidence));
    }
  }

  process.exit(0);
})();
