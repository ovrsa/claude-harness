#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OBSERVATION_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Stop',
  'SessionEnd',
];

function test(name, fn) {
  try {
    fn();
    console.log('  ✓ ' + name);
    return true;
  } catch (error) {
    console.log('  ✗ ' + name);
    console.log('    Error: ' + error.message);
    return false;
  }
}

function commandPath(command) {
  const match = command.match(/^node\s+"([^"]+)"/);
  if (!match) return null;
  return match[1].replace(/\$\{[^}]+\}/, ROOT);
}

function runTests() {
  console.log('\n=== Hook registry integration tests ===\n');
  let passed = 0;
  let failed = 0;
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, 'settings.json'), 'utf8'));
  const pluginHooks = JSON.parse(fs.readFileSync(path.join(ROOT, 'hooks', 'hooks.json'), 'utf8'));

  const cases = [
    ['registers only the minimal Experience and safety surface', () => {
      assert.deepStrictEqual(Object.keys(pluginHooks.hooks).sort(), [...OBSERVATION_EVENTS, 'PermissionRequest'].sort());
      assert.deepStrictEqual(Object.keys(settings.hooks).sort(), [...OBSERVATION_EVENTS, 'PermissionRequest', 'Notification'].sort());
      assert.strictEqual(settings.hooks.Stop.length, 2, 'Stop retains Experience plus completion sound');
    }],
    ['points every observation event to its Experience adapter', () => {
      for (const registry of [settings.hooks, pluginHooks.hooks]) {
        for (const event of OBSERVATION_EVENTS) {
          const command = registry[event][0].hooks[0].command;
          assert.match(command, /experience-[a-z-]+\.js/);
          const scriptPath = commandPath(command);
          assert.ok(scriptPath && fs.existsSync(scriptPath), 'missing hook script for ' + event + ': ' + scriptPath);
        }
      }
    }],
    ['keeps observation fail-open and PermissionRequest independent', () => {
      for (const registry of [settings.hooks, pluginHooks.hooks]) {
        assert.match(registry.PermissionRequest[0].hooks[0].command, /permission-request\.js/);
        for (const event of ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop']) {
          assert.strictEqual(registry[event][0].hooks[0].async, true);
          assert.strictEqual(registry[event][0].hooks[0].timeout, 10);
        }
      }
    }],
    ['contains no retired lifecycle or SQLite hook registrations', () => {
      const serialized = JSON.stringify({ settings: settings.hooks, plugin: pluginHooks.hooks });
      assert.doesNotMatch(serialized, /telemetry|lifecycle|continuous-learning|subagent|pre-compact|quality-gate|cost-tracker/i);
    }],
    ['preserves permission and completion notification sounds', () => {
      assert.match(settings.hooks.Notification[0].hooks[0].command, /Ping\.aiff/);
      assert.match(settings.hooks.Stop[1].hooks[0].command, /Pop\.aiff/);
    }],
  ];

  for (const [name, fn] of cases) {
    if (test(name, fn)) passed += 1;
    else failed += 1;
  }

  console.log('\nPassed: ' + passed);
  console.log('Failed: ' + failed);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
