#!/usr/bin/env node
'use strict';

const { formatTraceStatus } = require('./lib/session-trace');

process.stdout.write(`${formatTraceStatus()}\n`);
