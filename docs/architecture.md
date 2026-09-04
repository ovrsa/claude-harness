# ハーネス構成

**今どうなっているか**だけを置く1枚。なぜそうなったかは `docs/design/` に日付順で残っている。
トラック・成果物・Git 規約・doc 規約は `CLAUDE.md` と `rules/`。

最終更新: 2026-08-20

## 層と所有

| 層 | 実体 | 持つもの |
|---|---|---|
| 入口 | `CLAUDE.md` | 常時ロードされる不変則。トラック選択と完了条件 |
| 強制 | `hooks/` `scripts/hooks/` | 保護ブランチ push のブロック。許可境界。他は助言 |
| トレース | `projects/**/*.jsonl` | ツール呼び出しと結果の生ログ。Claude Code が書く。harness は読むだけ |
| 証拠 | `runs/<date>-<slug>/` | ゲートの証拠本文、resume の成否、task↔session↔branch の結合。git 追跡。**状態と履歴はここと生ログの2つだけ**（2026-08-20 に SQLite を撤去） |
| 成果物 | `templates/` | 成果物の構造と各ゲートの契約 |
| 入口（コマンド） | `commands/` | 手順の入口。`commands/COMMANDS.md` は要約であって置き換えではない |
| リポジトリ地図 | 各リポジトリの `AGENTS.md` | 向き先の案内のみ。ライフサイクルを再定義しない |
| アダプタ | `~/.codex` ほか | `~/.claude` を消費する。ワークフローを継承し再定義しない |

`~/.claude` が制御レイヤの正本。ミラー・アーカイブ・プラグイン・upstream リポジトリは参照層または配布層であって、
ライフサイクルの権威ではない。

## 流れ

段の一覧は `commands/COMMANDS.md` の Ordered Path が正本。ここでは複製しない。

構造として効いているのは2点だけ。

- **調査と `/grill-me` は read-only。** worktree はその後、最初の書き込みの直前に**エージェントが**作る
- **`docs/design/` は実装の入力。** 決定は `/grill-me` で確定するので、実装前に書く。
  実装後にしか書けないのは「実装してみて初めて原因が分かった回」だけ

`plan.md` と `progress.md` は 2026-08-17 に撤去した。承認は design doc に対して会話で与える。

## 実行経路は3層

同じ流れを3つの層で見る。混同すると「正規かフォールバックか」が決まらなくなる。

| 層 | 実体 | 役割 |
|---|---|---|
| ライフサイクル | `commands/COMMANDS.md` の Ordered Path | **何が起きなければならないか**。経路を問わない |
| 既定エンジン | `/execute-plan`（ローカルパイプライン） | 手順6〜10 を回す。standard / heavy-risky の既定 |
| 手動経路 | `/implement-task` `/review-task` | エンジンを使わない時の手順6・8 |

`/review-task` は手動経路の成果物生成コマンドであって、パイプラインを使う場合の既定ではない。

## 実際に止まる場所

**ブロックは1箇所だけ。** マシンの外に出る一点で止め、それ以外は助言に留める。

| 場所 | 挙動 |
|---|---|
| 編集時 | 助言のみ。`[Lifecycle Advisory]` が欠けている証拠を挙げて続行する |
| `git commit` | 助言のみ。コミットはチェックポイントであって完了宣言ではない |
| 完了宣言 | 助言のみ。証拠の連鎖を機械的に検査するものは無い |
| **`main`/`master` への `git push`** | **`hooks/git-push-guard.js` がブロックする** |
| worktree | 止めない。フックは検査しない。エージェントの既定の挙動で担保する |

push ブロックはリポジトリから対象ブランチを解決するので、`git push origin main` だけでなく
**main 上での引数なし `git push` も止まる**。プロファイルで無効化できない配線にしてある。

ブロックを主張する行は、実装しているフックを**名指ししなければならない**。
`scripts/ci/audit-harness-contract.js` が検査し、名指ししたフックが存在して `settings.json` に
配線されているかまで確認する。

2026-08-17 まで、この表は完了宣言を「ライフサイクル軸の唯一のブロック」として2つ目のブロックに
数えていた。`hooks/lifecycle-progress-complete.js` は書き込み先が `progress.md` でなければ即 exit し、
`progress.md` を作るコードはハーネス内に無かったので、**一度も発火しなかった**。
フックがブロックすることの確認と、いつ発火するかの確認は別物だった。フックは撤去した。

許可境界は `scripts/lib/permission-resolver.js` が持つ。`PermissionRequest` フック経由で
危険な Bash を deny、読み取り専用を allow、`ps` / `whoami` などを audit に分類する。
**分類の正本はコードであって文書ではない。**

## 未実施

これらは存在しない。あるように書かない。

- commit 前の `verification-summary.md` 強制（commit フックは助言のみ。ブロックは完了宣言側にある）
- worktree の強制（フックは検査しない）
- guardrail 候補の自動昇格
- 定期実行される改善
- repo-map の鮮度強制
- triage からの自動起票
- TypeScript パイプラインランナー

## 勝手に走るもの（フック）

- セッション開始 / 終了時にゲートの証拠を `runs/` へ退避（ツール呼び出しの記録は 2026-08-19 に撤去。
  Claude Code のトランスクリプトが同じものを書いており、そちらは `is_error` を実際に持つ）
- 編集・新規作成後の format / typecheck / quality-gate / console.log 検査（`Edit` と `Write` の両方）
- compaction 前に、どの証拠成果物が存在するかのスナップショット（状態の要約はしない）

長時間コマンドは `run_in_background` で扱う（tmux は使わない）。

## 状態をどの順で読むか

1. **git** — ブランチ・`git log`・`git diff`。実際に何が起きたかはここにしか無い
2. `docs/design/` の最新の1枚（決定された意図）
3. `verification-summary.md` / `review-summary.md` / `observation-summary.md`（どこまでゲートを通ったか）
4. `runs/<date>-<slug>/`（worktree を消した後も残る証拠本文。`runs-cli show` / `/trace-status`）
5. セッション一時ファイル（最後の手段）

**状態の要約を保存する仕組みは無い。** 2026-08-17 に諦めた。

それまでの実装は `progress.md` に checkpoint を書き、`run_state.current_phase` / `next_action` /
`blockers_json` はその `progress.md` を `parseProgressState` で読んで埋めていた
（`task-artifacts.js` の `buildLifecycleState` → `session-trace.js` の `upsertRunState`）。
つまり **SQLite は保存先で、ソースは `progress.md` だった。** 依存の向きが文書と逆で、
「SQLite が runtime source of truth」という記述はこの点で誤っていた。

`progress.md` を撤去すると、フックには書ける内容が無い（フックはエージェントの認識に
アクセスできず、リポジトリの成果物しか見えない）。要約を供給する仕組みを新設するより、
git と design doc から復帰する方を選んだ。`run_state` は 2026-08-20 に撤去した（成果物が揃った状態で
比較したところ、非空フィールドはすべて `buildArtifactContext` にも含まれ、後者にしか無い項目が2つあった）。
なお撤去時点で `run_state` の行は識別子と時刻として残っていたが、
`current_phase` などの叙述フィールドはもう埋まらない。

## 常時ロードされるもの

ここに置いたものは毎セッション無条件で読まれる。**ローカルの決定だけを置く。**
一般的ベストプラクティスは書かない（モデルが既に知っているうえ、ローカル規約と矛盾しうる）。

`CLAUDE.md` と `rules/common/` の4ファイル（`documentation` `performance` `worktree-policy` `git-workflow`）。
各ファイルが何を定めるかはそのファイル自身が正本なので、ここでは要約しない。
量は `wc -l rules/common/*.md` で見る（ここに数字を書くと必ず古くなる）。

**新規に自動選択から外す時は `settings.json` の `skillOverrides` を使う**（`SKILL.md` を編集しない）。
インストーラ管理下のスキルは編集が更新で失われる。詳細は `AGENTS.md` の Mistakes To Avoid。

## upstream スキルのレーン（Pocock 系）

本線とは別の、明示起動する道具立て。**編集しない**（upstream 由来）。一覧と upstream の所在は
`AGENTS.md` の Upstream Assets が正本。

`/grill-me` 以外はこのレーンの中で閉じており、上の流れには**接続されていない**。
`CONTEXT.md` + `docs/adr/` を前提にする点もローカル規約（`docs/design/`）とは別系統。

## Open Issues

- **リンクの向きが一様でない。** `skills/` の5件（`design-doc-mermaid` `python-code-style` `sql-code-review` `sql-optimization` `sql-optimization-patterns`）は実体が `~/.agents/skills/` 側にあり **git 管理外**。worktree ではダングリングする。別の7件は両側に実体があり、現時点で内容は一致しているが構造上いつでも乖離しうる
- **未起動スキルが残っている。** 起動実績があるのは13本（計測は2026-04-22〜08-15、`Skill` ツールの起動記録91件が母数）。ローカル作成分の判断が未着手
- **SQL スキル2本の内容が重複している。** `sql-optimization`(296行) と `sql-optimization-patterns`(499行)。両方 lock 管理下で、片方が `skillOverrides` で隠れているため自動選択の衝突は起きない
- **尋問系スキルとライフサイクルゲートが噛み合っていない。** `issue-framing` で要件整理をしても `/docs-build` の grilling ゲートは通らない。ゲートが認識するのは `grilling` だけ
- **並行セッションを検知する手段が無い。** 同一リポジトリで別の `claude` プロセスが走っていても互いに見えず、片方の編集がもう片方から出自不明の変更として現れる
- `tests/hooks/hooks.test.js`（5,581行）が高負荷時に断続的に停止する。停止位置は毎回異なり単体では再現しない。原因未特定
- **セッション `.tmp` の注入がリポジトリ横断。** `sessions/*-session.tmp` は全リポジトリ分が同じディレクトリに並ぶため、`session-start.js` の3番目のフォールバックは「最後に触ったプロジェクト」の会話要約を拾いうる
- **テスト由来のフィクスチャ行が実データに混入していた。** 撤去時の実測で `verification_results` 247行のうち113行、全 verbatim テーブルで135行が `run_id = test-session-abc12345`（`tests/lib/utils.test.js` のフィクスチャ値）。アーカイブでは `is_test_fixture` を立てて分離した。**実 DB に書いた経路は未特定のまま**
- **トランスクリプトの保持期間は Claude Code 側が決めており、harness は制御できない。** 実測で最古のレコードは **2026-07-07**（2026-08-20 に再測定。それまで「2026-07-23」と書いていたのは誤り）。それより古い期間の記録は `runs/_archive/telemetry-sqlite-2026-08-20.json` にしか無い
- **`telemetry.db` への書き込みを止め、`session-trace.js`（1,300行超）を撤去した**（2026-08-20）。撤去前に全テーブルが write-only だったことを確認し、97,399行を JSON アーカイブに書き出した（小さいテーブルは verbatim、`session_events` 53,672行と `tool_executions` 39,062行は日次集計。git に入れるサイズの都合で、信号の質はトランスクリプト側が上）。**DB ファイル 144MB は orphan として残る。削除は人が判断する**
- **`plan.md` 撤去の後始末を 2026-08-20 に完了した。** それまで `buildLifecycleState` のルーティング判断4つ（`review_required` / `observe_required` / `worktree_required` / `task_type`）はすべて `plan.md` の front matter 由来で、`plan.md` 撤去後は恒久的に `false` だった。結果 **review と observe のゲートは 2026-08-17 以降「not required by plan metadata」と報告し続け**、未解決の `CRITICAL` 指摘の検査（`hasBlockingFindings`）も到達不能だった。要否は `verification-summary.md` の有無から導出する形にした（実装して検証したなら後続のゲートを負う。read-only の調査は何も負わない）
- **`hasBlockingFindings` は severity を問わず全件をブロック扱いにしていた。** `INFO: 特になし` でも止まる定義で、到達不能だったため気づかれていなかった。`CRITICAL` と `HIGH` のみに絞った（2026-08-20）
- **NUL バイトを含むソースは grep に丸ごと無視される。** 2026-08-20 に自作の1ファイルで発生し、「SQLite 参照ゼロ」の検証が空振りしていた。grep はバイナリ判定したファイルに対しても「該当なし」と同じ exit 1 を返す。`scripts/ci/validate-text-sources.js` で機械的に止める
- **恒久的に定数を返していた指標を7件撤去した**（2026-08-20）。`final_status='completed_clean'`（`plan.md` 撤去で到達不能）、`pipeline_*`（記録0件）、`bridge_mode='manual'`（記録0件）、`run_state.next_action`（2026-08-17 以降すべて空）、`token_usage_observed`（3,113件すべて `null`）、`costs.jsonl`（3,120行すべて `null`）。**撤去済み部分系に依存する条件は真偽が反転して発火し続ける**（`session_level_observability_only` はゲートが3つ揃った run で発火していた）
- **`high_session_turn_count` は注入されたターンを数えていた。** 全269トランスクリプトで、`type: 'user'` の1,818件のうち542件（30%）が `<task-notification>` / `<local-command-stdout>` / compact 継続プロンプト / `isMeta`。あるセッションでは3.25倍の過大計上だった
- カバレッジは未計測。「80%」のような目標値を語れる状態ではない
