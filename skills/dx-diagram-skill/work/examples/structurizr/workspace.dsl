workspace "DX Diagram Example" "C4 sample focused on system boundaries, responsibilities, and integrations" {
    !identifiers hierarchical

    model {
        sales = person "営業担当" "案件を登録し、顧客へ完了連絡を行う"
        approver = person "例外承認者" "例外案件だけを確認し、承認する"
        operator = person "現場担当" "例外案件だけを処理し、完了結果を登録する"

        dxPlatform = softwareSystem "DX案件オーケストレーション基盤" "標準案件の自動処理と、例外案件の判断・実行フローを支える中核システム" {
            portal = container "業務ポータル" "営業、承認者、現場担当が案件を登録、確認、承認する画面" "Web App"
            workflowApi = container "ワークフローAPI" "案件状態、例外判断、操作権限を管理する中核API" "Backend API" {
                apiController = component "案件APIコントローラー" "案件登録、承認、結果登録の入口となるAPI" "REST Controller"
                authPolicy = component "認可ポリシー" "ユーザー権限と操作可能範囲を判定する" "Authorization Component"
                exceptionService = component "例外判断サービス" "例外案件の承認要否と進行先を決定する" "Domain Service"
                stateSyncService = component "状態同期サービス" "ERP との状態同期と更新指示を扱う" "Application Service"
                auditLogService = component "監査ログサービス" "操作履歴と承認履歴を保存する" "Application Service"
            }
            rulesEngine = container "判定・自動化エンジン" "標準案件の判定と自動実行を行う" "Rules Engine / Worker"
            notificationJob = container "通知ジョブ" "完了通知と例外依頼通知を送る" "Async Worker"
            workflowDb = container "ワークフローDB" "案件状態、承認履歴、監査ログを保持する" "PostgreSQL" {
                tags "Database"
            }
        }

        erp = softwareSystem "ERP / 基幹システム" "業務状態の正式な記録を保持する外部システム" {
            tags "External"
        }
        notify = softwareSystem "通知サービス" "メールやチャットで社内外へ通知を送る外部サービス" {
            tags "External"
        }
        idp = softwareSystem "認証基盤" "社内ユーザーの認証と権限確認を提供する外部サービス" {
            tags "External"
        }

        sales -> dxPlatform "案件を登録する"
        sales -> dxPlatform "案件状態を確認する"
        approver -> dxPlatform "例外案件を承認する"
        operator -> dxPlatform "例外処理の結果を登録する"

        dxPlatform -> erp "案件状態を同期する"
        dxPlatform -> notify "完了通知と依頼通知を送る"
        dxPlatform -> idp "ユーザーを認証する"

        sales -> dxPlatform.portal "ブラウザで利用する"
        approver -> dxPlatform.portal "ブラウザで利用する"
        operator -> dxPlatform.portal "ブラウザで利用する"

        dxPlatform.portal -> idp "ログイン時に認証する"
        dxPlatform.portal -> dxPlatform.workflowApi "案件を登録・確認する"
        dxPlatform.portal -> dxPlatform.workflowApi "例外案件を承認する"
        dxPlatform.portal -> dxPlatform.workflowApi "処理結果を登録する"

        dxPlatform.workflowApi -> dxPlatform.workflowDb "案件状態と監査ログを保存する"
        dxPlatform.workflowApi -> dxPlatform.rulesEngine "標準案件の判定と自動処理を依頼する"
        dxPlatform.workflowApi -> dxPlatform.notificationJob "通知送信を依頼する"
        dxPlatform.workflowApi -> erp "案件状態を同期する"

        dxPlatform.rulesEngine -> dxPlatform.workflowDb "判定結果と実行結果を保存する"
        dxPlatform.rulesEngine -> erp "標準案件の状態を反映する"

        dxPlatform.notificationJob -> dxPlatform.workflowDb "通知対象を参照する"
        dxPlatform.notificationJob -> notify "通知を送信する"

        dxPlatform.portal -> dxPlatform.workflowApi.apiController "API を呼び出す"
        dxPlatform.workflowApi.apiController -> dxPlatform.workflowApi.authPolicy "操作権限を確認する"
        dxPlatform.workflowApi.apiController -> dxPlatform.workflowApi.exceptionService "例外進行を判定する"
        dxPlatform.workflowApi.apiController -> dxPlatform.workflowApi.stateSyncService "状態更新を依頼する"
        dxPlatform.workflowApi.apiController -> dxPlatform.workflowApi.auditLogService "操作履歴を記録する"

        dxPlatform.workflowApi.authPolicy -> idp "権限情報を参照する"
        dxPlatform.workflowApi.exceptionService -> dxPlatform.workflowDb "案件状態を参照する"
        dxPlatform.workflowApi.exceptionService -> dxPlatform.rulesEngine "標準案件処理を依頼する"
        dxPlatform.workflowApi.stateSyncService -> erp "案件状態を同期する"
        dxPlatform.workflowApi.stateSyncService -> dxPlatform.notificationJob "通知送信を依頼する"
        dxPlatform.workflowApi.auditLogService -> dxPlatform.workflowDb "監査ログを保存する"
    }

    views {
        systemContext dxPlatform "context" {
            include *
            autoLayout lr
            title "System Context - DX案件オーケストレーション基盤"
        }

        container dxPlatform "containers" {
            include *
            autoLayout lr
            title "Container Diagram - DX案件オーケストレーション基盤"
        }

        component dxPlatform.workflowApi "workflowApiComponents" {
            include *
            autoLayout lr
            title "Component Diagram - ワークフローAPI"
        }

        theme default
    }
}
