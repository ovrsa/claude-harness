# Verification Command

Run comprehensive verification on current codebase state.

## Instructions

Execute verification in this exact order:

1. **Build Check**
   - Run the build command for this project
   - If it fails, report errors and STOP

2. **Type Check**
   - Run TypeScript/type checker
   - Report all errors with file:line

3. **Lint Check**
   - Run linter
   - Report warnings and errors

4. **Test Suite**
   - Run all tests
   - Report pass/fail count
   - Report coverage percentage
   - Target 80%+ coverage when applicable

5. **Harness Audit**
   - For `.claude` lifecycle or artifact changes, run the harness contract audit
   - Confirm docs, hook contracts, and artifact expectations did not drift

6. **Console.log Audit**
   - Search for console.log in source files
   - Report locations

7. **Git Status**
   - Show uncommitted changes
   - Show files modified since last commit

8. **Review Findings**
   - Confirm `review-summary.md` exists for behavior-changing work
   - Ensure CRITICAL and HIGH findings are resolved or explicitly called out as residual risk

9. **Observe Runtime Behavior**
   - For UI changes: use browser verification, screenshots, or flow checks
   - For backend/runtime changes: inspect logs, error output, or equivalent runtime evidence
   - Treat build/test success as necessary but not sufficient when behavior changed

10. **Update Durable Session State**
   - For non-trivial implementation work, update `progress.md`
   - Set `Last Completed Step` to the latest verified milestone
   - Set `Blockers` to `none` if verification cleared them
   - Set `Next Action` to `none` when the task is commit-ready

## Output

Produce a concise verification report:

```
VERIFICATION: [PASS/FAIL]

Review:   [OK/X findings]
Build:    [OK/FAIL]
Types:    [OK/X errors]
Lint:     [OK/X issues]
Tests:    [X/Y passed, Z% coverage]
Secrets:  [OK/X found]
Logs:     [OK/X console.logs]
Observe:  [OK/X findings]

Ready for PR: [YES/NO]
```

If any critical issues, list them with fix suggestions.

## Arguments

$ARGUMENTS can be:
- `quick` - Only build + types
- `full` - All checks (default)
- `pre-commit` - Checks relevant for commits
- `pre-pr` - Full checks plus security scan
