# Git Workflow

## Commit Message Format
```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

Attribution（`Co-Authored-By` トレーラーと PR 説明文への付記）は付けない。
根拠は `~/.claude/settings.json` の `attribution.commit` と `attribution.pr` を空文字にしていること。

```bash
jq '.attribution' ~/.claude/settings.json   # {"commit": "", "pr": ""} なら有効
```

`includeCoAuthoredBy` は deprecated なので使わない（2026-08-10 時点のスキーマ）。
2026-08-10 まで、この節は「settings.json で無効化済み」と書いていたが実際にはキーが存在せず、
既定値（attribution あり）に依存していた。既定値が変われば黙って挙動が変わる状態だった。

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch

> For the full development process (planning, TDD, code review) before git operations,
> see [development-workflow.md](./development-workflow.md).
