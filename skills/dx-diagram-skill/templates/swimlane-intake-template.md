# Swimlane Intake Template

## 0. Basic Info

- Initiative name:
- Target business process:
- Author:
- Interviewees:
- Date:

## 1. Scope

- Start condition:
- End condition:
- Included steps:
- Excluded steps:
- Diagram granularity:

## 2. Lane Definition

| lane_id | lane_name | lane_type | primary_responsibility | notes |
| --- | --- | --- | --- | --- |
| L1 |  | person / team / system / external |  |  |

## 3. Step Inventory

| seq | step_id | lane_id | step_name | step_kind | trigger | input | output | decision_criteria | next_step | branch_condition | handoff_to | used_tool | system_of_record |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | S1 |  |  | start / task / decision / approval / end |  |  |  |  |  |  |  |  |  |

## 4. Bottleneck Notes

- Waiting points:
- Rework points:
- Ownership ambiguity:
- Double entry:
- Exception-heavy steps:
- Unclear system of record:

## 5. Diagram Readiness Check

- Can time flow be shown in one direction?:
- Are start and end clear?:
- Are decisions separable from tasks?:
- Are handoffs explicit?:
- Is the granularity consistent?:
- Does the exception flow need a separate diagram?:

## 6. Pre-Implementation Design (Required Before Editing .drawio)

### Grid Method

- 軸方向: 列=担当・システム / 行=業務フェーズ（時系列は上→下）
- グリッド方式: 3層分離（背景＋細い区切り線＋小タスクボックス）を採用する
- 例外（左→右標準を取る等）がある場合は理由を書く:

### Lane List

| lane_id | lane_name | primary_phases |
| --- | --- | --- |
| L1 |  |  |

### Cell Content (lane × phase)

セル内のタスクは 1 行 1 タスク。複数手順を `① 〇〇 / ② 〇〇` でまとめない（描画時に 1 ボックス 1 タスクに分割するため）。

| phase \ lane | L1 | L2 | L3 | L4 |
| --- | --- | --- | --- | --- |
| P1 | 例: `Excel記入` ↓ `メール送付` |  |  |  |
| P2 |  | 例: `内容確認` ↓ ◇`承認可否` |  |  |
| P3 |  |  |  |  |

- 動詞句のみ。連番 `① ② ③` は付けない（描画時の handoff 矢印にのみ付与）
- 条件分岐は `◇〇〇` と明示（独立ひし形ノードとして描画される）
- 空きマスは空白のままにする（`未関与` `主担当ではない` `結果待ち` `参照のみ` のプレースホルダは置かない）
- ボトルネック（`48h 待機` 等）として議論したい場合のみ、その空白に短い灰ラベル候補を書く

### Arrow List

| kind | from (lane × phase × task) | to (lane × phase × task) | label |
| --- | --- | --- | --- |
| レーン跨ぎ主経路 |  |  | ① |
| レーン内タスク間 |  |  | （ラベルなし） |
| NG / 差戻し |  |  | NG: 〇〇 |
| 前提・補助 |  |  |  |

種類は `レーン跨ぎ主経路 / レーン内タスク間 / NG / 前提 / フェーズ間` のいずれか。レーン跨ぎのみ番号付きラベル。

## 7. AI Support Notes

- A/B/C hypothesis:
- Delegate notes:
- Review notes:
- Own notes:
