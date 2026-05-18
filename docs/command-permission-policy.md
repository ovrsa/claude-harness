# Command Permission Policy

Use staged, bounded autonomy.

## Core Rule

Autonomy is allowed only inside an approved plan and only inside explicit tool and lifecycle boundaries.

## Decision Classes

### `auto-allow`

Use for clearly safe, read-only, low-risk commands.

Examples:
- `pwd`
- `ls`
- `rg`
- `sed -n`
- `cat`
- `git status`

Expected human involvement:
- none

### `ask-with-justification`

Use for commands that may be legitimate but have execution cost, side effects, or ambiguity.

Examples:
- test runs
- builds
- dependency installation
- repo mutation that is not obviously destructive

Expected human involvement:
- explicit approval with a clear reason

### `hard-deny`

Use for clearly destructive or unsafe commands.

Examples:
- `rm -rf`
- `git reset --hard`
- `git clean -fd`
- force pushes

Expected human involvement:
- deny by default
- proceed only by changing approach or requesting an explicit override outside the normal harness path

### `audit-only`

Use for commands that are low risk but should still leave a trace because they touch system/process state or are useful to review later.

Examples:
- `ps`
- `whoami`
- `id`
- `date`

Expected human involvement:
- none

## Autonomy Ladder

1. Plan-first + edit/commit guard
2. Artifact-first restore and continuity
3. Verify + observe before completion
4. Limited autonomous execution inside an approved plan
5. Parallel subagents for independent work only
6. Long-running loops with stronger evals and stronger sandboxing

## Promotion Rule

Do not move up the ladder unless the current level is supported by:

- explicit boundary rules
- reproducible verification
- runtime observation where relevant
- a clear stop or rollback condition

## Non-Goals

- full auto-merge
- architecture changes without human approval
- destructive operations without explicit human review
