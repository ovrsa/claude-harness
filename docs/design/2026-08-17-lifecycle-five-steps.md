# ライフサイクルを5段にし plan.md / progress.md を撤去する

## Objective

文書が書いていたライフサイクルを、実測した挙動に合わせる。ブロックするゲートを
`main` への `git push` の1つだけにし、文書がそう書く。

## なぜ今これか

尋問で、文書と実態の乖離が3つ出た。いずれも測定で確定している。

**1. `plan.md` は人間が書いていなかった。** ルート `plan.md` への書き込みは `Write` 88件 +
`Edit` 138件、12セッション。すべて `tool_executions` の記録＝エージェントのツール呼び出しで、
人間がエディタで書いたものは1件も現れない。`Write` が88件ある以上、人間が作ってエージェントが
直すだけの形でもない。にもかかわらず `docs/how-to/run-a-task.md` は執筆を「人間の仕事4つ」の
2番目として書いていた。

**2. 完了ゲートは一度も発火していなかった。** `hooks/lifecycle-progress-complete.js:174` は
書き込み先が `<repo>/progress.md` でなければ即 `exit(0)`。そして `progress.md` を新規作成する
コードはハーネス内に存在しなかった（`updateProgressManagedSection` は不在時に `return false`）。
`plan.md` の検査はこのゲートの内側にしか無かったので、`progress.md` が無ければ `plan.md` も
要求されない。`CLAUDE.md` は「declaring a task complete → **blocked**」と無条件に読める形で
書いていた。**フックがブロックすることは確認していたが、いつ発火するかを確認していなかった。**

**3. コミット時の証拠助言も沈黙していた。** `hooks/lifecycle-pre-commit.js` の
verify / review / observe の助言は、全体が `if (!exists(plan.md)) {...} else { ... }` の
`else` 節に入っていた。`plan.md` の無い30/42セッションでは一度も出ていない。

加えて `hooks/README.md` は7項目を「blocked」と書いていたが、どれも助言だった。
`commands/verify.md` は coverage 80% を目標に掲げていたが、`c8`/`nyc` も coverage script も
存在しない。

## Non-goals

- **`buildLifecycleState`（`scripts/lib/task-artifacts.js`）の状態モデルは変えない。**
  chain の重み判定（`reviewRequired` / `observeRequired` / `nonTrivial`）が `plan.md` の
  frontmatter 由来なので、ここを変えると `session-trace.js` の `deriveRunStatus`
  （`blocked_before_plan` などのステータス値）とテスト約195箇所に波及する
- **compaction 用の状態要約の仕組みを作り直さない。** 下記の通り諦める
- パーサ（`parsePlanState` / `parseProgressState`）は残す。`pipeline-runner.js` と
  `session-trace.js` が使っている
- スキルの整理はしない

## 決定

ライフサイクルの骨格を5段にする。段の一覧の正本は `commands/COMMANDS.md` の Ordered Path。

```
1 決める     /grill-me（診断もここ。read-only、捨てられる）
2 残す       /docs-build -> docs/design/（実装の入力）
3 書く       worktree + skills/tdd（seam 合意 -> RED -> 最小 GREEN）
4 確かめる   refactor はここ。/verify -> /review-task -> /eval
5 確定させる 判明した触る対象と Open Issues を design doc に降ろす
```

**design doc は出力ではなく入力にした。** `commands/docs-build.md` 自身の表によれば
Grill Record 10項目のうち実装後にしか分からないのは `触る対象` だけで、残りは尋問で確定する。
後回しにすると compaction で失われる — 2026-08-17 に `HARNESS.md` の Design Principles
9項目を実際に失った（`plan.md` に「`docs/design/` へ移す」と書いてあったのに移さず削除した）。

修正タスクの例外は狭めた。従来の「実装後にしか書けない回がある」は**診断と実装を混同**していた。
診断は read-only で `/grill-me` 側なので、診断が終われば実装前に書ける。実装後まで待つのは
「実装してみて初めて原因が分かった回」だけ。

**ブロックは1箇所だけにした。** ブロックを主張する文書の行は、実装しているフックを
名指ししなければならない。`scripts/ci/audit-harness-contract.js` の
`blocking-gate-unnamed` が検査し、名指ししたフックが存在して `settings.json` に配線されて
いるかまで確認する。導入時にこの検査は3件で落ちた（RED を確認済み）。

**重み判定の信号を linked worktree に移した。** `plan.md` の frontmatter が消えたので、
`task_type` / `worktree_required` / `track` は読めない。worktree policy が
standard / heavy-risky で worktree を作ると定めているので条件が一致し、しかも
**ファイルを書くことで満たせない**。

## 却下した案

| 案 | 却下の理由 |
|---|---|
| 文書だけ直してフックを残す | `progress.md` を誰かが作った瞬間に死んだゲートが復活し、「plan は不要」と書いた文書と矛盾する |
| 337箇所すべて撤去（パーサごと） | 状態モデルの再設計になり、`deriveRunStatus` とテスト195箇所に波及する。今回の目的に不相応 |
| `progress.md` をチェックポイント専用で残す | ライフサイクルから外したものが残り、「撤去した」という記述と実体が再びずれる |
| `run_state` を本当のソースにする | フックはエージェントの認識にアクセスできずリポジトリの成果物しか見えないので、要約の供給元を新設する必要がある。別タスク |
| プラグイン経由で upstream skills を18本入れる | 使わない10本が自動選択の対象になり、`~/.claude` の git 差分から消えて「ローカル制御層から観測可能」を満たせない（`code-review` 1本だけ `npx skills` で追加した） |

## 触る対象

契約が変わったもの:

- `CLAUDE.md` の `Where The Lifecycle Is Enforced` — 2ブロックから1ブロックへ
- `commands/COMMANDS.md` の Ordered Path — 段の意味が変わる（段5が入力になる）
- `templates/verification-summary-template.md` — `RED Evidence` 節が必須になった
  （`scripts/ci/validate-artifact-templates.js` が検査する）
- `hooks/lifecycle-pre-edit.js` / `lifecycle-pre-commit.js` — 発火条件が
  「`plan.md` の frontmatter」から「linked worktree か」に変わった

撤去したもの: `hooks/lifecycle-progress-complete.js`、`templates/plan-template.md`、
`templates/progress-template.md`、`writeProgressCheckpoint`、`writeProgressDelegatedHandoff`、
`updateProgressManagedSection`、`isPipelineEvidenceRequired`。
撤去時点で後者4つの呼び出し元はテストだけで、テストが本番から到達しないコードを緑に保っていた。

## 数字

- テスト 1,324 → 1,303。差の21件はすべて撤去した挙動のテスト（内訳: フック助言16、
  progress 書き込み5）。それ以外の減少はない
- ブロックするフック: 2 → 1（`hooks/*.js` で `process.exit(2)` を持つのは
  `git-push-guard.js` のみ、`settings.json` に配線済み）
- 監査の検査項目: 10 → 12

## 許容したリスク・負債

**compaction を跨ぐ状態の要約は失われる。** これが最大の負債で、明示的に受け入れた。

依存の向きが文書と逆だったことが判明した — `run_state.current_phase` / `next_action` /
`blockers_json` は `parseProgressState(progress.md)` から埋まっていた
（`task-artifacts.js:609` → `session-trace.js:753`）。**SQLite は保存先で、ソースは
`progress.md` だった。** `CLAUDE.md` の「SQLite is the runtime source of truth for current run
state and resume hints」はこの点で誤りだった。

`progress.md` を撤去するとフックには書ける内容が無い。復帰の根拠は git（ブランチ・log・diff）と
`docs/design/` の最新の1枚に移した。**compaction の前にコミットする**必要がある。
実際に使われていたのは17/42セッションなので損失は限定的だが、ゼロではない。

**状態モデルに `plan` / `progress` の段が残っている。** `buildLifecycleState` は
`plan.md` / `progress.md` を chain の段として持ち続け、その結果 `harness-status` /
`chain-status` / `telemetry-health` も vestigial な段を報告し得る。Non-goals の通り触っていない。

## Open Issues

- `buildLifecycleState` の chain から plan / progress の段を外すか（波及195箇所。別タスク）
- `validate-skills.js` が `skills/learned/ - Missing SKILL.md` で落ちる（2026-08-10 の
  `dd819b0` 以来の既存。`test:optional` にあるので `npm test` は落ちない）。
  `guardrail-candidates-format.md` は `templates/` へ移すのが筋（推定）
- `scripts/lib/pipeline-evidence.js` の `sortTime` 未使用 lint エラー（本作業前から存在）
- `skillOverrides` に足した `code-review` の反映は次の新規セッションでしか確認できない
- コマンドの起動はテレメトリに記録されないので、コマンドの使用実績を測れない
  （スキルは `Skill` ツールとして記録される）。`COMMANDS.md` に未記載の23本の
  書く/消す判断がこれで止まっている
