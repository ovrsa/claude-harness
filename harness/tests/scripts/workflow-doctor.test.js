/**
 * Tests for harness/scripts/workflow-doctor.js
 *
 * Run with: node harness/tests/scripts/workflow-doctor.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '../../scripts/workflow-doctor.js');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-doctor-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeWorkflow(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${content.trim()}\n`);
}

function run(args = []) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    code: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

const VALID_WORKFLOW = `
name: standard-development
initial_step: research
max_steps: 12
steps:
  - name: research
    mode: readonly
    outputs:
      - research.md
    rules:
      - condition: research_complete
        next: plan
  - name: plan
    mode: readonly
    requires_approval: true
    outputs:
      - plan.md
    rules:
      - condition: approved
        next: implement
  - name: implement
    mode: edit
    rules:
      - condition: implementation_complete
        next: review
      - condition: blocked
        next: ABORT
  - name: review
    mode: readonly
    parallel:
      - architecture_review
      - security_review
    rules:
      - condition: approved
        next: verify
      - condition: needs_fix
        next: implement
  - name: verify
    mode: readonly
    outputs:
      - verification-summary.md
    rules:
      - condition: verified
        next: COMPLETE
`;

const TAKT_LIKE_WORKFLOW = `
name: takt-like
initial_step: implement
max_steps: 8
steps:
  - name: implement
    mode: edit
    required_permission_mode: edit
    provider: codex
    model: gpt-5.2-codex
    provider_options:
      codex:
        network_access: true
    quality_gates:
      - npm test passes
    facets:
      persona: implementer
      policy: [local-authority, coding]
      knowledge: [harness-map, workflow-map]
      instruction: implement-task
    output_contracts:
      report:
        - name: 01-implementation.md
          format: implementation-report
          use_judge: true
    rules:
      - condition: implementation_complete
        next: review
      - condition: ai("Implementation is blocked")
        next: ABORT
  - name: review
    mode: readonly
    parallel:
      - name: architecture_review
        mode: readonly
        facets:
          persona: reviewer
          instruction: review-task
        rules:
          - condition: approved
            next: COMPLETE
          - condition: needs_fix
            next: COMPLETE
      - name: security_review
        mode: readonly
        facets:
          persona: reviewer
          instruction: review-task
        rules:
          - condition: approved
            next: COMPLETE
          - condition: needs_fix
            next: COMPLETE
    rules:
      - condition: all("approved")
        next: COMPLETE
      - condition: any("needs_fix")
        next: implement
`;

function writeFacetSet(root, options = {}) {
  const facets = {
    'personas/implementer.md': 'Implementer persona',
    'personas/reviewer.md': 'Reviewer persona',
    'policies/local-authority.md': 'Local authority policy',
    'policies/coding.md': 'Coding policy',
    'knowledge/harness-map.md': 'Harness knowledge',
    'knowledge/workflow-map.md': 'Workflow knowledge',
    'instructions/implement-task.md': 'Implementation instruction',
    'instructions/review-task.md': 'Review instruction',
    'output-contracts/implementation-report.md': 'Implementation report format',
    ...options,
  };
  for (const [relativePath, content] of Object.entries(facets)) {
    const filePath = path.join(root, 'harness/facets', relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${content}\n`);
  }
}

function runTests() {
  console.log('\n=== Testing workflow-doctor.js ===\n');

  let passed = 0;
  let failed = 0;

  if (test('validates the real workflow directory', () => {
    const result = run([]);
    assert.strictEqual(result.code, 0, result.stderr);
    assert.ok(result.stdout.includes('Validated'), 'should report validation count');
  })) passed++; else failed++;

  if (test('validates an explicit workflow file', () => {
    const dir = createTempDir();
    try {
      const filePath = path.join(dir, 'standard-development.yaml');
      writeWorkflow(filePath, VALID_WORKFLOW);

      const result = run([filePath]);

      assert.strictEqual(result.code, 0, result.stderr);
      assert.ok(result.stdout.includes('Validated 1 workflow definition'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('rejects duplicate step names', () => {
    const dir = createTempDir();
    try {
      const filePath = path.join(dir, 'duplicate.yaml');
      writeWorkflow(filePath, VALID_WORKFLOW.replace('  - name: verify', '  - name: review'));

      const result = run([filePath]);

      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('duplicate step name: review'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('rejects unknown rule targets', () => {
    const dir = createTempDir();
    try {
      const filePath = path.join(dir, 'bad-target.yaml');
      writeWorkflow(filePath, VALID_WORKFLOW.replace('next: verify', 'next: missing_step'));

      const result = run([filePath]);

      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('unknown rule target: missing_step'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('rejects review steps that can edit', () => {
    const dir = createTempDir();
    try {
      const filePath = path.join(dir, 'edit-review.yaml');
      writeWorkflow(filePath, VALID_WORKFLOW.replace('  - name: review\n    mode: readonly', '  - name: review\n    mode: edit'));

      const result = run([filePath]);

      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('review step must be readonly: review'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('validates the optional completion check setting', () => {
    const dir = createTempDir();
    try {
      const filePath = path.join(dir, 'workflow.yaml');
      for (const value of ['task-finishng', 'false', '42', '']) {
        writeWorkflow(filePath, `completion_check: ${value}\n${VALID_WORKFLOW}`);
        const result = run([filePath]);
        assert.strictEqual(result.code, 1, `invalid setting accepted: ${value}`);
        assert.ok(result.stderr.includes('completion_check must be task-finishing when present'), result.stderr);
      }
      writeWorkflow(filePath, `completion_check: task-finishing\n${VALID_WORKFLOW}`);
      assert.strictEqual(run([filePath]).code, 0);
      writeWorkflow(filePath, VALID_WORKFLOW);
      assert.strictEqual(run([filePath]).code, 0, 'existing workflows may omit completion_check');
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('rejects unbounded max_steps', () => {
    const dir = createTempDir();
    try {
      const filePath = path.join(dir, 'unbounded.yaml');
      writeWorkflow(filePath, VALID_WORKFLOW.replace('max_steps: 12', 'max_steps: 0'));

      const result = run([filePath]);

      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('max_steps must be between 1 and 50'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('validates TAKT-like fields, facets, output contracts, and aggregate rules', () => {
    const dir = createTempDir();
    try {
      const filePath = path.join(dir, 'takt-like.yaml');
      writeWorkflow(filePath, TAKT_LIKE_WORKFLOW);
      writeFacetSet(dir);

      const result = run([filePath]);

      assert.strictEqual(result.code, 0, result.stderr);
      assert.ok(result.stdout.includes('Validated 1 workflow definition'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('rejects missing facet references', () => {
    const dir = createTempDir();
    try {
      const filePath = path.join(dir, 'missing-facet.yaml');
      writeWorkflow(filePath, TAKT_LIKE_WORKFLOW);
      writeFacetSet(dir);
      fs.unlinkSync(path.join(dir, 'harness/facets', 'policies', 'coding.md'));

      const result = run([filePath]);

      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('missing facet: policy=coding'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('rejects missing output contract formats', () => {
    const dir = createTempDir();
    try {
      const filePath = path.join(dir, 'missing-output-contract.yaml');
      writeWorkflow(filePath, TAKT_LIKE_WORKFLOW);
      writeFacetSet(dir);
      fs.unlinkSync(path.join(dir, 'harness/facets', 'output-contracts', 'implementation-report.md'));

      const result = run([filePath]);

      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('missing output contract: implementation-report'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('rejects invalid required permission modes', () => {
    const dir = createTempDir();
    try {
      const filePath = path.join(dir, 'bad-permission.yaml');
      writeWorkflow(filePath, TAKT_LIKE_WORKFLOW.replace('required_permission_mode: edit', 'required_permission_mode: admin'));
      writeFacetSet(dir);

      const result = run([filePath]);

      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('invalid required_permission_mode for step implement: admin'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('rejects aggregate rules without parallel substeps', () => {
    const dir = createTempDir();
    try {
      const filePath = path.join(dir, 'bad-aggregate.yaml');
      writeWorkflow(filePath, TAKT_LIKE_WORKFLOW.replace('    parallel:', '    outputs:'));
      writeFacetSet(dir);

      const result = run([filePath]);

      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('aggregate rule requires parallel substeps in step: review'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  if (test('rejects editable review substeps', () => {
    const dir = createTempDir();
    try {
      const filePath = path.join(dir, 'edit-review-substep.yaml');
      writeWorkflow(filePath, TAKT_LIKE_WORKFLOW.replace('name: architecture_review\n        mode: readonly', 'name: architecture_review\n        mode: edit'));
      writeFacetSet(dir);

      const result = run([filePath]);

      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('review step must be readonly: architecture_review'));
    } finally {
      cleanup(dir);
    }
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
