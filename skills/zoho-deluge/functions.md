# 組込関数リファレンス

> Deluge の標準関数群。**呼び出しは「メソッド形式」と「関数形式」の両方が許容**される。
> ```deluge
> "Zoho Creator".contains("Creator");   // method
> contains("Zoho Creator", "Creator");  // function
> ```

## 1. Text / String

公式インデックスに載っている全関数:
`containsIgnoreCase, contains, isEmpty, getAlpha, getAlphaNumeric, getOccurenceCount, getPrefix, getPrefixIgnoreCase, getSuffix, getSuffixIgnoreCase, startsWith, startsWithIgnoreCase, endsWith, endsWithIgnoreCase, equalsIgnoreCase, concat, indexOf, lastIndexOf, toList, toMap, toLong, toNumber, toString, toText, toJSONList, toListString, toDecimal, toTime, toDate, toLowerCase, toUpperCase, left, leftpad, right, rightpad, len, length, isAscii, trim, ltrim, rtrim, matches, mid, text, subText, substring, proper, hexToText, textToHex, find, repeat, remove, removeAllAlpha, removeAllAlphaNumeric, removeFirstOccurence, removeLastOccurence, replaceAll, replaceAllIgnoreCase, replaceFirst, replaceFirstIgnoreCase`

```deluge
s = "Zoho Creator";
s.contains("Creator");           // true（case sensitive）
s.containsIgnoreCase("creator"); // true
s.startsWith("Zoho");            // true
s.substring(0, 4);               // "Zoho"（end は exclusive）
s.length();                      // 12（len() と同義）
s.replaceAll("o", "0");          // "Z0h0 Creat0r"
s.toLowerCase();                 // "zoho creator"
s.getPrefix(" ");                // "Zoho"（区切り文字より前）
s.getSuffix(" ");                // "Creator"（区切り文字より後ろ）
s.matches("^Zoho.*");            // true（正規表現）
```

**ハマりどころ**:
- `contains()` は case-sensitive。
- `substring(start, end)` の end は exclusive。
- `getPrefix` / `getSuffix` は**インデックスではなく区切り文字**で動く。
- `length()` と `len()` は同じ。

## 2. Date / Time

### 加減算
`addDay, subDay, addHour, subHour, addMinutes, subMinutes, addMonth, subMonth, addSeconds, subSeconds, addWeek, subWeek, addYear, subYear, addBusinessDay, subBusinessDay`

### 取り出し
`day, getDay, getDayOfYear, getHour, getMinutes, getMonth, getSeconds, getWeekOfYear, getYear, hour, minute, month, second, weekday`

### 期間計算
`days360, daysBetween, edate, eomonth, hoursBetween, monthsBetween, yearsBetween, totalMonth, totalYear, workday`

### 変換・ユーティリティ
`toDate, toTime, toDateTimeString, toString, isDate, toStartOfMonth, toStartOfWeek, unixEpoch, now, today`

```deluge
tomorrow = addDay(zoho.currentdate, 1);
diff     = daysBetween('2024-01-01', '2024-12-31');
formatted = zoho.currentdate.toString("yyyy-MM-dd");
epoch    = zoho.currenttime.toLong();   // milliseconds since epoch
```

### 外部 API に渡すときの ISO 8601 化（推奨パターン）

外部 API は ISO 8601 + UTC を期待することが多い。Zoho の日時は組織 TZ で持つので、明示的に整形する。

```deluge
// 組織 TZ のまま ISO 8601（ローカルオフセット込み）
iso_local = zoho.currenttime.toString("yyyy-MM-dd'T'HH:mm:ssXXX");
// 例: 2026-06-03T10:00:00+09:00

// UTC に補正してから ISO 8601 'Z' 表記
// （JST = UTC+9 を引いた値を UTC とみなす）
utc_dt = subHour(zoho.currenttime, 9);
iso_utc = utc_dt.toString("yyyy-MM-dd'T'HH:mm:ss'Z'");
```

**注意（DST）**:
- `addHour` / `subHour` による静的オフセット補正は**サマータイムを考慮しない**。DST を持つ国の組織 TZ（米国、欧州）で運用するなら、サーバ側で TZ 変換させるか、組織 TZ を UTC に固定する運用にする。
- 日本は DST 無いので JST↔UTC は固定 ±9 でよい。

### `toString` フォーマット記号（よく使う）

| 記号 | 意味 | 例 |
|---|---|---|
| `yyyy` | 4桁年 | 2026 |
| `MM` | 2桁月 | 06 |
| `dd` | 2桁日 | 03 |
| `HH` | 2桁時 (24h) | 10 |
| `mm` | 2桁分 | 30 |
| `ss` | 2桁秒 | 45 |
| `XXX` | ISO TZ オフセット | +09:00 |
| `'T'` / `'Z'` | 'で囲んだリテラル | ISO の T や Z |

**ハマりどころ**:
- 出力フォーマットは Zoho サービスの **Application Settings** に依存する。組織間で差が出るので、外部システムへ渡すときは必ず `toString(...)` で明示する。
- タイムゾーンは引数ではなくユーザー / 組織設定に従う。静的補正は `addHour` / `subHour` だが DST 非対応。
- `zoho.currenttime` を `toLong()` すると **ミリ秒** epoch。**秒** で欲しい API には `/ 1000`。

## 3. List

`add, addAll, distinct, get, indexOf, intersect, isEmpty, lastIndexOf, remove, removeAll, removeElement, size, sort, sortDescending, subList, toJSONList, toList, notContains, union, average, largest, median, nthLargest, nthSmallest, smallest`

```deluge
nums = {3, 1, 2};
nums.add(4);                // {3,1,2,4}
nums.sort(true);            // ascending
nums.sortDescending();      // descending
uniq = nums.distinct();
first = nums.get(0);
nums.removeElement(2);      // 値 2 を削除
nums.remove(0);             // インデックス 0 を削除
mid = nums.subList(1, 3);   // インデックス [1,3) を取得
inter = {1,2,3}.intersect({2,3,4});  // {2,3}
un = {1,2}.union({2,3});             // {1,2,3}
```

**ハマりどころ**:
- 範囲外インデックスへの `get()` は例外。`size()` を確認するか `try/catch` で囲む。
- `removeElement(value)` は値、`remove(index)` はインデックス。

## 4. Map / Key-Value

`get, put, putAll, remove, keys, values, containKey, containValue, size, isEmpty, clear, toMap, toJSONList, notContains`

```deluge
m = Map();
m.put("name", "John");
m.put("age", 30);
m.get("name");          // "John"
m.containKey("name");   // true
m.keys();               // {"name","age"}
m.values();             // {"John",30}
m.size();               // 2
m.remove("age");
```

**ハマりどころ**:
- **欠落キーで `get` は `null` を返す**。`ifNull(m.get(k), default)` か `containKey` で必ず防御。
- **Map のキー順序は保証されない**。`toString()` / iteration 結果が入力順と異なる可能性あり。順序が必要なら List of Map を使う。
- 関数名が `containsKey` ではなく **`containKey`**（s なし）。微妙だが間違えやすい。

## 5. Number / Math

`round, ceil, floor, abs, power, sqrt, randomNumber, toDecimal, toLong, toNumber, sin, cos, tan, log, log10, average, median, max, min, toHex, toWords`

```deluge
round(3.14159, 2);   // 3.14
ceil(3.2);           // 4
floor(3.9);          // 3
abs(-5);             // 5
power(2, 10);        // 1024
sqrt(16);            // 4
randomNumber(1, 100);
"42".toLong();       // 42
"3.14".toDecimal();  // 3.14
```

## 6. JSON / XML

```deluge
emp = "{\"response\":{\"employee\":{\"id\":\"EMP-001\",\"role\":\"Developer\"}}}";
info emp.getJSON("response").getJSON("employee").getJSON("id");  // EMP-001

resp = "{\"data\":[{\"Id\":1,\"firstname\":\"John\"},{\"Id\":2,\"firstname\":\"Patricia\"}]}";
employees = resp.getJSON("data");
ids = Collection();
for each e in employees {
    ids.insert(e.getJSON("Id"));
}
info ids;   // {1,2}
```

関連: `toJsonList`, `toJsonString`, `toMap`。

**ハマりどころ**:
- `get()` は Map 向け、`getJSON()` は JSON テキストでも Map でも動く。混在させると黙って `null` になる。
- 文字列リテラルで JSON を書くなら `\"` のエスケープを忘れない（が、極力 Map を作って `.toString()` する方が安全）。

## 7. 暗号 / ハッシュ

カテゴリ: AES / Base / Hash / HMAC / URL & HTML エンコード。

- `zoho.encryption.aesEncode(key, plain, iv)` / `aesDecode` / `aesEncode128` / `aesDecode128`
- `zoho.encryption.base64Encode` / `base64Decode` / `base32Encode` / `base32Decode` / `base64DecodeToFile`
- ハッシュ: `md5`, `sha1`, `sha256`, `sha512`
- HMAC: `hmacSha1`, `hmacSha256`, `hmacSha512`
- URL / HTML: `urlEncode`, `urlDecode`, `encodeUrl`, `htmlEncode`, `htmlDecode`

```deluge
info zoho.encryption.aesEncode("passkey", "Confidential", "0000000000000000");
// "AR+ygx+et18UNeIltGh82NBgPQx6Y0hWbEcgN3NVbJA="

info zoho.encryption.sha256("payload");
info zoho.encryption.hmacSha256("key", "msg");
info zoho.encryption.base64Encode("hello").toString();
```

**ハマりどころ**:
- AES の IV は**正確に 16 文字**必要。
- AES の既定は 256bit。128bit が必要なら `aesEncode128`。
- `sha256` 等は出力 type（hex / binary）を指定できる版がある（場合によりオーバーロード）。

## 8. ファイル

ファイル型はリテラル不可。生成元は:
- `invokeurl` で `response-format: FILE` を指定して取得
- Creator の file upload field
- `sendmail` の attachment / `zoho.creator.uploadFile`

主な操作:
- `<file>.toString()` — テキスト読み出し
- `<file>.size()` — バイト長
- `sendmail` の `attachments: file: <var>` で添付
- `invokeurl` の `files: <fileVar>` でアップロード

## 9. デバッグ — `info`

```deluge
info "user=" + zoho.loginuser;
info someMap;
```
- 出力可視範囲: Super Admin / Admins / Developers。
- Creator のフォームでは **View Log Details** に出る。
- `info` + `alert` の合計出力は **500 KB** で切り捨て。

## 出典

- https://www.zoho.com/deluge/help/functions/text.html
- https://www.zoho.com/deluge/help/functions/string/contains.html
- https://www.zoho.com/deluge/help/functions/string/substring.html
- https://www.zoho.com/deluge/help/functions/string/concat.html
- https://www.zoho.com/deluge/help/functions/date-time.html
- https://www.zoho.com/deluge/help/functions/list.html
- https://www.zoho.com/deluge/help/functions/key-value.html
- https://www.zoho.com/deluge/help/functions/map/put.html
- https://www.zoho.com/deluge/help/functions/map/get.html
- https://www.zoho.com/deluge/help/functions/map/keys.html
- https://www.zoho.com/deluge/help/functions/number.html
- https://www.zoho.com/deluge/help/functions/common/getjson.html
- https://www.zoho.com/deluge/help/encryption-tasks.html
- https://www.zoho.com/deluge/help/functions/encryption/aesencode.html
- https://www.zoho.com/deluge/help/debug/info.html
