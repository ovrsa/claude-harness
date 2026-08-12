#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const ACTIVE_AUTHORITY = [
  'CLAUDE.md',
  'AGENTS.md',
  'README.md',
  'CONTEXT.md',
  'docs/harness-operating-loop.md',
  'docs/harness-structure-and-ownership.md',
  'docs/experience-store.md',
  'docs/agents/issue-tracker.md',
  'docs/agents/domain.md',
  'rules/common/agents.md',
  'rules/common/development-workflow.md',
  'rules/common/git-workflow.md',
  'rules/common/performance.md',
  'rules/common/worktree-policy.md',
];

function read(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(filePath)) throw new Error(relativePath + ' is missing');
  return fs.readFileSync(filePath, 'utf8');
}

function requireText(content, needle, label) {
  if (!content.includes(needle)) throw new Error(label + ' is missing ' + JSON.stringify(needle));
}

function rejectPattern(content, pattern, label) {
  const match = content.match(pattern);
  if (match) throw new Error(label + ' contains retired lifecycle text: ' + JSON.stringify(match[0]));
}

function main() {
  const claude = read('CLAUDE.md');
  const agents = read('AGENTS.md');
  const operatingLoop = read('docs/harness-operating-loop.md');
  const structure = read('docs/harness-structure-and-ownership.md');
  const experience = read('docs/experience-store.md');
  const issueTracker = read('docs/agents/issue-tracker.md');
  const domain = read('docs/agents/domain.md');
  const hooks = JSON.parse(read('hooks/hooks.json')).hooks;
  const settingsHooks = JSON.parse(read('settings.json')).hooks;

  for (const [label, content] of [
    ['CLAUDE.md', claude],
    ['docs/harness-operating-loop.md', operatingLoop],
  ]) {
    requireText(content, 'grilling', label);
    requireText(content, '/to-spec', label);
    requireText(content, '/grill-with-docs', label);
    requireText(content, '/implement', label);
  }

  requireText(claude, '最終理解', 'CLAUDE.md');
  requireText(claude, '明示', 'CLAUDE.md');
  requireText(claude, 'JSON Experience', 'CLAUDE.md');
  requireText(agents, 'scripts/resolve-managed-skill.js grilling', 'AGENTS.md');
  requireText(agents, 'scripts/hooks/runtime-session-start.js', 'AGENTS.md');
  requireText(agents, 'scripts/hooks/runtime-session-end.js', 'AGENTS.md');
  requireText(issueTracker, '.scratch/<feature>/', 'docs/agents/issue-tracker.md');
  requireText(domain, 'CONTEXT.md', 'docs/agents/domain.md');
  requireText(structure, 'managed read-only plugin', 'docs/harness-structure-and-ownership.md');
  requireText(experience, 'unknown', 'docs/experience-store.md');
  requireText(experience, '明示的', 'docs/experience-store.md');

  if (!fs.existsSync(path.join(ROOT, 'scripts/resolve-managed-skill.js'))) {
    throw new Error('managed skill resolver is missing');
  }

  const retiredPatterns = [
    /Superpowers/i,
    /\b(?:research|plan|progress|review-summary|verification-summary|observation-summary)\.md\b/i,
    /telemetry\.db|session-trace|task-artifacts/i,
    /自動(?:commit|コミット|subagent|サブエージェント)|ALWAYS use parallel|mandatory worktree/i,
  ];
  for (const relativePath of ACTIVE_AUTHORITY) {
    const content = read(relativePath);
    for (const pattern of retiredPatterns) rejectPattern(content, pattern, relativePath);
  }

  const expectedPluginEvents = [
    'PermissionRequest',
    'PostToolUse',
    'PreToolUse',
    'SessionEnd',
    'SessionStart',
    'Stop',
    'UserPromptSubmit',
  ];
  if (JSON.stringify(Object.keys(hooks).sort()) !== JSON.stringify(expectedPluginEvents)) {
    throw new Error('hooks/hooks.json does not expose the minimal event set');
  }
  const expectedSettingsEvents = [...expectedPluginEvents, 'Notification'].sort();
  if (JSON.stringify(Object.keys(settingsHooks).sort()) !== JSON.stringify(expectedSettingsEvents)) {
    throw new Error('settings.json does not expose the minimal event set');
  }

  const hookText = JSON.stringify({ hooks, settingsHooks });
  rejectPattern(hookText, /telemetry|lifecycle|continuous-learning|subagent|quality-gate|cost-tracker/i, 'hook registries');

  const explicitSemantics = [
    ['subagent', /subagent[^\n]{0,80}明示|サブエージェント[^\n]{0,80}明示/i],
    ['commit', /commit[^\n]{0,80}明示|コミット[^\n]{0,80}明示/i],
  ];
  for (const [label, pattern] of explicitSemantics) {
    if (!pattern.test(claude)) throw new Error('CLAUDE.md lacks explicit ' + label + ' semantics');
  }

  console.log('PASS: Grill lifecycle contract');
}

try {
  main();
} catch (error) {
  console.error('FAIL: ' + error.message);
  process.exit(1);
}
