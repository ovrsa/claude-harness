# Worktree Policy

## Goal

大きな実装でコンテキスト汚染と変更競合を減らすため、Plan 承認後は worktree を使う。

## Required Flow (Large Changes)

1. `/plan` で仕様確定・承認
2. `/worktree-start <slug>` で実装専用 worktree 作成
3. 実装はその worktree セッションでのみ実施
4. 親セッションには要約のみ戻す
5. 完了後は worktree branch を fork 元のローカルブランチへ取り込む（PR は指示がある時のみ）

## When Worktree Is Mandatory

- 複数ファイルを跨ぐ機能追加/改修
- 影響範囲が backend + frontend に跨る
- 1日以上の作業見込み
- 並列で複数タスクを進める

## Dangerous Mode Policy

- `--dangerous` は以下すべてを満たす時のみ許可
1. Plan 承認済み
2. 実装対象が worktree 上
3. 実行スコープが承認済み仕様の範囲内

- exploratory 調査や未承認要件では使わない

## Git Safety

- `main` / `master` への直接 `push` は常時禁止（PR / CI の有無に関係なく禁止）
- `main` / `master` への直接コミット禁止
- `main` / `master` へのマージは PR + 必須チェック通過を前提とする
- `main` / `master` 以外のブランチは、状況に応じて直接マージしてよい（PR は任意）
- PR の作成・更新・マージは明示指示がある場合のみ実行する
- worktree を作る前に dirty state を解消または退避
