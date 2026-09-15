---
name: split-issue
description: 親 Issue に書いた仕様を、成果と依存関係だけの分割案にして人に確かめ、確認後に子 Issue を作る。1つの会話で終わる作業なら分割せず、親 Issue をそのまま1タスクにする。
---

# 仕様を子 Issue に分ける

Claude Code は `/split-issue <親Issue>`、Codex は `$split-issue <親Issue>` で呼ぶ。
流れの中の位置は `~/.claude/commands/COMMANDS.md` の「管理先があるプロジェクトの流れ」にある。
分割の考え方は mattpocock/skills の `to-tickets` を参考にしている（upstream は編集しない）。

## 1. 管理先を確かめる

```bash
node ~/.claude/scripts/resolve-tracker.js --repo .
```

- `configured` なら次へ進む
- `unconfigured`（終了コード 2）なら、`candidates` を示して人に選んでもらい、`expected_path` に書く。
  **人が選ぶ前に Issue を1つも作らない**
- `none` なら対象外。仕様は `docs/design/` にあるので、分割せずに進めると伝えて止まる
- `invalid` なら `error` を示して止まる

## 2. 親 Issue を読む

本文だけを読む。コメントや関連する Issue は読まない。
目的・受け入れ条件・対象外が本文に無ければ、分割せず `/docs-build` に戻るよう伝える。

## 3. 分割案を示して、人の確認を待つ

成果と依存だけの表にする。実装の手順、ファイル名、見出しの案は書かない。

| # | 成果（単独で確かめられる動作） | 先行 |
|---|---|---|

- 1つの子 Issue は1つの会話で終わる大きさにする。目安は、ゴール文面が 4,000 字に収まり、30ターン以内で終わること
- 層ごとではなく、動作ごとに切る。規約の文書は、その動作を入れる子 Issue の中で一緒に直す
- 全体が1つの会話で終わるなら、**分割しない**と提案する

粒度と依存が合っているか人に聞き、確認が取れるまで作らない。

## 4. 子 Issue を作る（確認の後）

先行の無いものから順に作る。本文は `~/.claude/templates/task-issue-template.md` に沿って書き、
`親Issue` 節に親の番号と、子が読むべき親の見出し（`参照:`）を書く。

作る前に、下書きからゴール文面を作れるか確かめる。入力の形は `~/.claude/scripts/task-goal.js` の先頭にある。
`INVALID` なら直してから作る。

```bash
node ~/.claude/scripts/task-goal.js --repo . --check --input <下書きと親の本文.json>
```

GitHub では、本文のリンクに加えて親子関係と依存関係も付ける。API が受け取るのは Issue の番号ではなく `id`。

```bash
gh issue create --repo <owner/repo> --title "<成果>" --body-file <本文>
gh api -X POST repos/<owner/repo>/issues/<親>/sub_issues -F sub_issue_id="$(gh api repos/<owner/repo>/issues/<子> --jq .id)"
gh api -X POST repos/<owner/repo>/issues/<子>/dependencies/blocked_by -F issue_id="$(gh api repos/<owner/repo>/issues/<先行> --jq .id)"
```

他の管理先でも同じ本文を使い、親子と依存はその管理先の機能で結ぶ。

- 親 Issue の本文は変えず、閉じない
- 分割しない場合は子 Issue を作らない。親 Issue の本文に `受け入れ条件` と `検証方法` の節があるかを
  `--check` で確かめ、足りなければ足す案を示す（本文を変えるのは人の確認の後）

## 5. 伝える

作った Issue の番号と先行を1つの表で示し、次は新しい会話で `/start-issue <番号>`（Codex は `$start-issue`）から
始めると伝える。
