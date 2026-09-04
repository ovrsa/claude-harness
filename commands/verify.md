# Verification Command

Run rerunnable mechanical verification on current codebase state.

`/verify` is the primary mechanical gate. It proves the checks passed, but it does not decide acceptance.

## Instructions

Execute verification in this exact order:

When writing or updating `verification-summary.md`, write artifact body text in Japanese by default while preserving canonical section headings and exact command output where useful.

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
   - Do not report a coverage percentage. There is no coverage tooling wired
     (no `c8`/`nyc`, no coverage script in `package.json`), so any figure would be invented.
     Wire a tool first if coverage is wanted

5. **RED Evidence**
   - For a new test or a bug fix, record that the test failed *before* the change:
     the command, and the failure it produced
   - This is a rerunnable check, which is why it belongs here rather than in review
   - If the change added no test, say so plainly instead of omitting the section

6. **Harness Audit**
   - For `.claude` lifecycle or artifact changes, run the harness contract audit
   - Confirm docs, hook contracts, and artifact expectations did not drift

7. **Console.log Audit**
   - Search for console.log in source files
   - Report locations

8. **Git Status**
   - Show uncommitted changes
   - Show files modified since last commit

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
Tests:    [X/Y passed]
RED:      [command + observed failure / no test added]
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

## Next Handoff

- If verification fails, use `/build-fix` for mechanical failures or `/receive-review` for review-driven fixes.
- If verification passes, run `/review-task`, then `/eval`.
- **Refactoring happens in review, not here.** If review refactors, rerun `/verify` — the loop between
  the two is expected (`skills/tdd` keeps refactoring outside the red/green cycle).
- If behavior changed and observe evidence is missing, create or update `observation-summary.md` before acceptance.
