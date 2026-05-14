#!/usr/bin/env node
'use strict';

const {
  runProviderStepAdapter,
} = require('./lib/provider-step-adapter');

const exitCode = runProviderStepAdapter({
  provider: 'claude-code',
  defaultCommand: ['claude', '-p'],
});

process.exit(exitCode);
