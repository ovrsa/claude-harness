# Grill-Based Operating Loop

## Lifecycle

1. 非自明な依頼でmanaged `grilling` を読む。
2. 未解決のdesign frontierを、ユーザーへの質問とmain contextでの環境調査で閉じる。
3. 最終理解を提示し、ユーザーの確認を待つ。
4. 確認後は停止し、ユーザーが明示した次の一手だけを実行する。
5. `/to-spec`、`/grill-with-docs`、`/implement`、終了のいずれかへ進む。
6. 変更内容に必要なcheckを実行し、結果をそのまま報告する。

小さく明白な変更と `Grill不要` 指定はGrillを省略できる。省略理由は判明した範囲でExperienceへ記録する。

## Boundaries

- main contextが既定
- subagent、commit、push、PR、deployは明示的な依頼でのみ実行
- Grillはinterviewで終了し、次工程を先取りしない
- Experienceは観測であり、承認や完了を決めない
- harness改善は `/improve-harness` の明示実行でのみ始める

## Pointers

- component ownership: [harness-structure-and-ownership.md](harness-structure-and-ownership.md)
- persisted observation: [experience-store.md](experience-store.md)
- Local Markdown contract: [agents/issue-tracker.md](agents/issue-tracker.md)
- domain language: [agents/domain.md](agents/domain.md)
