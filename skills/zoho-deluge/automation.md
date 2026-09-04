# 自動化: Custom Function / Workflow Rule / Schedule / Zoho Flow との使い分け

Deluge のコード自体は素のスクリプトに過ぎず、**どこにフックされて走るか**で自動化の性質が決まる。本ファイルはその「実行コンテキスト」を整理する。

## 1. Custom Function（Zoho CRM 中心）

### 取り付けポイント

CRM の Custom Function はスタンドアロン関数として登録され、以下から呼び出せる:

1. **Standalone** — REST API 経由で外部から呼ぶ
2. **Workflow Rule** — レコードイベントや時刻トリガから呼ぶ
3. **Custom Schedule** — cron 的バッチ
4. **Custom Button** — レコード詳細画面のボタン
5. **Related List** — 関連リスト上のアクション
6. **Validation Rule** — 入力検証時

### 関数シグネチャ

```deluge
<returnType> <namespace>.<FunctionName>(<typedArgs>)
{
    // 引数は input.<name> でアクセス（CRM の慣習）
}
```

- 戻り値型: `void`, `int`, `string`, `decimal`, `bool`, `map`, `list`, `collection`, `date` …
- 名前空間: CRM 既定は `workflowspace.` だがカスタム名空間も可

### REST API 公開

Setup → Developer Hub → Functions → 対象関数 → ⚙ → **REST API**。

- 認証: **OAuth 2.0** か **API Key**。
- 呼び出し: POST `form-data` の `arguments` キーに JSON 文字列を入れる。または GET の `arguments=<urlencoded_json>`。
- **`arguments` という名前の引数を関数側で定義しない**。POST body 全体がその引数に丸ごと入ってしまう。

### Workflow Rule からの呼び出し

Workflow Rule は CRM の「レコードイベント or 時刻ベース」自動化フレームワーク。アクションとして Custom Function を最大 **6 個（即時 1 + 時刻 5）** 呼べる。

- トリガ: Create / Edit / Field Update / Delete / Convert / 時刻
- Criteria: フィールドベースのフィルタ
- Action 種別: Email / Task / Field Update / Webhook / **Function** / Tag

> **ドキュメント注記**: 旧 KB の URL `help.zoho.com/portal/en/kb/crm/automate-business-processes/workflow-rules` は 404。挙動は `crm/developer/docs/functions/programming.html` と `set-up-functions.html` から再構成している。最新仕様は CRM の Setup → Automation → Workflow Rules 画面または公式 Developer Docs から確認すること。

### 1.5 Workflow Rule → Function 引数の橋渡し（重要）

Workflow Rule のアクションで Function を呼ぶとき、**「引数の関連付け」UI**（Associate Arguments）で「関数側の引数 ← トリガレコードの merge field」をマッピングする。コード側はそれを `input.<name>` で受ける。

**手順**:
1. Function 側で引数を**型付き**で宣言する。
2. Workflow Rule 編集 → アクションで Function を選ぶ → **Edit Arguments** で `argName ← #Module.FieldName` を組む。
3. Function 内では `input.argName` でその値を読む。

**例: Lead Created で Function を起動して Email を引数で受ける**:

```deluge
void crm.on_lead_created(string LeadId, string Email, string LastName)
{
    // Workflow Rule の Edit Arguments で
    //   LeadId  ← ${Leads.Lead Id}
    //   Email   ← ${Leads.Email}
    //   LastName← ${Leads.Last Name}
    // を割り当てた前提

    if (isNull(Email) || Email.length() == 0) { return; }

    info "fired for lead=" + LeadId + " email=" + input.Email;

    // フル情報が要るときは ID で改めて取り直す
    full = zoho.crm.getRecordById("Leads", input.LeadId.toLong());
    company = ifNull(full.get("Company"), "(unknown)");

    enrich = Map();
    enrich.put("Industry", "Pending Enrichment");
    zoho.crm.updateRecord("Leads", input.LeadId.toLong(), enrich);
}
```

**注意点**:
- 関連付け UI で渡せるのは**トリガレコードのフィールド**だけ。関連レコードや別モジュールの値が必要な場合は、関数内で `getRecordById` / `getRelatedRecords` で取り直す。
- 引数名に `arguments` を使わない（[pitfalls.md](pitfalls.md) §11）。
- 時刻起動（Time-Based）の Function は、時刻になった時点でのレコード状態を渡す。途中で消えた場合は `getRecordById` が null を返す可能性があるので null チェック必須。

## 2. Custom Schedules（Zoho CRM）

cron 的バッチ。

### 設定

**Setup → Automation → Schedules → Create Schedule**。

### 周期

once / daily / weekly / monthly / yearly、Custom 曜日 / 日付セレクタも可。

### 制限

| 項目 | 上限 |
|---|---|
| 1 組織あたり Active Schedule | **10** |
| Function 実行時間 | **5 分** |
| Function 実行行数 | **200,000** |
| 手動トリガ | **1日 2 回** まで |
| 開始日時の最大未来 | **1 年** |
| 必要権限 | Manage Workflow |

### サンプル: 毎朝 7:00 に前日成約案件を集計

```deluge
void crm.daily_won_summary()
{
    yesterday = subDay(zoho.currentdate, 1).toString("yyyy-MM-dd");
    deals = zoho.crm.searchRecords(
        "Deals",
        "(Stage:equals:Closed Won)and(Closing_Date:equals:" + yesterday + ")"
    );
    body = "<h2>Won " + yesterday + "</h2><ul>";
    total = 0.0;
    for each d in deals {
        body = body + "<li>" + d.get("Deal_Name") + " — $" + d.get("Amount") + "</li>";
        total = total + d.get("Amount").toDecimal();
    }
    body = body + "</ul><p>Total: $" + total + "</p>";
    sendmail[
        from: zoho.adminuserid
        to:   "sales-leadership@zylker.com"
        subject: "Won deals " + yesterday
        message: body
        content type: HTML
    ];
}
```

## 3. Creator のフォーム/ワークフロー

Creator では Deluge を貼り付ける場所が違う:

- **Form Workflow**: フォームの On Load / On User Input / On Validate / On Add / On Edit / On Delete
- **Schedule Workflow**: 時刻起動
- **Custom Action**: レポート上のボタンや一括操作
- **Approval Workflow**: 承認段階
- **Page**: HTML スニペット内 Deluge

シグネチャは CRM と同じだが、`input.*` の代わりに `<form>.<field>` をそのまま読み書きする場面が多い。

## 4. Workflow Rule vs Schedule vs Zoho Flow の使い分け

| 状況 | 第一候補 |
|---|---|
| 単一 Zoho アプリ内、レコードイベント駆動 | **Workflow Rule + Custom Function** |
| 定刻バッチ（夜間集計、定期同期） | **Custom Schedule** |
| 複数 SaaS をまたぐ視覚的フロー、非エンジニアが保守 | **Zoho Flow** |
| 外部からのイベント受信 → 加工 → CRM 反映 | **Standalone Function** を REST 公開 → Webhook 元から POST |
| 複雑な条件分岐 / 暗号化 / 大量データ加工 | Deluge（Flow より圧倒的に表現力が高い） |

Zoho Flow は **800+ アプリの no-code 連携プラットフォーム**。トリガ→ロジック→アクションをドラッグ&ドロップで組む。複雑な変換や認証越えのカスタム HTTP を頻繁に書くなら Deluge Custom Function の方が向く。

## 5. Webhook の出入り両方向

### 出方向（Zoho → 外部）

- Workflow Rule の **Webhook アクション** で URL に POST/GET（GUI 設定）
- Custom Function 内で **`invokeurl`**（柔軟、推奨）

### 入方向（外部 → Zoho）

- Standalone Custom Function を **REST API として公開**
- 呼び元から POST `form-data` の `arguments` で JSON を投げる
- 認証は OAuth 2.0 または API Key

## 6. レビューチェックリスト

- [ ] 関数の **戻り型と引数型** は宣言されているか
- [ ] 引数アクセスが **`input.<name>`** か（CRM）
- [ ] **`5000 statement`** を超えそうなループが無いか（[error-handling.md](error-handling.md) 参照）
- [ ] **Connection** を使っているか（生 OAuth トークンの埋め込みは禁止）
- [ ] エラー時の **`try/catch` と `info`** ログがあるか
- [ ] 外部 API 呼び出しが **冪等** に書かれているか
- [ ] Workflow Rule から呼ぶ場合、**6 関数上限** を超えていないか
- [ ] Schedule から呼ぶ場合、**5分 / 200,000 行 / Active 10** に収まるか

## 出典

- https://www.zoho.com/crm/developer/docs/functions/programming.html
- https://www.zoho.com/crm/developer/docs/functions/set-up-functions.html
- https://www.zoho.com/crm/developer/docs/serverless-architecture/custom-schedules.html
- https://www.zoho.com/crm/developer/docs/serverless-architecture/deluge-limits.html
- https://www.zoho.com/flow/help/
