# Finish Task

Read commands/review-task.md and templates/review-summary-template.md from the
harness.
Before task completion, inspect the task diff and finish changed code,
documents, and comments.
Apply necessary cleanup within the approved scope. Record target and reason for
unchanged or
not-applicable decisions; never invent edits just to report activity. Update
stale operational
instructions and resolved Open Issues. Write the canonical review-summary.md in
the task repo,
including Code Quality finishing fields. Verification stays pending until the
next verify step.
If cleanup changes behavior beyond the approved scope, return needs_fix.
Otherwise return finished.
Do not mark the ticket Done or report task completion in this step.
