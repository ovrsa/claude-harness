# Example AI Decision Matrix

| step_id | step_name | risk | context_dependence | creativity | classification | delegate | review | own | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | 問い合わせを受ける | medium | high | low | C | 人が受ける | 営業が内容確認 | 営業責任者 | 顧客接点のため人主導 |
| S2 | 依頼内容を転記する | low | low | low | A | システム入力補助または自動登録 | 事後監査 | 業務責任者 | 標準フォーム化しやすい |
| S3 | 対応方針を判断する | high | high | medium | C | AI は判断材料整理のみ | 管理職が判断 | 管理職 | 例外判断は人が持つ |
| S4 | 手配する | medium | medium | low | B | 標準案件は自動手配 | 現場担当が確認 | 業務責任者 | 例外は人対応 |
| S5 | 進捗を確認する | low | low | low | A | システムが状態同期と通知 | 事後確認 | 業務責任者 | 人の追跡を減らす |
| S6 | 顧客へ完了連絡する | medium | medium | low | B | 下書き生成または自動通知 | 営業が確認 | 営業責任者 | 対顧客文面は要確認 |
