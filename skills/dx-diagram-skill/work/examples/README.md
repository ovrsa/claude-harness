# Examples

このディレクトリは、DX 図解 Skill の `input -> output -> review` 見本一式を置く場所。

## Example Scenario

対象シナリオ:

- 営業が問い合わせを受ける
- 管理職が対応方針を判断する
- 現場担当が手配する
- 顧客へ完了連絡する

改善前:

- 承認待ちが長い
- Excel と基幹への二重入力がある
- 人が進捗確認を繰り返す

改善後:

- 標準案件は DX システムが自動処理する
- 例外案件だけ管理職と現場担当が関与する
- 人は例外判断に集中する

## Files

- `example-swimlane-intake.md`: 図の元になった棚卸し
- `example-ai-decision-matrix.md`: A/B/C と Delegate/Review/Own の見本
- `example-kpi.md`: Before / Target の見本
- `swimlane-3layer-minimal.drawio`: 3層分離方式の最小参考実装（列=担当・システム / 行=フェーズ）。新規スイムレーンはまずこのファイルを参考にする
- `swimlane-current.drawio`: 旧方式の現状スイムレーン。**新規作図では参考にしない。歴史的経緯で残置**（横=フェーズ軸 / 1 セルに `① ② ③` 連番詰め込み / `主担当ではない` 等のプレースホルダ使用 / 判断セル内 `【判断セル】` 文字使用 — いずれも現行 Critical Rules に違反）
- `swimlane-future.drawio`: 旧方式の改善後スイムレーン。**新規作図では参考にしない。歴史的経緯で残置**（同上の旧パターンを含む）
- `structurizr/workspace.dsl`: 同じシナリオの C4 例
- `verification/`: 確認時の証跡用

## How to Use

1. `swimlane-3layer-minimal.drawio` を開いて 3 層分離方式（背景塗り＋細い区切り線＋小タスクボックス）の構造を確認する
2. `example-swimlane-intake.md` を読む
3. `example-ai-decision-matrix.md` を見て、AI 判断を図の外に出す理由を確認する
4. `example-kpi.md` を見て、図だけで終わらせないことを確認する
5. `structurizr/workspace.dsl` を見て、同じシナリオを C4 の構造図にどう落とすか確認する

旧 `swimlane-current.drawio` / `swimlane-future.drawio` は軸方向・グリッド方式に加え、現行 Critical Rules（1 タスク 1 ボックス／空きマス空白／条件分岐は独立ひし形）にも違反しているため、新規作図のテンプレートとしては使わない。

## Reading Intent

- `example-swimlane-intake.md` は input の正本
- `swimlane-3layer-minimal.drawio` は現行標準（列=担当 / 行=フェーズ / 3 層分離 / 1 タスク 1 ボックス / 条件分岐は独立ひし形 / 空きマスは空白）の output 見本
- `swimlane-current.drawio` と `swimlane-future.drawio` は旧標準の歴史的記録
- `example-ai-decision-matrix.md` と `example-kpi.md` は図の外に持つ補助表の見本
- `structurizr/workspace.dsl` は system 観点の見本
