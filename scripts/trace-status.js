#!/usr/bin/env node
'use strict';

const { formatTraceStatus } = require('./lib/trace-status');

process.stdout.write(`${formatTraceStatus()}\n`);
