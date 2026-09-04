# SQLite を撤去する

日付: 2026-08-20

`2026-08-18-json-logs-retire-sqlite.md` の Phase 4。

## Objective

`telemetry/telemetry.db`（144MB）への書き込みを止め、`session-trace.js` の DB 層を撤去する。
再生成できない履歴だけを git 追跡下の JSON に書き出してから外す。

## なぜ今これか

Phase 3 の結果、**全テーブルが write-only になった。** 実測（2026-08-20）:

| テーブル | 行数 | 残った参照 |
|---|---|---|
| `session_events` | 53,672 | INSERT と、UPSERT を支える内部 SELECT のみ |
| `tool_executions` | 39,062 | 無し（Phase 1 で書き手も撤去） |
| `memory_episodic` | 4,293 | **コード上の参照が0件**（Phase 1 で INSERT 撤去） |
| `verification_results` | 247 | INSERT のみ |
| `session_runs` | 58 | INSERT/UPSERT のみ |
| `task_runs` | 29 | INSERT/UPSERT のみ |
| `review_findings` | 21 | INSERT のみ |
| `run_state` | 17 | `getLatestRunState`（下記の測定で無価値と確定） |
| `memory_semantic` / `memory_procedural` / `tactic_candidates` / `tactic_adoptions` | **0** | 無し |

フック呼び出しのたびに書き、剪定は無く、誰も読まない。

**`run_state` の読み手も無価値だった。** design doc が Phase 4 の入口と定めた測定を実施した。
成果物3種が揃ったリポジトリで `formatResumeState`（SQLite）と `buildArtifactContext`（成果物ファイル）を
並べた結果:

- SQLite 側の非空フィールドは**すべて** `buildArtifactContext` にも含まれる
- `current_phase` `current_step` `next_action` `blockers` `delegated_work` は空
  （`progress.md` 撤去後は埋まらない）
- `final_status=blocked_before_plan` は `plan.md` 撤去後の構造的な定数
- `buildArtifactContext` にしか無いものが2つある: `next_required_action`、`detail=/chain-status`

つまり `run_state` は**成果物ファイルの劣化コピー**だった。「ゲート有無だけ足している」という
Phase 3 の推定は SQLite 側に有利すぎた。

## Non-goals

- **`plan.md` 問題は直さない。** 上の測定で、`buildArtifactContext` が全セッションに
  `next_required_action=create plan.md` と `blocked=missing plan.md` を注入していることが
  判明した（`plan.md` は 2026-08-17 撤去済み）。`buildLifecycleState` の chain 構造に触るため
  別タスク。**Phase 4 はこれを悪化させる**（run_state が消えると成果物側だけが残る）ので
  Open Issues に明記する
- `metrics/` `sessions/` `session-env/` `file-history/` は対象外
- ログの保持期間ポリシーは決めない
- **DB ファイル自体は削除しない。** コードを外して orphan にする。削除の判断はユーザーに残す
- 新しい読み手を作らない。ロールアップは一度書いて置くだけのアーカイブ

## 触る対象

| 対象 | 変更内容 | 壊す可能性のあるもの |
|---|---|---|
| `scripts/export-telemetry-archive.js`（新設） | DB を JSON に書き出す。**撤去より先に実行する** | 出力先が `runs/_archive/`（git 追跡） |
| `scripts/hooks/session-start.js` | `getLatestRunState` / `formatResumeState` / `isRunStateStale` の使用をやめる | **契約: 復帰時に注入される文言**。`buildArtifactContext` 単独になる |
| `scripts/hooks/runtime-session-start.js` | 同上。`|| getLatestRunState()` の cross-repo フォールバックもここで消える | codex bridge の復帰 |
| `scripts/hooks/session-end.js` / `session-end-marker.js` / `runtime-session-end.js` | `recordSessionEvent` / `recordLifecycleSnapshot` の呼び出しを撤去 | フックの残りの責務（要約抽出）は残す |
| `scripts/hooks/command-telemetry.js` | 記録先が消えるので**フックごと撤去** | `settings.json` の UserPromptSubmit 配線 |
| `scripts/pipeline-runner.js` / `scripts/task-queue.js` | `recordSessionEvent` / `recordTaskRun` の呼び出しを撤去 | pipeline の evidence は `runs/run-*/` 側に既にある |
| `scripts/lib/session-trace.js` | **ファイルごと撤去**（1,300行超） | 読み手6箇所。`getRunId` は別モジュールへ移す |
| **契約: `getRunId`** | `session-trace.js` から出す。6ファイルが使う | run id の生成規則は変えない |
| `settings.json` | `command-telemetry` の配線を外す | セッション開始時に読まれる |
| `docs/architecture.md` | 「状態」層の記述。**最古トランスクリプトを 2026-07-23 → 2026-07-07 に訂正** | 実測値 |

## 却下した案

- **DB を残して書き込みだけ止める** — 読み手のいないストアを残すことになり、144MB も残る。
  「読み手のいないストアを作らない」に反する
- **`telemetry/` にロールアップを置く** — `.gitignore:33` が `telemetry/` を丸ごと除外している。
  マシンを失えば消える。**証拠が gitignore で消えるのは、この一連の変更が直した欠陥そのもの**
- **ロールアップを作らずに撤去** — `tool_executions` 39,062行のうち **16,977行（43.5%）**、
  `session_events` 53,672行のうち **21,109行**が、トランスクリプト保持期間（最古 2026-07-07）より古い。
  再生成できない
- **全行を verbatim で git に入れる** — 93,000行。`tool_executions` と `session_events` だけ
  日次×種別の集計にし、残りは verbatim にする。**集計にするのはサイズが理由で、
  信号の質はトランスクリプトの方が高い**（Table 3 の教訓は生トレースが残る側に効く）
- **`getRunId` を残すために `session-trace.js` を残す** — 1,300行を関数1本のために残すことになる
- **各フックの記録先を `runs/` に付け替える** — 読み手がいないものを移すだけ。
  必要になった時に、その時の読み手に合わせて作る

## Open Issues

- **Phase 4 は `plan.md` 問題を露出させる。** `run_state` が消えると復帰時の注入は
  `buildArtifactContext` 単独になり、`create plan.md` / `missing plan.md` だけが残る。
  撤去済み成果物の作成を全セッションで指示し続ける状態。**次タスクの最優先**
- `memory_episodic` は 4,293行だが distinct な summary は **17個**（15 run 分）。
  同一状態の反復なので dedup して verbatim で残す
- `verification_results` 247行のうち95行が `run_id = test-session-abc12345`（テスト由来）。
  アーカイブに印を付けて分離するが、実 DB に書いた経路は未特定のまま（**推定**: `tests/lib/utils.test.js`）
- ロールアップには読み手が無い。`runs/<id>/evidence/` と同じ「必要な時に引く記録」として置く。
  **これが唯一の write-only な追加**であることは認識している
- DB ファイル（144MB + WAL）は残る。削除はユーザーの判断
