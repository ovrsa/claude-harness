#!/usr/bin/env node

const assert = require('assert');

const {
  classifyFeedbackSignal,
  redactValue,
  sanitizeToolInput,
  sanitizeToolResult,
} = require('../../scripts/lib/experience-redaction');

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
  console.log('\n=== Testing experience-redaction.js ===\n');
  let passed = 0;
  let failed = 0;

  const cases = [
    ['redacts credential-shaped keys recursively', () => {
      const value = redactValue({
        authorization: 'Bearer auth-secret-123456789',
        nested: { apiKey: 'sk-example-secret-1234567890', password: 'hunter2' },
        safe: '/Users/example/project/src/index.js',
      });
      const serialized = JSON.stringify(value);
      assert.doesNotMatch(serialized, /auth-secret|sk-example|hunter2/);
      assert.match(serialized, /REDACTED/);
      assert.strictEqual(value.safe, '/Users/example/project/src/index.js');
    }],
    ['redacts bearer tokens and long opaque values in free text', () => {
      const opaque = 'a'.repeat(72);
      const value = redactValue(`Authorization: Bearer token-value-1234567890 opaque=${opaque}`);
      assert.doesNotMatch(value, /token-value|a{40}/);
      assert.match(value, /REDACTED/);
    }],
    ['preserves an explicitly labeled sha256 fingerprint', () => {
      const fingerprint = `sha256:${'a1'.repeat(32)}`;
      assert.strictEqual(redactValue(fingerprint), fingerprint);
    }],
    ['bounds multiline command payloads without retaining later lines', () => {
      const input = sanitizeToolInput('Bash', {
        command: 'npm test\nexport API_KEY=super-secret-value\ncurl https://example.com/private',
      });
      const serialized = JSON.stringify(input);
      assert.match(serialized, /npm test/);
      assert.doesNotMatch(serialized, /super-secret|example\.com\/private/);
      assert.strictEqual(input.command.multiline, true);
    }],
    ['bounds oversized tool results', () => {
      const result = sanitizeToolResult('Read', { output: 'safe-output '.repeat(2000) });
      assert.ok(JSON.stringify(result).length < 5000);
      assert.match(JSON.stringify(result), /TRUNCATED/);
    }],
    ['classifies feedback without returning raw prompt text', () => {
      const samples = [
        ['ok', 'accepted'],
        ['違う。SQLiteではなくJSONです', 'corrected'],
        ['テストが失敗しています', 'failed'],
        ['この作業は中止して', 'abandoned'],
        ['少し考えます', 'unknown'],
      ];
      for (const [prompt, expected] of samples) {
        const signal = classifyFeedbackSignal(prompt);
        assert.strictEqual(signal.outcome, expected);
        assert.ok(!Object.values(signal).includes(prompt));
      }
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
