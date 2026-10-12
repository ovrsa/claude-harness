# Git Workflow

## Commit Message Format

`<type>: <description>`, with an optional body. Types: feat, fix, refactor, docs, test, chore, perf, ci.

Attribution（`Co-Authored-By` トレーラーと PR 説明文への付記）は付けない。`~/.claude/settings.json` の
`attribution` で無効にしている。`includeCoAuthoredBy` は deprecated なので使わない。

## Issue からゴールを始めた時の push と PR

`start-issue` で対象 Issue のゴールを始めたら、その作業ブランチについて次の指示を受けたものとして扱う。

- 作業ブランチの push（`main` / `master` 以外）
- PR の作成と本文の更新、Draft と Ready for review の切り替え、停止理由のコメント

含まないもの:

- **マージ。** 人が行う。エージェントは `gh pr merge` を実行しない
- 人がマージする前に、次のタスクの実装を始めること

この PR の本文は `harness/templates/review-request-template.md` の5節だけにする。
Ready にする前に完了検査（`harness/scripts/task-completion.js`）を通す。
