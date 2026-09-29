# Evaluate Task

Read commands/eval.md and the current task's review, verification, and required
observation evidence.
Confirm verification ran after the last cleanup. Complete the Code Quality
finishing fields in
review-summary.md, including Verification and Observation with a concrete
reason/source.
After the final diff review, obtain Revision with the harness
harness/scripts/task-completion.js
--repo TASK_REPO --fingerprint. Record it and run the same CLI without
--fingerprint.
Return accepted only when the CLI exits zero and the design acceptance criteria
are met.
Otherwise return needs_fix with the missing evidence. The runner independently
checks before DONE.
