#!/usr/bin/env node
'use strict';

const { formatHealthStatus } = require('./lib/health-loop');

process.stdout.write(`${formatHealthStatus()}\n`);
