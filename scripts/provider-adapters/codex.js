#!/usr/bin/env node
'use strict';

const {
  runProviderStepAdapter,
} = require('./lib/provider-step-adapter');

const exitCode = runProviderStepAdapter({
  provider: 'codex',
  defaultCommand: ['codex', 'exec', '-'],
});

process.exit(exitCode);
