<!--
節を消さない。2026-08-21 から `scripts/lib/task-artifacts.js` がこのテンプレートの全10節を
要求する。欠けた節は `missingSections` になり、成果物は incomplete としてチェーンを止める。
触っていない回は1行（「該当なし」）で埋める。**空にはできるが、消すことはできない。**

必須節リストとこのファイルの見出しが一致することは
`tests/lib/task-artifacts.test.js` が検査する。片方だけ変えると落ちる。
-->

# Review Summary

## Review Scope

- design compliance, security, comment adequacy, code quality, and test adequacy

## Design Compliance

-

## Security

- 触れた面:

<!-- 許可・認証の判定 / 信頼できない入力のパース / シェル・SQL・パスの組み立て /
秘密情報 / ネットワーク送信先の決定。どれにも触れていなければ「該当面に触れていない」と1行。

触れた場合、コードを読むだけでは足りない。**敵対的な入力で実行し、入出力の表を残す。**
最低限の観点: 大小文字、フラグの並び順、`;` `&&` `||` `|` での連結、引用符、
コマンド置換、境界値（空・極大）。

2026-08-18 の permission-resolver.js のバイパスは、コードを読む形のレビューでは
数ヶ月見つからず、分類器を実行した数分で見つかった。 -->

## Comment Adequacy

- 落とした:
- 残した:
- 足した:
- 比率:

<!-- 落とす = 撤去の年表（docs/design/ の役目。コードに書くと契約が2箇所になる）。
残す = コードだけからは読めない実装判断。足す = 非自明な判断が無説明の箇所。

比率はリポジトリの基準と比べる。閾値は無い。乖離が大きい時に理由を書く。
測り方は docs/how-to/run-a-task.md。 -->

## Code Quality

-

## Test Adequacy

- RED/GREEN evidence:
- BDD scenarios:
- integration/E2E evidence:
- observe evidence:

## Findings

- none

<!-- 1行1件、`SEVERITY: message` の形。SEVERITY は CRITICAL / HIGH / MEDIUM / LOW / INFO。
この形に合わない行は invalidFindings として弾かれ、成果物が incomplete になる。

**CRITICAL と HIGH はチェーンを止める**（`hasBlockingFindings`）。MEDIUM 以下は記録されるだけ。

**ここに書くのは未解決のものだけ。** 見つけて直したものは本文の該当節に書く。
2026-08-20 まで severity を問わず全件がブロック扱いで、`INFO: 特になし` でも止まっていた。
参照する側が到達不能だったので気づかれていなかった。 -->

## Residual Risks

- none

## Guardrail Candidates

- none

<!-- The parser only recognizes multi-line key-value candidates, not one-line slash-separated bullets.
Each candidate starts with `- failure_pattern: <text>`, followed by unbulleted lines for the rest:
- failure_pattern: <text>
  source: <text>
  recommended_layer: docs|command|hook|skill
  confidence: high|medium|low
All four fields are required, and recommended_layer must be one of the four values above or the
candidate is silently dropped (a warning appears in the pre-commit hook's stderr, not a block). -->

## Next Action

- none

<!-- Findings は未解決の項目だけを置く。各項目は次のいずれかの接頭辞を付ける:
CRITICAL: / HIGH: / MEDIUM: / LOW: / INFO:
例: `HIGH: missing runtime evidence`

受容した懸念は Findings ではなく Residual Risks へ移す。
**CRITICAL と HIGH が残る間は approval-ready ではない。MEDIUM 以下は記録されるだけで止めない。**
2026-08-21 まで、ここには「Findings が `none` になって初めて approval-ready」と書いてあった。
上の Findings 節が同じ日に severity 別の定義へ変わっており、**同じテンプレート内で矛盾していた。**
実測では6タスク中4件が `none` でないままマージされている。

`review-summary.md` は evaluate の成果物であって verify の代わりにはならない。
再実行可能な検査は `verification-summary.md`、実行時の証拠は `observation-summary.md`。 -->
