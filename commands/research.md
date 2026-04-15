---
description: 実装前リサーチ。既存コード、関連フロー、ライブラリ選定、技術リスクを整理し、plan 前提を作る。
---

# Research Command

実装前の探索と前提整理を行う。

## Usage

`/research <task or spec>`

- 引数: タスク説明または spec ファイルパス
- 引数省略時: 現在の会話コンテキストから対象を推定する

## 前提条件

1. 実装前であること
2. まだコード変更を始めていないことが望ましい

## リサーチ項目

### 1. 既存コード理解

- 関連ファイルと実装パターン
- 類似機能や隣接フロー
- 命名規約、構造、既存の抽象化
- 変更影響を受ける箇所

### 2. 技術選択と業界標準

- 必要なライブラリやAPIの候補
- 業界標準パターンとの整合
- 既知の落とし穴、アンチパターン
- 採用時の制約とトレードオフ

### 3. リスク整理

- 技術リスク
- 仕様の曖昧さ
- テストしづらい箇所
- `/plan` で詰めるべき未解決事項

## 出力フォーマット

```markdown
# Research Report: [task]

## Goal

- ...

## Existing Code

- ...

## Technical Options / Standards

- ...

## Risks

- ...

## Open Questions for Plan

- ...

## 次のステップ

- `plan.md` を作る
- 不明点が大きければ 1-2 個だけ確認質問をする
```

## 使用例

```
/research 通知配信基盤の追加
```

## 重要ルール

- このコマンドは plan の後ではなく plan の前に使う
- substantial task では結果を `research.md` または `{task}_research.md` に残す
- research 完了後に `/plan` へ進む
- research 段階ではコードを書かない

## 後続コマンド

- `/plan` — 実装計画を作成
