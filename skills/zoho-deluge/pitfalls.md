# 公式ドキュメント由来のハマりどころ FAQ

「動かない」「期待通り返ってこない」「本番でだけ落ちる」の典型的な原因と公式 URL。

## 1. `5000 statement limit` は実行数

ソースコードの行数ではなく **実行された文の数**。10 行のループを 600 回回せば 6,000。
**対策**:
- `bulkCreateRecords` / List 一括投入を使う
- Schedule で chunking する
- `getRecords` の `per_page=200` を活用
- 余計な `info` を削る（出力も 1 statement）

出典: https://www.zoho.com/deluge/help/limitations.html

## 2. 旧 `authtoken` は廃止、Connection 必須

過去ドキュメントに残る `authtoken` 方式は**現在は使えない**。`invokeurl` は **Connection の link name** を `connection:` で指定するのが唯一の正攻法。

出典: https://www.zoho.com/deluge/help/connections.html

## 3. タイムゾーンの混乱

`zoho.currentdate` / `zoho.currenttime` は **アプリ設定の TZ とフォーマット**に従う。外部 API に渡すときは:
- フォーマットを固定 → `toString("yyyy-MM-dd'T'HH:mm:ssXXX")`
- TZ を補正 → `addHour(date, offset)`

出典: https://www.zoho.com/deluge/help/functions/date-time.html

## 4. List と Collection を取り違える

- **List** は順序付き配列。`{a,b,c}`。
- **Collection** は polymorphic（List モード or Map モード）。**最初の `insert` でモード固定**。
- 迷うなら List。Collection は Subform 行の動的生成や JSON 組み立てで有用。

出典: https://www.zoho.com/deluge/help/datatypes/collection.html

## 5. Map のキー順序は保証されない

`toString()` や iteration の順序は入力と異なる可能性。**順序に意味があるなら List of Map** を使う。

出典: https://www.zoho.com/deluge/help/datatypes/key-value.html

## 6. JSON エスケープ地獄

文字列リテラルで JSON を組むと `\"` が嵐になる。
**回避**: Map を作って `.toString()` で吐かせる（[language.md](language.md) 参照）。

出典: https://www.zoho.com/deluge/help/functions/common/getjson.html

## 7. 論理演算子の優先順位がサービスで違う

- 通常 Zoho サービス: `NOT > AND > OR`
- **Zoho Creator のみ**: `NOT > OR > AND`

**対策**: 常に括弧を明示する。

出典: https://www.zoho.com/deluge/help/operators/logical-operators.html

## 8. `contains()` は case-sensitive

```deluge
"Zoho Creator".contains("creator");          // false
"Zoho Creator".containsIgnoreCase("creator"); // true
```

出典: https://www.zoho.com/deluge/help/functions/string/contains.html

## 9. Map の `get` は欠落キーで `null`

```deluge
v = m.get("missing");   // null（例外ではない）
```

**対策**:
- `ifNull(m.get(k), default)`
- `if (m.containKey(k)) { ... }`

出典: https://www.zoho.com/deluge/help/functions/map/get.html

## 10. `invokeurl` の落とし穴一式

- **40 秒タイムアウト**
- **レスポンス 5 MB 上限**
- **`body` と `parameters` は排他**
- Map を `body` に渡すと既定 `multipart/form-data`（JSON 送るなら `Content-Type: application/json` を明示し `.toString()`）
- GET にクエリは **URL 直書き**（`parameters` ではない）
- バイナリは `Content-Type: application/octet-stream`
- 1日 **2,000 コール**

出典: https://www.zoho.com/deluge/help/webhook/invokeurl-api-task.html

## 11. Standalone 関数の引数名に `arguments` を使うな

REST 公開した関数は、POST `form-data` の `arguments` キーに JSON 文字列が入る。関数側の引数名を `arguments` にすると **POST body 全体がその 1 つの引数に丸ごと**入ってしまい、map にパースされない。

出典: https://www.zoho.com/crm/developer/docs/functions/set-up-functions.html

## 12. Schedule は 5 分 / 200,000 行 / Active 10

長時間バッチは無理。**chunking する**か **Workflow Rule で連鎖**する設計に。

出典: https://www.zoho.com/crm/developer/docs/serverless-architecture/custom-schedules.html

## 13. Workflow Rule から呼べる関数は 6 個

即時 1 + 時刻起動 5。それを超える要件は別ルールに分割するか、Standalone 関数で集約する。

## 14. `info` は 500 KB で切り捨て

巨大オブジェクトを全部 `info` すると**肝心な後半が消える**。本番ログは Creator フォーム / CRM カスタムモジュールに `createRecord` する方が確実。

出典: https://www.zoho.com/deluge/help/debug/info.html

## 15. Connection は 6 ヶ月未使用で自動 revoke

久しぶりに呼んだら 401 — Connection 一覧から **Re-authorize** で復活する。本番では月次の死活チェック関数を Schedule に置いておくと安心。

出典: https://www.zoho.com/deluge/help/connections.html

## 16. Subform に custom sort が有効だと Subform 操作タスクが効かない

Creator の subform に custom sort を設定すると `insert into form [subform = rows]` 系が動かない。custom sort を外すか、別フォームに退避する設計が必要。

出典: https://www.zoho.com/deluge/help/miscellaneous/insert-subform-row.html

## 17. ドキュメントの URL ゆらぎ

調査中に見つかった現実:
- `zoho.com/deluge/help/script/data-types.html` は 404。正しくは `zoho.com/deluge/help/datatypes.html`（`/script/` が無い）。
- `help.zoho.com/portal/en/kb/crm/automate-business-processes/workflow-rules` は 404。Workflow Rule 概念は CRM Developer Docs の `programming.html` / `set-up-functions.html` 側で確認する。
- 新旧 URL が混在しているので、検索結果リンクが死んでいたら `https://www.zoho.com/deluge/help/` のトップから辿り直すのが確実。

## 18. 関数名のうっかり間違い集

| 間違い | 正解 |
|---|---|
| `containsKey` | `containKey`（s なし） |
| `??` | `ifNull(a, b)` |
| `let x = ...` | `x = ...`（宣言キーワード無し） |
| `"a" + "b"` （連結） | OK だが、JSON は Map → toString が安全 |
| Date リテラルにダブルクォート | **シングルクォート** `'2024-01-15'` |
| `length(list)` | `list.size()`（List は size, String は length） |

## 出典まとめ

- https://www.zoho.com/deluge/help/limitations.html
- https://www.zoho.com/deluge/help/connections.html
- https://www.zoho.com/deluge/help/webhook/invokeurl-api-task.html
- https://www.zoho.com/deluge/help/operators/logical-operators.html
- https://www.zoho.com/deluge/help/functions/common/getjson.html
- https://www.zoho.com/deluge/help/functions/map/get.html
- https://www.zoho.com/deluge/help/datatypes/collection.html
- https://www.zoho.com/deluge/help/miscellaneous/insert-subform-row.html
- https://www.zoho.com/crm/developer/docs/functions/set-up-functions.html
- https://www.zoho.com/crm/developer/docs/serverless-architecture/custom-schedules.html
