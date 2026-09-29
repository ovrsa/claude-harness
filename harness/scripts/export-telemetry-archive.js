#!/usr/bin/env node
'use strict';

/**
 * One-time archive of telemetry.db, written before the store is retired.
 *
 * The database is write-only as of 2026-08-20: Phase 3 moved every reader to
 * the JSON logs. Most of what it holds is regenerable from the transcripts, but
 * not all of it -- the oldest transcript record is 2026-07-07, while the
 * database starts 2026-04-22. Of tool_executions' 39,062 rows, 16,977 (43.5%)
 * predate the transcripts; of session_events' 53,672, 21,109 do.
 *
 * Output goes somewhere git-tracked. `.gitignore:33` excludes `telemetry/`
 * wholesale, and an archive that dies with the machine repeats the defect this
 * whole change exists to fix.
 *
 * Verbatim vs rolled up is a size decision, not a signal-quality one:
 * session_events and tool_executions are ~93,000 rows between them, which does
 * not belong in a git object. The higher-fidelity record for that period is the
 * transcripts, which this does not touch.
 *
 * Usage:
 *   node harness/scripts/export-telemetry-archive.js [--db <path>] --output <path> [--force]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

/** Tables small enough to keep row for row. */
const VERBATIM_TABLES = [
  'session_runs',
  'run_state',
  'review_findings',
  'verification_results',
  'task_runs',
  'memory_semantic',
  'memory_procedural',
  'tactic_candidates',
  'tactic_adoptions',
];

/** Tables too large for git, kept as daily counts. */
const ROLLUP_TABLES = ['session_events', 'tool_executions'];

const ALL_TABLES = [...VERBATIM_TABLES, ...ROLLUP_TABLES, 'memory_episodic'];

/**
 * Fixture run ids that reached the real database. Measured on export: 113 of
 * 247 verification_results rows carry the first one, 135 across every verbatim
 * table. The write path was never identified. Marking beats dropping: a reader
 * can filter, but cannot recover rows that were silently removed.
 */
const TEST_FIXTURE_RUN_IDS = new Set(['test-session-abc12345']);

function loadDatabaseSync() {
  try {
    return require('node:sqlite').DatabaseSync;
  } catch {
    return null;
  }
}

function hasSqliteCli() {
  try {
    execFileSync('sqlite3', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Self-contained on purpose. The equivalent helper lives in session-trace.js,
 * which this change deletes, so depending on it would make the exporter die
 * with the thing it exists to preserve.
 */
function openDatabase(dbPath, options = {}) {
  const DatabaseSyncClass = loadDatabaseSync();
  if (!DatabaseSyncClass) {
    throw new Error(
      hasSqliteCli()
        ? 'node:sqlite is unavailable; export needs it to read the archive'
        : 'no sqlite available in this Node runtime'
    );
  }
  if (options.create) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    // Passing `undefined` as the options argument is a TypeError in node:sqlite,
    // so the two cases cannot share one call.
    return new DatabaseSyncClass(dbPath);
  }
  return new DatabaseSyncClass(dbPath, { readOnly: true });
}

function tableExists(db, table) {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table);
  return Boolean(row);
}

/**
 * The table name is interpolated because SQLite cannot parameterise an
 * identifier. Safe here and only here: `table` always comes from ALL_TABLES,
 * a module constant built from two other module constants, and buildArchive
 * takes no table argument. Do not widen this to a caller-supplied name.
 */
function selectAll(db, table) {
  return db.prepare(`SELECT * FROM "${table}"`).all();
}

function dayOf(value) {
  return String(value || '').slice(0, 10);
}

/**
 * Daily counts, keyed by whatever dimension the table is asked about. Sorted so
 * two exports of the same database produce identical files.
 */
function rollupByDay(rows, dimensions) {
  const buckets = new Map();
  for (const row of rows) {
    const key = [dayOf(row.occurred_at), ...dimensions.map(d => String(row[d] || ''))];
    // NUL separator so a value containing the joined character cannot forge a
    // different key. Written as an escape, never a literal: a raw NUL makes the
    // file binary to grep, which then skips it silently, and every grep-based
    // check against this file passes vacuously.
    const id = key.join('\u0000');
    if (!buckets.has(id)) {
      const entry = { date: key[0], count: 0 };
      dimensions.forEach((d, i) => { entry[d] = key[i + 1]; });
      buckets.set(id, entry);
    }
    buckets.get(id).count += 1;
  }
  return [...buckets.values()].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    for (const d of dimensions) {
      if (a[d] !== b[d]) return String(a[d]).localeCompare(String(b[d]));
    }
    return 0;
  });
}

/**
 * memory_episodic holds 4,293 rows collapsing to 57 distinct states (17
 * distinct summaries): the same lifecycle snapshot rewritten on every hook
 * invocation. Keep the states with how often and how long each held.
 */
function dedupeEpisodes(rows) {
  const byState = new Map();
  for (const row of rows) {
    const id = [row.run_id, row.episode_type, row.summary, row.details_json].join('\u0000');
    if (!byState.has(id)) {
      byState.set(id, {
        run_id: row.run_id,
        project_id: row.project_id,
        repo_root: row.repo_root,
        episode_type: row.episode_type,
        summary: row.summary,
        details_json: row.details_json,
        occurrences: 0,
        first_at: row.occurred_at,
        last_at: row.occurred_at,
      });
    }
    const entry = byState.get(id);
    entry.occurrences += 1;
    if (row.occurred_at < entry.first_at) entry.first_at = row.occurred_at;
    if (row.occurred_at > entry.last_at) entry.last_at = row.occurred_at;
  }
  return [...byState.values()].sort((a, b) => String(a.first_at).localeCompare(String(b.first_at)));
}

function markFixtures(rows) {
  let marked = 0;
  const out = rows.map(row => {
    const isFixture = TEST_FIXTURE_RUN_IDS.has(String(row.run_id || ''));
    if (isFixture) marked += 1;
    return { ...row, is_test_fixture: isFixture };
  });
  return { rows: out, marked };
}

function buildArchive(dbPath) {
  const db = openDatabase(dbPath);
  try {
    const verbatim = {};
    const rollup = {};
    const tables = {};
    const missingTables = [];
    let testFixtureRows = 0;

    for (const table of ALL_TABLES) {
      if (!tableExists(db, table)) {
        missingTables.push(table);
        tables[table] = 0;
        if (ROLLUP_TABLES.includes(table)) rollup[table] = [];
        else verbatim[table] = [];
        continue;
      }

      const rows = selectAll(db, table);
      tables[table] = rows.length;

      if (table === 'memory_episodic') {
        verbatim[table] = dedupeEpisodes(rows);
      } else if (table === 'session_events') {
        rollup[table] = rollupByDay(rows, ['event_type', 'status']);
      } else if (table === 'tool_executions') {
        rollup[table] = rollupByDay(rows, ['tool_name', 'status']);
      } else {
        const { rows: marked, marked: count } = markFixtures(rows);
        verbatim[table] = marked;
        testFixtureRows += count;
      }
    }

    return {
      schema: 1,
      source: dbPath,
      exported_at: new Date().toISOString(),
      note: 'One-time archive written before telemetry.db was retired. '
        + 'session_events and tool_executions are daily counts because the raw rows '
        + '(~93,000) do not belong in git; the transcripts hold the finer record '
        + 'from 2026-07-07 onward.',
      counts: { tables, test_fixture_rows: testFixtureRows },
      missingTables,
      verbatim,
      rollup,
    };
  } finally {
    if (typeof db.close === 'function') db.close();
  }
}

function parseArgs(argv) {
  const options = { dbPath: '', output: '', force: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--db') options.dbPath = argv[++i] || '';
    else if (arg === '--output' || arg === '-o') options.output = argv[++i] || '';
    else if (arg === '--force') options.force = true;
  }
  return options;
}

function defaultDbPath() {
  return path.join(process.env.HOME || os.homedir(), '.claude', 'harness/data/archive', 'telemetry.db');
}

function printHelp() {
  process.stdout.write([
    'Export telemetry.db to a JSON archive',
    '',
    'Usage:',
    '  node harness/scripts/export-telemetry-archive.js [--db <path>] --output <path> [--force]',
    '',
    'Writes a one-time archive before the SQLite store is retired. Small tables',
    'are kept row for row; session_events and tool_executions become daily counts.',
    'Refuses to overwrite an existing archive unless --force is given.',
    '',
  ].join('\n'));
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return 0;
  }

  const dbPath = options.dbPath || defaultDbPath();
  if (!fs.existsSync(dbPath)) {
    process.stderr.write(`export-telemetry-archive: database not found at ${dbPath}\n`);
    return 1;
  }
  if (!options.output) {
    process.stderr.write('export-telemetry-archive: --output is required\n');
    return 1;
  }
  // The archive may be the only surviving copy once the store is gone.
  if (fs.existsSync(options.output) && !options.force) {
    process.stderr.write(`export-telemetry-archive: ${options.output} already exists (use --force)\n`);
    return 1;
  }

  const archive = buildArchive(dbPath);
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(archive, null, 2)}\n`);

  const total = Object.values(archive.counts.tables).reduce((sum, n) => sum + n, 0);
  process.stdout.write(`Archived ${total} rows from ${dbPath}\n`);
  for (const [table, count] of Object.entries(archive.counts.tables)) {
    process.stdout.write(`  ${table.padEnd(22)} ${count}\n`);
  }
  if (archive.counts.test_fixture_rows > 0) {
    process.stdout.write(`  (${archive.counts.test_fixture_rows} rows marked is_test_fixture)\n`);
  }
  process.stdout.write(`Output: ${options.output}\n`);
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main, buildArchive, openDatabase, rollupByDay, dedupeEpisodes };
