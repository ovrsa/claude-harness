---
title: Harness Simplification
status: approved
task_type: heavy-risky
worktree_required: true
observe_required: true
review_required: true
---

# Plan: harness-simplification

<!--
本文は日本語で書く。
見出し名は hooks / validators が読むため、このテンプレートの英語見出しを維持する。
コマンド、ファイルパス、コード識別子、Given/When/Then、normal/boundary/abnormal、RED/GREEN command などの parser token は必要に応じて英語のままにする。
-->

## Summary

- ECC 由来の膨張した runtime surface を、計測を直してから段階的に縮小する。
- broad hook behavior、local SQLite migration、runtime capability removal を含むため、全体を `heavy-risky` とする。
- Phase 1〜5を独立した implementation plan と approval checkpoint に分ける。
- この master plan の最初の実行対象は Phase 1「Hook output contract repair」だけとする。
- Phase 2以降は、前 phase の review / verification / residual-risk acceptance 後に詳細planを作成・承認する。

## Source Of Truth

- research: `plan/harness-simplification/research.md`
- approved design: `docs/superpowers/specs/2026-08-11-harness-simplification-design.md`
- master plan: `plan/harness-simplification/plan.md`
- Phase 1 plan: `docs/superpowers/plans/2026-08-11-harness-simplification-phase-1.md`
- later phase plans: approval checkpoint 後に `docs/superpowers/plans/` へ追加する。

## Non-Goals

- 一度に全 commands / skills / agents / rules を削除しない。
- 利用計測が直る前に usage 0 を削除条件にしない。
- 新しい orchestration framework や第二の lifecycle を追加しない。
- `settings.json` の user-owned `model`, `tui`, その他の unrelated keys を変更しない。
- telemetry DB、history、plugin manager state、credentials を削除しない。
- 同時進行中の test-suite pruning を本作業へ吸収しない。
- commit / merge / push は個別の明示承認なしに行わない。

## Phase Structure

| Phase | Deliverable | Entry Gate | Exit Gate |
|---|---|---|---|
| 1 | Hook stdout amplification の停止 | 本planとPhase 1 planの承認、dedicated worktree | focused/full tests、review、active runtime observation |
| 2 | SQLite v3、capability events、task-scoped artifacts | Phase 1 accepted | migration fixture、backup/rollback、session persistence、artifact isolation |
| 3 | lifecycle正本とreference integrity | Phase 2 accepted | broken reference 0、`CLAUDE.md` single authority review |
| 4 | commands / skills / agents / rules のquarantine | Phase 2–3 accepted、batch inventory承認 | batch別tests、listing smoke、active runtime promotion承認 |
| 5 | observation後の物理削除 | batchごとの5 non-trivial sessionsまたは早期確定 | final inventory、restore request 0、review/verify/observe accepted |

## Approval Semantics

- master plan と Phase 1 plan の承認は Phase 1実装だけを許可する。
- Phase 2–5は、それぞれ詳細planと touched-file inventory を提示して再承認を得る。
- Phase 4は commands、skills、agents、rules の4 batchを別承認にする。
- worktreeからactive `~/.claude` runtimeへ反映する前に、diff、rollback、protected-file snapshotを提示して承認を得る。
- observation後の物理削除は Phase 5 の別承認とする。

## Acceptance Criteria

- Phase 1:
  - no-op active hooks が raw stdin を stdout へ返さない。
  - `auto-tmux-dev.js` は変更時だけ valid `PreToolUse.hookSpecificOutput.updatedInput` を返す。
  - wrapper disabled / missing optional script は exit 0、stdout empty。
  - existing safety decisions と intended side effects が維持される。
- Phase 2:
  - existing schema v2 DB がbackup後にadditive v3へmigrationされ、新規session eventを保存する。
  - usage signal が explicit / automatic / dependency / discovered を混同しない。
  - task artifact write はvalidated `task_id`なしにrootへfallbackしない。
- Phase 3:
  - lifecycle default は `CLAUDE.md` だけに存在する。
  - active local links / command / skill / agent references にmissing targetがない。
- Phase 4:
  - local command / skill listing が129から51以下になるか、超過分が個別承認される。
  - agent listing が21から10以下になるか、超過分が個別承認される。
  - quarantined asset はactual listingに現れない。
- Phase 5:
  - restore request、broken reference、missing capabilityを処理してから物理削除する。
  - review / verification / observation summaries がtask-scopedでcompleteになる。

## Worktree And Concurrent-Change Policy

- 実装は dedicated worktree で行う。
- current `main` の既存変更:
  - `settings.json` の user changes
  - untracked `docs/superpowers/` と task artifacts
  - その他の local runtime state
- worktree作成前とactive runtime反映前に `git status --short --branch` を記録する。
- overlapping file が別作業で変化した場合は、そのphaseを停止し、rebase / re-plan / user decision のいずれかを選ぶ。
- `docs/superpowers/specs/2026-08-11-test-suite-pruning-design.md` が示す test-only作業と、Phase 1のproduction hook fixを同時に同じtest fileへ実装しない。

## Rollback

- Phase 1: focused commit単位でhook scriptsとcontract testsを戻す。
- Phase 2: migration transaction rollback、pre-v3 snapshot、additive schema compatibilityを使う。DB resetはしない。
- Phase 3: docs / rules / validator batchだけを戻す。
- Phase 4: tracked assetはGit、ignored assetはquarantine manifestから戻す。
- Phase 5: physical deletion前のinventory reviewを必須とし、tracked assetはGit history、ignored assetはsnapshotから戻す。

## Stop Conditions

- protected `settings.json` keysまたは同じhook registration entryにconcurrent changeがある。
- test-suite pruning作業が Phase 1 target testsを変更中である。
- safety / permission hookのdecision behaviorが変わる。
- Hook stdoutを空にするとintended contextまたはdecisionまで失われることが判明する。
- migration backupを作れない、またはschema v2 fixtureが再現できない。
- quarantine対象に未解決inbound referenceがある。
- active runtime promotion diffに承認範囲外のfileが含まれる。

## Verify

- phase-specific focused tests
- `npm test`
- `npm run test:hooks`
- `npm run test:pipeline` when artifact / SQLite code changes
- `npm run test:regression`
- `npm run test:full`
- `npm run test:optional` when skill / agent surface changes
- `git diff --check`
- protected-file diff audit

## Evaluate

- phaseごとに `plan/harness-simplification/review-summary.md` を更新する。
- `Findings` が `none` になるまで次phaseへ進めない。
- accepted concernは `Residual Risks` に移し、user acceptanceを記録する。

## Observe

- runtime behaviorが変わるPhase 1、2、4、5では `plan/harness-simplification/observation-summary.md` を更新する。
- Phase 1はactual registered hook replayのstdout / stderr bytesを記録する。
- Phase 2はsession start/end後のSQLite rowsを記録する。
- Phase 4–5はcatalog listing、restore request、missing capabilityを記録する。

## Execution Todo

- [x] 全体監査とskill stocktakeを完了する。
- [x] staged reductionを選択する。
- [x] design specを作成し、独立reviewとuser reviewを通す。
- [x] master planとPhase 1 implementation planをdraftする。
- [x] plan document reviewを通す。
- [x] master planとPhase 1 planのuser approvalを得る。
- [x] planning commit / worktree / verified candidate commit authorizationを得る。
- [ ] Phase 1を実装・review・verify・observeする。
- [ ] Phase 2 planを作成・承認・実行する。
- [ ] Phase 3 planを作成・承認・実行する。
- [ ] Phase 4 batch plansを作成・承認・実行する。
- [ ] Phase 5 observationとfinal deletionを承認・実行する。

## Current Decision

- designはapproved。
- independent plan reviewはapproved。
- master planとPhase 1 planはapproved。
- execution modeはSubagent-Driven。
- planning commit / dedicated worktree / verified candidate commitはauthorized。
- active `~/.claude` runtimeへの反映は未承認であり、verification後の別checkpointとする。
- implementationは未着手。
- current next actionはplanning artifactsの検証済みcommitとdedicated worktree作成。
