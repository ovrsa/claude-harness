---
name: shape-task
description: Translate a rough request, goal, concern, or vague intent into a clear, approval-ready task brief before any implementation. Use when the user says "タスクをシェイプ", "shape this task", "要望を整理して", "これどう進める？", or hands over an idea that is not yet a concrete, scoped task. Defines objective, success criteria, constraints, task weight, whether a spec is needed, acceptance criteria, and the next step.
---

# Shape Task

曖昧な要望・目的・懸念・アイデアを、**実装に入る前に**「実際に何をやるタスクなのか / どれくらい重いのか / 何があれば受け入れてよいか」を明確にする思考フレーム。

これは readonly なシェイピング。コードを書く許可ではない。整理して出力するだけ。

## このスキルが答えること

> 私たちは実際に何のタスクをやろうとしていて、どれくらい重く、何が証跡になれば受け入れられるのか？

planning の前に位置する。曖昧な議論を、いきなり実装や重い成果物に変えてしまうのを防ぐ。

## やること

1. ユーザーの目的を平易な言葉で言い換える。
2. ユーザーが握る決定（目的・戦略・制約・採否)と、こちらが提案する実行詳細を分ける。
3. 具体的な objective を提案する。
4. success criteria / constraints / non-goals / assumptions / open questions を挙げる。
5. タスクの重みを分類する: `trivial` / `exploratory` / `standard` / `behavior-changing` / `heavy-risky`
6. spec が必要かを判断する: `no` / `optional` / `recommended` / `required`
7. 必要なら、作るべき成果物の名前を挙げる。
8. acceptance criteria と必要な証跡を定義する。
9. review の重みを決める。
10. 次の一手を推奨する: 議論を続ける / 範囲を区切った調査 / planning / 直接実行（trivial の場合)

### セキュリティの扱い

要望が認証・認可・データ・課金・個人情報・破壊的操作・外部公開に触れるなら、自動的に `heavy-risky` 寄りに倒し、**Security Requirements を constraints と acceptance criteria に明記する**。汎用のリスク欄任せにしない。

## 出力フォーマット

簡潔な task brief を出す:

```text
Task Shape

Interpreted Purpose:
- ...

Proposed Objective:
- ...

Success Criteria:
- ...

Constraints:
- ...

Security Requirements:
- ...（該当しなければ none)

Non-Goals:
- ...

Assumptions:
- ...

Open Questions:
- ...

Decision Candidates:
- ...

Task Weight:
- trivial | exploratory | standard | behavior-changing | heavy-risky

Spec Needed:
- no | optional | recommended | required

Suggested Artifact:
- ...

Acceptance Criteria:
- ...

Evidence Needed:
- ...

Review Weight:
- ...

Human Approval Needed:
- yes | no

Suggested Next Step:
- ...
```

## ガードレール

- シェイピングを「実装してよい承認」と扱わない。
- すべてのタスクに full spec を強制しない。重み判定で要否を決める。
- objective・scope・acceptance が明確になる前に作業へ進めない。
- 目的・scope 拡大・破壊的操作・認証情報の使用・deploy・採否は、こちら側で勝手に握らない。常にユーザーの決定対象として残す。
- 要望が「読む・学ぶ・概念的な議論・戦略整理」だけなら、ユーザーが実行可能な改善を選ぶまでは議論として扱い、無理にタスク化しない。

## 例

戦略議論:

```text
ユーザーハーネスを自立化したい。どう進めるべきか整理したい。
```
→ 想定: `exploratory`、full spec なし、議論継続か範囲を区切った調査。

明確な実装:

```text
readonly のタスク整理機能と、それ用のテストを足したい。
```
→ 想定: `standard`、spec は optional、承認後に planning。

リスクの高い実装:

```text
本番の認証マイグレーションを変更して deploy したい。
```
→ 想定: `heavy-risky`、承認済み plan か design spec が required、強い検証と残存リスクの受け入れ、Security Requirements を明記。

## 注意

- これは明示的に呼ぶスキル。常時発火ルールではない。
- ブラウザのチャットで動かす版なので、ローカルのファイル生成・telemetry・進捗永続化は行わない。出力した task brief は、必要ならユーザーが自分で保存する。
