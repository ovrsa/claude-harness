# Plan: Superpowers Enforcement Hardening

## Summary

- Continue the Superpowers adoption by moving from command guidance toward executable enforcement.
- Clear the dependency audit backlog created by local lint tooling.
- Tighten commit guard behavior so `verification-summary.md` must be structurally complete, not merely present.

## Behavior Spec

### Normal Case

Given an approved non-trivial task with complete lifecycle artifacts,
when the operator attempts `git commit`,
then `lifecycle-pre-commit.js` allows the commit path.

### Boundary Case

Given `verification-summary.md` exists but only contains a title,
when the operator attempts `git commit`,
then `lifecycle-pre-commit.js` blocks and explains the missing verification sections.

### Abnormal Case

Given npm audit reports vulnerable dev-tool transitive dependencies,
when safe non-breaking remediation is available,
then the dependency tree is updated and `npm audit` reports zero vulnerabilities.

## Implementation Steps

1. Update vulnerable dev-tool dependencies through normal npm resolution.
2. Parse `verification-summary.md` in `lifecycle-pre-commit.js`.
3. Block commit when verification required sections or values are missing.
4. Extend lifecycle smoke and hook tests for incomplete verification.
5. Run audit, lint, lifecycle smoke, and full tests.

## Approval

- status: implemented
- rationale: continuation requested explicitly; change is scoped to enforcement and dependency health.
