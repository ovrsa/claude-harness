# Research Report: harness-simplification

<!--
本文は日本語で書く。
見出し名は運用上の互換性のため、このテンプレートの英語見出しを維持する。
コマンド、ファイルパス、コード識別子、引用した出力は原文を優先する。
-->

## Goal

- ECC を起点に増えた `commands/`, `skills/`, `agents/`, `rules/`, hooks を、現在の個人用 harness に必要な最小構成へ縮小する。
- `CLAUDE.md` を唯一の lifecycle 正本とし、下位レイヤーが別の標準フローを定義しない状態にする。
- 利用実績、依存関係、runtime cost を再現可能に測定できるようにしてから、退役・統合・更新を進める。
- 削除は参照検証と観測を通過した対象に限定し、稀に使う機能を誤って失わないようにする。

## Scope

- runtime discovery surface:
  - `commands/`
  - `skills/`
  - `agents/`
- always-loaded policy surface:
  - `CLAUDE.md`
  - `AGENTS.md`
  - `rules/`
  - lifecycle を再定義している command / skill
- runtime control surface:
  - `settings.json`
  - `hooks/`
  - `scripts/hooks/`
  - `scripts/lib/session-trace.js`
  - `scripts/lib/task-artifacts.js`
- validation surface:
  - `tests/hooks/hooks.test.js`
  - `tests/lib/session-trace.test.js`
  - `tests/lib/task-artifacts.test.js`
  - `scripts/ci/`

## Evidence Method

- ローカルの `history.jsonl` と transcript の `skill_listing`, `hook_success` を集計した。
- Git 追跡状態、runtime discovery directory、参照関係を `rg`, `find`, `git ls-files` で確認した。
- Hook scripts に最小入力を与え、exit code、stdout、stderr を再現した。
- 既存 schema を模した一時 SQLite DB で migration failure を再現した。
- 全66件のローカル `SKILL.md` を Keep / Improve / Update / Retire / Merge に分類した。
- 現在のテストが正しい外部契約を検証しているか、実装と assertion を突き合わせた。

## Current State

### Runtime Discovery Cost

監査時点の Claude transcript では、1 session に次のカタログが注入されていた。

| Surface | Count | Approximate injected text |
|---|---:|---:|
| commands + skills + builtin/external | 138 | 23,569 chars |
| agents | 21 | 5,724 chars |
| total | 159 | 29,293 chars |

`skills/**` と `agents/**` は `.gitignore` では quarantined optional packs と記述されているが、Claude の directory discovery からは除外されていない。Git 管理外であることと runtime 無効化は別である。

ローカル資産のおおよその文書量:

| Surface | Lines |
|---|---:|
| skills | 19,587 |
| commands | 8,421 |
| rules | 1,081 |
| agents | 1,692 |
| total | 30,781 |

### Observed Usage

- `history.jsonl`: 1,504 records、2026-02-08 から 2026-07-19。
- custom commands 60件中、明示的な利用を確認できたものは9件。
- 明示利用0の51 commands は合計7,225行。
- 利用を確認できた commands:
  - `/plan`
  - `/shape-task`
  - `/refactor-clean`
  - `/worktree-start`
  - `/model-route`
  - `/research`
  - `/evolve`
  - `/learn`
  - `/skill-create`
- skills の明示 slash 利用は一部に限られるが、自然言語による自動発火は現行 telemetry では信頼して判定できない。

したがって、明示利用0は「退役候補」のシグナルには使えるが、単独で削除理由にはしない。

### Hook Output Amplification

39 transcript、2,971 `hook_success` records の stdout + stderr は約13,938,413 chars だった。

主因は PostToolUse edit hooks である。`post-edit-format.js`, `post-edit-typecheck.js`, `post-edit-console-warn.js` が同じ raw stdin JSON をそれぞれ stdout に返し、353 edit events で約11.63M chars を重複させていた。

再現結果:

- no-op の `post-edit-format.js`: exit 0、stdout は入力と完全一致。
- disabled profile の `run-with-flags.js`: exit 0、stdout は入力と完全一致。
- `auto-tmux-dev.js`: current hook protocol の `hookSpecificOutput.updatedInput` ではなく、変更後の入力全体を返す。
- `run-with-flags-shell.sh`: `${CLAUDE_PLUGIN_ROOT}` 未定義時に `set -u` で exit 1。

no-op hook は stdout を空にし、tool input を変更する hook だけが current protocol の structured output を返すべきである。診断は長さを制限した stderr に出す。

### SQLite Telemetry Failure

既存 `telemetry.db` の `session_runs` には `repo_root`, `project_id` がない。一方、`scripts/lib/session-trace.js` は両 column を前提に query する。

- `schema_meta` は version 2。
- `CREATE TABLE IF NOT EXISTS` だけで、既存 table に対する `ALTER TABLE` migration がない。
- DB error は `withDatabase` で握り潰され、caller には `null` が返る。
- persisted `session_runs` と `session_events` は2026-04-17付近で停止している。
- `task_runs`, `tool_executions`, `verification_results` は0件。
- fresh DB のみを使う test は通るが、旧 schema migration は検証していない。

この状態では SQLite を runtime source of truth と扱えず、health / triage / usage based pruning の判断も信頼できない。

### Skill Stocktake Failure

`skills/skill-stocktake/scripts/scan.sh` には次の問題がある。

- `find "$dir" -name "*.md"` により、reference docs と README まで skill として数える。
- `$HOME/.claude/observations.jsonl` を利用ログとして参照するが、その file は存在しない。
- 現行 transcript / SQLite / actual activation telemetry を使っていない。
- 削除済み skill と参照切れを判定しない。

監査時には113件を skill と誤認し、全件 usage 0 と表示した。実数は66 directory の `SKILL.md` と3 symlink である。

### Skill Classification

全66件の分類結果:

| Verdict | Count | Meaning |
|---|---:|---|
| Keep | 10 | 現状のまま残せる |
| Improve | 17 | scope / instructions / implementation を改善する |
| Update | 17 | API、version、security、framework guidance を更新する |
| Retire | 11 | 固有価値がなく、正本と重複または危険 |
| Merge | 11 | command または別 skill に固有部分だけ統合する |

高信頼の Retire 候補:

- `project-guidelines-example`
- `coding-standards`
- `eval-harness`
- `plankton-code-quality`
- `visa-doc-translate`
- `agentic-engineering`
- legacy `continuous-learning`
- `verification-loop`
- `ai-first-engineering`
- `coding-agent-lifecycle-guardrails`
- `configure-ecc`

高信頼の Merge 候補:

- `langgraph` -> `langchain-architecture`
- `postgres-patterns` -> `supabase-postgres-best-practices`
- `enterprise-agent-ops`, `autonomous-loops`, `ralphinho-rfc-pipeline` -> `continuous-agent-loop`
- `prompt-engineering-patterns` -> `/prompt-optimize`
- `post-commit-asset-capture` -> command surface
- `pre-plan-research`, `search-first` -> `/research`
- `tdd-workflow` -> `/tdd`
- `worktree-execution` -> `/worktree-start`

依存解除前に Retire してはいけない例:

- `continuous-learning-v2`: active hook 参照がある。先に hook と telemetry を修復または置換する。
- `strategic-compact`: active hook 参照がある。実装場所と説明の drift を解消する。
- `security-review`: agents / rules / feature pipeline の依存先。誤った security examples を更新する。

### Lifecycle And Policy Drift

同じ lifecycle が複数レイヤーで異なる形に定義されている。

- `CLAUDE.md`: `trivial`, `standard`, `heavy-risky` の track-based artifact chain。
- `AGENTS.md`: すべての non-trivial work に research, approved plan, review, verification を要求。
- `commands/plan-task.md` など: Superpowers を default と表現。
- `rules/common/development-workflow.md`: planner agent、GitHub search、Exa を広く要求。
- `rules/common/testing.md`: 一律80% coverage、unit / integration / E2E を要求。
- `rules/common/agents.md`: planner / tdd / reviewer と並列 agent を広く要求。

正本は `CLAUDE.md` とし、`AGENTS.md` は Codex runtime bridge と pointer、commands は entrypoint、rules は狭い invariant に限定する必要がある。

### Artifact Routing Drift

- `README.md`: task artifacts は `plan/<task-name>/`、root へ置かない。
- `scripts/lib/task-artifacts.js`: root の `research.md`, `plan.md`, `progress.md` などだけを読む。
- root artifacts は別 session から更新され、task identity が衝突している。

今回の成果物は `plan/harness-simplification/` に隔離する。artifact resolver は active task identity を明示的に受け取り、task-scoped path を優先し、root fallback を移行期間だけ読む設計が必要である。

### Broken References

確認できた代表例:

- `AGENTS.md` -> 削除済み `docs/codex-operations-runbook.md`
- `AGENTS.md` -> 削除済み `docs/codex-telemetry-bridge.md`
- `CLAUDE.md` -> 削除済み `docs/superpowers-adoption.md`
- `README.md` -> 削除済み `docs/github-sync.md`
- `commands/sync-global.md` -> 削除済み `install.sh`
- rules -> 存在しない `build-error-resolver`, `django-security`, Swift skills

現在の Markdown validation はこれらを検出できない。

### Test Signal Problems

- baseline `npm test` は通るが、PostToolUse hook が raw stdin を stdout に返すことを明示的に assertion している。
- session trace test は fresh DB のみを検証し、旧 schema migration を検証しない。
- standard `npm test` は optional skill validator を含まない。
- skill validator は空の `skills/learned/` を error として失敗する。

テスト成功数より、外部契約、migration、runtime discovery boundary の検証を優先する必要がある。

## Approaches Considered

### A. Staged Reduction

1. Hook と telemetry の信頼性を直す。
2. lifecycle と artifact routing の正本を統一する。
3. 未使用候補を runtime discovery 外へ隔離する。
4. 実 session で観測する。
5. 参照切れがなく、復帰要求もない対象を削除する。

利点: 誤削除を避けつつ、最も大きい runtime cost から減らせる。
欠点: 最終削除まで observation window が必要。

### B. Core Reset

利用実績がある資産と必須依存だけを残し、それ以外を一括隔離する。

利点: runtime surface を最短で縮小できる。
欠点: 現行 telemetry では暗黙発火を観測できず、稀な用途を失うリスクが高い。

### C. Governance-Only Cleanup

docs / rules / links の矛盾だけ直し、commands / skills / agents は残す。

利点: capability loss がほぼない。
欠点: runtime discovery cost と見通しの悪さが残る。

## Decision

2026-08-11、ユーザーは A. Staged Reduction を承認した。

優先順位:

1. active runtime waste を止める。
2. measurement を信頼可能にする。
3. canonical lifecycle と artifact routing を揃える。
4. dependency-aware quarantine を行う。
5. observation 後に delete / merge / update を確定する。

## Non-Goals

- この改善作業で新しい agent framework や第二の lifecycle を導入しない。
- ECC の機能を網羅的に保存しない。
- 明示利用0だけを根拠に即時削除しない。
- `settings.json` のユーザー変更である `model` / `tui` を変更しない。
- telemetry、history、plugin manager state を破壊的に削除しない。
- commit / push は明示承認なしに行わない。
- 同時進行中の `docs/superpowers/specs/2026-08-11-test-suite-pruning-design.md` を変更しない。

## Risks

- Hook stdout contract を直すと、誤った passthrough を前提にする既存 tests が多数失敗する。
- SQLite migration が既存 local DB を変更するため、transaction と backup / rollback strategy が必要。
- skill の暗黙発火は短い observation window では検出できない可能性がある。
- command / skill / agent の移動は内部参照を壊す可能性がある。
- task-scoped artifact routing は session hooks と pipeline runner の両方に影響する。

## Guardrail Candidates

- `Git ignored` と `runtime disabled` を同一視しない validator。
- Markdown / command / skill / agent の local reference validator。
- 旧 SQLite schema からの migration fixture test。
- no-op hook の stdout が空であることを検証する protocol test。
- lifecycle rule が `CLAUDE.md` 以外で default flow を再定義していないかを検出する audit。
