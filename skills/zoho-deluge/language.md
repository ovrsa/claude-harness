# Deluge 言語基礎

> Zoho Deluge の構文・データ型・演算子・制御フロー・関数定義のリファレンス。

## 1. 変数

- **動的型付け**。型宣言なし、代入で型が決まる。
- **ローカルスコープのみ**。グローバル変数は存在せず、関数間は引数 / 戻り値 / レコード経由で受け渡す。
- 文末セミコロン `;` 必須。
- 命名: 英大文字 / 英小文字 / `_` で始まり、英数字と `_` のみ。case-sensitive。
- 予約語: `true`, `false`, `null`, `void`, `return`。

```deluge
tax = 0.1;
name = "John Doe";
is_active = true;
```

## 2. データ型

| 型 | リテラル | メモ |
|---|---|---|
| Text (string) | `"hello"` | ダブルクォート |
| Number (int) | `42` | 整数のみ |
| Decimal | `19.99` | 通貨・割合 |
| Decision (bool) | `true` / `false` | 非クォート |
| Date-Time | `'2024-01-15 10:30:00'` | **シングル**クォート |
| Time | `'14:30:00'` / `'02:30 PM'` | 12h / 24h どちらも可 |
| List | `{"red","green","blue"}` | 順序付き・インデックスアクセス・異種混在可 |
| Key-Value (Map) | `{"Item":"Mouse","Qty":23}` | Map |
| Collection | `Collection("a","b","c")` | 「List モード」か「Map モード」を最初の insert で決定 |
| File | 非リテラル | `invokeurl` / Creator file field / 添付経由で取得 |
| null | `null` | 組込定数 |

### List と Collection の決定的な違い

- **List**: ただの順序付き配列。`{a, b, c}` で書く。
- **Collection**: List としても Map としても振る舞える polymorphic 容器。**最初の `insert` で挙動が決まり、以降変更不可**。要素と key-value を混ぜると壊れる。
- 迷ったら List で十分。Collection は subform の挿入や、API レスポンスを段階的に組み立てるときの選択肢。

```deluge
// List
lst = {"a","b"};
lst.add("c");

// Collection（要素モード）
col = Collection();
col.insert("x");
col.insert("y");

// Collection（key-value モード）
col2 = Collection();
col2.insert("k": "v");
```

## 3. 演算子

### 算術
```deluge
a = 5; b = 3;
a + b   // 8（数値加算 / 文字列連結 / 日付加算で多重定義）
a - b   // 2
a * b   // 15
a / b   // 1 （整数除算 / Decimal なら小数）
a % b   // 2
```

### 比較
`<`, `>`, `<=`, `>=`, `==`, `!=`。Text 型は `==` と `!=` のみ。

### 論理
- `&&` AND, `||` OR, `!` NOT
- **優先順位はサービスごとに違う**:
  - 通常の Zoho サービス: `NOT > AND > OR`
  - **Zoho Creator のみ**: `NOT > OR > AND`
- 安全のため**括弧を明示**する。

### 代入 / 複合代入
`=`, `+=` 等。`+=` は string, bigint, decimal で動作。

### 三項相当
Deluge は `? :` 構文を持たず、関数形式の `if` を使う:
```deluge
status = if(score >= 60, "pass", "fail");
```

### null 合体
`??` は無い。`ifNull(expr1, expr2)` を使う。

## 4. 制御フロー

### if / else if / else

```deluge
if (zoho.currentdate.weekday() == 7) {
    info "Sunday";
}
else if (zoho.currentdate.weekday() == 6) {
    info "Saturday";
}
else {
    info "Weekday";
}
```
- 中カッコ必須。
- `else` は最後にしか書けない。

### for each element

```deluge
nums = {"One","Two","Three"};
for each item in nums {
    info item;
}
```
- List と CSV ファイル（≤ 2MB）に対応。

### for each index

```deluge
colors = {"red","green","blue"};
for each index i in colors {
    info "(" + i + ")" + colors.get(i);
}
// (0)red (1)green (2)blue
```

### for each record (Creator)

```deluge
for each rec in Tasks [Status == "Open"] sort by Due_Date {
    // rec.Title などでアクセス
}
```

### break / continue / while

```deluge
for each n in nums {
    if (n == "Two") { continue; }
    if (n == "Stop") { break; }
    info n;
}

i = 0;
while (i < 5) {
    info i;
    i = i + 1;
}
```

## 5. 関数定義

### 一般形

```deluge
<returnType> <namespace>.<FunctionName>(<typedArgs>)
{
    // body
    return <value>;
}
```

戻り値の型: `void`, `int`, `string`, `decimal`, `bool`, `map`, `list`, `collection`, `date`, …。

### CRM 用 Custom Function 例

```deluge
void workflowspace.Rollup_Amount_To_Account(int AccountId, string SumUpField)
{
    accountID1 = (input.AccountId).toString();
    // ロジック
}
```
- `workflowspace.` は CRM の namespace。
- 引数は **`input.<argname>`** からアクセス（CRM では特に重要）。
- REST API で外部公開する場合、引数名に `arguments` を使うと POST body 全体がその引数に丸ごと入るので**避ける**。

### 関数の呼び出し

```deluge
void notify()
{
   send_mail("ops@zylker.com", "Welcome", "Hello!");
}

void send_mail(string to_addr, string subject, string msg)
{
   sendmail[
       from   : zoho.adminuserid
       to     : to_addr
       subject: subject
       message: msg
   ];
}
```

## 6. 文字列の組み立て

- 連結は `+` のみ。テンプレートリテラルや format 文字列のような糖衣は無い。
- JSON を文字列リテラルで書くと `\"` のエスケープ地獄になるので、Map を作って `.toString()` で吐き出す。

```deluge
// ❌ エスケープ地獄
body = "{\"name\":\"" + name + "\",\"age\":" + age + "}";

// ✅ Map から作る
m = Map();
m.put("name", name);
m.put("age", age);
body = m.toString();
```

## 7. コメント

- `//` 行コメント
- `/* … */` ブロックコメント

公式リファレンスには記載が無いが、Deluge エディタ上では両方とも有効。

## 8. null 安全

```deluge
// ifNull
safe = ifNull(maybe_null, "default");

// isNull
if (isNull(x)) { info "x is null"; }
```
- Map の `get()` は欠落キーで `null` を返す。**`ifNull` か `containKey` を必ず噛ませる**。
- List の `get(badIndex)` は例外送出。`try/catch` か事前の size チェックが必要（[error-handling.md](error-handling.md) 参照）。

## 出典

- https://www.zoho.com/deluge/help/variables.html
- https://www.zoho.com/deluge/help/datatypes.html
- https://www.zoho.com/deluge/help/datatypes/list.html
- https://www.zoho.com/deluge/help/datatypes/collection.html
- https://www.zoho.com/deluge/help/datatypes/key-value.html
- https://www.zoho.com/deluge/help/operators.html
- https://www.zoho.com/deluge/help/operators/arithmetic-operators.html
- https://www.zoho.com/deluge/help/operators/relational-operators.html
- https://www.zoho.com/deluge/help/operators/logical-operators.html
- https://www.zoho.com/deluge/help/conditional-statements/condition.html
- https://www.zoho.com/deluge/help/list-manipulations/for-each-element.html
- https://www.zoho.com/deluge/help/list-manipulations/for-each-index.html
- https://www.zoho.com/deluge/help/misc-statements/break.html
- https://www.zoho.com/deluge/help/misc-statements/continue.html
- https://www.zoho.com/deluge/help/misc-statements/call-function.html
- https://www.zoho.com/deluge/help/functions/common/isnull.html
- https://www.zoho.com/crm/developer/docs/functions/programming.html
