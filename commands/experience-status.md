---
name: experience-status
description: JSON Experienceの件数、容量、outcome、未分類run、experiment数をread-onlyで表示する。
command: true
---

# Experience Status

`node ~/.claude/scripts/experience-status.js` を実行し、結果を短く説明する。

- データを作成、更新、削除しない
- pruneを自動実行しない
- `unknown` が多い場合も勝手に再分類しない
- cleanupが必要なら、対象と回復方法を示してユーザーの明示的な依頼を待つ
