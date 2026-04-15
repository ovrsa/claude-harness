# Code Review

Comprehensive security and quality review of uncommitted changes:

1. Get changed files: git diff --name-only HEAD

2. For each changed file, check for:

**Security Issues (CRITICAL):**
- Hardcoded credentials, API keys, tokens
- SQL injection vulnerabilities
- XSS vulnerabilities  
- Missing input validation
- Insecure dependencies
- Path traversal risks

**Code Quality (HIGH):**
- Functions > 50 lines
- Files > 800 lines
- Nesting depth > 4 levels
- Missing error handling
- console.log statements
- TODO/FIXME comments
- Missing JSDoc for public APIs

**Best Practices (MEDIUM):**
- Mutation patterns (use immutable instead)
- Emoji usage in code/comments
- Missing tests for new code
- Accessibility issues (a11y)
- Missing observation or runtime verification for behavior-changing changes

3. Also check process adherence:

- Was implementation consistent with the approved plan?
- Were changes kept in small reviewable batches?
- Were boundary/error scenarios tested?
- Is there a verification summary or evidence?
- For runtime-visible changes, is there observation evidence (logs, screenshots, browser check, metrics)?

4. Generate report with:
   - Severity: CRITICAL, HIGH, MEDIUM, LOW
   - File location and line numbers
   - Issue description
   - Suggested fix

5. Block commit if CRITICAL or HIGH issues found

Never approve code with security vulnerabilities!
