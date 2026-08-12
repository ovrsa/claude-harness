const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_PLUGIN_ID = 'mattpocock-skills@mattpocock';

function readJson(filePath, label) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`${label} is unavailable: ${error.code || error.message}`);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }
}

function isWithinRoot(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveManagedSkill({
  skillName,
  pluginId = DEFAULT_PLUGIN_ID,
  registryPath = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json'),
  settingsPath = path.join(os.homedir(), '.claude', 'settings.json'),
} = {}) {
  if (typeof skillName !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(skillName)) {
    throw new Error('A valid skill name is required');
  }

  const registry = readJson(registryPath, 'Managed plugin registry');
  if (registry.version !== 2 || !registry.plugins || typeof registry.plugins !== 'object') {
    throw new Error('Managed plugin registry version 2 is required');
  }

  const installs = registry.plugins[pluginId];
  if (!Array.isArray(installs)) {
    throw new Error(`Managed plugin is not installed: ${pluginId}`);
  }

  const install = installs.find((candidate) => candidate && candidate.scope === 'user');
  if (!install || typeof install.installPath !== 'string' || typeof install.version !== 'string') {
    throw new Error(`User-scoped managed plugin is not installed: ${pluginId}`);
  }

  const settings = readJson(settingsPath, 'Claude settings');
  if (!settings.enabledPlugins || settings.enabledPlugins[pluginId] !== true) {
    throw new Error(`Managed plugin is not enabled: ${pluginId}`);
  }

  let pluginRoot;
  try {
    pluginRoot = fs.realpathSync(install.installPath);
  } catch (error) {
    throw new Error(`Managed plugin install path is unavailable: ${error.code || error.message}`);
  }

  const manifestPath = path.join(pluginRoot, '.claude-plugin', 'plugin.json');
  const manifest = readJson(manifestPath, 'Managed plugin manifest');
  if (!Array.isArray(manifest.skills)) {
    throw new Error('Managed plugin manifest does not publish skills');
  }

  const publishedEntry = manifest.skills.find((entry) => (
    typeof entry === 'string' && path.basename(path.normalize(entry)) === skillName
  ));
  if (!publishedEntry) {
    throw new Error(`Skill is not published by ${pluginId}: ${skillName}`);
  }

  const declaredSkillPath = path.resolve(pluginRoot, publishedEntry, 'SKILL.md');
  let skillPath;
  try {
    skillPath = fs.realpathSync(declaredSkillPath);
  } catch (error) {
    throw new Error(`Published skill is unavailable: ${skillName} (${error.code || error.message})`);
  }

  if (!isWithinRoot(pluginRoot, skillPath)) {
    throw new Error(`Skill resolves outside managed plugin root: ${skillName}`);
  }

  return {
    pluginId,
    version: install.version,
    installPath: pluginRoot,
    skillPath,
  };
}

module.exports = {
  DEFAULT_PLUGIN_ID,
  isWithinRoot,
  resolveManagedSkill,
};
