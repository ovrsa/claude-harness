# Git Workflow

Gitはユーザー作業を保護するために使う。

- 既存dirty stateを保持し、対象外の変更を混ぜない
- destructive restoreや広い削除を避ける
- commit、push、PR、mergeはユーザーの明示的な依頼でのみ実行する
- commitを依頼された場合は、対象差分とcheck結果を確認してから作成する
- PRを依頼された場合は、baseとの差分全体とtest evidenceを要約する

commit messageは `<type>: <description>` を基本形とする。
