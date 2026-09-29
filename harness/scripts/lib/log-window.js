'use strict';

/**
 * The time-window contract shared by every JSON log reader.
 *
 * Half-open: `[start, end)`. `end` is usually "now", so a record stamped
 * exactly at `end` is out — which is why fixtures must sit inside the window
 * rather than on its edge.
 *
 * One definition on purpose. transcript-log.js and run-log.js each had their
 * own copy, and aggregateAll calls both with the same window object: if one
 * copy were changed to an inclusive bound, a single weekly report would count a
 * run whose tool calls it excluded.
 *
 * No side effects. No console output.
 */

function inWindow(at, window) {
  if (!window) return true;
  if (!at) return false;
  if (window.start && at < window.start) return false;
  if (window.end && at >= window.end) return false;
  return true;
}

module.exports = { inWindow };
