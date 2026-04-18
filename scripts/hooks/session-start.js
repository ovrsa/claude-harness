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
  getLearnedSkillsDir,
  findFiles,
  ensureDir,
  readFile,
  log,
  output
} = require('../lib/utils');
const { getPackageManager, getSelectionPrompt } = require('../lib/package-manager');
const { listAliases } = require('../lib/session-aliases');
const { detectProjectType } = require('../lib/project-detect');
const { getRepoRoot, buildArtifactContext } = require('../lib/task-artifacts');
const {
  recordSessionEvent,
  recordLifecycleSnapshot,
  getRunId,
  getLatestRunState,
  formatResumeState,
} = require('../lib/session-trace');

async function main() {
  const sessionsDir = getSessionsDir();
  const learnedDir = getLearnedSkillsDir();
  const repoRoot = getRepoRoot(process.cwd());
  const artifactContext = buildArtifactContext(repoRoot);
  const sessionId = String(process.env.CLAUDE_SESSION_ID || '').trim() || undefined;
  const runId = getRunId(sessionId);
  const persistedState = repoRoot
    ? (getLatestRunState({ repoRoot }) || getLatestRunState())
    : getLatestRunState();

  // Ensure directories exist
  ensureDir(sessionsDir);
  ensureDir(learnedDir);

  // Check for recent session files (last 7 days)
  const recentSessions = findFiles(sessionsDir, '*-session.tmp', { maxAge: 7 });

  if (persistedState) {
    output(formatResumeState(persistedState));
  } else if (artifactContext) {
    output(artifactContext);
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

  // Check for learned skills
  const learnedSkills = findFiles(learnedDir, '*.md');

  if (learnedSkills.length > 0) {
    log(`[SessionStart] ${learnedSkills.length} learned skill(s) available in ${learnedDir}`);
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

  recordSessionEvent({
    sessionId,
    runId,
    eventType: 'session_started',
    status: persistedState ? 'resumed' : (artifactContext ? 'artifact_resumed' : 'started'),
    repoRoot: repoRoot || '',
    cwd: process.cwd(),
    taskPhase: persistedState?.currentPhase || '',
    metadata: {
      frameworks: projectInfo.frameworks,
      languages: projectInfo.languages,
      recent_session_count: recentSessions.length,
      resume_success: Boolean(persistedState || artifactContext),
      resume_source: persistedState ? 'sqlite' : (artifactContext ? 'artifacts' : (recentSessions.length > 0 ? 'session_tmp' : 'none')),
    },
    createdBy: 'session-start',
  });

  if (repoRoot) {
    recordLifecycleSnapshot({
      sessionId,
      runId,
      repoRoot,
      cwd: process.cwd(),
      includeArtifactContextLoaded: true,
      createdBy: 'session-start',
    });
  }

  process.exit(0);
}

main().catch(err => {
  console.error('[SessionStart] Error:', err.message);
  process.exit(0); // Don't block on errors
});
