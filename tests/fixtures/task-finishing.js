'use strict';
const fs = require('fs');
const path = require('path');
const { taskFingerprint } = require('../../scripts/lib/task-completion');

function writeFinishingEvidence(repo) {
  fs.writeFileSync(path.join(repo, 'verification-summary.md'), '# Verification\n## Scope\n- fixture task\n## Commands Run\n- node --check fixture.js\n## Verification Outcome\n- passed\n## Assessment\n- syntax valid\n');
  fs.writeFileSync(path.join(repo, 'review-summary.md'), [
    '# Review Summary', '## Review Scope', '- fixture task', '## Design Compliance', '- approved scope',
    '## Security', '- no external input changes', '## Comment Adequacy', '- no unexplained decisions',
    '## Code Quality', '- Refactoring: unchanged | fixture has no duplication',
    '- Documents: not-applicable | fixture changes no usage instructions',
    '- Comments: unchanged | fixture decisions are explained',
    '- Verification: passed | node --check fixture.js after cleanup',
    '- Observation: not-required | fixture changes no runtime behavior',
    `- Revision: ${taskFingerprint(repo)}`,
    '## Test Adequacy', '- syntax check', '## Findings', '- none', '## Residual Risks', '- none',
    '## Guardrail Candidates', '- none', '## Next Action', '- none',
  ].join('\n'));
}
module.exports = { writeFinishingEvidence };
