---
title: Harness Full Cleanup
status: approved
task_type: heavy-risky
worktree_required: false
observe_required: false
review_required: true
---

# Plan: harness-full-cleanup

<!--
本文は日本語で書く。
見出し名は hooks / validators が読むため、このテンプレートの英語見出しを維持する。
コマンド、ファイルパス、コード識別子、Given/When/Then、normal/boundary/abnormal、RED/GREEN command などの parser token は必要に応じて英語のままにする。
-->

## Summary

- `~/.claude` を GitHub private repo で維持する個人用 Claude harness として全体整理する。
- `.claude` 直下の root task artifact を片付け、今後の task artifact は `plan/<task>/` に寄せる。
- Everything Claude Code 由来の plugin 名、fallback、導入 skill、不要 local pack を整理する。
- GitHub 管理対象とローカル runtime state を明確に分離する。
- 承認済み方針:
  - root artifact は `plan/harness-full-cleanup/old-root-artifacts/` に退避してから root から消す。
  - `continuous-learning-v2` と instinct 系 commands は今回は維持する。
  - ignored local state は低リスク debris のみ削除し、履歴・telemetry・plugin manager state は残す。

## Non-Goals

- Git 履歴は書き換えない。
- npm 公開用 package にはしない。
- telemetry / sessions / projects / plugins / skills を GitHub に追加しない。
- `settings.json` hook が壊れる削除はしない。
- `continuous-learning-v2` を依存解除なしに削除しない。
- 大きい runtime state を明示承認なしに削除しない。

## Acceptance Criteria

- `plan/harness-full-cleanup/research.md` に棚卸しと分類が残る。
- root の `progress.md`, `review-summary.md`, `verification-summary.md`, `observation-summary.md` の扱いが決まる。
- `.claude-plugin/plugin.json` の ECC 由来名を残すか rename するか決まる。
- `settings.json` と `hooks/hooks.json` の ECC plugin fallback 方針が決まる。
- `continuous-learning-v2` と instinct 系 commands は今回は維持される。
- GitHub 管理対象と ignored local state の境界が README/docs に反映される。
- 実行後に `npm test` が通る。

## Touched Files

- `plan/harness-full-cleanup/research.md`
- `plan/harness-full-cleanup/plan.md`
- optional: `plan/harness-full-cleanup/old-root-artifacts/`
- optional: `.claude-plugin/plugin.json`
- optional: `settings.json`
- optional: `hooks/hooks.json`
- optional: `README.md`
- optional: `docs/github-sync.md`
- optional: `docs/device-migration.md`
- optional: `docs/codex-operations-runbook.md`
- optional: `commands/instinct-import.md`
- optional: `commands/instinct-status.md`
- optional: `commands/evolve.md`
- optional: `commands/projects.md`
- optional: `commands/promote.md`
- optional: `commands/skill-create.md`
- local ignored cleanup:
  - root task artifacts
  - `.codex-global-write-test`
  - `debug/`
  - `cache/`
  - `paste-cache/`
  - `shell-snapshots/`
  - `statsig/`

## Interface Expectations

- 別デバイスでは `git clone` 後に `npm install` と `npm test` で harness を検証できる。
- Claude Code hooks は `~/.claude` 直下の tracked scripts を優先して解決する。
- `plugins/` や runtime state がなくても、tracked harness core は動く。
- task artifact の標準置き場は `plan/<task>/` として説明される。

## Rollback

- tracked file の変更は `git restore <path>` で戻す。
- root artifact を退避した場合は `plan/harness-full-cleanup/old-root-artifacts/` から戻せる。
- local ignored directory の削除は戻しにくいので、`plugins/`, `telemetry/`, `sessions/`, `projects/`, `file-history/`, `backups/` は明示承認後に削除する。
- `settings.json` / `hooks/hooks.json` の hook 変更でテストが落ちたら、まず hook command を元に戻す。

## Risks

- lifecycle hooks は root artifact 名を前提にしているため、root artifact 廃止を完全に行うには追加改修が必要。
- `settings.json` と `hooks/hooks.json` の二重定義が drift しやすい。
- `continuous-learning-v2` は hook と command docs の両方に関係している。
- ignored `skills/` は GitHub には載らないが、ローカル skill discovery には影響する。
- `plugins/` は今回は削除しない。plugin manager の状態を失うリスクを避ける。

## Behavior Spec

### Scenarios

- Given `~/.claude` を GitHub sync repo として見る
  When root directory を確認する
  Then tracked harness core と ignored runtime state の境界が分かる。

- Given 作業タスク artifact が必要になる
  When research / plan / review / verify を作成する
  Then `.claude` 直下ではなく `plan/<task>/` に作成される。

- Given Everything Claude Code plugin が不要である
  When session start hook が動く
  Then `$HOME/.claude/plugins/everything-claude-code` を探さず、local harness root を使う。

- Given continuous learning を残す判断をする
  When observe hook が実行される
  Then tracked されている script だけで動くか、必要な local dependency が明示される。

### Normal / Boundary / Abnormal Cases

- normal: root artifact と低リスク ignored debris を整理し、docs と manifest 名を更新する。
- boundary: `continuous-learning-v2` を残す場合は docs と tracked surface を整合させる。
- abnormal: hook 変更で session start / pre-tool / post-tool が失敗する。

## Phases

- Phase 1: 現状整理 artifact の作成
  - `plan/harness-full-cleanup/research.md` を作成する。
  - `plan/harness-full-cleanup/plan.md` を draft として作成する。

- Phase 2: root artifact の退避
  - `progress.md`, `review-summary.md`, `verification-summary.md`, `observation-summary.md` を `plan/harness-full-cleanup/old-root-artifacts/` に退避する。
  - 今回は hook の root artifact 前提を大改修しない。

- Phase 3: ECC identity cleanup
  - `.claude-plugin/plugin.json` を `claude-harness` へ rename する。
  - `settings.json` と `hooks/hooks.json` の `everything-claude-code` plugin fallback を削る。
  - local root fallback に簡略化する。

- Phase 4: continuous learning の維持
  - `continuous-learning-v2` と observe hooks は今回は維持する。
  - instinct 系 commands も削除しない。
  - docs では `continuous-learning-v2` が今回の例外的な tracked skill dependency であることを明記する。

- Phase 5: local ignored debris cleanup
  - 低リスク debris を削除する。
  - 大きい runtime state は削除候補一覧を提示し、明示承認後に削除する。

- Phase 6: docs update
  - `README.md`, `docs/github-sync.md`, `docs/device-migration.md` に最終方針を反映する。

- Phase 7: verification and review
  - hook validators と full test を実行する。
  - `review-summary.md` と `verification-summary.md` は task-scoped に記録する。

## Stop Conditions

- `settings.json` / `hooks/hooks.json` の hook 検証が落ちる。
- `npm test` が落ちる。
- 削除候補に未解決の参照がある。
- `telemetry/`, `sessions/`, `projects/`, `file-history/`, `backups/`, `plugins/` などの runtime state を削除する必要が出る。
- root artifact 廃止が hook の大改修に広がる。

## Source Of Truth

- `plan/harness-full-cleanup/research.md`
- `plan/harness-full-cleanup/plan.md`
- 実行後:
  - `plan/harness-full-cleanup/verification-summary.md`
  - `plan/harness-full-cleanup/review-summary.md`

## Verify

- status:
  - `git status --short --branch`
- ignored inventory:
  - `git status --short --ignored`
- references:
  - `rg -n "everything-claude-code|everything-claude-code-local|continuous-learning-v2|plugins/|skills/" README.md CLAUDE.md AGENTS.md HARNESS.md docs commands hooks scripts settings.json .claude-plugin package.json .gitignore`
- hook validation:
  - `node scripts/ci/validate-hooks.js`
  - `node scripts/ci/validate-runtime-surface.js`
- safety:
  - `node scripts/ci/validate-no-personal-paths.js`
- full:
  - `npm test`

## Test Evidence Plan

### TDD / Unit

- RED command: n/a
- expected failure: n/a
- GREEN command: `npm test`
- refactor check: `npm test`

### Integration

- path: repository root
- command: `npm test`
- expected result: pass

## Evaluate

- root artifact の扱いが明確である。
- GitHub repo に残すものと local only のものが説明されている。
- Everything Claude Code plugin 不要方針が tracked settings に反映されている。
- continuous learning を残す/削る判断が曖昧でない。
- 削除したものに未解決参照がない。

## Observe

- required: no
- critical journey: no runtime behavior change expected in planning phase.
- command: n/a
- evidence artifact: n/a
- logs / screenshots / traces / metrics: n/a

## Execution Todo

- [x] `plan/harness-full-cleanup/` を作成する。
- [x] 現在の root files, Git tracked files, ignored files を棚卸しする。
- [x] `settings.json` / `hooks/hooks.json` の ECC / continuous learning 参照を確認する。
- [x] `plan/harness-full-cleanup/research.md` を作成する。
- [x] `plan/harness-full-cleanup/plan.md` を draft で作成する。
- [x] root artifact の退避/削除方針を承認する。
- [x] Everything Claude Code fallback / manifest rename 方針を承認する。
- [x] continuous learning を残すか削るか決める。
- [x] 実行範囲を approved に更新する。
- [x] 変更を実行する。
- [x] 検証を実行する。
- [x] review / verification summary を task-scoped に記録する。
- [ ] commit / push するか確認する。

## Current Decision

- この plan は approved。
- root artifact は退避して root から消す。
- ECC plugin fallback と `.claude-plugin/plugin.json` rename を実行する。
- `continuous-learning-v2` は今回は維持する。
- local ignored state は低リスク debris だけ削除する。
- 実行済み:
  - root artifact を `old-root-artifacts/` に退避した。
  - ECC plugin fallback を削除した。
  - `.claude-plugin/plugin.json` を `claude-harness` に変更した。
  - 低リスク debris を削除した。
  - `npm test` は `1213 passed / 0 failed`。
