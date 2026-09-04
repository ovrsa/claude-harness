# 連携: invokeurl / Connections / zoho.crm / zoho.creator / Subform / Lookup

外部 API 連携と Zoho 内のレコード操作を担う中核タスク群。

## 1. `invokeurl` — 汎用 HTTP タスク

### フル文法

```deluge
response = invokeUrl
[
    url: <url_value>
    type: [<GET|POST|PUT|PATCH|DELETE|OPTIONS>]
    headers: [<map>]
    body: [<text | file | map>]
    parameters: [<text | file | map>]
    files: [<file | list>]
    connection: [<connection_link_name>]
    detailed: [<true|false>]
    response-format: [<NONE|STRING|FILE>]
    response-decoding: [<encoding>]
];
```

### GET

```deluge
response = invokeUrl [
    url: "https://api.example.com/items?limit=10"
    type: GET
];
```

### POST（JSON, Connection 利用）

```deluge
payload = Map();
payload.put("contact_name", "Shawn");

response = invokeurl [
    url: "https://books.zoho.com/api/v3/contacts?organization_id=53792286"
    type: POST
    body: payload.toString()
    headers: {"Content-Type":"application/json"}
    connection: "books_connection"
];
```

### PUT / DELETE

```deluge
upd = Map(); upd.put("status","active");
invokeUrl [
    url: "https://api.example.com/resource/123"
    type: PUT
    body: upd.toString()
    headers: {"Content-Type":"application/json"}
];

invokeUrl [
    url: "https://api.example.com/resource/123"
    type: DELETE
];
```

### multipart / ファイルアップロード

```deluge
fileResp = invokeurl [
    url: "https://example.com/some.pdf"
    type: GET
    response-format: FILE
];

invokeurl [
    url: "https://api.example.com/upload"
    type: POST
    files: fileResp
    connection: "my_conn"
];
```

### detailed レスポンス

```deluge
resp = invokeurl [
    url: "https://api.example.com/x"
    type: GET
    detailed: true
];
info resp.get("statusCode");
info resp.get("responseHeader");
info resp.get("responseText");
```

### 仕様の急所

- **タイムアウト 40 秒**。長時間処理は呼び出し先側で非同期化。
- **`body` と `parameters` は排他**。同時指定不可。
- **レスポンス上限 5 MB**。
- `body` に Map を渡すと既定で `multipart/form-data`。JSON 送信時は `Content-Type: application/json` を `headers` で明示し、`m.toString()` を渡す。
- GET ではクエリ文字列を **URL に直書き**する。`parameters` を GET に使わない。
- バイナリアップロードは `Content-Type: application/octet-stream`。
- 1日 2,000 コールまで（[error-handling.md](error-handling.md) 参照）。

### 旧 function 形式（非推奨）

`invokeUrl(url, type, body, headers)` の関数形式 (`web-data/invokeurl-function.html`) は残っているが、現行は **task 形式（角括弧ブロック）** を使う。

## 2. Connections（OAuth 等の認証管理）

### 概念

Connection は名前付きの認証情報。`invokeurl` の `connection:` に **Connection Link Name**（小文字英数 + `_`、先頭は小文字、≤50 文字）を渡す。

### 認証方式

- OAuth 2.0（Default / Custom Service）
- OAuth 1.0
- API Key
- Basic Auth
- AWS Signature v4

### 作成手順

1. 各サービスの **My Connections → Create Connection**
2. Default Service（Zoho 自社 / 著名 SaaS）か Custom Service を選ぶ
3. Connection Name と Link Name を指定
4. 認証種別を選んで Client ID / Secret / Scopes を投入

### OAuth 2 で要る項目

Authorize URL / Access Token URL / Refresh Token URL / Revoke Token URL / Scopes / Scope Delimiter / Client ID / Client Secret。

### Callback URL（リージョン別）

| リージョン | Callback |
|---|---|
| US (.com) | `https://deluge.zoho.com/delugeauth/callback` |
| EU (.eu) | `https://dre.zoho.eu/delugeauth/callback` |
| IN (.in) | `https://deluge.zoho.in/delugeauth/callback` |

利用側に登録する Authorized Redirect URI として、上記を OAuth クライアント設定に入れる。

### Custom Service の動的パラメータ

URL に `{ParamKey}` プレースホルダを置くと、認証時に実値を求められる。

### 利用例

```deluge
resp = invokeurl [
    url: "https://{domain}.my.salesforce.com/services/data/v56.0/sobjects/Account"
    type: GET
    connection: "salesforce_connection"
];
```

### 種別と運用

- My / Shared / Internal / Extension
- 6 ヶ月未使用で自動 revoke（再認可で復活）
- 旧 `authtoken` は廃止済み。Connection が唯一の正攻法。

## 3. `zoho.crm.*` 主要タスク

### createRecord

```deluge
<var> = zoho.crm.createRecord(<module>, <recordMap>, <optionsMap>, <connection>);

leadinfo = {
  "Company": "Zylker",
  "Last_Name": "Williams",
  "Phone": "+1 678 XXX XXXX",
  "Email": "will@zylker.com"
};
resp = zoho.crm.createRecord("Leads", leadinfo);
```

`optionsMap.trigger` で `"workflow"`, `"approval"`, `"blueprint"`, `"orchestration"` を起動可能。

### updateRecord

```deluge
zoho.crm.updateRecord("Leads", 23033xxxxxxx, {"Phone":"+81-..."});
```

### getRecordById / getRecords / searchRecords

```deluge
rec = zoho.crm.getRecordById("Leads", 23033xxxxxxx);

q = Map(); q.put("sort_order","asc"); q.put("sort_by","First_Name");
list = zoho.crm.getRecords("Contacts", 1, 10, q, "crm_oauth_connection");

hits = zoho.crm.searchRecords("Leads", "(Email:equals:john@zylker.com)");
hits = zoho.crm.searchRecords("Accounts", "(Account_Name:starts_with:A)");
```

- 既定 `page=1, per_page=200`。
- 検索基準は `equals` と `starts_with` のみ。`and` で**最大 10 条件**まで結合可能。

### getRelatedRecords

```deluge
notes = zoho.crm.getRelatedRecords("Notes", "Leads", 23033xxxxxxx);
events = zoho.crm.getRelatedRecords("Events", "Hotels", 23033xxxxxxx, 1, 3);
```

### その他documented なタスク

`bulkCreateRecords`, `updateRelatedRecord`, `deleteRecord`, `getOrgVariable`, `convertLead`, `uploadFile`, `sendMail`。

## 4. `zoho.creator.*` 主要タスク

### createRecord

```deluge
data = Map();
data.put("Task_Name", "Priority Task");
data.put("Task_Description", "Configuring toaster");

resp = zoho.creator.createRecord(
    "Shawn",               // app owner
    "Task_Management",     // app link name
    "Tasks",               // form link name
    data, Map(),           // 値マップ, options
    "creator_oauth_connection"
);
```

- `data` を **List of Map** にすると 1 コールで最大 200 件作成可能。

### getRecords

```deluge
recs = zoho.creator.getRecords(
    "John", "Task_Management", "All_Tasks",
    "Task_Name == \"ServiceTask\"",   // 条件
    1, 200,
    "creator_oauth_connection"
);
```

条件式は dot 記法で lookup 越え可: `Department.Name == "Electrical"`。

### その他

`zoho.creator.getRecordById`, `zoho.creator.updateRecord`, `zoho.creator.deleteRecord`, `zoho.creator.uploadFile`。`V2.1` 系のシグネチャは引数が増えている版があるので公式ドキュメントを最新で確認する。

## 5. Subform 操作（Creator）

新規行を作って親フォームに挿入:

```deluge
row1 = Products.Items();     // 新規 subform row
row1.Item_Name = "Laptop";
row1.Quantity  = 1;
input.Items.insert(row1);    // 現在編集中のフォームに追加
```

別フォームへの一括投入:

```deluge
fetch = form1[ID != 0];
for each entry in fetch {
    rows = Collection();
    for each data in entry.subform1 {
        r = form2.subform2();
        r.Product_Name = data.Product;
        r.Qty = data.Quantity;
        rows.insert(r);
    }
    insert into form2 [subform2 = rows];
}
```

**注意**: **custom sorting が有効な subform には未対応**。

## 6. Lookup / Related-list 操作

- Creator: `Lookup_field.Linked_field` のドット記法で条件・取得とも可能。
  ```deluge
  for each emp in Employees[Department.Name == "Electrical"] { ... }
  ```
- CRM: `zoho.crm.getRelatedRecords(relation, parent_module, record_id, page?, per_page?, query?, connection?)`。

## 7. 他の namespace（高レベル概要）

- `zoho.books.*` / `zoho.invoice.*`: Books / Invoice モジュール（createRecord, sendInvoice, getRecord, …）
- `zoho.desk.*`: チケット・関連リスト
- `zoho.people.*`: HR レコード
- `zoho.mail.*`: メール検索・取得・送信
- いずれもシグネチャは Zoho 公式の Developer Docs を都度確認する

## 出典

- https://www.zoho.com/deluge/help/webhook/invokeurl-api-task.html
- https://www.zoho.com/deluge/help/web-data/invokeurl-function.html
- https://www.zoho.com/deluge/help/connections.html
- https://www.zoho.com/deluge/help/integration/requirement.html
- https://www.zoho.com/deluge/help/crm/create-record.html
- https://www.zoho.com/deluge/help/crm/update-record.html
- https://www.zoho.com/deluge/help/crm/search-records.html
- https://www.zoho.com/deluge/help/crm/get-records.html
- https://www.zoho.com/deluge/help/crm/get-record-by-id.html
- https://www.zoho.com/deluge/help/crm/get-related-records.html
- https://www.zoho.com/deluge/help/creator/create-record.html
- https://www.zoho.com/deluge/help/creator/get-records.html
- https://www.zoho.com/deluge/help/miscellaneous/insert-subform-row.html
