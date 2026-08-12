# Personal Harness

`~/.claude` はClaude CodeとCodexで共有するharnessのsource of truthである。開発ライフサイクルはこのファイルだけで定義し、runtime別の入口にはポインタだけを置く。

## Standard Flow

非自明な変更は、managed read-only pluginの `grilling` から始める。小さく明白な変更と、ユーザーが `Grill不要` と指定した変更は省略できる。

`grilling` では未解決のdesign frontierを質問と環境調査で閉じる。最後に「最終理解」を提示し、ユーザーの確認を待つ。ここまででGrillは終了し、文書作成や実装へ自動で進まない。

確認後は、ユーザーが明示した次の一手だけを実行する。

- `/to-spec`: 合意をLocal Markdownへまとめる
- `/grill-with-docs`: domain languageとADRも一緒に詰める
- `/implement`: 合意済み内容を実装する
- 終了: 会話だけで閉じる

subagentまたはサブエージェントはユーザーが明示した場合だけ使う。通常はmain contextで完結する。
commitまたはコミット、push、PR、deployはユーザーが明示した場合だけ実行する。

## Runtime And Evidence

Claude Codeは `mattpocock-skills@mattpocock` をmanaged pluginとして直接使う。Codexは [AGENTS.md](AGENTS.md) のbridgeから同じread-only installを解決する。

JSON Experienceは実行履歴をsanitized JSON/JSONLで観測する。作業を開始・完了させるgateではなく、改善も自動適用しない。

## Pointers

- lifecycle: [docs/harness-operating-loop.md](docs/harness-operating-loop.md)
- ownership: [docs/harness-structure-and-ownership.md](docs/harness-structure-and-ownership.md)
- Experience: [docs/experience-store.md](docs/experience-store.md)
- Local Markdown: [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)
- domain language: [CONTEXT.md](CONTEXT.md) と [docs/agents/domain.md](docs/agents/domain.md)
- permission boundary: [docs/command-permission-policy.md](docs/command-permission-policy.md)

会話とLocal Markdownは日本語を既定とし、コマンド、パス、code identifier、parser tokenは原文を保つ。
