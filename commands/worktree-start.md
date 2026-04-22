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

1. worktree 作成先ディレクトリ決定

優先順:

1. 既存の `.worktrees/`
2. 既存の `worktrees/`
3. `CLAUDE.md` / `AGENTS.md` に明記された worktree directory
4. どれもなければユーザーに確認

project-local の `.worktrees/` または `worktrees/` を使う場合は、作成前に ignore 済みであることを確認する。

```bash
git check-ignore -q .worktrees 2>/dev/null || git check-ignore -q worktrees 2>/dev/null
```

ignore されていない場合は、worktree 作成を止めて `.gitignore` 対応を先に行う。

2. ベースブランチ更新

```bash
git fetch origin
```

3. branch / target 決定

```bash
WT_ROOT="<selected-worktree-root>"
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

4. 既存衝突チェック

```bash
git worktree list
git branch --list "${BRANCH}"
```

5. 新規 branch + worktree 作成

```bash
git worktree add -b "${BRANCH}" "${TARGET}" "origin/${BASE}"
```

6. setup command 自動検出

worktree に移動して、該当するものだけ実行する。

```bash
cd "${TARGET}"
if [ -f package.json ]; then npm install; fi
if [ -f pyproject.toml ] && command -v uv >/dev/null 2>&1; then uv sync; fi
if [ -f requirements.txt ]; then python -m pip install -r requirements.txt; fi
if [ -f go.mod ]; then go mod download; fi
if [ -f Cargo.toml ]; then cargo build; fi
```

7. baseline verification

project の標準 test command が分かる場合は、実装前に baseline を確認する。

```bash
# examples; choose the project-appropriate command
npm test
uv run pytest
go test ./...
cargo test
```

baseline が失敗した場合は、失敗内容を報告して、既知の失敗として進めるか先に調査するか確認する。

8. 実装開始先を表示

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
6. baseline test の失敗を新規実装の失敗と混同しない
7. `worktree_required: true` の plan では、main worktree で implementation file を編集しない
8. baseline verification の結果を `progress.md` または `verification-summary.md` に記録する

## Enforcement Notes

- `lifecycle-pre-edit` blocks implementation-code edits for `worktree_required: true` plans unless the current repository is a linked worktree.
- If that block fires, run `/worktree-start` and continue in the printed `TARGET`.
- Documentation-only edits in the parent session should keep the plan/review coordination role clear.

## Recommended Flow

`/research` → `/plan` → user approve → `/worktree-start` → `/implement-task` → `/review-task` → `/verify` → `/eval` → observe if required → commit

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

## Next Handoff

- If worktree setup and baseline verification pass, run `/implement-task` in the new worktree.
- If baseline verification fails, decide whether to investigate with `/build-fix` or proceed with a documented known baseline.
- Keep parent session focused on plan/review coordination.
