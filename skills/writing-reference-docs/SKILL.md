---
name: writing-reference-docs
description: "Decide whether a persistent reference doc should exist, which kind it is, and where it belongs before writing it. Use when asked to write a design doc, architecture doc, README, runbook, or any docs/ file, and when tempted to save an explanation of current state."
---

# Writing Reference Docs

このスキルは**判定だけ**を担う。何をどこに置くか、何を守るかは
`~/.claude/rules/common/documentation.md` が正本で、そこに書いてあることをここで繰り返さない。
繰り返した時点で契約が2つになり、必ず乖離する。

構築の実行も担わない。判定が済んで書く段になったら `/docs-build`（`docs/` 一式）か
`/repo-map`（`AGENTS.md`）へ渡す。`/docs-build` は Grill を通してから使う。
却下した案と Non-goals は決定の場でしか出ないので、後から書くと推定になる。

前提: **維持を前提にした doc は必ず嘘になる。嘘の doc は無い doc より悪い**（もっともらしいので疑われない）。
だから最も価値のある判定は「**書かない**」を返せることである。

## 判定に使う3つのテスト

規則を読む前に、この3つで大半は片付く。

### テスト1: 規模ゲート

新しくプロジェクトを始める時だけ使う。既に doc がある確立したプロジェクトには当てない
（「書くか」はとっくに答えが出ている）。

Lynch の3問に答える。

- 複数人で協調して実装するか
- 3ヶ月以上の作業になるか
- 数年本番で動くか

**0個 Yes → 書かない。** `AGENTS.md` と `TODO.md` で足りる、と返す。
1個以上なら規則の「規模による段階」に従って置き場を決める。

`~/.claude` の設定変更、単発のスクリプト、使い捨ての調査はここで止まる。

### テスト2: 「これは誰が、いつ直すのか」

答えられないなら作らない。

**エージェントは放置すると追随型 doc を作りたがる。** 現状説明の overview、目次、
設定値の一覧、ディレクトリ構成の羅列、手順を文章にした Tutorial。
どれも書いた瞬間から実態とずれ始め、ずれても静かに壊れる。

唯一の例外が `docs/architecture.md` で、それ以外に「今の姿」を保存しようとしていたら止める。

### テスト3: 「通読するか、引きに来るか」

型の判定はこれで切れる。通読するものと引きに来るものを1つの doc に混ぜると、
通読が成立しなくなる。引きに来るもの（値・型・シグネチャ）はコード側に置く。

置き場の対応表は規則にある。

## 判定できたら

規則の「必ず守ること」を読んでから書く。
判定を通したことは、規則を読まなくてよいという意味ではない。
