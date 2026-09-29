# Command Surface

This file groups the local `~/.claude/commands/` surface by role.

Use it as the fastest command map after `CLAUDE.md`. It does not replace the command docs themselves.

## Preferred Lifecycle Path

Use the local pipeline by default for standard and heavy-risky implementation and bug-fix work.

- `/next-action` as the operator-facing status surface for the current recommended next step
- `/shape-task` as the explicit task-shaping surface for rough intent before planning, routing, or execution
- `/route-task` as the explicit readonly routing surface for shaped tasks before execution or delegation
- `/grill-me` as the depth pass on a sharpened task before any file is written
- `/docs-build` for persistent reference docs; it extracts the Grill Record from the grilling session
- `/execute-plan` as the pipeline entrypoint when the work suits it
- `/verify` to capture local rerunnable evidence when needed
- `/eval` to record local acceptance judgment when needed

### Ordered Path

読み取り専用フェーズを前に固め、**最初にファイルを書く直前に worktree を作る**。

```
1  調査             質問に答える。ここで終わることも多い              read-only
2  /shape-task      意図を固める（重み判定・任意）                    read-only
3  /grill-me        尋問（upstream skill / 実体は grilling）。診断もここ read-only
   ---- ここまで read-only。捨てるならここで捨てる ----
4  worktree         書き込みが発生するならエージェントが作る（コマンドではない）
5  /docs-build      決定を記録する = **実装の入力**（管理先あり: 親 Issue 本文 / なし: docs/design/）
6  実装             skills/tdd（seam 合意 -> RED -> 最小 GREEN。refactor はしない）
7  検証             -> verification-summary.md（RED 証拠を含む。入口は /verify・任意）
8  レビュー・仕上げ -> review-summary.md（refactor / 文章 / セキュリティ / コメント。修正後は再検証）
9  受容判断         成果物を持たない。7・8・10 を読んで受容を答える（入口は /eval・任意）
10 観測（挙動が変わった時のみ）-> observation-summary.md
11 確定             実装で判明した「触る対象」と Open Issues を design doc に降ろす
12 commit / PR（明示指示がある時のみ。管理先ありの流れではゴールの開始が指示を兼ねる）
```

1〜3 は read-only なので、ここでタスクを捨てる判断ができる。捨てるタスクに worktree を作らないための順序。

**各段を実際にどう操作するかは [docs/how-to/run-a-task.md](../docs/how-to/run-a-task.md)。**
この表は順序の正本で、操作方法はそちらが持つ（人間が手で行うのは3つだけ）。

**5 は出力ではなく入力。** `/docs-build` が抽出する Grill Record 10項目のうち、実装後にしか
分からないのは `触る対象` だけで、残りは 3 で確定している。後回しにすると compaction で失われる
（2026-08-17 に `HARNESS.md` の Design Principles 9項目を実際に失った）。
修正タスクの例外は狭い — 診断は 3 の read-only 側なので、**診断が終われば実装前に書ける**。
実装後まで待つのは「実装してみて初めて原因が分かった回」だけ。

**8 で refactor すると 7 をやり直す必要がある。** `skills/tdd` が「refactoring は red->green ループの
外、review 段の仕事」と定めているため。7 -> 8 は一方向ではなくループになる回がある。

**7〜9 の段は成果物であって、コマンドの起動ではない。** 保持期間中の全トランスクリプト
（154コマンド起動）で `/verify` `/review-task` `/eval` は**0回**だが、成果物の側は
`verification-summary.md` 37回・`review-summary.md` 37回・`observation-summary.md` 16回
書かれている。エージェントが黙って書くのが実挙動なので、段の名前を成果物側に置いた。
コマンドは残す — 成果物のスキーマを説明する場所として機能しており、
撤去は 2026-08-12 の [pipeline-trim](../docs/design/2026-08-12-pipeline-trim.md) で却下済み。
**機構はパーサとテンプレート**（`harness/scripts/lib/task-artifacts.js` と `harness/templates/`）であって、
コマンドを打ったかどうかを見ているものは無い。

**`plan.md` と `progress.md` はこの列に無い。** 2026-08-17 に撤去した。承認は 5 の design doc に対して
会話で与える。**状態の要約を保存する仕組みは無い** — 復帰の根拠は git（ブランチ・log・diff）と
design doc（管理先があればブランチ名の Issue 番号から辿る Issue と親 Issue の本文、無ければ `docs/design/` の最新1枚）、
そして `harness/data/runs/<date>-<slug>/` に残るゲートの証拠。
**compact の前にコミットする。** 経緯は
[docs/design/2026-08-17-lifecycle-five-steps.md](../docs/design/2026-08-17-lifecycle-five-steps.md)
と [docs/design/2026-08-20-retire-sqlite.md](../docs/design/2026-08-20-retire-sqlite.md)。

`/shape-task` と `/grill-me` の棲み分け:

- `/shape-task` は**広く浅く分類する**（task weight・spec 要否・次の一手）
- `/grill-me` は**狭く深く尋問する**（却下した案・数字・触る契約・許容した負債）
- `/shape-task` の重み判定が `/docs-build` の規模ゲート（Lynch 3問）に対応する

11 を飛ばすと設計判断が消える。ドキュメント標準は `~/.claude/rules/common/documentation.md`。

Standard and heavy-risky work should leave pipeline run evidence through `/execute-plan` or task queue execution. The current guardrail warns when that evidence is missing but does not block the work.

この12段は**ライフサイクル**であって実行経路ではない。ライフサイクルと、それを回す経路を分けて見る。

| 層 | 実体 | 役割 |
|---|---|---|
| ライフサイクル | この Ordered Path | **何が起きなければならないか**。経路を問わない |
| 既定エンジン | `/execute-plan`（ローカルパイプライン） | 手順6〜11 を回す。finish・verify・evaluate 後に完了検査 |
| ゴール経路 | `start-issue` スキルとランタイムのゴール | 管理先があるプロジェクトで、手順6〜12 を1つの会話で回す（下の節） |
| 手動経路 | `/implement-task` `/review-task` | エンジンを使わない時の手順6・8 |

`/review-task` は手順8の成果物（`review-summary.md`）を手で作るコマンドであって、
パイプラインを使う場合の既定ではない。 `/worktree-start` is the manual override for the worktree the agent normally creates on its own — reach for it only when you want `--detached` (a separate process) or a specific base branch.

### 管理先があるプロジェクトの流れ

プロジェクトの `.claude/tracker.json` で管理先を宣言したプロジェクトでは、上の段を Issue と会話の単位に割り当てる。
宣言の解決は `harness/scripts/resolve-tracker.js`、ゴール文面の組み立ては `harness/scripts/task-goal.js` が持つ。
Task 内の実行順、休止、別セッション再開を Graph で扱う場合の共通契約と接続点は
[`docs/how-to/execution-graph-contract.md`](../docs/how-to/execution-graph-contract.md) が持つ。

```
A  調査・グリル  手順1〜3。read-only
B  仕様          手順5。/docs-build が親 Issue の本文に書く（docs/design/ には置かない）
C  分割          split-issue。成果と依存だけの分割案を人が確認 -> 子 Issue。1つの会話で終わるなら親をそのまま1タスクにする
B' 起票          draft-issue。Issue の無い1タスク分の依頼は B と C の代わりにこれを使う。
                 下書き -> stop-ai-slop-jp -> task-goal.js --check -> 人のレビュー -> 承認の後に起票
   ---- ここから1タスク1会話 ----
D  着手          start-issue <Issue>。先行 Issue の解決を確かめ、手順4の worktree とゴール文面を作る
E  ゴール        手順6〜11 を回す。Claude Code は人が /goal の1行を実行し、Codex はエージェントが始める
F  確認依頼      手順12。完了検査の後に Ready for review にする。停止したら Draft のまま理由をコメントする
G  マージ        人が行う。次の start-issue が Issue のクローズを確かめ、着手できる子 Issue を示す
```

- **起票の入口。** Issue の無い作業を頼まれたら、実装の前に `draft-issue` で下書きし、人が承認してから起票する。
  Issue 番号の無いブランチに初めて書き込むと、`harness/hooks/lifecycle-pre-edit.js` が `draft-issue` を案内する
  （セッションに1回。書き込みは止めない）
- **Grill を省いてよい条件。** 下書きの欄（実現する動作・受け入れ条件・検証方法・制約・Graph）を、依頼の文面と
  環境の調査だけで推測なしに埋められる時だけ。埋められない欄があれば、その欄だけを聞く。
  1つの会話で終わらない依頼は A〜C を通す
- ゴール文面の停止条件（同じ原因で3回連続の失敗 / 30ターン / 受け入れ条件や範囲の変更 / 権限や外部依存）の正本は
  `harness/scripts/lib/task-goal.js`。ゴール機能が使えない時は、同じ文面を終了条件にして会話の中で繰り返す
- ゴールの開始は、作業ブランチの push と PR の作成・更新・状態変更の指示を兼ねる。マージは含まない（`rules/common/git-workflow.md`）
- 機械で止まるのは main/master への push（`harness/hooks/git-push-guard.js`）だけ。完了検査を呼ぶこと、
  マージしないこと、マージ前に次のタスクへ進まないことは規律に依存する
- **キュー経路（`task-queue.js run/retry/watch`、`pipeline-runner.js --execute`）はこの流れに未対応。**
  管理先の宣言もゴール文面も読まない

## Core Lifecycle Pairs

These pairs separate conversational guidance from repository artifacts. They are local fallback paths, not the standard pipeline path.

- `/shape-task` turns rough intent into an approval-ready task brief without mutating the repository
- `/route-task` classifies a shaped task into main context, sidecar, queue, isolated clone, or human decision
- `/research` is the conversational research entrypoint; `/research-task` creates or updates repository `research.md`. Both are optional — `research.md` is no longer expected for non-trivial work, because nothing parsed it and the design doc already carries the findings that survive

## Command Groups

### Review, Verify, Evaluate

Local evidence surface for implementation and bug-fix work.

- `/review-task`
- `/receive-review`
- `/verify`
- `/eval`

### Implementation Helpers

Used while moving a task through execution when manual local control or local wrapper behavior is needed.

- `/execute-plan`
- `/implement-task`
- `/build-fix`
- `/test-coverage`
- `/code-review`

`/execute-plan` is the preferred local pipeline entrypoint. It should preserve pipeline stop conditions rather than reimplement a parallel home-grown runner.

`/implement-task` remains the conservative manual fallback and should not be the default when the pipeline can handle the task.

### Repo Orientation And Maintenance

Used to enter a repo cleanly and keep deeper references current.

- `/next-action`
- `/repo-map`
- `/docs-build`
- `/update-codemaps`
- `/sessions`

`/repo-map` は `AGENTS.md` のみを扱う。`docs/` の永続リファレンスは `/docs-build` が担い、
`/grill-me` を通してから実行する。標準は `~/.claude/rules/common/documentation.md`。

### Capture And Health

Secondary surface. Use when a pattern is worth extracting, or to inspect harness health.

instinct 系（evolve / promote / instinct-*）は 2026-08-18 に continuous-learning-v2 ごと撤去した。

- `/learn`
- `/learn-eval`
- `/post-commit-capture`
- `/guardrail-status`
- `/runs`
- `/trace-status`
- `/health-status`
- `/triage-loop`
- `/improve-harness`

`/runs` は過去タスクの証拠本文を読む入口。`/trace-status` `/health-status` が集計なのに対し、
こちらは生の記録を返す。`/improve-harness` は 2026-08-18 に**集計ではなく生トレースを先に読む**
指示に変えた（根拠は `commands/improve-harness.md` の「Why raw evidence, not summaries」）。

### Advanced Orchestration And Loops

Preferred advanced workflows for multi-agent, long-running, or orchestrated work.

- `/orchestrate`
- `/multi-plan`
- `/multi-execute`
- `/multi-workflow`
- `/loop-start`
- `/loop-status`

### Optional Builders And Utilities

Optional surfaces for specialized operator workflows. Use only when the task clearly calls for them.

- presentation, content, security, setup, and project-specific command packs
- runtime-specific adapters that should not redefine the lifecycle

## Visibility Tiers

- `primary`: default local wrappers and evidence surfaces most sessions should prefer
- `secondary`: useful but not required for the normal implementation path
- `optional`: specialized packs and utilities outside the core harness path
