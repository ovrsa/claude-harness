#!/usr/bin/env node
'use strict';
const { captureRuntimeSession } = require('../lib/runtime-session');
try {
  const context = captureRuntimeSession('start');
  if (context) process.stdout.write(`${context}\n`);
} catch (error) {
  process.stderr.write(`[Harness recording] ${error.message}\n`);
}
