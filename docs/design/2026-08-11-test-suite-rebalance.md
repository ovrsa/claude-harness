# テストスイートの配分是正と、緑表示の信頼回復

日付: 2026-08-11

## Objective

テストの総数ではなく配分を直し、`npm test` の「全通過」表示が実際に全通過を意味する状態に戻す。

## なぜ今これか

「テストが多すぎないか」という問いから計測したところ、多さより**配分の逆転**と**緑表示の不正確さ**が問題だった。

- 中核2モジュール（`session-trace.js` 1,474行・16参照、`task-artifacts.js` 928行・20参照）にテストは計16件
- 一方 `session-manager.js`（2参照）165件、`session-aliases.js`（4参照）105件、`package-manager.js`（5参照）115件
- `KNOWN_BASELINE_FAILURES` が5件を passed/failed の**両方から除外**していたため、失敗中でも `Failed: 0` と表示されていた
- 集計が `Passed:` の**最初**の一致を採っており、総数を20件取りこぼしていた
- `run-all.js` 未登録のまま放置されたテストファイルが6件（うち3件は通る、2件は対象が死んでいる、1件は落ちる）

つまり「1,186件全通過」という数字は、母数も判定も正確ではなかった。

## Non-goals

- カバレッジ計測の導入。目標値を語れる状態にはしない
- `tests/hooks/hooks.test.js`（5,581行）の分割
- `scripts/engine-adapter.ts` の配線または撤去の判断
- 残る ECC 由来 skills 44本の判断

## 触る対象

| 対象 | 変更内容 | 壊す可能性のあるもの |
|---|---|---|
| `scripts/lib/` | 参照ゼロの4モジュールを削除（`ui-detect` `shell-split` `task-router` `task-shaper` 計731行） | なし。`.md` を含む全文検索で参照ゼロを確認済み |
| `tests/hooks/hooks.test.js` | 免除リストと `--allow-known-baseline` を撤去。`createSessionStartFixture` で HOME と cwd を隔離 | 隔離が不十分なら該当テストが環境で揺れる |
| `tests/run-all.js` | 3ファイルを登録。スキップを理由付きで明示。集計を最後の一致に変更。終了コードを総計へ反映 | 総数が過去の記録と不連続になる |
| `scripts/ci/audit-harness-contract.js` | 免除リストの「存在」assert を「不在」assert へ反転 | 免除機構を再導入すると CI が落ちる（意図した挙動） |
| `tests/lib/session-trace.test.js` | 6 -> 24件 | なし（追加のみ） |
| `tests/lib/task-artifacts.test.js` | 10 -> 30件 | なし（追加のみ） |

契約の変更はない。`classifyRunStatus` の**優先順位**を分岐ごとにテストで固定したので、以後この順位は契約として扱う。

## 判明した具体的な欠陥

1. **免除リストが失敗を隠していた。** 5件のうち3件は、リポジトリ直下に `plan.md` / `progress.md` があると落ちる。
   `session-start.js` がリポジトリ成果物を previous-session summary より優先するため。
   つまり**タスク実行中は常に3件が失敗しており、その間だけ隠れていた**。退避すると 214 -> 217 に戻ることで確認した。
2. **契約監査がその免除機構を義務付けていた。** `audit-harness-contract.js` は `KNOWN_BASELINE_FAILURES` の存在を assert しており、
   撤去しようとすると CI が落ちる構造だった。守るべき対象と守る仕組みが逆を向いていた。
3. **集計が最初の一致を採っていた。** 途中経過に `Passed: N` を出すファイルで取りこぼし、合計が個別実行の合計より少なかった。
4. **走らないテストが黙って存在していた。** 未登録6ファイルのうち `engine-adapter` は5件落ちる（`tsx` 未導入）。
   一覧から外れているだけで、緑の見た目には一切現れなかった。

## 却下した案

- `session-manager.js` の165件を削除する: 当初「参照ゼロ」と判定したが誤り。`commands/sessions.md` が4箇所で require している。
  `grep` の除外パターンがパス先頭の `./` 有無で外れ、`head` の打ち切りに隠れていた
- 環境依存の3件を削除する: 隠れていただけで、検証している挙動自体は有効。隔離すれば残せる
- 総数を減らすことを目標にする: 減らすべきは死んだ対象であって件数ではない。結果として総数は 1,186 -> 1,28x に増えた

## Open Issues

- `tests/hooks/hooks.test.js` が高負荷時に断続的に停止する。停止位置は毎回異なり、単体再現はしていない。
  1MB stdin のデッドロックを疑って5回試したが再現せず、原因未特定
- 未計測のまま残る領域: `utils.js`（33参照）以外の高参照モジュールに対する分岐網羅、カバレッジ数値
- `scripts/engine-adapter.ts` は参照ゼロのまま。配線するか撤去するかの判断が未着手
- `getLatestRunState` は `dbPath` を明示しても既定値 `getTelemetryDbPath()` が先に評価され、`~/.claude/telemetry/` を作る副作用がある
