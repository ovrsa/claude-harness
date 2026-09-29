---
description: Manual override for worktree creation. The agent normally creates the worktree on its own; reach for this only to force a specific slug, base branch, or detached process.
---

# Worktree Start Command

**通常このコマンドは打たない。** grilling が終わり次の動作がファイル書き込みなら、
エージェントが自分で worktree を作る(`rules/common/worktree-policy.md`)。
6ヶ月でこのコマンドがユーザーから打たれた回数は2回、最後は 2026-02-14 だった。

このコマンドが要るのは次の3つの場合だけ。

- **Detached Mode が要る** — 親セッションを実装と並行して別作業に使い続けたい
- **base branch を指定したい** — 既定の `worktree.baseRef` と違う分岐元を使いたい
- **slug を固定したい** — チケット番号などブランチ名を明示したい

## Usage

`/worktree-start <slug> [base-branch] [--detached]`

- `slug`: チケット名を推奨(例 `RAR-2172`, `feat-RAR-2192`)
- `base-branch`: 省略時は現在のローカルブランチ(detached HEAD の場合は `main`)。既定モードでは `EnterWorktree` の `worktree.baseRef` 設定(`fresh`=origin/デフォルトブランチ、既定)に従うため、現在のブランチから分岐したい場合は明示するか `head` 設定を確認する
- `--detached`: 明示指定時のみ、2セッション手渡し(新規プロセス)を使う

## Preconditions

1. `/grill-me` を通過していること(read-only。ここで捨てるタスクに worktree を作らない)
2. これから**リポジトリ内のファイルを書く**こと。read-only 作業なら worktree は不要
3. `slug` がチケット/機能を一意に表せること
4. (Detached Mode のみ)現在の作業ツリーに未コミットの変更がないこと(必要なら先に退避)。既定モードでは `EnterWorktree` 自体が独立した作業ディレクトリを作るため、この前提は適用されない

design doc の承認は前提条件ではない。承認は実装開始の条件。

## Default vs Detached Mode

判断基準は1つ: **親セッションを実装と並行して別作業に使い続ける必要があるか。**

- **既定(同一セッション)**: 大半のケース。摩擦が小さく、実装後すぐそのまま `/verify`/`/review-task` に進める。テレメトリ上、旧来の2セッション手渡しフローが実際に使われた形跡はほぼ無く、既定を軽くすることを優先する
- **Detached Mode(新規プロセス)**: 親セッションを空けておきたい・本当に独立した2プロセスが要る場合のみ。heavy-risky で稀にある。`CLAUDE.md` の「親セッションには要約のみ戻す」を厳密に満たしたい時はこちら

## Steps (既定: 同一セッション)

1. branch prefix をリポジトリの既存慣習に合わせて正規化する(例: feat/ infra/ improve/)。既存ブランチの命名を先に `git branch -a --format='%(refname:short)' | head -20` で確認し揃える。

```bash
case "${SLUG}" in
  */*) NAME="${SLUG}" ;;
  feat-*|feature-*|fix-*|infra-*|improve-*|refactor-*|chore-*|docs-*)
       NAME="$(echo "${SLUG}" | sed 's/-/\//')" ;;
  *)   NAME="feat/${SLUG}" ;;
esac
```

2. `EnterWorktree(name: "${NAME}")` を呼ぶ。

`.claude/worktrees/<name>/` に作成され、セッションの作業ディレクトリがそのまま切り替わる。base ref は `worktree.baseRef` 設定に従う(既定 `fresh`=origin/デフォルトブランチ、`head`=現在のローカルHEAD)。現在のブランチから分岐したい場合は事前に確認する。既に別 worktree のセッション内にいる場合は `EnterWorktree` が拒否するので、`ExitWorktree` してから再実行する。

3. setup command 自動検出

worktree に切り替わった状態で、該当するものだけ実行する。

```bash
if [ -f package.json ]; then npm install; fi
if [ -f pyproject.toml ] && command -v uv >/dev/null 2>&1; then uv sync; fi
if [ -f requirements.txt ]; then python -m pip install -r requirements.txt; fi
if [ -f go.mod ]; then go mod download; fi
if [ -f Cargo.toml ]; then cargo build; fi
```

4. baseline verification

project の標準 test command が分かる場合は、実装前に baseline を確認する。

```bash
# examples; choose the project-appropriate command
npm test
uv run pytest
go test ./...
cargo test
```

baseline が失敗した場合は、失敗内容を報告して、既知の失敗として進めるか先に調査するか確認する。

5. `research.md` など gitignore 対象の作業アーティファクトは worktree ごとに独立している(git 履歴を通じて共有されない)。親セッションで作成済みのものがあれば、この時点でこの worktree 側にもコピーする。design doc は `docs/design/` にあり git 管理下なので、この操作は不要。

6. plan 承認後、同一セッションのまま実装を続行する(新規ターミナルの起動は不要)。

## Steps (Detached Mode: 新規プロセス)

`--detached` が明示された場合のみ、以下の生の git 手順を使う。

1. worktree 作成先ディレクトリ決定

優先順:

1. 既存の `.worktrees/`
2. 既存の `worktrees/`
3. `CLAUDE.md` / `AGENTS.md` に明記された worktree directory
4. どれもなければユーザーに確認

project-local の `.worktrees/` または `worktrees/` を使う場合は、作成前に ignore 済みであることを確認する。

```bash
git check-ignore -q .worktrees/.gitkeep 2>/dev/null || git check-ignore -q worktrees/.gitkeep 2>/dev/null
```

ディレクトリがまだ存在しない状態で `git check-ignore` に末尾スラッシュ付きパターン(`.worktrees/`)の判定をさせると、
実在しないパスは常に「ignore されていない」と誤判定される。存在しないディレクトリ内の仮のファイルパスを渡すことで、
ディレクトリ実体が無くても正しく判定できる。

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
# branch prefix はリポジトリの既存慣習に合わせる(例: feat/ infra/ improve/)。
# ディレクトリ名は slug のまま、branch は prefix/rest に正規化する。
case "${SLUG}" in
  */*) BRANCH="${SLUG}" ;;
  feat-*|feature-*|fix-*|infra-*|improve-*|refactor-*|chore-*|docs-*)
       BRANCH="$(echo "${SLUG}" | sed 's/-/\//')" ;;
  *)   BRANCH="feat/${SLUG}" ;;
esac
TARGET="${WT_ROOT}/$(echo "${SLUG}" | tr '/' '-')"
mkdir -p "${WT_ROOT}"
```

既存ブランチの命名を先に確認し、それに揃える。

```bash
git branch -a --format='%(refname:short)' | head -20
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

1. 実装・テスト・コミットは worktree 側(同一セッションの切替先、または Detached Mode の `TARGET`)のみで行う
2. Detached Mode では親セッションを plan 管理とレビューに限定する
3. `--dangerous` は承認済み plan を実装する時のみ使用する
4. 大きな変更を一気に入れず、小さな reviewable batch に分ける
5. 各 batch ごとに verify し、必要なら observe まで行う
6. baseline test の失敗を新規実装の失敗と混同しない
7. 実装ファイルは main worktree で編集しない（worktree を切ってから書く）
8. baseline verification の結果を `verification-summary.md` に記録する

## Enforcement Notes

- `lifecycle-pre-edit` warns (does not block) when editing inside a linked worktree that has no recent pipeline run evidence. **It does not read any plan metadata** — until 2026-08-20 this section claimed it warned on `worktree_required: true` plans, and it never read that field.
- **The only hard block in the lifecycle is `harness/hooks/git-push-guard.js`** on `main`/`master`. This section named `lifecycle-progress-complete.js`, which was removed on 2026-08-17 for never firing.
- If the advisory fires, prefer `/execute-plan` or a task-queue run so the pipeline records run evidence.
- Documentation-only edits in the parent session should keep the plan/review coordination role clear.

## Recommended Flow

調査 → `/grill-me` → **worktree**(通常はエージェントが作る。このコマンドは上書き用)→ `/docs-build` → 実装 → `/verify` → `/review-task` → `/eval` → observe if required → design doc 確定 → commit

全体像は `~/.claude/commands/COMMANDS.md` の Ordered Path を参照。

## Cleanup (After Merge)

**既定(同一セッション)**: マージが必要な場合は親ブランチ側で `git merge --no-ff <branch>` を実行してから `ExitWorktree(action: "remove")` を呼ぶ。

**Detached Mode**:

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

- 既定(同一セッション): worktree セットアップと baseline verification が通れば、そのまま同一セッションで実装を続ける
- Detached Mode: worktree セットアップと baseline verification が通れば、新規プロセスで `/implement-task` を実行する
- baseline verification が失敗した場合は、`/build-fix` で調査するか、既知の失敗として文書化した上で進めるかを判断する
- Detached Mode では親セッションを plan/review 調整に専念させる
