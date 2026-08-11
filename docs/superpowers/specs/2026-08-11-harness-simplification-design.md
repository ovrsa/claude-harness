# Harness Simplification Design

## Status

- design direction: approved
- independent spec review: approved
- written spec user review: approved
- implementation: not started
- selected approach: staged reduction
- task artifacts: `plan/harness-simplification/`

## Context

この harness は ECC を起点に個人環境へ最適化されてきたが、runtime discovery と lifecycle policy が増殖し、次の状態になっている。

- 1 session で commands / skills / agents の catalog が約29,000 chars 注入される。
- Git 管理外にした optional packs が runtime では有効なまま残る。
- Hook が raw input を stdout に重複出力し、context と telemetry を膨張させる。
- SQLite migration failure が握り潰され、利用計測が停止している。
- `CLAUDE.md`, `AGENTS.md`, commands, rules, skills が異なる lifecycle default を定義する。
- root artifact 前提の実装と `plan/<task>/` 前提の文書が競合する。

調査の詳細は `plan/harness-simplification/research.md` を正本とする。

## Goals

1. active runtime cost を先に削減する。
2. pruning 判断に使える telemetry を復旧する。
3. lifecycle の正本を `CLAUDE.md` に一本化する。
4. runtime surface を dependency-aware に縮小する。
5. 隔離、観測、削除の順序で capability loss を管理する。

## Non-Goals

- 新しい orchestration framework を導入しない。
- すべての ECC asset を更新して保存しない。
- telemetry が直る前に、usage 0 を理由として一括削除しない。
- local runtime history や credentials を削除しない。
- commit / push を自動化しない。
- 同時進行中の test-suite pruning spec の範囲を取り込まない。

## Design Principles

### One Authority Per Concern

- lifecycle default: `CLAUDE.md`
- Codex runtime bridge: `AGENTS.md`
- workflow entrypoints: `commands/`
- narrow reusable expertise: `skills/`
- language / framework invariants: `rules/`
- hard machine-enforceable boundaries: hooks
- runtime state: SQLite
- human approval and evidence: `plan/<task>/`

下位レイヤーは上位レイヤーを参照できるが、同じ concern を別の default として再定義しない。

### Fix Measurement Before Usage-Based Deletion

利用記録が停止している間は、usage 0 を削除条件にしない。先に session / tool / capability activation events を保存し、stocktake が同じ source を読むようにする。

### Discovery Is A Runtime Boundary

`commands/`, `skills/`, `agents/` に置くこと自体を capability enablement と扱う。Git ignore、ownership、runtime enablement を別の概念として文書化・検証する。

### Prefer Removal Over Another Registry

新しい複雑な plugin manager は作らない。高信頼の退役候補は参照検証後に Git history を rollback source として削除する。暗黙利用が不明な local optional packs だけを一時 quarantine する。

## Target Architecture

```text
CLAUDE.md
  ├─ track selection / done semantics
  ├─ points to focused docs
  └─ does not enumerate optional capabilities

AGENTS.md
  ├─ points to CLAUDE.md
  ├─ Codex session start/end bridge
  └─ no second lifecycle definition

runtime directories
  ├─ commands/  small operator-facing entrypoints
  ├─ skills/    narrow reusable expertise and active hook dependencies
  ├─ agents/    roles with demonstrated independent value
  └─ rules/     short scoped invariants

runtime control
  ├─ hooks: enforce or observe one boundary each
  ├─ SQLite: session/tool/capability state
  └─ plan/<task>/: approval and human-readable evidence
```

## Phase 1: Stop Active Runtime Waste

### Hook Output Contract

対象:

- `scripts/hooks/run-with-flags.js`
- `scripts/hooks/run-with-flags-shell.sh`
- `scripts/hooks/post-edit-format.js`
- `scripts/hooks/post-edit-typecheck.js`
- `scripts/hooks/post-edit-console-warn.js`
- `scripts/hooks/auto-tmux-dev.js`
- active passthrough hooks found by the contract audit:
  - `scripts/hooks/pre-bash-tmux-reminder.js`
  - `scripts/hooks/pre-bash-git-push-reminder.js`
  - `scripts/hooks/quality-gate.js`
  - `scripts/hooks/post-bash-build-complete.js`
  - `scripts/hooks/cost-tracker.js`
  - `scripts/hooks/doc-file-warning.js`
  - `scripts/hooks/session-end-marker.js`
  - `scripts/hooks/post-bash-pr-created.js`
  - `scripts/hooks/check-console-log.js`
- relevant hook tests

Phase 1は、測定済みhotspotであるwrapper / PostToolUse / `auto-tmux-dev.js` をPhase 1A、残存するactive raw-input passthroughをPhase 1Bとして実装・検証する。Phase 1Bは新しいhook機能を追加せず、既存side effectとbounded diagnosticsを維持したままraw stdinの再出力だけを除く。

`settings.json` と `hooks/hooks.json` の registration は Phase 1 の既定範囲に含めない。`auto-tmux-dev.js` はまず registration を維持したまま current protocol に適合させる。適合できない場合は Phase 1 を停止し、registration 変更だけを別の user-approved change とする。

その変更が必要になった場合の key-level scope は次に限定する。

- `settings.json`: `hooks.PreToolUse` 内で command が `scripts/hooks/auto-tmux-dev.js` を指す1 entry
- `hooks/hooks.json`: 対応する同一 entry

編集直前に両 file を読み直し、pre-edit content hash と protected user keys の snapshot を保存する。期待する command が一致しない、または同じ entry に concurrent diff がある場合は自動変更しない。JSON 全体を再serializeせず、対象 entry だけを patch し、pre/post snapshot と `git diff -- settings.json hooks/hooks.json` の両方で変更範囲を検証する。`model`, `tui`, その他の user-owned keys は不変とする。

契約:

- no-op / disabled / missing optional script: exit 0、stdout は空。
- optional hook diagnostics: 長さを制限した stderr。
- tool input を変更する場合: current hook protocol の structured JSON のみ stdout に出す。
- malformed input: optional hook は fail open、raw input を stdout へ返さない。
- permission / destructive-action hook: existing fail-closed policy を維持する。
- wrapper は `CLAUDE_PLUGIN_ROOT` 未定義時に local harness root を安全に解決する。

`auto-tmux-dev.js` は current update protocol に直せない場合、default hook surface から外す。暗黙の command rewrite より明示的な `/dev` command を優先する。

### Verification

- fixture input を各 hook に replay し、no-op stdout が exact empty であること。
- structured output が schema-valid であること。
- stderr に raw tool input、secret-like values、巨大 payload が出ないこと。
- existing destructive-action boundaries が維持されること。

## Phase 2: Restore Measurement And Artifact Routing

### SQLite Migration

対象:

- `scripts/lib/session-trace.js`
- `tests/lib/session-trace.test.js`
- schema / migration helpers if separation is needed

設計:

- target schema version は3とする。
- version 3 は additive-only とし、既存 table / column の drop、rename、型変更を行わない。
- `session_runs.repo_root TEXT NOT NULL DEFAULT ''`、`session_runs.project_id TEXT NOT NULL DEFAULT ''`、`run_state.task_id TEXT NOT NULL DEFAULT ''` を、存在しない場合だけ追加する。
- capability activation 用 table と index も version 3 migration で追加する。
- schema version ごとの idempotent migration を transaction 内で実行する。
- version 2 fixture から `repo_root`, `project_id` を追加できる test を先に作る。
- migration error を silent `null` に変換しない。
- optional telemetry write failure は main tool action を止めないが、bounded stderr と health signal に残す。
- session start/end の integration test で persisted event を確認する。
- user DB を destructive reset しない。

既存 user DB を初めて version 3へ変更する前に、SQLite の整合した snapshot を `telemetry/backups/telemetry-before-v3-<timestamp>.db` に1件作る。online backup または `VACUUM INTO` が利用できない場合は migration を開始せず、telemetry を fail-open で無効化して診断を残す。migration commit 後に code を rollback しても version 2 code が追加 column / table を無視できる additive compatibility を test する。schema downgrade は行わない。

### Capability Activation

activation signal は次の強度を区別する。

1. explicit invocation
2. runtime dependency / direct reference
3. automatic skill activation
4. discovered but unused

`capability_events` の最小 schema:

| Column | Contract |
|---|---|
| `event_id` | source event から作る stable unique ID |
| `occurred_at` | UTC timestamp |
| `session_id` / `run_id` | session trace との join key |
| `capability_type` | `command`, `skill`, `agent` |
| `capability_name` | normalized local name |
| `activation_kind` | `explicit`, `automatic` |
| `source_kind` | `runtime_event`, `transcript_backfill` |
| `source_event_id` | source 内の dedupe key |
| `metadata_json` | version、runtime、confidence など非機密の小さい metadata |

unique key は `(session_id, capability_type, capability_name, activation_kind, source_kind, source_event_id)` とする。同じ source event の replay は count を増やさない。

`direct reference` は static dependency graph、`discovered` は inventory として別集計し、activation count へ加算しない。SQLite に同一 session の runtime event がある場合はそれを正本とし、transcript backfill と合算しない。SQLite event がない過去 session だけ transcript backfill を利用し、source と confidence を表示する。

raw prompt、tool input / output、file contents は `capability_events` に保存しない。保存するのは capability name、event identifiers、timestamp、runtime/version、confidence に限定する。unknown automatic activation を0件へ丸めない。

`skill-stocktake` は `*/SKILL.md` だけを inventory とし、上記 SQLite event、transcript backfill、static dependencies を分離表示する。

### Task-Scoped Artifacts

対象:

- `scripts/lib/task-artifacts.js`
- session hooks
- pipeline runner
- related tests

設計:

- authoritative task identity は、明示的な pipeline / hook input の `task_id`、次に同じ `session_id` と `repo_root` に binding された SQLite `run_state.task_id` の順で解決する。明示入力を採用したときは validation 後に同じ run の `run_state.task_id` へ保存する。
- directory scan、更新時刻、root artifact の内容から task identity を推測しない。
- `task_id` は `^[a-z0-9][a-z0-9._-]{0,63}$` に限定し、path separator、`..`、absolute path、symlink escape を拒否する。
- resolved artifact directory は常に `<repo_root>/plan/<task_id>/` の子であることを realpath boundary check で確認する。
- read は task-scoped directory を優先する。root artifacts は migration fallback として read-only で利用できるが、利用時に warning を出す。
- write / update は有効な `task_id` を必須とし、root artifact へ fallback write しない。task identity がない場合は明示エラーを返し、別 task の artifact を変更しない。
- session hooks、pipeline runner、artifact writers は同じ resolver API を使い、独自 path resolution を持たない。
- root fallback 廃止は observation 後の別 checkpoint とする。

## Phase 3: Reconcile Authority And References

### Canonical Lifecycle

- `CLAUDE.md` を唯一の lifecycle default とする。
- `AGENTS.md` は canonical pointer、artifact language、Codex session bridge のみに縮める。
- Sensemaking guidance は canonical doc へ移すか参照に変え、runtime bridge 内で別 lifecycle を定義しない。
- commands は operator action と local options を説明し、pipeline / Superpowers の競合する default を持たない。
- rules は対象 language / framework の狭い invariant に限定し、全 task 共通の planner、coverage、parallel-agent requirement を削る。
- model version は常時ロード rule に固定せず、stable alias または runtime config を使う。

### Reference Integrity

local Markdown links と named capability references を検証する validator を追加する。

- relative / absolute local Markdown link target が存在する。
- command docs が参照する script / command が存在する。
- rules / skills が参照する agent / skill が存在する。
- deleted asset を参照する active runtime file がない。

削除済み runbook は、固有の運用情報が残っている場合だけ focused doc として復元する。単なる古い pointer は削除する。

## Phase 4: Reduce Runtime Surface

### Classification Policy

| Class | Action |
|---|---|
| Keep | active runtime directory に残す |
| Improve | active dependency なら修正、未使用なら quarantine 後に判断 |
| Update | current API / security risk があるものを優先更新 |
| Merge | 固有部分を canonical command / skill へ統合後、元 asset を外す |
| Retire | reference check と smoke test 後に runtime directory から外す |

### Commands

- 明示利用がある9 commands と pipeline core を初期 keep set とする。
- builtin shadowing、lifecycle duplication、巨大 one-off command を優先的に統合・退役する。
- 明示利用0でも active dependency がある command は残すか先に dependency を書き換える。

### Skills

- Keep 10件は active set に残す。
- Retire 11件は参照解除後に runtime discovery から外す。
- Merge 11件は固有の判断表・checklist・contract だけを merge target に移す。
- Improve / Update 34件を一度に直さない。active dependency、利用実績、risk の順に backlog を並べる。
- `continuous-learning-v2`, `strategic-compact` など active hook dependency は Phase 1–2完了まで移動しない。

### Agents And Rules

- agent は独立した context、tool access、review role が必要なものだけ残す。
- command の薄い言い換えだけの agent は command または inline instruction に統合する。
- missing agent / skill references を解消する。
- rules は常時ロード cost を抑えるため、短い invariant と routing pointer に圧縮する。

### Quarantine And Rollback

- Phase 4 は disable / quarantine だけを行い、物理削除しない。
- tracked asset は `runtime-disabled/<batch>/` など auto-discovery root 外の tracked directory へ小さい batch 単位で移す。
- ignored local optional pack は `.quarantine/runtime-surface/<batch>/` へ移す。
- `plan/harness-simplification/quarantine-manifest.md` に original path、classification、inbound references、dependency check、restore command、batch ID を残す。
- quarantine directory が runtime discovery 外であることを actual session listing で検証してから observation window を開始する。
- dedicated worktree で batch を検証した後、active `~/.claude` runtime へ反映する直前に、対象 inventory、restore 手順、active workspace diff を提示して明示承認を得る。active runtime へ反映されるまでは observation window を開始しない。
- Phase 5だけが、observation と user inventory review を通過した asset の物理削除を行う。tracked asset は Git history、ignored asset は quarantine manifest と削除前 snapshot を rollback source とする。

## Phase 5: Observe And Finalize

commands、skills、agents、rules は独立した reversible batch とする。各 batch の observation window は、その batch を runtime discovery 外へ移動し、reference validation、targeted tests、session listing smoke test が通った時点から開始する。後続 batch は先行 batch の observation を妨げないが、自身の5-session window を持つ。

non-trivial session は、正常な session start/end event があり、次のどちらかを満たす session とする。

- 5件以上の tool executions があり、少なくとも1件が read-only 以外。
- explicit command / skill / agent activation event が1件以上ある。

既定 observation window は batch ごとに5 non-trivial sessions。ユーザーは inventory と smoke evidence を確認したうえで早期確定できる。

各 session で記録するもの:

- catalog item count と injected chars
- hook stdout / stderr volume
- SQLite session / tool / activation event persistence
- missing capability / broken reference / manual restore request
- root artifact fallback warning

observation 後:

- restore request がない Retire / Merge 元 asset を削除する。
- restore された asset は Keep / Improve / Update に再分類する。
- quarantine と temporary compatibility fallback を掃除する。
- `observation-summary.md` に runtime evidence を残す。

## Error Handling

- optional observability failure は main task を止めないが、silently discard しない。
- permission / destructive-action enforcement failure は既存の安全側 semantics を維持する。
- migration は transaction を使い、partial schema を残さない。
- quarantine move 前に resolved target と references を記録する。
- missing dependency を検出した場合、その batch の pruning を停止し、既存 asset を戻す。
- test failure が unrelated concurrent work による場合、対象 file を上書きせず分離して報告する。

## Testing Strategy

### Contract Tests

- no-op hook output
- hook structured update output
- bounded diagnostics
- local reference integrity
- runtime discovery boundary

### Migration Tests

- fresh DB creation
- version 2 -> current migration
- repeated idempotent migration
- migration failure rollback
- session start/end persistence

### Artifact Tests

- explicit task path wins
- root fallback warns
- two task directories do not cross-contaminate
- missing task identity does not adopt stale root state

### Integration And Regression

- `npm run test:hooks`
- `npm run test:pipeline`
- `npm run test:regression`
- `npm run test:full`
- `node scripts/ci/validate-skills.js`
- runtime session start/end replay
- actual Claude catalog listing comparison before / after quarantine

## Acceptance Criteria

- no-op PostToolUse hooks produce empty stdout.
- active hook diagnostics do not repeat raw input payloads.
- existing version 2 SQLite DB migrates without data reset and records new session events.
- `skill-stocktake` counts only actual `SKILL.md` files and distinguishes unknown activation from zero.
- task-scoped artifact resolver prefers `plan/<task>/` and prevents cross-task root collisions.
- active docs / rules / commands contain no broken local references.
- `CLAUDE.md` is the only lifecycle default; `AGENTS.md` is a thin runtime bridge.
- controllable local catalog baseline は transcript `skill_listing` に現れた custom commands 60 + local skill entries 69 = 129とする。builtin / external 9 entries は除外する。normalized local name と source path で数え、symlink は listing に別 entry として現れる場合だけ baseline に含める。
- Phase 4完了時の local command / skill catalog は51 entries以下、すなわち controllable baseline から少なくとも60%削減する。dependency のため目標を超える場合は retained entry、inbound dependency、追加数を acceptance review で明示承認する。
- agents は別 surface として baseline 21、初期目標10以下とするが、独立 audit で必要性が確認された場合は retained rationale を記録する。
- Retire / Merge assets have no active inbound references before removal.
- all required tests pass and runtime behavior is recorded in `plan/harness-simplification/observation-summary.md`.
- user-owned `settings.json` changes and concurrent test-pruning work remain untouched unless an approved task explicitly requires coordination.

## Rollback

- Hook batch: restore the previous hook scripts and registrations if tool input rewriting or safety decisions fail.
- SQLite batch: transaction rollback; do not reset or delete the existing DB.
- policy batch: revert only the focused docs / rules batch.
- runtime-surface batch: restore tracked assets from Git or ignored assets from quarantine manifest.
- artifact routing batch: retain root fallback until task-scoped behavior is observed in real sessions.

## Implementation Boundaries

- この改善全体を `heavy-risky` と分類する。broad hook behavior、user SQLite migration、runtime capability removal を含むためである。
- 実装は dedicated worktree で行い、phase ごとに独立した implementation plan、approval checkpoint、review/evaluate、verification、residual-risk acceptance を持つ。
- Phase 1 Hook contract、Phase 2 telemetry/artifact routing、Phase 3 authority/reference、Phase 4 runtime quarantine、Phase 5 observation/final deletion を別 plan に分ける。
- Phase 4はさらに commands、skills、agents、rules の user-reviewed batch に分ける。
- Phase 1–2を通過するまで usage-based deletion を始めない。
- Phase 4の quarantine は reference validation と user-visible inventory review を通す。物理削除は Phase 5 の別承認に限定する。
- commit / push はユーザーの明示承認を得る。
- `settings.json` の既存 user changes と `docs/superpowers/specs/2026-08-11-test-suite-pruning-design.md` を保護する。
