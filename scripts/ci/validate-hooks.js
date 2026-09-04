#!/usr/bin/env node
/**
 * settings.json の hooks スキーマを検証する。
 *
 * 2026-08-15 まで、この検証の主対象は hooks/hooks.json だった。同じ24スクリプトを
 * settings.json と二重に配線しており、実際に読まれるのは settings.json だけなので、
 * 片方だけ直すともう片方が黙って古いまま残った（expression-style matcher が両方に
 * 生き残った実例がある）。そのためのドリフト検出まで作っていた。
 * 二重配線ごと撤去し、動いている設定を直接検証する。
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 定数名は HOOKS_FILE のまま。tests/ci/validators.test.js が定数名でパスを差し替える。
const HOOKS_FILE = path.join(__dirname, '../../settings.json');
const VALID_EVENTS = ['PreToolUse', 'PostToolUse', 'PreCompact', 'SessionStart', 'SessionEnd', 'Stop', 'Notification', 'SubagentStop', 'PermissionRequest', 'UserPromptSubmit'];

// Matchers are tool-name patterns ("Edit|Write|MultiEdit", "Bash", "*"), not expressions.
// An expression-style matcher (tool == "Edit" || ...) does not filter, so the hook runs on
// every tool call — including read-only ones. Reject the syntax instead of trusting it.
const EXPRESSION_MATCHER_TOKENS = ['==', '!=', '&&', '||', 'matches', 'tool_input', 'tool_name'];

function validateMatcherSyntax(matcher, label) {
  if (typeof matcher !== 'string') return false;
  const offending = EXPRESSION_MATCHER_TOKENS.filter(token => matcher.includes(token));
  if (offending.length === 0) return false;
  console.error(
    `ERROR: ${label} uses expression-style matcher syntax (${offending.join(', ')}): ${matcher}\n` +
    '       Matchers must be tool-name patterns such as "Edit|Write|MultiEdit", "Bash", or "*".'
  );
  return true;
}

/**
 * Validate a single hook entry has required fields and valid inline JS
 * @param {object} hook - Hook object with type and command fields
 * @param {string} label - Label for error messages (e.g., "PreToolUse[0].hooks[1]")
 * @returns {boolean} true if errors were found
 */
function validateHookEntry(hook, label) {
  let hasErrors = false;

  if (!hook.type || typeof hook.type !== 'string') {
    console.error(`ERROR: ${label} missing or invalid 'type' field`);
    hasErrors = true;
  }

  // Validate optional async and timeout fields
  if ('async' in hook && typeof hook.async !== 'boolean') {
    console.error(`ERROR: ${label} 'async' must be a boolean`);
    hasErrors = true;
  }
  if ('timeout' in hook && (typeof hook.timeout !== 'number' || hook.timeout < 0)) {
    console.error(`ERROR: ${label} 'timeout' must be a non-negative number`);
    hasErrors = true;
  }

  if (!hook.command || (typeof hook.command !== 'string' && !Array.isArray(hook.command)) || (typeof hook.command === 'string' && !hook.command.trim()) || (Array.isArray(hook.command) && (hook.command.length === 0 || !hook.command.every(s => typeof s === 'string' && s.length > 0)))) {
    console.error(`ERROR: ${label} missing or invalid 'command' field`);
    hasErrors = true;
  } else if (typeof hook.command === 'string') {
    // Validate inline JS syntax in node -e commands
    const nodeEMatch = hook.command.match(/^node -e "(.*)"$/s);
    if (nodeEMatch) {
      try {
        new vm.Script(nodeEMatch[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t'));
      } catch (syntaxErr) {
        console.error(`ERROR: ${label} has invalid inline JS: ${syntaxErr.message}`);
        hasErrors = true;
      }
    }
  }

  return hasErrors;
}

function validateHooks() {
  if (!fs.existsSync(HOOKS_FILE)) {
    console.log('No settings.json found, skipping validation');
    process.exit(0);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(HOOKS_FILE, 'utf-8'));
  } catch (e) {
    console.error(`ERROR: Invalid JSON in settings.json: ${e.message}`);
    process.exit(1);
  }

  // Support both object format { hooks: {...} } and array format
  const hooks = data.hooks || data;
  let hasErrors = false;
  let totalMatchers = 0;

  if (typeof hooks === 'object' && !Array.isArray(hooks)) {
    // Object format: { EventType: [matchers] }
    for (const [eventType, matchers] of Object.entries(hooks)) {
      if (!VALID_EVENTS.includes(eventType)) {
        console.error(`ERROR: Invalid event type: ${eventType}`);
        hasErrors = true;
        continue;
      }

      if (!Array.isArray(matchers)) {
        console.error(`ERROR: ${eventType} must be an array`);
        hasErrors = true;
        continue;
      }

      for (let i = 0; i < matchers.length; i++) {
        const matcher = matchers[i];
        if (typeof matcher !== 'object' || matcher === null) {
          console.error(`ERROR: ${eventType}[${i}] is not an object`);
          hasErrors = true;
          continue;
        }
        if (!matcher.matcher) {
          console.error(`ERROR: ${eventType}[${i}] missing 'matcher' field`);
          hasErrors = true;
        } else if (validateMatcherSyntax(matcher.matcher, `settings.json ${eventType}[${i}]`)) {
          hasErrors = true;
        }
        if (!matcher.hooks || !Array.isArray(matcher.hooks)) {
          console.error(`ERROR: ${eventType}[${i}] missing 'hooks' array`);
          hasErrors = true;
        } else {
          // Validate each hook entry
          for (let j = 0; j < matcher.hooks.length; j++) {
            if (validateHookEntry(matcher.hooks[j], `${eventType}[${i}].hooks[${j}]`)) {
              hasErrors = true;
            }
          }
        }
        totalMatchers++;
      }
    }
  } else if (Array.isArray(hooks)) {
    // Array format (legacy)
    for (let i = 0; i < hooks.length; i++) {
      const hook = hooks[i];
      if (!hook.matcher) {
        console.error(`ERROR: Hook ${i} missing 'matcher' field`);
        hasErrors = true;
      }
      if (!hook.hooks || !Array.isArray(hook.hooks)) {
        console.error(`ERROR: Hook ${i} missing 'hooks' array`);
        hasErrors = true;
      } else {
        // Validate each hook entry
        for (let j = 0; j < hook.hooks.length; j++) {
          if (validateHookEntry(hook.hooks[j], `Hook ${i}.hooks[${j}]`)) {
            hasErrors = true;
          }
        }
      }
      totalMatchers++;
    }
  } else {
    console.error('ERROR: settings.json hooks must be an object or array');
    process.exit(1);
  }

  if (hasErrors) {
    process.exit(1);
  }

  console.log(`Validated ${totalMatchers} hook matchers`);
}

validateHooks();
