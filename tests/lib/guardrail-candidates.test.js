/**
 * Tests for scripts/lib/guardrail-candidates.js
 *
 * Run with: node tests/lib/guardrail-candidates.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseGuardrailCandidates,
  normalizeGuardrailCandidate,
  appendGuardrailCandidates,
  loadGuardrailCandidates,
  summarizeGuardrailCandidates,
} = require('../../scripts/lib/guardrail-candidates');

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    return true;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'guardrail-candidates-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function runTests() {
  console.log('\n=== Testing guardrail-candidates.js ===\n');

  let passed = 0;
  let failed = 0;

  console.log('parseGuardrailCandidates:');

  if (test('returns no candidates for empty section', () => {
    const parsed = parseGuardrailCandidates([]);
    assert.deepStrictEqual(parsed.candidates, []);
    assert.deepStrictEqual(parsed.warnings, []);
  })) passed++; else failed++;

  if (test('parses one multiline candidate', () => {
    const parsed = parseGuardrailCandidates([
      '- failure_pattern: missing acceptance artifact',
      '  source: review-summary.md',
      '  recommended_layer: hook',
      '  confidence: medium',
      '  promotion_hint: block missing review artifact before commit',
    ]);
    assert.strictEqual(parsed.candidates.length, 1);
    assert.strictEqual(parsed.candidates[0].failure_pattern, 'missing acceptance artifact');
    assert.strictEqual(parsed.candidates[0].source, 'review-summary.md');
    assert.strictEqual(parsed.candidates[0].recommended_layer, 'hook');
    assert.strictEqual(parsed.candidates[0].confidence, 'medium');
    assert.deepStrictEqual(parsed.warnings, []);
  })) passed++; else failed++;

  if (test('parses multiple candidates in one section', () => {
    const parsed = parseGuardrailCandidates([
      '- failure_pattern: stale progress state',
      '  source: progress.md',
      '  recommended_layer: docs',
      '  confidence: low',
      '- failure_pattern: repeated missing command guidance',
      '  source: verification-summary.md',
      '  recommended_layer: command',
      '  confidence: high',
    ]);
    assert.strictEqual(parsed.candidates.length, 2);
    assert.strictEqual(parsed.candidates[1].recommended_layer, 'command');
  })) passed++; else failed++;

  if (test('reports malformed candidate lines', () => {
    const parsed = parseGuardrailCandidates([
      '- source: review-summary.md',
      '  recommended_layer: hook',
      '  confidence: medium',
    ]);
    assert.strictEqual(parsed.candidates.length, 0);
    assert.strictEqual(parsed.warnings.length, 1);
  })) passed++; else failed++;

  console.log('\nnormalizeGuardrailCandidate:');

  if (test('adds source artifact metadata and candidate key', () => {
    const normalized = normalizeGuardrailCandidate(
      {
        failure_pattern: 'missing review artifact',
        source: 'review-summary.md',
        recommended_layer: 'hook',
        confidence: 'high',
      },
      {
        sourceArtifact: 'review-summary.md',
        capturedAt: '2026-04-15T06:00:00.000Z',
      }
    );
    assert.strictEqual(normalized.source_artifact, 'review-summary.md');
    assert.strictEqual(normalized.captured_at, '2026-04-15T06:00:00.000Z');
    assert.ok(normalized.candidate_key.includes('missing review artifact'));
  })) passed++; else failed++;

  console.log('\nJSONL registry:');

  if (test('appends and loads candidates from JSONL registry', () => {
    const dir = createTempDir();
    try {
      const registryPath = path.join(dir, 'guardrail-candidates.jsonl');
      appendGuardrailCandidates(registryPath, [
        normalizeGuardrailCandidate({
          failure_pattern: 'missing review artifact',
          source: 'review-summary.md',
          recommended_layer: 'hook',
          confidence: 'high',
        }, {
          sourceArtifact: 'review-summary.md',
          capturedAt: '2026-04-15T06:00:00.000Z',
        }),
      ]);
      const loaded = loadGuardrailCandidates(registryPath);
      assert.strictEqual(loaded.length, 1);
      assert.strictEqual(loaded[0].recommended_layer, 'hook');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('ignores malformed JSONL rows while loading', () => {
    const dir = createTempDir();
    try {
      const registryPath = path.join(dir, 'guardrail-candidates.jsonl');
      fs.writeFileSync(
        registryPath,
        '{"failure_pattern":"a","recommended_layer":"docs"}\nnot json at all\n',
        'utf8'
      );
      const loaded = loadGuardrailCandidates(registryPath);
      assert.strictEqual(loaded.length, 1);
      assert.strictEqual(loaded[0].failure_pattern, 'a');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('summarizes candidates by layer and key', () => {
    const summary = summarizeGuardrailCandidates([
      {
        candidate_key: 'review::missing artifact',
        recommended_layer: 'hook',
      },
      {
        candidate_key: 'review::missing artifact',
        recommended_layer: 'hook',
      },
      {
        candidate_key: 'verify::missing docs',
        recommended_layer: 'docs',
      },
    ]);
    assert.strictEqual(summary.total, 3);
    assert.strictEqual(summary.byLayer.hook, 2);
    assert.strictEqual(summary.byLayer.docs, 1);
    assert.strictEqual(summary.topCandidates[0].count, 2);
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
