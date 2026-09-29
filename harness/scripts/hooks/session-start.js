#!/usr/bin/env node
/**
 * SessionStart Hook - Load previous context on new session
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs when a new Claude session starts. Loads the most recent session
 * summary into Claude's context via stdout, and reports available
 * sessions and learned skills.
 */

const {
  getSessionsDir,
  findFiles,
  ensureDir,
  readFile,
  log,
  output
} = require('../lib/utils');
const { getPackageManager, getSelectionPrompt } = require('../lib/package-manager');
const { listAliases } = require('../lib/session-aliases');
const { detectProjectType } = require('../lib/project-detect');
const { getRepoRoot } = require('../lib/task-artifacts');
const { captureRuntimeSession, hookSessionId, readHookInput } = require('../lib/runtime-session');
const { resolveResumeState } = require('../lib/run-log');

async function main(raw) {
  const sessionsDir = getSessionsDir();
  const repoRoot = getRepoRoot(process.cwd());
  const sessionId = hookSessionId(raw);

  // The SQLite run_state row is gone. Measured 2026-08-20 with all three gate
  // artifacts present: every non-empty field it contributed already appeared in
  // buildArtifactContext, which also had next_required_action and detail. The
  // narrative fields (current_phase / current_step / next_action / blockers)
  // came from progress.md and have been empty since 2026-08-17.
  // resolveResumeState handles an empty repoRoot itself, so no branch here.
  const resume = resolveResumeState({ repoRoot });

  // Ensure directories exist
  ensureDir(sessionsDir);

  // Check for recent session files (last 7 days)
  const recentSessions = findFiles(sessionsDir, '*-session.tmp', { maxAge: 7 });

  if (resume.context) {
    output(resume.context);
  } else if (resume.expected) {
    // A run record holds evidence for this repository but the artifacts are
    // gone, so the task is over. Falling through to the session .tmp branch
    // would replace one wrong answer with a worse one: those files are not
    // repo-scoped, so the newest one belongs to whichever project was touched
    // last. Nothing is the honest output.
    log(`[SessionStart] No current task state to restore (evidence remains in harness/data/runs/${resume.runId})`);
  } else if (recentSessions.length > 0) {
    const latest = recentSessions[0];
    log(`[SessionStart] Found ${recentSessions.length} recent session(s)`);
    log(`[SessionStart] Latest: ${latest.path}`);

    // Read and inject the latest session content into Claude's context
    const content = readFile(latest.path);
    if (content && !content.includes('[Session context goes here]')) {
      // Only inject if the session has actual content (not the blank template)
      output(`Previous session summary:\n${content}`);
    }
  }

  // Check for available session aliases
  const aliases = listAliases({ limit: 5 });

  if (aliases.length > 0) {
    const aliasNames = aliases.map(a => a.name).join(', ');
    log(`[SessionStart] ${aliases.length} session alias(es) available: ${aliasNames}`);
    log(`[SessionStart] Use /sessions load <alias> to continue a previous session`);
  }

  // Detect and report package manager
  const pm = getPackageManager();
  log(`[SessionStart] Package manager: ${pm.name} (${pm.source})`);

  // If no explicit package manager config was found, show selection prompt
  if (pm.source === 'default') {
    log('[SessionStart] No package manager preference found.');
    log(getSelectionPrompt());
  }

  // Detect project type and frameworks (#293)
  const projectInfo = detectProjectType();
  if (projectInfo.languages.length > 0 || projectInfo.frameworks.length > 0) {
    const parts = [];
    if (projectInfo.languages.length > 0) {
      parts.push(`languages: ${projectInfo.languages.join(', ')}`);
    }
    if (projectInfo.frameworks.length > 0) {
      parts.push(`frameworks: ${projectInfo.frameworks.join(', ')}`);
    }
    log(`[SessionStart] Project detected — ${parts.join('; ')}`);
    output(`Project type: ${JSON.stringify(projectInfo)}`);
  } else {
    log('[SessionStart] No specific project type detected');
  }

  if (repoRoot) {
    // Recording must never keep a session from starting, so both writes are
    // guarded. Gate evidence first: it is the copy that survives ExitWorktree.
    try {
      captureRuntimeSession('start', { sessionId });
    } catch {
      // Intentionally silent.
    }
  }

  process.exit(0);
}

readHookInput().then(main).catch(err => {
  console.error('[SessionStart] Error:', err.message);
  process.exit(0); // Don't block on errors
});
