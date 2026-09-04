# 実例レシピ 5 本

Deluge で頻出する自動化パターンを、そのまま貼り付けて動くサイズで揃えた。

## 1. Webhook → enrichment → CRM 更新

外部システムが POST してくる webhook を、Standalone Custom Function（REST 公開）で受けて Lead を更新する。

```deluge
string crm.enrich_lead(map payload)
{
    email = payload.get("email");
    if (isNull(email) || email.length() == 0) { return "bad_request"; }

    found = zoho.crm.searchRecords("Leads", "(Email:equals:" + email + ")");
    if (found.size() == 0) { return "not_found"; }

    lead_id = found.get(0).get("id");
    upd = Map();
    if (!isNull(payload.get("industry")))  { upd.put("Industry", payload.get("industry")); }
    if (!isNull(payload.get("revenue")))   { upd.put("Annual_Revenue", payload.get("revenue")); }
    if (!isNull(payload.get("employees"))) { upd.put("No_of_Employees", payload.get("employees")); }

    if (upd.size() == 0) { return "noop"; }

    try {
        resp = zoho.crm.updateRecord("Leads", lead_id, upd);
        info "enriched lead=" + lead_id + " resp=" + resp;
        return "updated";
    } catch(e) {
        info "ERR lead=" + lead_id + " msg=" + e.message;
        return "error";
    }
}
```

呼び出し例（curl）:
```bash
curl -X POST "https://www.zohoapis.com/crm/v5/functions/crm.enrich_lead/actions/execute?auth_type=apikey&zapikey=<KEY>" \
     -F 'arguments={"email":"john@zylker.com","industry":"Software","revenue":12000000}'
```

## 2. 夜間バッチ: 前日成約案件をサマリ送信

CRM の Custom Schedule に登録して毎朝 7:00 起動。

```deluge
void crm.daily_won_summary()
{
    yesterday = subDay(zoho.currentdate, 1).toString("yyyy-MM-dd");
    deals = zoho.crm.searchRecords(
        "Deals",
        "(Stage:equals:Closed Won)and(Closing_Date:equals:" + yesterday + ")"
    );

    if (deals.size() == 0) {
        info "no won deals on " + yesterday;
        return;
    }

    body = "<h2>Won deals on " + yesterday + "</h2><table border='1' cellpadding='6'><tr><th>Deal</th><th>Owner</th><th>Amount</th></tr>";
    total = 0.0;
    for each d in deals {
        owner_map = ifNull(d.get("Owner"), Map());
        body = body + "<tr><td>" + d.get("Deal_Name") + "</td><td>" + owner_map.get("name") + "</td><td>$" + d.get("Amount") + "</td></tr>";
        total = total + d.get("Amount").toDecimal();
    }
    body = body + "</table><p><b>Total: $" + total + "</b></p>";

    sendmail[
        from: zoho.adminuserid
        to:   "sales-leadership@zylker.com"
        subject: "[Daily] Won deals " + yesterday + " — " + deals.size() + " deals / $" + total
        message: body
        content type: HTML
    ];
}
```

## 3. Subform 集計 → 親フィールド書き込み（Creator）

Creator のフォーム `On User Input` または `On Add - On Validate` で発火。

```deluge
total = 0.0;
discount_total = 0.0;

for each row in input.LineItems
{
    line = (row.Qty.toDecimal()) * (row.Unit_Price.toDecimal());
    discount = ifNull(row.Discount, 0).toDecimal();
    total = total + (line - discount);
    discount_total = discount_total + discount;
}

input.Subtotal       = total + discount_total;
input.Discount_Total = discount_total;
input.Grand_Total    = total;
```

**注意**: custom sort が有効な subform では `insert` 系挙動が変わる。読み出し（for each）は問題ない。

## 4. 外部 REST API: 在庫サービスへ問い合わせて CRM に同期

Connection `inventory_oauth` を事前に作成済みとする。

```deluge
void sync.refresh_inventory(int product_id)
{
    try {
        resp = invokeurl [
            url: "https://inv.example.com/v1/products/" + product_id
            type: GET
            headers: {"Accept":"application/json"}
            connection: "inventory_oauth"
            detailed: true
        ];
        status = resp.get("statusCode").toLong();
        if (status != 200) {
            info "inventory api failed status=" + status + " body=" + resp.get("responseText");
            return;
        }
        body = resp.get("responseText").toMap();

        upd = Map();
        upd.put("Stock_Quantity",  body.get("on_hand"));
        upd.put("Reserved",        body.get("reserved"));
        upd.put("Last_Synced_At",  zoho.currenttime.toString("yyyy-MM-dd HH:mm:ss"));

        zoho.crm.updateRecord("Products", product_id, upd);
        info "synced product=" + product_id + " on_hand=" + body.get("on_hand");
    } catch(e) {
        info "ERR product=" + product_id + " msg=" + e.message;
    }
}
```

## 5. クロスアプリ同期: CRM Lead → Creator フォームへミラー

CRM Workflow Rule の即時アクションとして発火。

```deluge
void sync.crm_lead_to_creator(int lead_id)
{
    lead = zoho.crm.getRecordById("Leads", lead_id);
    if (isNull(lead) || lead.size() == 0) { return; }

    // 既存ミラー確認（upsert パターン）
    existing = zoho.creator.getRecords(
        "owner_name", "CRM_Mirror", "Leads",
        "CRM_Lead_Id == \"" + lead_id + "\"",
        1, 1, "creator_conn"
    );

    data = Map();
    data.put("CRM_Lead_Id", lead_id.toString());
    data.put("First_Name",  ifNull(lead.get("First_Name"), ""));
    data.put("Last_Name",   ifNull(lead.get("Last_Name"), ""));
    data.put("Email",       ifNull(lead.get("Email"), ""));
    data.put("Phone",       ifNull(lead.get("Phone"), ""));
    data.put("Synced_At",   zoho.currenttime.toString("yyyy-MM-dd HH:mm:ss"));

    if (existing.size() == 0) {
        resp = zoho.creator.createRecord(
            "owner_name", "CRM_Mirror", "Leads", data, Map(), "creator_conn"
        );
        info "created mirror lead=" + lead_id + " resp=" + resp;
    } else {
        mirror_id = existing.get(0).get("ID");
        resp = zoho.creator.updateRecord(
            "owner_name", "CRM_Mirror", "Leads",
            mirror_id, data, Map(), "creator_conn"
        );
        info "updated mirror lead=" + lead_id + " resp=" + resp;
    }
}
```

## 共通の設計指針（5 本に共通する判断）

- **冪等性**: search → 存在チェック → create/update の upsert。外部 API には `Idempotency-Key` を渡す。
- **null 防御**: `ifNull(map.get(k), default)` を慣習化。
- **ログ**: 成功時の `info` も書く。失敗時は line / message を出力。
- **Statement 節約**: バルク化、`per_page` 最大、不要 `info` の除去。
- **タイムアウト**: 外部 API は 40s 制約があるので、長い処理は呼び出し先で非同期化。
