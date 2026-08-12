# Local Markdown Issue Tracker

issue trackerとしてLocal Markdownを選んだ場合だけ、`.scratch/<feature>/` を使う。

- `spec.md`: `/to-spec` で会話から合意内容をまとめる
- `tickets.md`: ticket分割を明示的に選んだ場合に作る
- `verification.md`: 長く残す必要があるcheck結果
- 補助JSON: cutoverやmachine-readable summaryが必要な場合だけ置く

Grill自体はfileを作らない。feature slugは短いkebab-caseとし、同じfeatureの文書を一つのdirectoryにまとめる。`.scratch/` はlocal-onlyでGit追跡しない。
