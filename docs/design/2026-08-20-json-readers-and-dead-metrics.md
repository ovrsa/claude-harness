# 読み手を JSON に向け、到達不能な指標を撤去する

日付: 2026-08-20

`2026-08-18-json-logs-retire-sqlite.md` の Phase 3 本体。

## Objective

SQLite を読む残り4箇所を、生きた信号だけ JSON へ向け直し、到達不能・恒久ゼロの指標は移植せず撤去する。

## なぜ今これか

Phase 3 を「読み先を JSON へ」と書いたが、読んでいる列を実測すると大半が既に死んでいた。
移植すれば死んだ指標を新しい基盤で再生産することになり、design doc の却下した案
「要約だけを JSON にする」と同じ誤りになる。

実測（`telemetry.db`、2026-08-20）:

| 読み手 | 読む対象 | 実測 | 判定 |
|---|---|---|---|
| `summarizeTraceStatus` の token KPI | `token_usage_observed` | 3,113件**すべて** `status='missing'` / `input_tokens=null` | 移す（JSON にしか実値が無い） |
| 同上 | トランスクリプトの `message.usage` | 17,521件に実値。input 1.64M / output 21.2M / cache read 3.69B、6モデル | — |
| `eval-aggregates.computeSuccessRate` | `final_status='completed_clean'` | 全履歴で1件（2026-04-17）。`planStatus==='missing'` が先に return するため plan.md 撤去（2026-08-17）以降**到達不能** | 撤去 |
| `eval-aggregates.pipelineEventCounts` | `pipeline_*` / `engine_adapter_*` | `pipeline_*` は0件。`engine_adapter_*` は2026-04のみ（56件） | 撤去 |
| `telemetry-health` の manual-bridge 検出器 | `bridge_mode='manual'` / `plan_present=1` かつ tool 0件 | `bridge_mode=manual` は**一度も**記録されていない。`plan_present=1` は撤去済み。`tool_executions` は Phase 1 で停止したので tool 0件は今後**常に真** | 撤去 |
| `harness-status.summarizeRuntime` | `run_state.next_action` | 非空6件すべて 2026-08-17T06:55 以前（`progress.md` 由来）。以降の5行はすべて空 | 撤去 |
| `eval-aggregates.findingsHistogram` | `review_findings.severity` | 19件、全部 `INFO` | 移す（`evidence/review.json` に本文がある） |
| `telemetry-health` の `high_session_turn_count` | `human_intervention_count` | `session-end.js:226` = `userMessages.length - 1` | ~~移す~~ → **撤去**（下記「実装中に判明したこと」） |
| `telemetry-health` の `resume_failed` | `session_started` の metadata | 12件（Phase 3 第1弾で 382件から削減） | 移す（`runs/*/logs/events.ndjson` へ） |

`tool_executions` は Phase 1 で書き手を止めたので、それを 0 と比較する条件は今後すべて真になる。
撤去した部分系に依存する条件を残すと、真偽が反転して発火し続ける。
`session_level_observability_only` は「ゲートが3つ揃った run」で発火する状態にあり、意味が逆になっている。

## Non-goals

- `task-artifacts.js` の `buildLifecycleState` は触らない（2026-08-17 に決めた境界）
- `session-trace.js` の DB 層そのものは撤去しない。Phase 4 の範囲
- `final_status` の算出ロジック（`computeFinalStatus`）は直さない。`completed_clean` を到達可能に
  戻すのは plan.md 撤去の後始末であって、この回の目的ではない。**指標側を撤去して事実に合わせる**
- 保持期間ポリシーは決めない
- トークン単価表を持たない。`estimated_cost_usd` は復活させず、トークン数のみ報告する

## 触る対象

| 対象 | 変更内容 | 壊す可能性のあるもの |
|---|---|---|
| `scripts/lib/transcript-log.js` | `tokenUsage()` を追加。`message.usage` を model 別に集計 | 既存 `toolFailureRate` の窓計算を共有する |
| `scripts/lib/run-log.js`（新設） | `runs/` を読む。gate presence・resume 成否・turn count を返す | `run-record.js` の書き形 |
| `scripts/lib/eval-aggregates.js` | `computeSuccessRate` / `pipelineEventCounts` / `SUCCESS_FINAL_STATUSES` / `FAIL_FINAL_STATUSES` を撤去。`findingsHistogram` を `evidence/review.json` 読みに | **契約: `/eval-batch` の出力キー `successRate` / `pipelineEvents` が消える** |
| `scripts/lib/telemetry-health.js` | manual-bridge 検出器を撤去。残る2つを `run-log` / `transcript-log` 読みに | `/health-status` の候補数 |
| `scripts/lib/harness-status.js` | `summarizeRuntime` の `sqlite3` 呼び出しを撤去し、`runs/` 読みに | **契約: `summary.runtime.state` の形。`nextAction` が常に空だったので `/next-action` の実挙動は変わらない** |
| `scripts/lib/session-trace.js` | `summarizeTraceStatus` の token KPI を transcript 由来に。`estimated_cost_usd` を落とす | **契約: `/trace-status` の出力行** |
| `scripts/hooks/cost-tracker.js` | `token_usage_observed` の記録をやめる | 3,113件の null を積む唯一の書き手 |
| `docs/architecture.md` | 状態の置き場所。Phase 3 の着地時点の事実に合わせる | 先に書かない |

## 却下した案

- **`completed_clean` を到達可能に直してから移植する** — plan.md 撤去の後始末であってこの回の目的ではない。
  成功率が要るなら定義から作り直すべきで、`planStatus` を経由する現行式を延命する理由が無い
- **トークン単価表を持って `estimated_cost_usd` を復活させる** — 単価は doc に書けない値（変わる）。
  6モデル分の単価を harness に持たせると維持義務が増える。トークン数だけ出す
- **死んだ指標も形だけ JSON へ移す** — 出力キーを守るために中身が空の指標を残すのは、
  「読み手のいないストアを作らない」に反する。キーごと落として利用側を直す
- **`cost-tracker.js` を残して transcript 由来の値を書き込む** — 二重記録に戻る。読み手が transcript を直接読む

## 実装中に判明したこと

- **`high_session_turn_count` は注入されたターンを数えていた。** 全269トランスクリプトで
  `type: 'user'` 1,818件のうち542件（30%）が `<task-notification>` / `<local-command-stdout>` /
  compact 継続プロンプト / `isMeta`。あるセッションでは 151 → 121 turns（3.25倍の過大計上）。
  ターン数と名付け直した 2026-08-19 の判断はまだ甘く、**「ターン」ですらなかった**。
  `turns`（人が書いた散文）と `commands`（スラッシュコマンド）に分離した
- **その `high_session_turn_count` を撤去した（当初計画は「移す」）。** 移した後に実データで
  観測したら候補が 51 → **98件に増え**、`/health-status` の全127件中98件を占めた。分布は
  245セッションで中央値1ターン・p75=2・p90=7・max 128。**閾値2では全セッションの40%が発火**する。
  長いセッションは長いセッションであって障害ではない。残る検出器は `resume_failed` 1本で、
  これは実際の不具合（状態があったのに復元しなかった）を指す
- **`reviewSeverityHistogram` の histogram だけ prototype 汚染に対して無防備だった。**
  `severity` は `evidence/review.json`（ディスク上のファイル）から読み戻すので
  `REVIEW_FINDING_PATTERN` の制約が効かない。`.toUpperCase()` が `__proto__` を `__PROTO__` に
  変えていたため**偶然守られていた**。`Object.create(null)` に直した
- **`inWindow`（半開区間 `[start, end)`）が2箇所にあった。** `aggregateAll` は同じ窓オブジェクトで
  両方を呼ぶので、片方だけ包含区間に変えられると1つのレポート内で
  「run は数えたがそのツール呼び出しは数えなかった」が起きる。`log-window.js` に集約した
- **`cost-tracker.js` を撤去した（当初計画は SQLite 書き込みの停止のみ）。** `costs.jsonl` も
  2026-05-15 以降 3,120行すべて `input_tokens=null` / `token_source='missing'` で、
  `session_id` は最初から最後まで `"default"`（`getRuntimeSessionId` が解決していない）。
  ハードコードされた価格表 `estimateCost` は一度も数値を出していない。読み手は自身のテストだけ
- **`time_to_verified_completion_minutes` を新規に入れかけて落とした。** `meta.started_at` は
  run 記録の作成時刻で、記録は最初のゲート発火時に作られる。実測2件で `started_at` と
  全 `captured_at` が1ミリ秒以内。**恒久ゼロの指標を撤去している最中に恒久ゼロの指標を
  入れることになる**ので撤去した。真のタスク開始時刻は誰も記録していない（worktree は
  セッション途中で作られるので、セッション開始も最初のトランスクリプト行も目印にならない）
- **`<synthetic>` model は usage を持つが全48件でトークン0。** 集計から除く必要は無い（Open Issue 解決）
- **`getCandidateProvenance` が `telemetry:` 接頭辞だけを見ていた。** source を `runs:` /
  `transcript:` に変えたら provenance が `artifact` に落ちた。3つとも「計測されたもの」なので
  同じ分類にした
- **説明コメントを検査するテストを2回書いた。** 「`sqlite3` を含まない」「`session-trace` を
  含まない」は、撤去理由を書いたコメント自身を弾く。呼び出し（`spawnSync('sqlite3'`、
  `require(...session-trace`）を検査する形に直した

## Open Issues

- `session_events` / `session_runs` / `run_state` / `review_findings` の**書き手**はこの回では止めない。
  読み手を外してから Phase 4 で書き手ごと落とす。その間 DB は書かれるが報告系は誰も読まない
- **`getLatestRunState` が唯一残った読み手。** `session-start.js` / `runtime-session-start.js` の
  セッション復帰経路。`next_action` と `current_phase` は 2026-08-17 以降すべて空なので、
  この行が `buildArtifactContext` に足している情報はゲート有無だけ、という**推定**が立つが、
  成果物が揃った状態で比較していない（測定時どちらも `stale` / `null` だった）。Phase 4 の入口
- `run-log.js` は `runs/` を全走査する。現在3ディレクトリなので実害は無いが、
  件数が増えたら `meta.json` の `started_at` で早期に切る必要がある（**推定**）
- `runtime-session-start.js:21` の `getLatestRunState({ repoRoot }) || getLatestRunState()` は
  `session-start.js` が契約違反として撤去した書き方のまま残っている。今回もスコープ外
