# エラー処理・公式 Limits・リトライと冪等性

Deluge の例外モデル、null 安全、公式の実行上限、そして長く動かすための実践パターン。

## 1. `try / catch`

```deluge
try
{
    products = {"Creator","CRM","Cliq"};
    products = products.get(10);     // IndexOutOfRange
    products.add("Sheet");
}
catch(e)
{
    info e.lineNo;    // 6
    info e.message;   // "Given index 10 is greater than the list size"
    info e;           // 結合表示
}
```

- catch 節はエラー時のみ実行。
- 抜けた後は try ブロックの**後ろ**から続行。
- 例外オブジェクトは `lineNo` と `message` を持つ。

### 何を `try` で囲むべきか

- `invokeurl`（ネットワーク / 認証 / レスポンスパース失敗）
- `zoho.crm.*` / `zoho.creator.*`（権限・存在チェック・スキーマ不整合）
- List の境界アクセス
- `getJSON` チェーン（途中 null）
- 文字列→数値変換（不正書式）

## 2. null 安全

```deluge
// Map のキー欠落
v = ifNull(m.get("missing"), "fallback");

// チェーン途中の null
data = ifNull(resp.get("data"), Map());
items = ifNull(data.get("items"), {});
```

`isNull(x)` で明示的に判定もできる。Deluge の `??` は無いので `ifNull` 一択。

## 3. 公式 Limits（暗記推奨）

### 関数あたり

| 項目 | 値 |
|---|---|
| 実行 statement 数 | **5,000**（ループ回数も加算） |
| 関数呼び出し数 | 75 |
| `info` + `alert` 出力合計 | 500 KB |

### `invokeurl` / 外部 HTTP

| 項目 | 値 |
|---|---|
| リクエストタイムアウト | **40 秒** |
| レスポンスサイズ | 5 MB |
| 1日あたり呼び出し | 2,000 |

### `sendmail`

| 項目 | 値 |
|---|---|
| 添付サイズ | 15 MB |
| 1日送信数 | 500 |

### Custom Schedule（CRM）

| 項目 | 値 |
|---|---|
| Active Schedule 数 | 10 / 組織 |
| 実行時間 | 5 分 |
| 実行行数 | 200,000 |
| 手動トリガ | 1日 2 回 |

### Workflow Rule

| 項目 | 値 |
|---|---|
| 1 ルールあたり Function 数 | 6（即時 1 + 時刻 5） |

> 数値は公式ドキュメント時点のもので、Zoho 側で随時調整される。最終確認は `https://www.zoho.com/deluge/help/limitations.html` と `https://www.zoho.com/crm/developer/docs/serverless-architecture/deluge-limits.html` を都度参照。

## 4. 5,000 statement を超えないコツ

**統合タスクのバルク版を最優先で使う**。

```deluge
// ❌ N+1: 600 件のループ × 内部 10 文 = 6,000 statement → 死ぬ
for each c in customers {
    m = Map(); m.put("Last_Name", c.get("name"));
    zoho.crm.createRecord("Leads", m);
}

// ✅ List of Map で一括投入
batch = List();
for each c in customers {
    m = Map(); m.put("Last_Name", c.get("name"));
    batch.add(m);
}
zoho.crm.bulkCreateRecords("Leads", batch);
```

その他:

- Schedule で **chunking**: 1 ジョブで 1,000 件処理 → 続きを次回に持ち越し
- `getRecords` の `per_page=200` を活用してページ分割
- 不要な `info` を消す（出力自体も statement に乗る）
- 条件分岐で**早期 return**

## 5. リトライ + 冪等性

```deluge
void integration.send_with_retry(string url, map payload, string conn)
{
    maxAttempts = 3;
    attempt = 0;
    success = false;
    last_err = "";
    while (attempt < maxAttempts && !success)
    {
        attempt = attempt + 1;
        try {
            resp = invokeurl [
                url: url
                type: POST
                body: payload.toString()
                headers: {"Content-Type":"application/json","Idempotency-Key": payload.get("ext_id")}
                connection: conn
                detailed: true
            ];
            status = resp.get("statusCode").toLong();
            if (status >= 200 && status < 300) {
                success = true;
            } else {
                last_err = "status=" + status + " body=" + resp.get("responseText");
            }
        } catch(e) {
            last_err = e.message;
        }
        // 指数バックオフは sleep 無いので諦めて即リトライ（または間にダミー処理）
    }
    if (!success) {
        info "FAILED after " + attempt + " attempts: " + last_err;
        sendmail[
            from: zoho.adminuserid
            to:   "ops@zylker.com"
            subject: "Integration failed: " + url
            message: last_err
        ];
    }
}
```

### 冪等性のポイント

- 外部 API には **`Idempotency-Key`** や独自 `external_id` を必ず送る
- Zoho 側でも `searchRecords` → 見つからなければ create、見つかれば update の **upsert パターン**で書く
- リトライは**Statement 残量と相談**。深いループ内では 1 回まで

## 6. ロギング戦略

| 重要度 | 手段 |
|---|---|
| 開発ローカル | `info` |
| 本番・短期 | Creator のログフォームへ `createRecord` |
| 本番・長期 | 外部監視（Datadog 等）へ `invokeurl` で push |
| 緊急通知 | `sendmail`（ただし日次 500 通制限あり） |

## 7. Red Flags チェック

| 兆候 | 疑うべき |
|---|---|
| `null` が返る | `get()` の欠落キー、`getJSON()` チェーン途中、Map vs JSON 混在 |
| Statement Limit 超過 | ループ内の per-record API 呼び出し |
| 40s タイムアウト | 外部 API の遅延、巨大ペイロード |
| 認証エラー | Connection が revoke 済み（6 ヶ月未使用） |
| メール届かない | `from` が未検証 / SPF / DKIM 未設定 / 日次上限 500 |
| Schedule が動かない | 5 分上限 / 200,000 行 / Active 10 |
| Workflow が走らない | 6 関数上限 / criteria のミスマッチ |

## 出典

- https://www.zoho.com/deluge/help/misc-statements/try-catch.html
- https://www.zoho.com/deluge/help/functions/common/isnull.html
- https://www.zoho.com/deluge/help/limitations.html
- https://www.zoho.com/crm/developer/docs/serverless-architecture/deluge-limits.html
- https://www.zoho.com/crm/developer/docs/serverless-architecture/custom-schedules.html
