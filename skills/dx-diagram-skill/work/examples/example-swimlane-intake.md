# Example Swimlane Intake

## 0. Basic Info

- Initiative name: 標準案件の受付・手配 DX
- Target business process: 問い合わせ受付から完了連絡まで
- Author: Codex
- Interviewees: 想定ケース
- Date: 2026-04-09

## 1. Scope

- Start condition: 営業が問い合わせを受けた時点
- End condition: 顧客へ完了連絡が済んだ時点
- Included steps: 受付、方針判断、手配、進捗確認、完了連絡
- Excluded steps: 請求、事後分析
- Diagram granularity: 業務フェーズ単位

## 2. Lane Definition

| lane_id | lane_name | lane_type | primary_responsibility | notes |
| --- | --- | --- | --- | --- |
| L1 | 営業 | team | 問い合わせ受付、顧客連絡 | 顧客接点 |
| L2 | 管理職 | person | 方針判断、承認 | 例外判断責任者 |
| L3 | 現場担当 | team | 手配、進捗確認 | 実作業担当 |
| L4 | 基幹・既存システム | system | 正本保持 | 改善前は受け身 |
| L5 | DX システム | system | 標準案件の自動処理 | 改善後に追加 |

## 3. Step Inventory

| seq | step_id | lane_id | step_name | step_kind | trigger | input | output | decision_criteria | next_step | branch_condition | handoff_to | used_tool | system_of_record |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | S1 | L1 | 問い合わせを受ける | task | 顧客連絡 | 顧客依頼 | 受付内容 |  | S2 |  | L1 | 電話 / メール | なし |
| 2 | S2 | L1 | 依頼内容を転記する | task | S1 | 受付内容 | 共有内容 |  | S3 |  | L2 | Excel | なし |
| 3 | S3 | L2 | 対応方針を判断する | decision | S2 | 共有内容 | 対応方針 | 緊急性、標準可否 | S4 | 標準 / 例外 | L3 | 口頭 / メール | なし |
| 4 | S4 | L3 | 手配する | task | S3 | 対応方針 | 手配結果 |  | S5 |  | L4 | Excel | Excel |
| 5 | S5 | L3 | 進捗を確認する | task | S4 | 手配結果 | 完了報告 |  | S6 |  | L1 | 電話 / メール | 基幹 |
| 6 | S6 | L1 | 顧客へ完了連絡する | task | S5 | 完了報告 | 完了通知 |  |  |  |  | メール | 基幹 |

## 4. Bottleneck Notes

- Waiting points: 管理職承認待ち、現場からの完了報告待ち
- Rework points: Excel と基幹への再入力
- Ownership ambiguity: 標準案件と例外案件の境界が曖昧
- Double entry: Excel と基幹
- Exception-heavy steps: 方針判断
- Unclear system of record: 受付段階では正本がない
