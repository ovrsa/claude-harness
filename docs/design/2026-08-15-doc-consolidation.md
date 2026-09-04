# ハーネスの文書統合と重複契約の撤去

日付: 2026-08-15

## Objective

`~/.claude` を他の開発者が読み物として読める状態にする。文書と実装の乖離を「揃える」のではなく、
契約を1箇所に寄せて**発生しえない構造**にする。

## なぜ今これか

共有の意図が生じたので点検した結果、20件の乖離が見つかった。ただし個別修正では再発する。
実測がそれを示していた。ルート文書894行が3.8ヶ月47セッションで**参照されたのは4回**、
`HARNESS.md`(266行) は作業時参照0回。同じ契約が最大6箇所にあり、
`audit-harness-contract.js` は20件の乖離を抱えたまま **PASS していた**。
文字列の存在検査は「テキストが動いていないこと」しか見ておらず、一致を何も保証しない。

## Non-goals

- 他の開発者が自分の環境で**動かせる**ようにすること（remote 無し、逆リンク5件が git 管理外）
- 共同編集リポジトリにすること
- ローカル作成の未起動スキル23本と `continuous-learning-v2` の判定
- `task_runs` のテストフィクスチャ7件の掃除

## 触る対象

| 対象 | 変更内容 | 壊す可能性のあるもの |
|---|---|---|
| ルート文書5本（684行） | 削除。今の姿は `docs/architecture.md`、契約は `templates/` へ | 参照元11箇所 |
| `hooks/hooks.json` | 撤去。`settings.json` を単一の正本に | CI・テスト6ファイル |
| ECC 由来スキル40本（12,268行） | 削除 | `performance.md` ほか参照元5件 |
| **契約: ゲート意味論** | `HARNESS.md` から `templates/*.md` へ | review/verify/observe の判定 |
| **契約: `progress.md` スキーマ** | `SESSION.md` から `templates/progress-template.md` へ | 完了ゲート |
| **契約: 許可クラス** | 文書を削除。`permission-resolver.js` が正本 | Bash の deny/allow |
| `audit-harness-contract.js` | 文字列存在検査 → 不一致検出9種 | CI |

## 却下した案

- **動かせる形での共有** — remote が無く、逆リンク5件は clone しても欠ける。配布基盤の新設から始まる
- **ルートに `HARNESS.md` を統合先として残す** — `docs/architecture.md` と維持義務が2つになる
- **未実装の設計文書を削除** — 却下・未実装の記録こそ `docs/design/` の存在理由
- **監査を移動先に合わせて書き換えるだけ** — vacuous なまま。同じ乖離を三度目も見逃す
- **`AUTONOMY_POLICY.md` の Autonomy Ladder を引き継ぐ** — 作成以来コミット1回、3.8ヶ月で参照2回。
  実装は `permission-resolver.js` にあり、ladder の上位2段は一度も到達していない。
  未行使の理想を決定として残さない

## Open Issues

- `docs/architecture.md` 本体は A4 1.9枚。arc42 の Risks（Open Issues）を含めると2.9枚で、
  規約の「A4 1〜2枚」を本体のみの制約と解釈した
- 未起動スキル31本14,668行を残した。ローカル作成23本は1本ずつの判断が要る
- `continuous-learning-v2` は3コマンドが `instinct-cli.py` を実行する実行時依存を持つ一方、
  学習成果は3.5ヶ月で0件。コマンドごと生きているかの判定が先に要る
- 尋問系3本とライフサイクルゲートが噛み合っていない。`issue-framing` で要件整理をしても
  `/docs-build` の grilling ゲートは通らない
- SQL スキル2本の内容重複795行。両方 lock 管理下で自動選択の衝突は無いため優先度は低い
