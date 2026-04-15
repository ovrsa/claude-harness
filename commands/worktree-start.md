---
description: Create a feature branch worktree after plan approval, then start implementation in that worktree.
---

# Worktree Start Command

Plan 承認後、実装専用の worktree + feature branch を作成する。

## Usage

`/worktree-start <slug> [base-branch]`

- `slug`: 例 `resource-availability-fix`
- `base-branch`: 省略時は現在のローカルブランチ（detached HEAD の場合は `main`）

## Preconditions

1. `/plan` が承認済みであること
2. 現在の作業ツリーに未コミットの変更がないこと（必要なら先に退避）
3. `slug` がチケット/機能を一意に表せること

## Steps

1. ベースブランチ更新

```bash
git fetch origin
```

2. worktree 作成先ディレクトリ決定

```bash
WT_ROOT="../GenbaFlow__worktrees"
SLUG="<slug>"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ -n "${2}" ]; then
  BASE="${2}"
elif [ "${CURRENT_BRANCH}" = "HEAD" ]; then
  BASE="main"
else
  BASE="${CURRENT_BRANCH}"
fi
BRANCH="feature/${SLUG}"
TARGET="${WT_ROOT}/${SLUG}"
mkdir -p "${WT_ROOT}"
```

3. 既存衝突チェック

```bash
git worktree list
git branch --list "${BRANCH}"
```

4. 新規 branch + worktree 作成

```bash
git worktree add -b "${BRANCH}" "${TARGET}" "origin/${BASE}"
```

5. 実装開始先を表示

```bash
echo "cd ${TARGET}"
echo "claude --dangerous"
```

## Implementation Policy

1. 実装・テスト・コミットは `TARGET` 側のみで行う
2. 親セッションは plan 管理とレビューに限定する
3. `--dangerous` は承認済み plan を実装する時のみ使用する
4. 大きな変更を一気に入れず、小さな reviewable batch に分ける
5. 各 batch ごとに verify し、必要なら observe まで行う

## Recommended Flow

`/research` → `/plan` → user approve → `/worktree-start` → `/tdd` → `/code-review` → `/verify` → commit

## Cleanup (After Merge)

```bash
BASE_TO_MERGE_INTO="<fork元ブランチ>"
cd "<main worktree path>"
git checkout "${BASE_TO_MERGE_INTO}"
git merge --no-ff "${BRANCH}"

git worktree remove "${TARGET}"
git branch -d "${BRANCH}"
```

## Important

- PR の作成は自動で行わない。必要な場合のみユーザーの明示指示で実行する。
