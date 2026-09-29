#!/usr/bin/env node
'use strict';
const { captureRuntimeSession } = require('../lib/runtime-session');
try {
  captureRuntimeSession('end');
} catch (error) {
  process.stderr.write(`[Harness recording] ${error.message}\n`);
}
