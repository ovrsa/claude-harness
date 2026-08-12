#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  resolveManagedSkill,
} = require('../../scripts/lib/managed-skill-resolver');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function makeFixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-skill-resolver-'));
  const pluginRoot = path.join(root, 'plugins', 'cache', 'mattpocock', 'mattpocock-skills', options.version || '9.8.7');
  const skillDir = path.join(pluginRoot, 'skills', 'productivity', 'grilling');
  const registryPath = path.join(root, 'plugins', 'installed_plugins.json');
  const settingsPath = path.join(root, 'settings.json');

  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Grilling\n');
  writeJson(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), {
    name: 'mattpocock-skills',
    version: options.version || '9.8.7',
    skills: ['./skills/productivity/grilling'],
  });
  writeJson(registryPath, {
    version: 2,
    plugins: {
      'mattpocock-skills@mattpocock': [
        {
          scope: 'user',
          installPath: pluginRoot,
          version: options.version || '9.8.7',
        },
      ],
      'mattpocock-skills-copy@other': [
        {
          scope: 'user',
          installPath: path.join(root, 'unrelated'),
          version: '1.0.0',
        },
      ],
    },
  });
  writeJson(settingsPath, {
    enabledPlugins: {
      'mattpocock-skills@mattpocock': options.enabled !== false,
      'mattpocock-skills-copy@other': true,
    },
  });

  return { root, pluginRoot, registryPath, settingsPath, skillDir };
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    return false;
  }
}

function runTests() {
  console.log('\n=== Testing managed-skill-resolver.js ===\n');
  let passed = 0;
  let failed = 0;

  const cases = [
    ['resolves an exact user-scoped v2 registry entry', () => {
      const fixture = makeFixture();
      const result = resolveManagedSkill({
        skillName: 'grilling',
        registryPath: fixture.registryPath,
        settingsPath: fixture.settingsPath,
      });
      assert.strictEqual(result.pluginId, 'mattpocock-skills@mattpocock');
      assert.strictEqual(result.version, '9.8.7');
      assert.strictEqual(result.installPath, fs.realpathSync(fixture.pluginRoot));
      assert.strictEqual(result.skillPath, fs.realpathSync(path.join(fixture.skillDir, 'SKILL.md')));
    }],
    ['supports versioned cache paths without hard-coding a version', () => {
      const fixture = makeFixture({ version: '2030.4.17' });
      const result = resolveManagedSkill({
        skillName: 'grilling',
        registryPath: fixture.registryPath,
        settingsPath: fixture.settingsPath,
      });
      assert.match(result.skillPath, /2030\.4\.17/);
    }],
    ['rejects skill-name path traversal', () => {
      const fixture = makeFixture();
      assert.throws(() => resolveManagedSkill({
        skillName: '../grilling',
        registryPath: fixture.registryPath,
        settingsPath: fixture.settingsPath,
      }), /valid skill name/i);
    }],
    ['rejects a skill realpath outside the managed plugin root', () => {
      const fixture = makeFixture();
      const outside = path.join(fixture.root, 'outside');
      fs.mkdirSync(outside, { recursive: true });
      fs.writeFileSync(path.join(outside, 'SKILL.md'), '# Outside\n');
      fs.rmSync(fixture.skillDir, { recursive: true });
      fs.symlinkSync(outside, fixture.skillDir, 'dir');
      assert.throws(() => resolveManagedSkill({
        skillName: 'grilling',
        registryPath: fixture.registryPath,
        settingsPath: fixture.settingsPath,
      }), /outside managed plugin root/i);
    }],
    ['reports a disabled plugin clearly', () => {
      const fixture = makeFixture({ enabled: false });
      assert.throws(() => resolveManagedSkill({
        skillName: 'grilling',
        registryPath: fixture.registryPath,
        settingsPath: fixture.settingsPath,
      }), /not enabled/i);
    }],
    ['does not select a similarly named plugin', () => {
      const fixture = makeFixture();
      const registry = JSON.parse(fs.readFileSync(fixture.registryPath, 'utf8'));
      delete registry.plugins['mattpocock-skills@mattpocock'];
      writeJson(fixture.registryPath, registry);
      assert.throws(() => resolveManagedSkill({
        skillName: 'grilling',
        registryPath: fixture.registryPath,
        settingsPath: fixture.settingsPath,
      }), /not installed/i);
    }],
    ['reports an unpublished skill clearly', () => {
      const fixture = makeFixture();
      assert.throws(() => resolveManagedSkill({
        skillName: 'not-published',
        registryPath: fixture.registryPath,
        settingsPath: fixture.settingsPath,
      }), /not published/i);
    }],
  ];

  for (const [name, fn] of cases) {
    if (test(name, fn)) passed += 1;
    else failed += 1;
  }

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
