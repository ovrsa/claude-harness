---
name: linear-project-overview-md
description: Generate a short third-party-friendly project overview Markdown with a fixed Japanese heading structure using Linear (issue/project) context and repo docs. Use when user asks to "概要をmdにして", "見出しを埋めて", "依頼内容をまとめて", or wants a reusable global command for this workflow.
---

# linear-project-overview-md

## 目的

Linear のチケット（例: `RAR-1964`）と、対象リポジトリの `README.md` / `setup-guide.md` 等を材料にして、**指定された見出し構造を崩さず**、短く端的な「概要MD」を作成する。

## 入力（ユーザーから得る/推定する情報）

- **Linear Issue ID**: 例 `RAR-1964`
- **Linear Project 名**（任意）: 例 `CAPE_メールワイズ(Gmail)_スプシ連携`
- **対象リポジトリのパス**: 例 `projects/cape_gmail_response_alert/`
- **参照ドキュメント**:
  - 既定: `README.md`, `setup-guide.md`
  - 追加: `docs/`, `PROJECT_OVERVIEW.md` 等（存在する場合のみ）
- **出力先ファイル**: 既定 `PROJECT_OVERVIEW.md`（対象リポジトリ直下）

## 手順

### 1) Linear から事実を取得

利用可能なら Linear 連携を使い、以下を取得する。

- Issue: `id`, `title`, `description`, `createdAt`, `updatedAt`, `url`, `project`, `dueDate`, `assignee`
- Project: `name`, `url`, `summary`, `description`

**日付の扱い**
- 「依頼された日」は原則 Issue の `createdAt` を採用（ISO を `YYYY-MM-DD` に整形）
- 「稼働開始日」は Issue 本文に明記がなければ **不明** とし、推測で断定しない

### 2) リポジトリ内ドキュメントを要約

対象リポジトリ配下で `README.md` / `setup-guide.md` を読み、以下を抽出して短く要約する。

- 何をする仕組みか（1文）
- 実行間隔 / 取得範囲 / 重複排除などの要点（箇条書き）
- 利用サービス（Gmail/GAS/スプシ/clasp 等）

### 3) 固定見出しテンプレートに埋める（構造厳守）

以下の**見出し構造を変更しない**。未確定は「不明」で埋める。

```markdown
概要

対応時期

依頼された日:

稼働開始日:

依頼者

部署:

依頼者名:

プロジェクト/タスクのリンク

Gitlabプロジェクト

目的

目的

非目的

背景

利用サービス

関連資料
```

**記述ルール**
- 1項目はできるだけ1〜3行で完結
- 箇条書きは最小限
- URL はバッククォートで囲う
- 断定できない個人名/部署は書かない（不明）

### 4) 出力

- 既定ファイル名: `PROJECT_OVERVIEW.md`
- 既に存在する場合は、テンプレ構造を維持した上で上書き（差分が出るように）

## 例

ユーザー: 「この見出しの構造を守ったまま、短く埋めて md にして。Linear は `RAR-1964` で、リポジトリは `projects/cape_gmail_response_alert/`」

出力: `projects/cape_gmail_response_alert/PROJECT_OVERVIEW.md` を作成/更新する。

