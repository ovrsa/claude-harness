#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  ExperienceStore,
  observeSafely,
} = require('../../scripts/lib/experience-store');

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

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'experience-store-'));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}

function runTests() {
  console.log('\n=== Testing experience-store.js ===\n');
  let passed = 0;
  let failed = 0;

  const cases = [
    ['creates a structured run and appends trace events', () => {
      const root = makeRoot();
      const store = new ExperienceStore({ root });
      const run = store.ensureRun({
        runId: 'run-test-001',
        runtime: 'codex',
        cwd: '/tmp/project',
        harnessFingerprint: 'sha256:test',
      });
      store.appendTrace(run.runId, { family: 'SessionStart', event: 'started' });
      const manifest = readJson(path.join(run.runPath, 'manifest.json'));
      const trace = readJsonl(path.join(run.runPath, 'trace.jsonl'));
      assert.strictEqual(manifest.schemaVersion, 1);
      assert.strictEqual(manifest.runtime, 'codex');
      assert.strictEqual(trace.length, 1);
      assert.strictEqual(trace[0].family, 'SessionStart');
    }],
    ['writes honest outcomes, references, and a compact finalized index row', () => {
      const root = makeRoot();
      const store = new ExperienceStore({ root });
      const run = store.ensureRun({ runId: 'run-test-002', runtime: 'claude' });
      store.recordSkillActivation(run.runId, { skill: 'grilling', source: 'managed' });
      store.writeRefs(run.runId, [{ kind: 'spec', path: '.scratch/example/spec.md' }]);
      store.finalizeRun(run.runId, { outcome: 'unknown', reason: 'no explicit signal' });
      const outcome = readJson(path.join(run.runPath, 'outcome.json'));
      const refs = readJson(path.join(run.runPath, 'refs.json'));
      const index = readJsonl(path.join(root, 'index.jsonl'));
      assert.strictEqual(outcome.outcome, 'unknown');
      assert.deepStrictEqual(refs.refs, [{ kind: 'spec', path: '.scratch/example/spec.md' }]);
      assert.strictEqual(index.length, 1);
      assert.strictEqual(index[0].runId, run.runId);
      assert.strictEqual(index[0].outcome, 'unknown');
      assert.ok(!JSON.stringify(index[0]).includes('.scratch/example/spec.md'));
    }],
    ['uses atomic JSON replacement without leaving temp files', () => {
      const root = makeRoot();
      const store = new ExperienceStore({ root });
      const run = store.ensureRun({ runId: 'run-test-003', runtime: 'codex' });
      store.writeOutcome(run.runId, { outcome: 'accepted', reason: 'confirmed' });
      store.writeOutcome(run.runId, { outcome: 'corrected', reason: 'changed' });
      assert.strictEqual(readJson(path.join(run.runPath, 'outcome.json')).outcome, 'corrected');
      assert.deepStrictEqual(fs.readdirSync(run.runPath).filter((name) => name.includes('.tmp-')), []);
    }],
    ['appends complete lines from concurrent processes', () => {
      const root = makeRoot();
      const store = new ExperienceStore({ root });
      store.ensureRun({ runId: 'run-test-004', runtime: 'claude' });
      const modulePath = path.join(__dirname, '../../scripts/lib/experience-store.js');
      const writer = [
        "const { ExperienceStore } = require(process.env.STORE_MODULE);",
        "const store = new ExperienceStore({ root: process.env.EXPERIENCE_ROOT });",
        "for (let offset = 0; offset < 25; offset += 1) {",
        "  store.appendTrace('run-test-004', { family: 'PostToolUse', sequence: Number(process.env.START) + offset });",
        "}",
      ].join(' ');
      const command = 'node -e "$WRITER" & START=25 node -e "$WRITER" & wait';
      const result = spawnSync('bash', ['-c', command], {
        env: {
          ...process.env,
          EXPERIENCE_ROOT: root,
          STORE_MODULE: modulePath,
          START: '0',
          WRITER: writer,
        },
        encoding: 'utf8',
      });
      assert.strictEqual(result.status, 0, result.stderr);
      const lines = readJsonl(path.join(root, 'runs', 'run-test-004', 'trace.jsonl'));
      assert.strictEqual(lines.length, 50);
      assert.deepStrictEqual(lines.map((line) => line.sequence).sort((a, b) => a - b), Array.from({ length: 50 }, (_, index) => index));
    }],
    ['fails open through the hook-facing API', () => {
      let warning = '';
      const result = observeSafely(() => {
        throw new Error('fixture failure');
      }, { onError: (message) => { warning = message; } });
      assert.deepStrictEqual(result, { ok: false });
      assert.match(warning, /fixture failure/);
      assert.ok(warning.length < 500);
    }],
    ['does not depend on SQLite or artifact lifecycle modules', () => {
      const source = fs.readFileSync(path.join(__dirname, '../../scripts/lib/experience-store.js'), 'utf8');
      assert.doesNotMatch(source, /sqlite|task-artifacts|session-trace/i);
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
