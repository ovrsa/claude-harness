---
name: mr-split
description: 大きな変更を複数の論理的MR単位に分割し、チェーン型 git worktree を作成してコミットまで行う。「変更が大きいのでMRを分けたい」「worktreeを作って対応したい」と言われたら使う。
---

# MR分割 + Worktree作成

## 目的

変更サイズが大きい場合に、MR指標（論理的最小単位）に従って複数のMRに分割し、
それぞれ独立した git worktree を作成してコミットまで完了させる。

---

## Step 1: 変更内容を把握する

まず**全ファイルの目的と行数**を把握する。推測で書かない。

```bash
find <対象ディレクトリ> -type f | sort
wc -l <対象ファイル群>
```

各ファイルについて:
- 何をするファイルか（1行で言える？）
- GAS/Lambda/テスト/設定 など層がわかるか
- 他のファイルへの依存関係はあるか

---

## Step 2: MR指標に基づいて分割案を作る

以下の基準で「論理的最小単位」に切る:

| 基準 | 詳細 |
|------|------|
| **1文・1意** | MRタイトルが1文で言い切れること。複数の目的を持つのはNG |
| **10ファイル以下** | 超える場合は設計見直しのきっかけにもなる |
| **テストが通る** | そのMRだけで動作が完結すること。呼び出し元だけ直して実装が未完はNG |
| **revert可能** | そのMRだけ取り消しても残りが機能すること |
| **コンテキストが残る** | 修正の目的がわかる粒度。関数だけ追加して呼び出し側未記載はNG |

### 典型的な分割パターン（レイヤー分割）

新規プロジェクト追加の場合:
1. **プロジェクト基盤**: `package.json` / 設定ファイル / README
2. **コアロジック + テスト**: テスト可能な純粋ロジック + テストファイル
3. **統合層・エントリーポイント**: フレームワーク固有コード（GAS / Lambda 等）

既存機能への横断的変更の場合:
1. **新規追加分**: 新しく追加するファイルのみ
2. **既存修正分**: 既存ファイルへの変更（目的が同じならまとめてよい）

---

## Step 2.5: Linear チケットを先に確定する（省略禁止）

**ブランチ名とworktreeディレクトリ名は Linear チケットIDから決める。チケットIDが先。**
worktree を作る前にこのステップを完了させること。後から変えると大量の手戻りが発生する。

### 手順

1. **親チケットを確認する**（MCP）
   ```
   mcp__linear-server__get_issue: { id: "<親チケットID>" }
   ```
   プロジェクト名・チームを確認する。

2. **子チケットを確認または作成する**
   - 既存の子チケットがあれば `mcp__linear-server__list_issues` で検索して使う
   - なければ各MRに対応する子チケットを `mcp__linear-server__save_issue` で作成する
   ```
   mcp__linear-server__save_issue: {
     title: "<MRタイトル>",
     team: "<チームID>",
     parentId: "<親チケットID>",
     project: "<プロジェクトID>"
   }
   ```

3. **チケットIDを確定してから命名規則を決める**

   | 項目 | 命名規則 | 例 |
   |------|---------|-----|
   | ブランチ名 | `feat/<チケットID>-<slug>` | `feat/RAR-2035-lambda` |
   | worktree ディレクトリ名 | `<チケットID>-<slug>` | `RAR-2035-lambda` |

   slug は英数字・ハイフンのみ（日本語は使わない）。

4. **このステップが終わるまで Step 3 に進まない。**

---

## Step 3: チェーン型 worktree を作成する

MR間に依存関係がある場合（後のMRが前のMRのファイルを前提とする場合）は
**チェーン構造**にする。

```
master
  └─ feat/<ID-1>-<slug> → .worktrees/<ID-1>-<slug>
       └─ feat/<ID-2>-<slug> → .worktrees/<ID-2>-<slug>
            └─ feat/<ID-3>-<slug> → .worktrees/<ID-3>-<slug>
```

```bash
# リポジトリルートで実行（.worktrees/ はリポジトリルート直下の慣例）
REPO_ROOT=$(git rev-parse --show-toplevel)

# MR1: masterから
git worktree add "$REPO_ROOT/.worktrees/<ID-1>-<slug>" -b feat/<ID-1>-<slug> master

# MR2: MR1から派生
git worktree add "$REPO_ROOT/.worktrees/<ID-2>-<slug>" -b feat/<ID-2>-<slug> feat/<ID-1>-<slug>

# MR3: MR2から派生
git worktree add "$REPO_ROOT/.worktrees/<ID-3>-<slug>" -b feat/<ID-3>-<slug> feat/<ID-2>-<slug>
```

依存関係がない場合（変更が独立している場合）は全て `master` から作成してよい。

**差分が正しいか必ず確認する:**
```bash
# MR1・MR2: masterとの差分
git -C "$REPO_ROOT/.worktrees/<ID-1>-<slug>" diff origin/master..HEAD --name-only

# MR3（チェーン）: ベースブランチとの差分
git -C "$REPO_ROOT/.worktrees/<ID-3>-<slug>" diff feat/<ID-2>-<slug>..HEAD --name-only
```

---

## Step 4: 各 worktree にファイルをコピーしてコミット

```bash
# コピー先のディレクトリ構造を作成してからコピー
DEST="$REPO_ROOT/.worktrees/<ID-1>-<slug>/<対象パス>"
SRC="<元のディレクトリ>"
mkdir -p "$DEST/..."
cp "$SRC/<ファイル>" "$DEST/<ファイル>"

# 対象ファイルのみ指定してステージング（git add . は使わない）
cd "$REPO_ROOT/.worktrees/<ID-1>-<slug>"
git add <ファイルを明示列挙>
git status --short  # 確認

# コミット: 英語1行
git commit -m "feat: <what this MR does> (<チケットID>)"
```

**コミットメッセージのルール:**
- 英語・1行
- `feat:` / `fix:` / `refactor:` / `chore:` などの prefix を付ける
- 末尾にチケットID を付ける（例: `feat: add Lambda API (RAR-2035)`）

---

## Step 5: 分割結果を報告し、Linear にブランチリンクを添付する

### 5-1. 結果を表示する

```
| worktree | ブランチ | チケット | コミット |
|---|---|---|---|
| .worktrees/RAR-2035-lambda | feat/RAR-2035-lambda | RAR-2035 | "feat: ..." |
| .worktrees/RAR-2036-chatwork-gas | feat/RAR-2036-chatwork-gas | RAR-2036 | "feat: ..." |
```

### 5-2. Linear チケットにブランチリンクを添付する

各チケットに対して、ブランチへのリンクを添付する。

```
mcp__linear-server__save_issue: {
  id: "<チケットID>",
  links: [{ url: "<GitLabリポジトリURL>/-/tree/<ブランチ名>", title: "Branch: <ブランチ名>" }]
}
```

同時にチケットの description にブランチ名を明記する（レビュアーがMRを見つけやすくなる）。

### 5-3. ユーザーへの確認

Push・MR作成はユーザーの確認を取ってから行う。

### 5-4. MR作成後: Linear チケットにMRリンクを添付する（省略禁止）

MRが作成されたら、ブランチリンクに加えて**MR URL も同じチケットにリンクとして追加する**。
ブランチリンクとMRリンクの両方が揃って初めてチケットとコードが完全に紐づく。

```
mcp__linear-server__save_issue: {
  id: "<チケットID>",
  links: [{ url: "<GitLabリポジトリURL>/-/merge_requests/<MR番号>", title: "MR: <MRタイトル>" }]
}
```

MRのURLはユーザーから受け取るか、`gh pr view` / GitLab CLI で取得する。
ユーザーがMRを作成したことを伝えてきたタイミングで、このステップを実行すること。

---

## 注意

- `git add -A` や `git add .` は使わない。node_modules や .env が混入するリスクがある
- コピーしたファイルが意図したものか `git status --short` で必ず確認する
- worktree の作成場所はリポジトリの `git worktree list` で既存の慣例を確認してから合わせる
- **ブランチ名を後からリネームすると `.git/worktrees/` の手動修復が必要になる。Step 2.5 を省略しない**
