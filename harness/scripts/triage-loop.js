#!/usr/bin/env node
'use strict';

const { formatTriageStatus } = require('./lib/triage-loop');

process.stdout.write(`${formatTriageStatus()}\n`);
