# Build and Fix

Incrementally fix build and type errors with minimal, safe changes.

## Core Rule

Do not edit before stating the likely root cause with evidence. Build fixes are debugging tasks, not guess-and-check patch sessions.

## Step 1: Detect Build System

Identify the project's build tool and run the build:

| Indicator | Build Command |
|-----------|---------------|
| `package.json` with `build` script | `npm run build` or `pnpm build` |
| `tsconfig.json` (TypeScript only) | `npx tsc --noEmit` |
| `Cargo.toml` | `cargo build 2>&1` |
| `pom.xml` | `mvn compile` |
| `build.gradle` | `./gradlew compileJava` |
| `go.mod` | `go build ./...` |
| `pyproject.toml` | `python -m py_compile` or `mypy .` |

## Step 2: Parse and Group Errors

1. Run the build command and capture stderr
2. Group errors by file path
3. Sort by dependency order (fix imports/types before logic errors)
4. Count total errors for progress tracking

## Step 3: Root Cause Investigation

Before editing, record:

1. exact error message and file/line
2. whether the failure reproduces consistently
3. recent changes that could explain the failure
4. smallest failing boundary:
   - import/type boundary
   - build config boundary
   - generated artifact boundary
   - dependency/version boundary
   - source logic boundary
5. likely root cause in one sentence

For multi-component failures, gather evidence at each boundary before proposing a fix.

## Step 4: Fix Loop (One Error at a Time)

For each error:

1. **Read the file** — Use Read tool to see error context (10 lines around the error)
2. **Diagnose** — State root cause before editing
3. **Fix minimally** — Use Edit tool for the smallest change that resolves the error
4. **Re-run build** — Verify the error is gone and no new errors introduced
5. **Move to next** — Continue with remaining errors

## Step 5: Guardrails

Stop and ask the user if:
- A fix introduces **more errors than it resolves**
- The **same error persists after 3 attempts** (likely a deeper issue)
- The fix requires **architectural changes** (not just a build fix)
- Build errors stem from **missing dependencies** (need `npm install`, `cargo add`, etc.)
- Root cause cannot be stated with evidence
- Three fix attempts fail; return to research/plan or architecture review before attempting a fourth fix

## Step 6: Summary

Show results:
- Errors fixed (with file paths)
- Errors remaining (if any)
- New errors introduced (should be zero)
- Root cause for each fixed error
- Suggested next steps for unresolved issues

## Recovery Strategies

| Situation | Action |
|-----------|--------|
| Missing module/import | Check if package is installed; suggest install command |
| Type mismatch | Read both type definitions; fix the narrower type |
| Circular dependency | Identify cycle with import graph; suggest extraction |
| Version conflict | Check `package.json` / `Cargo.toml` for version constraints |
| Build tool misconfiguration | Read config file; compare with working defaults |

Fix one error at a time for safety. Prefer minimal diffs over refactoring.

## Next Handoff

- If build/type failures are fixed, run `/verify`.
- If root cause requires design changes, return to the Grill and add a new `docs/design/` entry before the next attempt.
- If the fix changed behavior, update tests and observation requirements before `/eval`.
