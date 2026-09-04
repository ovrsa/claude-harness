# `sendmail` / `info` / システム変数

スクリプトから「Zoho の外」に出るチャネル（メール）と、「Zoho の内側を読む」変数群（current user, current date 等）。

## 1. `sendmail` ブロック

### 基本

```deluge
sendmail[
    from: zoho.adminuserid
    to:   "shawn@zylker.com"
    cc:   "salesmanager@zylker.com"
    reply to: "support@zylker.com"
    subject: "Welcome to Zoho Creator"
    message: "<p>Your registration successful</p>"
    content type: HTML
];
```

### 添付バリエーション

| 形式 | 例 |
|---|---|
| ファイルフィールド | `Attachments :file: <fileUploadField>` |
| Creator レポート PDF | `Attachments :view: Leads_Report [Status=="Converted"] as PDF` |
| Print Template | `Attachments :template: Medical_Invoice : invoice_details record_id as PDF` |
| `invokeurl` 取得ファイル | `Attachments :file: fileResp` |

### 制約

- **添付サイズ上限 15 MB**
- 1日 **500 通**
- `from` は: 検証済みアドレス / `zoho.adminuserid` / `zoho.loginuserid` のいずれか（外部メーカーに送るには SPF/DKIM 設定済みドメイン）

### HTML メールのコツ

- `content type: HTML` を明示しないとプレーンテキスト扱い。
- 文字列連結で組むのではなく、Map → JSON テンプレ → 置換のパターンの方が読みやすい。
- 受信者を List で渡すと一斉送信可能（`to: {"a@x.com","b@x.com"}`）。

## 2. `info` 文（デバッグ）

```deluge
info "current user = " + zoho.loginuser;
info someMap;
info someList;
```

- 可視: Super Admin / Admins / Developers
- Creator のフォーム実行では **View Log Details** に出力
- `info` + `alert` の **合算 500 KB** で切り捨て

**運用パターン**:

- 開発中は要所で `info` を撒く
- 本番では**長文の info はやめる**（500 KB 切り捨てで肝心な後半が消える）
- 永続ログが必要なら CRM のカスタムモジュール / Creator のログフォームに `createRecord` する

## 3. `zoho.*` システム変数

| 変数 | 値 |
|---|---|
| `zoho.currentdate` | 現在日付（アプリ設定のフォーマット） |
| `zoho.currenttime` | 現在日時 |
| `zoho.loginuser` | ログインユーザー名 |
| `zoho.loginuserid` | ログインユーザーのメール |
| `zoho.adminuser` | アプリオーナーのユーザー名 |
| `zoho.adminuserid` | アプリオーナーのメール |
| `zoho.appname` | アプリ link name |
| `zoho.ipaddress` | 実行ユーザーの public IP |
| `zoho.appuri` | `/<admin_username>/<application_link_name>/` |
| `zoho.device.type` | `"web"` / `"phone"` / `"tablet"` |

### 注意

- `zoho.appuser` / `zoho.dbprefix` は古い Developer/Creator 文脈で出てくることがあるが、現行の Deluge Variables 公式ページには記載が無い。**サービス固有**として扱い、依存するなら最新ドキュメントで確認すること。
- `zoho.currentdate` は **アプリ設定のフォーマットと TZ** に従う。UTC 化したい場合は明示的に `addHour` で補正するか、`toString("yyyy-MM-dd'T'HH:mm:ssXXX")` で ISO に固定する。

## 4. デバッグ実用 Tips

```deluge
// 段階ごとに状態を info で吐く
info "STEP 1 input=" + input;
... 処理 ...
info "STEP 2 resp=" + resp;

// Map / List はそのまま info に渡してOK（自動で文字列化）
info {"a","b","c"};
info {"k":"v"};

// 例外時には e.lineNo / e.message を出す
try { risky(); } catch(e) { info "ERR line=" + e.lineNo + " msg=" + e.message; }

// 長文を出したいなら CSV 形式にして1行ずつ Creator フォームへ createRecord する
```

## 出典

- https://www.zoho.com/deluge/help/misc-statements/send-mail.html
- https://www.zoho.com/deluge/help/debug/info.html
- https://www.zoho.com/deluge/help/zoho-variables.html
