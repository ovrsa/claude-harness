'use strict';

/**
 * Find Codex rollout files for the Codex session ids a Run records.
 *
 * A Run stores `codex-session-<id>` or `codex-thread-<id>` (scripts/lib/utils.js getRuntimeSessionId);
 * CODEX_THREAD_ID holds the same id as session_meta in the rollouts seen so far. Codex names the
 * rollout after the id too, but only the session_meta record it writes first is taken as proof:
 * a file name is not an identity.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const CODEX_PREFIXES = ['codex-session-', 'codex-thread-'];

function getCodexHome(codexHome) {
  return codexHome || process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

/**
 * The first line of a file, or null when it is unreadable or the line runs past `limit` bytes.
 * session_meta lines seen so far are under 50 KB; the limit only bounds what a scan reads per file.
 */
function readFirstLine(file, limit = 1024 * 1024) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(limit);
    const count = fs.readSync(fd, buffer, 0, limit, 0);
    const end = buffer.subarray(0, count).indexOf('\n');
    if (end === -1) return count < limit ? buffer.subarray(0, count).toString('utf8') : null;
    return buffer.subarray(0, end).toString('utf8');
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function sessionMetaId(file) {
  try {
    const record = JSON.parse(readFirstLine(file));
    return record?.type === 'session_meta' && typeof record.payload?.id === 'string' ? record.payload.id : null;
  } catch {
    return null;
  }
}

function listJsonl(dir) {
  const files = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listJsonl(full));
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(full);
  }
  return files;
}

/**
 * Map each Codex session id in `sessionIds` to the rollout paths whose session_meta carries it.
 * Ids of other runtimes are ignored.
 */
function findCodexRollouts(sessionIds, options = {}) {
  const wanted = new Map();
  for (const sessionId of sessionIds) {
    const prefix = CODEX_PREFIXES.find(item => sessionId.startsWith(item));
    if (!prefix) continue;
    const id = sessionId.slice(prefix.length);
    wanted.set(id, [...(wanted.get(id) || []), sessionId]);
  }
  const found = new Map();
  if (wanted.size === 0) return found;
  const home = getCodexHome(options.codexHome);
  for (const file of [...listJsonl(path.join(home, 'sessions')), ...listJsonl(path.join(home, 'archived_sessions'))]) {
    for (const sessionId of wanted.get(sessionMetaId(file)) || []) {
      if (!found.has(sessionId)) found.set(sessionId, []);
      found.get(sessionId).push(file);
    }
  }
  return found;
}

module.exports = { findCodexRollouts };
