# Loop Status Command

## Position

Retained secondary command. Use it to inspect an active managed loop; it supports the loop pack, but it is not itself core lifecycle machinery.

Inspect active loop state, progress, and failure signals.

## Usage

`/loop-status [--watch]`

## What to Report

- active loop pattern
- current phase and last successful checkpoint
- failing checks (if any)
- estimated time/cost drift
- recommended intervention (continue/pause/stop)

## Watch Mode

When `--watch` is present, refresh status periodically and surface state changes.

## Arguments

$ARGUMENTS:
- `--watch` optional
