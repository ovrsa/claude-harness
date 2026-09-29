/**
 * Tests for harness/scripts/export-telemetry-archive.js
 *
 * Run with: node harness/tests/scripts/export-telemetry-archive.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '../../..');
const EXPORTER = path.join(ROOT, 'harness/scripts', 'export-telemetry-archive.js');

const { main: runExport, buildArchive, openDatabase } = require(EXPORTER);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    failed += 1;
  }
}

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tel-archive-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * A database shaped like the real one. Built with the exporter's own opener so
 * the test does not depend on session-trace.js, which this change deletes.
 */
function seedDatabase(dbPath) {
  const db = openDatabase(dbPath, { create: true });
  db.exec(`
    CREATE TABLE session_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, occurred_at TEXT, session_id TEXT,
      run_id TEXT, event_type TEXT, status TEXT, repo_root TEXT, cwd TEXT,
      task_phase TEXT, artifact_refs_json TEXT, metadata_json TEXT,
      duration_ms INTEGER, created_by TEXT, schema_version INTEGER
    );
    CREATE TABLE tool_executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, session_id TEXT,
      project_id TEXT, repo_root TEXT, tool_name TEXT, phase TEXT, status TEXT,
      input_fingerprint TEXT, details_json TEXT, occurred_at TEXT, duration_ms INTEGER
    );
    CREATE TABLE session_runs (
      run_id TEXT PRIMARY KEY, session_id TEXT, repo_root TEXT, project_id TEXT,
      started_at TEXT, ended_at TEXT, final_status TEXT, human_intervention_count INTEGER,
      plan_present INTEGER, verify_present INTEGER, review_present INTEGER, observe_present INTEGER
    );
    CREATE TABLE run_state (run_id TEXT PRIMARY KEY, session_id TEXT, current_phase TEXT, updated_at TEXT);
    CREATE TABLE review_findings (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, severity TEXT, occurred_at TEXT);
    CREATE TABLE verification_results (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, occurred_at TEXT);
    CREATE TABLE task_runs (task_id TEXT PRIMARY KEY, run_id TEXT, objective TEXT);
    CREATE TABLE memory_episodic (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, repo_root TEXT,
      run_id TEXT, episode_type TEXT, summary TEXT, details_json TEXT, occurred_at TEXT
    );
    CREATE TABLE memory_semantic (id INTEGER PRIMARY KEY AUTOINCREMENT, fact TEXT);
  `);

  const event = db.prepare(`
    INSERT INTO session_events (occurred_at, session_id, run_id, event_type, status,
      repo_root, cwd, task_phase, artifact_refs_json, metadata_json, duration_ms, created_by, schema_version)
    VALUES (?, ?, ?, ?, ?, '', '', '', '[]', '{}', 0, 'x', 2)
  `);
  event.run('2026-05-01T00:00:00.000Z', 's1', 'r1', 'tool_invoked', 'started');
  event.run('2026-05-01T01:00:00.000Z', 's1', 'r1', 'tool_invoked', 'started');
  event.run('2026-05-01T02:00:00.000Z', 's1', 'r1', 'session_started', 'started');
  event.run('2026-05-02T00:00:00.000Z', 's2', 'r2', 'tool_invoked', 'started');

  const tool = db.prepare(`
    INSERT INTO tool_executions (run_id, session_id, project_id, repo_root, tool_name,
      phase, status, input_fingerprint, details_json, occurred_at, duration_ms)
    VALUES (?, 's1', 'p1', '/repo', ?, '', ?, 'fp', '{}', ?, 0)
  `);
  tool.run('r1', 'Bash', 'started', '2026-05-01T00:00:00.000Z');
  tool.run('r1', 'Bash', 'completed', '2026-05-01T00:00:01.000Z');
  tool.run('r1', 'Read', 'started', '2026-05-01T00:00:02.000Z');
  tool.run('r1', 'Bash', 'started', '2026-05-02T00:00:00.000Z');

  db.prepare(`INSERT INTO session_runs (run_id, session_id, repo_root, project_id, started_at,
    ended_at, final_status, human_intervention_count, plan_present, verify_present, review_present, observe_present)
    VALUES ('r1','s1','/repo','p1','2026-05-01T00:00:00.000Z','','persisted',0,0,1,1,0)`).run();
  db.prepare(`INSERT INTO run_state VALUES ('r1','s1','','2026-05-01T00:00:00.000Z')`).run();
  db.prepare(`INSERT INTO review_findings (run_id, severity, occurred_at) VALUES ('r1','INFO','2026-05-01T00:00:00.000Z')`).run();

  const verification = db.prepare(`INSERT INTO verification_results (run_id, occurred_at) VALUES (?, ?)`);
  verification.run('r1', '2026-05-01T00:00:00.000Z');
  verification.run('test-session-abc12345', '2026-05-01T00:00:00.000Z');
  verification.run('test-session-abc12345', '2026-05-01T00:00:01.000Z');

  db.prepare(`INSERT INTO task_runs VALUES ('t1','r1','do the thing')`).run();

  const episode = db.prepare(`INSERT INTO memory_episodic (project_id, repo_root, run_id,
    episode_type, summary, details_json, occurred_at) VALUES ('p1','/repo',?,'lifecycle_snapshot',?,?,?)`);
  // The real table holds 4,293 rows but only 17 distinct summaries: the same
  // snapshot rewritten on every hook invocation.
  episode.run('r1', 'phase A -> next A', '{"current_phase":"A"}', '2026-05-01T00:00:00.000Z');
  episode.run('r1', 'phase A -> next A', '{"current_phase":"A"}', '2026-05-01T00:00:01.000Z');
  episode.run('r1', 'phase A -> next A', '{"current_phase":"A"}', '2026-05-01T00:00:02.000Z');
  episode.run('r1', 'phase B -> next B', '{"current_phase":"B"}', '2026-05-01T00:00:03.000Z');

  if (typeof db.close === 'function') db.close();
}

console.log('export-telemetry-archive');

test('small tables are kept verbatim', () => {
  const dir = createTempDir();
  try {
    const dbPath = path.join(dir, 'telemetry.db');
    seedDatabase(dbPath);
    const archive = buildArchive(dbPath);
    assert.strictEqual(archive.verbatim.session_runs.length, 1);
    assert.strictEqual(archive.verbatim.session_runs[0].run_id, 'r1');
    assert.strictEqual(archive.verbatim.run_state.length, 1);
    assert.strictEqual(archive.verbatim.review_findings.length, 1);
    assert.strictEqual(archive.verbatim.task_runs.length, 1);
    assert.strictEqual(archive.verbatim.task_runs[0].objective, 'do the thing');
  } finally {
    cleanup(dir);
  }
});

test('the two large tables are rolled up by day, not dumped', () => {
  const dir = createTempDir();
  try {
    const dbPath = path.join(dir, 'telemetry.db');
    seedDatabase(dbPath);
    const archive = buildArchive(dbPath);

    // 93,000 rows verbatim would not belong in git. Aggregation here is a size
    // decision: the higher-quality signal for this period is the transcripts,
    // which are untouched.
    assert.strictEqual(archive.verbatim.session_events, undefined);
    assert.strictEqual(archive.verbatim.tool_executions, undefined);

    const events = archive.rollup.session_events;
    const may1 = events.filter(r => r.date === '2026-05-01');
    assert.strictEqual(may1.find(r => r.event_type === 'tool_invoked').count, 2);
    assert.strictEqual(may1.find(r => r.event_type === 'session_started').count, 1);
    assert.strictEqual(events.filter(r => r.date === '2026-05-02').length, 1);

    const tools = archive.rollup.tool_executions;
    const bashMay1 = tools.filter(r => r.date === '2026-05-01' && r.tool_name === 'Bash');
    assert.deepStrictEqual(bashMay1.map(r => r.status).sort(), ['completed', 'started']);
    assert.strictEqual(tools.reduce((sum, r) => sum + r.count, 0), 4);
  } finally {
    cleanup(dir);
  }
});

test('memory_episodic is deduplicated to its distinct states', () => {
  const dir = createTempDir();
  try {
    const dbPath = path.join(dir, 'telemetry.db');
    seedDatabase(dbPath);
    const archive = buildArchive(dbPath);
    const episodes = archive.verbatim.memory_episodic;
    assert.strictEqual(episodes.length, 2, `expected 2 distinct states, got ${episodes.length}`);
    const a = episodes.find(e => e.summary === 'phase A -> next A');
    assert.strictEqual(a.occurrences, 3);
    assert.strictEqual(a.first_at, '2026-05-01T00:00:00.000Z');
    assert.strictEqual(a.last_at, '2026-05-01T00:00:02.000Z');
  } finally {
    cleanup(dir);
  }
});

test('test-fixture rows are marked, not silently mixed in', () => {
  const dir = createTempDir();
  try {
    const dbPath = path.join(dir, 'telemetry.db');
    seedDatabase(dbPath);
    const archive = buildArchive(dbPath);
    // 95 of 247 real verification_results rows carry this run_id. Keeping them
    // unmarked would make the archive overstate how much verification ran.
    const rows = archive.verbatim.verification_results;
    assert.strictEqual(rows.length, 3);
    assert.strictEqual(rows.filter(r => r.is_test_fixture === true).length, 2);
    assert.strictEqual(rows.filter(r => r.is_test_fixture === false).length, 1);
    assert.strictEqual(archive.counts.test_fixture_rows, 2);
  } finally {
    cleanup(dir);
  }
});

test('empty tables are recorded as empty, not omitted', () => {
  const dir = createTempDir();
  try {
    const dbPath = path.join(dir, 'telemetry.db');
    seedDatabase(dbPath);
    const archive = buildArchive(dbPath);
    // Four tables held 0 rows for the store's whole life. An omitted table and
    // an empty one read the same way later; say which it was.
    assert.deepStrictEqual(archive.verbatim.memory_semantic, []);
    assert.strictEqual(archive.counts.tables.memory_semantic, 0);
    assert.strictEqual(archive.counts.tables.session_events, 4);
  } finally {
    cleanup(dir);
  }
});

test('a table the database does not have is reported, not fatal', () => {
  const dir = createTempDir();
  try {
    const dbPath = path.join(dir, 'telemetry.db');
    const db = openDatabase(dbPath, { create: true });
    db.exec('CREATE TABLE session_runs (run_id TEXT PRIMARY KEY, session_id TEXT);');
    if (typeof db.close === 'function') db.close();
    const archive = buildArchive(dbPath);
    assert.deepStrictEqual(archive.verbatim.session_runs, []);
    assert.ok(archive.missingTables.includes('tool_executions'));
  } finally {
    cleanup(dir);
  }
});

test('the CLI writes the archive and refuses to overwrite silently', () => {
  const dir = createTempDir();
  try {
    const dbPath = path.join(dir, 'telemetry.db');
    const out = path.join(dir, 'archive', 'telemetry-sqlite.json');
    seedDatabase(dbPath);

    assert.strictEqual(runExport(['--db', dbPath, '--output', out]), 0);
    assert.ok(fs.existsSync(out));
    const parsed = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.strictEqual(parsed.source, dbPath);
    assert.ok(parsed.exported_at);
    assert.strictEqual(parsed.counts.tables.session_events, 4);

    // Re-running must not quietly replace an archive that is the only surviving
    // copy of the data.
    const origStderr = process.stderr.write;
    let captured = '';
    process.stderr.write = chunk => { captured += chunk; return true; };
    try {
      assert.strictEqual(runExport(['--db', dbPath, '--output', out]), 1);
      assert.match(captured, /already exists/);
    } finally {
      process.stderr.write = origStderr;
    }
    assert.strictEqual(runExport(['--db', dbPath, '--output', out, '--force']), 0);
  } finally {
    cleanup(dir);
  }
});

test('a missing database exits non-zero', () => {
  const dir = createTempDir();
  try {
    const origStderr = process.stderr.write;
    let captured = '';
    process.stderr.write = chunk => { captured += chunk; return true; };
    try {
      const code = runExport(['--db', path.join(dir, 'nope.db'), '--output', path.join(dir, 'a.json')]);
      assert.strictEqual(code, 1);
      assert.match(captured, /not found/);
    } finally {
      process.stderr.write = origStderr;
    }
  } finally {
    cleanup(dir);
  }
});

console.log();
console.log(`Results: Passed: ${passed}, Failed: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
