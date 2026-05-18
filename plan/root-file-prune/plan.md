---
title: Root File Prune
status: approved
task_type: standard
worktree_required: false
observe_required: false
review_required: true
---

# Plan: root-file-prune

<!--
本文は日本語で書く。
見出し名は hooks / validators が読むため、このテンプレートの英語見出しを維持する。
-->

## Summary

- root 直下から一過性・旧運用向けの不要ファイルを削除する。
- 削除対象は `IMPLEMENTATION_ROADMAP.md`, `install.sh`, `commitlint.config.js`。
- 削除に伴い、参照している docs/config を更新する。

## Non-Goals

- harness lifecycle の中核ファイルは削除しない。
- `settings.json`, `package.json`, `package-lock.json`, lint/test 設定の必要部分は残す。
- `commands/`, `hooks/`, `scripts/`, `rules/` の構造整理は今回しない。

## Acceptance Criteria

- root から削除対象3ファイルが消えている。
- `rg` で不要な直接参照が残らない。
- `npm test` が通る。
- review / verification summary を `plan/root-file-prune/` に残す。

## Touched Files

- delete: `IMPLEMENTATION_ROADMAP.md`
- delete: `install.sh`
- delete: `commitlint.config.js`
- update: `OPERATING_MODEL.md`
- update: `HARNESS.md`
- update: `docs/device-migration.md`
- update: `rules/README.md`
- update: `package.json`
- update: `knip.json`

## Verify

- `rg -n "IMPLEMENTATION_ROADMAP|install\\.sh|commitlint\\.config" . --glob '!node_modules/**' --glob '!plan/**'`
- `node scripts/ci/validate-no-personal-paths.js`
- `npm test`

## Execution Todo

- [x] 削除候補の参照を確認する。
- [x] plan を作成する。
- [x] 参照を更新する。
- [x] 削除対象ファイルを削除する。
- [x] 検証する。
- [x] review / verification summary を作成する。
- [ ] commit / push する。
