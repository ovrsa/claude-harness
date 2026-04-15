# Verification Command

Run rerunnable mechanical verification on current codebase state.

`/verify` is the primary mechanical gate. It proves the checks passed, but it does not decide acceptance.

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

8. **Update Durable Session State**
   - For non-trivial implementation work, update `progress.md`
   - Set `Last Completed Step` to the latest verified milestone
   - Set `Blockers` to `none` only if no mechanical blockers remain
   - Point `Next Action` to `eval` or observation if those gates are still pending
9. **Record Guardrail Candidates When Appropriate**
   - If a mechanical failure pattern is likely to recur, add it to `Guardrail Candidates`
   - Include `failure_pattern`, `source`, `recommended_layer`, and `confidence`

## Scope Boundaries

`/verify` handles rerunnable checks only.

Do not use `/verify` to:

- make an acceptance decision
- clear unresolved review findings
- claim runtime evidence that belongs in `observation-summary.md`
- treat `runtime health`, `process state`, `logs`, `browser`, or similar evidence as verified unless they are captured in observation
- treat passing tests as equivalent to "done"
- write generic observation prose such as `looks good`
- skip `Guardrail Candidates` when a repeated failure obviously needs a docs, command, or hook follow-up

`/verify` feeds `/eval`; it does not replace `/eval`.

## Output

Produce a concise verification report:

```
VERIFICATION: [PASS/FAIL]

Build:    [OK/FAIL]
Types:    [OK/X errors]
Lint:     [OK/X issues]
Tests:    [X/Y passed, Z% coverage]
Logs:     [OK/X console.logs]
Audit:    [OK/FAIL]

Ready for Eval: [YES/NO]
```

If any mechanical failures remain, list them with fix suggestions.

## Arguments

$ARGUMENTS can be:
- `quick` - Only build + types
- `full` - All checks (default)
- `pre-commit` - Checks relevant for commits
- `pre-pr` - Full checks plus security scan
