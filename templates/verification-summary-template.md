# Verification Summary

## Scope

- approved task verification

## Commands Run

- pending: replace with rerunnable command evidence before completion

## RED Evidence

- command:
- observed failure:

## Verification Outcome

- pending

## Guardrail Candidates

- none

## Assessment

- record rerunnable verification evidence only
- move acceptance concerns to `review-summary.md`
- move runtime evidence to `observation-summary.md` when needed

<!-- verify は build / lint / types / tests / contract audit のような再実行可能な検査だけを記録する。
実行したコマンドとその結果を書く。

RED Evidence は「修正前に新しいテストが落ちたこと」を記録する。これも再実行可能な検査なので
ここが置き場所（review ではない）。テストを足していない変更なら、その事実を書く。空欄で流さない。
coverage の数字は書かない。測定ツールが配線されていないので、書けば必ず作った数字になる。

verify は受容の必要条件であって十分条件ではない。通っても acceptance は決まらない
（それは evaluate の仕事）。未解決のレビュー指摘や実行時の証拠をここに畳み込まない。 -->
