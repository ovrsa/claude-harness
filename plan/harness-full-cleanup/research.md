# Research Report: harness-full-cleanup

<!--
本文は日本語で書く。
見出し名は運用上の互換性のため、このテンプレートの英語見出しを維持する。
コマンド、ファイルパス、コード識別子、引用した出力は原文を優先する。
-->

## Goal

- `~/.claude` を、GitHub private repo で維持する個人用 Claude harness として整理する。
- `.claude` 直下に残っている root task artifact を整理し、今後の作業成果物は `plan/<task>/` に寄せる。
- Everything Claude Code 由来の plugin / fallback / skills / docs のうち、現在の目的に不要なものを削る。
- GitHub に載せるべき設定と、ローカル専用の runtime state を明確に分ける。

## Current State

- Git remote は `https://github.com/ovrsa/claude-harness.git`。
- `main` は `origin/main` と同期している。
- `.gitignore` はすでに runtime state と root lifecycle artifact を ignore している。
- `plan/` 配下の task-scoped artifact は追跡対象として許可されている。
- 作業ディレクトリには Git 追跡対象外の runtime/local state が多く残っている。
- `runtime-session-start` は root の `progress.md`, `review-summary.md`, `verification-summary.md`, `observation-summary.md` を検出しており、今回の整理対象になっている。

## Git Managed Surface

Git 管理対象として確認できた主要カテゴリ:

- harness entrypoint:
  - `CLAUDE.md`
  - `AGENTS.md`
  - `HARNESS.md`
  - `OPERATING_MODEL.md`
  - `AUTONOMY_POLICY.md`
  - `OBSERVE.md`
  - `SESSION.md`
- command surface:
  - `commands/`
- lifecycle and runtime:
  - `hooks/`
  - `scripts/hooks/`
  - `scripts/lib/`
  - `scripts/ci/`
  - `schemas/`
  - `workflows/`
  - `facets/`
- docs and policy:
  - `docs/`
  - `rules/`
  - `templates/`
  - `contexts/`
- package and validation:
  - `package.json`
  - `package-lock.json`
  - `eslint.config.js`
  - `knip.json`
  - `.dependency-cruiser.js`
  - `commitlint.config.js`
- plugin manifest:
  - `.claude-plugin/plugin.json`
- small tracked skill dependencies:
  - `skills/continuous-learning-v2/hooks/observe.sh`
  - `skills/continuous-learning-v2/scripts/detect-project.sh`
  - `skills/continuous-learning/config.json`

## Ignored Local Surface

`.gitignore` により GitHub に載らない runtime/local state:

- `.codex-global-write-test`
- `backups/`
- `cache/`
- `claw/`
- `debug/`
- `file-history/`
- `history.jsonl`
- `ide/`
- `paste-cache/`
- `plans/`
- `plugins/`
- `policy-limits.json`
- `projects/`
- `session-aliases.json`
- `session-env/`
- `sessions/`
- `shell-snapshots/`
- `stats-cache.json`
- `statsig/`
- `tasks/`
- `telemetry/`
- `todos/`
- `node_modules/`
- root lifecycle artifact:
  - `observation-summary.md`
  - `plan.md`
  - `progress.md`
  - `research.md`
  - `review-summary.md`
  - `verification-summary.md`
- quarantined optional packs:
  - `agents/**`
  - `examples/**`
  - `skills/**` with narrow tracked exceptions
  - `scripts/codemaps/**`
  - selected old hook/helper scripts

## Local Size Snapshot

確認時点の主な ignored directory size:

- `projects/`: 32M
- `telemetry/`: 25M
- `plugins/`: 20M
- `file-history/`: 5.1M
- `backups/`: 1.4M
- `skills/`: 1.1M
- `sessions/`: 448K
- `todos/`: 244K
- `cache/`: 240K
- `tasks/`: 104K

## Root Artifact Findings

root に残っている task artifact:

- `progress.md`
- `review-summary.md`
- `verification-summary.md`
- `observation-summary.md`

これらは `.gitignore` で ignore 済みだが、lifecycle hooks は root artifact を現在の作業状態として読みに行く。
そのため単純削除だけだと、次回 `runtime-session-start` の表示は改善するが、hook が期待する root artifact モデル自体は残る。

整理方針の候補:

- A: 現在の root artifact を削除し、今後の作業記録は `plan/<task>/` に置く。
- B: root artifact を `plan/harness-full-cleanup/old-root-artifacts/` に退避してから削除する。
- C: hook 側を task-scoped artifact 優先に改修し、root artifact を fallback に下げる。

推奨は C を別フェーズに分け、今回の第一段階では B または A に留めること。
hook 改修は `scripts/lib/task-artifacts.js`, `hooks/lifecycle-*`, `scripts/ci/smoke-harness-lifecycle.js` に影響し、テスト更新も必要になる。

## Everything Claude Code Findings

明確な ECC / Everything Claude Code 残存箇所:

- `.claude-plugin/plugin.json`
  - `name: everything-claude-code-local`
- `settings.json`
  - `SessionStart` hook が `$HOME/.claude/plugins/everything-claude-code` などを fallback 探索している。
- `hooks/hooks.json`
  - 同じ ECC plugin fallback が残っている。
- ignored local `plugins/`
  - `plugins/README.md`
  - `plugins/installed_plugins.json`
  - `plugins/known_marketplaces.json`
  - `plugins/marketplaces/...`
- ignored local `skills/configure-ecc/`
  - Everything Claude Code を clone / install する導入 skill。
- 多数の ignored local skill に `origin: ECC` が残っている。

ただし、現在 Git 管理されている `skills/continuous-learning-v2/hooks/observe.sh` は `settings.json` と `hooks/hooks.json` から参照されている。
このため `skills/continuous-learning-v2` 系を消すには先に observe hook と instinct 系 commands の方針を決める必要がある。

## Continuous Learning Findings

現在 Git 管理されている参照:

- `settings.json`
  - `skills/continuous-learning-v2/hooks/observe.sh`
- `hooks/hooks.json`
  - `skills/continuous-learning-v2/hooks/observe.sh`
- `package.json`
  - `skills/continuous-learning-v2/hooks/observe.sh`
  - `skills/continuous-learning-v2/scripts/detect-project.sh`
- `scripts/ci/validate-runtime-surface.js`
  - `skills/continuous-learning-v2/hooks/observe.sh` を許可対象として扱う。
- `commands/instinct-*`, `commands/evolve.md`, `commands/projects.md`, `commands/promote.md`
  - `skills/continuous-learning-v2/scripts/instinct-cli.py` を呼ぶ説明があるが、該当 script は ignored local にある。

判断:

- continuous learning を今後も使うなら、必要最小限の script / docs を tracked に戻すか、docs と実体のずれを解消する必要がある。
- 不要なら、hook 参照と commands を削ってから local ignored skill を削除する。
- 現時点で単純削除は危険。

## Plugin Findings

`plugins/` は ignored で GitHub には載らない。
ローカルには marketplace cache / install metadata が残っている。

判断:

- GitHub repo 維持の観点では `plugins/` は削除または再生成可能な local state として扱える。
- ただし Claude Code 側が plugin marketplace / installed_plugins を利用している可能性があるため、削除前に current runtime が `.claude-plugin` 直下運用で足りるか確認する。
- tracked `.claude-plugin/plugin.json` は名前だけ ECC 由来なので、`claude-harness` へ rename する第一候補。

## Documentation Findings

README と sync docs は private harness repo としてかなり整理済み。
一方で以下には現状とズレる記述が残る:

- `docs/device-migration.md`
  - `skills/`, `plugins/`, `agents` を移行対象として広く扱っている。
- `docs/github-sync.md`
  - `plugins/` をローカル専用として扱う記述はあるが、Everything Claude Code 不要方針までは明確でない。
- `docs/superpowers-adoption.md`
  - `/Users/kyo/development/references/superpowers` という個人 absolute path が残っている。

## Risk Areas

- root artifact を整理しても hooks が root artifact 前提なら、次の非自明作業でまた root に artifact が生成される可能性がある。
- `settings.json` と `hooks/hooks.json` は同じ hook surface を二重に持っているため、片方だけ直すと drift が起きる。
- `continuous-learning-v2` を消すと observe hook と instinct 系 commands が破綻する。
- ignored `skills/` の中には現在の Codex skill discovery に見えているものがあるため、削除するとこのセッション以外の作業体験が変わる可能性がある。
- `plugins/` 削除は GitHub sync には安全寄りだが、Claude Code plugin manager のローカル状態を失う可能性がある。

## Initial Classification

### Keep

- `CLAUDE.md`, `AGENTS.md`, `HARNESS.md`, `OPERATING_MODEL.md`
- `commands/shape-task.md`, `commands/plan-task.md`, `commands/research-task.md`, `commands/implement-task.md`, `commands/review-task.md`, `commands/verify.md`
- `hooks/`, `scripts/hooks/`, `scripts/lib/`, `scripts/ci/`
- `templates/`, `schemas/`, `workflows/`, `facets/`
- `plan/`
- `.gitignore`
- `README.md`, `docs/github-sync.md`, `docs/device-migration.md` after cleanup updates

### Rename / Rewrite

- `.claude-plugin/plugin.json`
  - `everything-claude-code-local` から `claude-harness` へ変更候補。
- `settings.json` and `hooks/hooks.json`
  - ECC plugin fallback を local harness root fallback に簡略化候補。
- `docs/device-migration.md`
  - `skills/` / `plugins/` の扱いを「原則 local optional」へ修正候補。
- `docs/github-sync.md`
  - Everything Claude Code 不要方針と local state cleanup 手順を追加候補。

### Delete Candidates: Low Risk

- root artifact:
  - `progress.md`
  - `review-summary.md`
  - `verification-summary.md`
  - `observation-summary.md`
- `.codex-global-write-test`
- `.DS_Store` files
- `debug/`
- `cache/`
- `paste-cache/`
- `shell-snapshots/`
- `statsig/`

### Delete Candidates: Requires Approval Because Runtime State May Be Useful

- `plugins/`
- `projects/`
- `sessions/`
- `telemetry/`
- `tasks/`
- `todos/`
- `file-history/`
- `backups/`
- `history.jsonl`
- `policy-limits.json`
- `session-aliases.json`
- `stats-cache.json`

### Delete Candidates: Requires Dependency Removal First

- `skills/configure-ecc/`
- ignored ECC-origin skill packs that are not used by current harness
- `skills/continuous-learning-v2/` local extras
- `commands/instinct-*`, `commands/evolve.md`, `commands/projects.md`, `commands/promote.md` if continuous learning is retired
- `settings.json` and `hooks/hooks.json` observe hook entries if continuous learning is retired

## Recommended Cleanup Strategy

1. Artifact cleanup first:
   - root artifact を退避または削除する。
   - root artifact を今後作らないための hook/command 方針は別フェーズで扱う。
2. Identity cleanup:
   - `.claude-plugin/plugin.json` を `claude-harness` に rename。
   - `settings.json` / `hooks/hooks.json` から ECC plugin fallback を削り、local root fallback に統一。
3. Continuous learning decision:
   - 使うなら tracked surface と docs を整合させる。
   - 不要なら observe hooks と instinct commands を削ってから local skill を削除。
4. Local debris cleanup:
   - 低リスク ignored files を削除。
   - 大きい runtime state は削除対象リストを提示して明示承認後に削除。
5. Verification:
   - `node scripts/ci/validate-hooks.js`
   - `node scripts/ci/validate-runtime-surface.js`
   - `node scripts/ci/validate-no-personal-paths.js`
   - `npm test`

## Open Questions

- root artifact は削除でよいか、`plan/harness-full-cleanup/old-root-artifacts/` に退避するか。
- continuous learning / instinct 系 commands は今後も使うか。
- `plugins/` はローカルから削除してよいか。
- `telemetry/` と `sessions/` は古いものを全削除するか、直近だけ残すか。
- ignored `skills/` は必要なものだけ残すか、一度全削除して必要時に再導入するか。
