#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseObservationState,
  parsePlanState,
  parseReviewState,
  parseVerificationState,
} = require('../lib/task-artifacts');

const ROOT_DIR = path.join(__dirname, '../..');
const TEMPLATE_DIR = path.join(ROOT_DIR, 'templates');

const TEMPLATE_CHECKS = [
  {
    file: 'plan-template.md',
    parser: parsePlanState,
    extra(state) {
      const errors = [];
      if (!state.hasGivenWhenThen) errors.push('Behavior Spec must include Given / When / Then');
      if (!state.hasCaseCoverage) errors.push('Behavior Spec must include normal / boundary / abnormal cases');
      if (!state.hasTddEvidencePlan) errors.push('Test Evidence Plan must include RED/GREEN evidence fields');
      if (!state.hasExecutionCheckboxes) errors.push('Execution Todo must include checkbox tasks');
      return errors;
    },
  },
  {
    file: 'review-summary-template.md',
    parser: parseReviewState,
  },
  {
    file: 'verification-summary-template.md',
    parser: parseVerificationState,
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

    const state = check.parser(fs.readFileSync(filePath, 'utf8'));
    if (state.missingSections && state.missingSections.length > 0) {
      errors.push(`${check.file}: missing sections ${state.missingSections.join(', ')}`);
    }
    if (state.missingValues && state.missingValues.length > 0) {
      errors.push(`${check.file}: empty sections ${state.missingValues.join(', ')}`);
    }
    if (check.extra) {
      for (const error of check.extra(state)) {
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
