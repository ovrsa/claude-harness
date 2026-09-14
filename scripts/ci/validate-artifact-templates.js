#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseObservationState,
  parseReviewState,
  parseVerificationState,
} = require('../lib/task-artifacts');

const ROOT_DIR = path.join(__dirname, '../..');
const TEMPLATE_DIR = path.join(ROOT_DIR, 'templates');

// plan-template.md は 2026-08-17 に撤去した。RED/GREEN の証拠要求はここから
// verification-summary-template.md の `RED Evidence` 節へ移った。
// 雛形が復活していないことは audit-harness-contract.js の retired-artifact が見る。
const TEMPLATE_CHECKS = [
  {
    file: 'review-summary-template.md',
    parser: parseReviewState,
    // Review judgments stay blank until an actual task is reviewed.
    allowEmptyValues: true,
  },
  {
    file: 'verification-summary-template.md',
    parser: parseVerificationState,
    extra(_state, content) {
      return /^##\s+RED Evidence/m.test(content) ? [] : ['Verification template must include a RED Evidence section'];
    },
  },
  {
    file: 'observation-summary-template.md',
    parser: parseObservationState,
    extra(state) {
      return state.hasConcreteEvidence ? [] : ['Observation template must name concrete evidence sources'];
    },
  },
];

function main() {
  const errors = [];

  for (const check of TEMPLATE_CHECKS) {
    const filePath = path.join(TEMPLATE_DIR, check.file);
    if (!fs.existsSync(filePath)) {
      errors.push(`${check.file}: missing`);
      continue;
    }

    // extra() には本文も渡す。パーサが必須節しか返さないので、節の存在そのものを
    // 検査したい場合（RED Evidence など）に state だけでは足りない。
    const content = fs.readFileSync(filePath, 'utf8');
    const state = check.parser(content);
    if (state.missingSections && state.missingSections.length > 0) {
      errors.push(`${check.file}: missing sections ${state.missingSections.join(', ')}`);
    }
    if (!check.allowEmptyValues && state.missingValues && state.missingValues.length > 0) {
      errors.push(`${check.file}: empty sections ${state.missingValues.join(', ')}`);
    }
    if (check.extra) {
      for (const error of check.extra(state, content)) {
        errors.push(`${check.file}: ${error}`);
      }
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`ERROR: ${error}`);
    }
    process.exit(1);
  }

  console.log(`Validated ${TEMPLATE_CHECKS.length} artifact templates`);
}

main();
