<!--
AGENTS.md = エージェント向けの唯一の常時ロードファイル（Linux Foundation / Agentic AI Foundation 標準）。
生成・更新は /repo-map。標準は ~/.claude/rules/common/documentation.md。

運用ルール:
  - ~100行に保つ。長いと効かない
  - 追記only。「エージェントが間違えたら1行足す」= ミスログ
  - 事実を持たない。値を書かない（値は変わる、存在は変わらない）
  - docs/ の索引を作らない。索引は維持されず嘘になる
  - グローバルなライフサイクルを複製しない。~/.claude を指すだけにする
-->

# Repo-Local Map

## Repository Purpose

- 

## Read First

- 

## Source Of Truth

<!-- 固定の少数ポインタのみ。docs/ の列挙はしない。 -->

- lifecycle:
- architecture/docs:
- current task artifacts:

## Mistakes To Avoid

<!--
このリポジトリ固有のものだけ。グローバルなルールは ~/.claude/rules にあるので書かない。
エージェントが実際に間違えた時に1行足していく（ミスログ）。ここが AGENTS.md の主要な価値。
-->

- 

## Out-Of-Repo Realities

<!--
エージェントが読めない領域（コンソール設定、外部SaaS、デプロイ済みの実体など）。
「どこにあるか」は書く。「値」は書かない。
例: 「デプロイ先の ID は CI の環境変数にある。リポジトリには無い」
-->

- 

## Artifact Expectations

- 

## Verify And Observe

- verify:
- observe:

## Local Boundaries

- 
