# Worktree Policy

## When

最初の書き込みの前に worktree を切る。`~/.claude` では特に守る。フックスクリプトは呼び出しのたびに
読み直されるので、直接編集すると壊れた中間状態がその場のツール呼び出しで実行される。

- **作る**: 実装コードを複数ファイル書く / `~/.claude` の hooks・scripts・settings を触る / 並行して別タスクが走っている
- **作らない**: read-only の調査・質問回答・Grill だけで終わる作業
- **効かない**: 未追跡ファイルだけを触る作業（origin から切った worktree にそのファイルが無い）

## Who Creates It

エージェントが作る。read-only の段（調査、`/shape-task`、`/route-task`、Grill）が終わり、次の動作が
リポジトリ内のファイル書き込みなら、許可を求めずにその場で `EnterWorktree` を呼ぶ。

- 以降の書き込み（design doc、実装）はすべてその worktree で行う。作成は承認より前でよく、承認は実装の許可として残る
- 完了後は worktree のブランチを fork 元のローカルブランチへ取り込む（`main` / `master` は Git Safety に従う）
- `/worktree-start` は上書き用。Detached Mode、base branch の変更、slug の固定の時だけ使う。
  Detached Mode では、親セッションには要約のみ戻す
- `mr-split` スキルの連鎖 worktree は、この方針の対象外

## Dangerous Mode Policy

`--dangerous` は次をすべて満たす時だけ使う。exploratory 調査や未承認要件では使わない。

1. Plan 承認済み
2. 実装対象が worktree 上
3. 実行スコープが承認済み仕様の範囲内

## Git Safety

- `main` / `master` への直接 `push` は常時禁止（PR / CI の有無に関係なく禁止）。`harness/hooks/git-push-guard.js` が止める
- `main` / `master` への直接コミット禁止（フックは止めない）
- `main` / `master` へのマージは remote の有無で分ける。`git remote` で判定する
  - **remote がある**: PR と必須チェックの通過を前提にする
  - **remote が無い**: fork 元で `git merge --no-ff <branch>` を実行し、`ExitWorktree(action: "remove")` で片付ける
- `main` / `master` 以外のブランチは、状況に応じて直接マージしてよい（PR は任意）
- PR の作成・更新・マージは明示指示がある場合のみ実行する。例外は `start-issue` でゴールを始めた時（`git-workflow.md`）
- worktree を作る前に dirty state を解消または退避する
