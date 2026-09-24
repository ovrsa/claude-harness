'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function listCodexTranscripts(sessionIds, codexHome) {
  const home = codexHome || process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const wanted = new Set(sessionIds);
  const files = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(filePath);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        let fd;
        try {
          // Codex writes session_meta first. Bound discovery reads and verify the ID inside it.
          fd = fs.openSync(filePath, 'r');
          const buffer = Buffer.alloc(1024 * 1024);
          const count = fs.readSync(fd, buffer, 0, buffer.length, 0);
          const record = JSON.parse(buffer.subarray(0, count).toString('utf8').split('\n')[0]);
          if (record.type === 'session_meta' && wanted.has(record.payload?.id)) {
            files.push({ sessionId: `codex-session-${record.payload.id}`, path: filePath });
          }
        } catch { /* Missing, unreadable or incomplete metadata cannot establish identity. */ }
        finally { if (fd !== undefined) fs.closeSync(fd); }
      }
    }
  }
  walk(path.join(home, 'sessions'));
  walk(path.join(home, 'archived_sessions'));
  return files;
}

module.exports = { listCodexTranscripts };
