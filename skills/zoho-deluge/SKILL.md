---
name: zoho-deluge
description: Use when writing Zoho Deluge scripts, building Zoho CRM/Creator/Books/Desk custom functions, configuring workflow rules or schedules, integrating Zoho apps with external APIs via invokeurl/Connections, manipulating subforms or lookups, or troubleshooting Deluge limits and errors (5000 statement limit, invokeurl timeout, OAuth connections, getJSON null traps).
disable-model-invocation: true
---

# Zoho Deluge リファレンス

## 概要

Zoho Deluge は Zoho 製品群（CRM, Creator, Books, Desk, People, Mail, Flow, …）に組み込まれた、サーバーサイド・スクリプト言語。動的型付けで、`invokeurl` による HTTP 呼び出し・`zoho.crm.*` / `zoho.creator.*` 等の組込タスク・`sendmail` ブロック・Workflow Rule / Custom Function / Schedule / Custom Button への接続を持つ「自動化用 DSL」として設計されている。

**スキルの基本姿勢**: 推測で構文を書かない。Deluge は他言語と似て非なる挙動（statement 上限・`get()` の null 返却・Creator だけ論理演算子優先順位が違う・`invokeurl` の `body`/`parameters` 排他など）が多いので、迷ったら下の参照ファイルに当たる。

## どんなときに使う

- Zoho CRM/Creator/Books/Desk の **Custom Function** を書く / レビューする
- **Workflow Rule** から関数を呼ぶ自動化を設計する
- **Schedule**（cron 的バッチ）を仕込む
- **invokeurl** で外部 REST API と連携する（GET/POST/PUT/DELETE, multipart, OAuth）
- **Connection** を新規作成 / 既存 Connection をスクリプトから参照する
- **Subform / Lookup** を Creator で操作する
- `sendmail` で通知メール / 添付付きメールを送る
- `5000 statement limit` / `invokeurl timeout 40s` / `getJSON null` などの落とし穴に当たった

## ファイル構成（必要なときに読む）

| ファイル | 内容 |
|---|---|
| [language.md](language.md) | 変数 / データ型 / 演算子 / 制御フロー / 関数定義 |
| [functions.md](functions.md) | 組込関数の全カテゴリ（String/Date/List/Map/Number/JSON/Encryption）。**日付の ISO 8601 化と TZ 補正もここ** |
| [integrations.md](integrations.md) | `invokeurl` フル文法 / Connections / `zoho.crm.*` / `zoho.creator.*` / Subform / Lookup |
| [automation.md](automation.md) | Custom Function / Workflow Rule / Custom Schedules / Zoho Flow との使い分け |
| [system-and-mail.md](system-and-mail.md) | `sendmail` ブロック / `info` デバッグ / `zoho.*` システム変数 |
| [error-handling.md](error-handling.md) | **null 安全の総本山**（`ifNull`, `isNull`, Map `get` 防御）/ `try/catch` / 公式 Limits / リトライ・冪等性 |
| [recipes.md](recipes.md) | E2E 実例 5 本（Webhook→CRM、Schedule→Mail、Subform 集計、外部 API、CRM↔Creator 同期） |
| [pitfalls.md](pitfalls.md) | 公式ドキュメント由来の頻出ハマりどころ FAQ |

### トピックの正本（重複時はこちらを参照）

| トピック | 正本 |
|---|---|
| null 安全（`ifNull` / Map `get` / `getJSON` の null 連鎖） | [error-handling.md](error-handling.md) §2 |
| 5,000 statement 回避とバルク化 | [error-handling.md](error-handling.md) §4 |
| 日付の出力フォーマット・ISO 8601・TZ 補正 | [functions.md](functions.md) §2 |
| Workflow Rule → Function 引数の渡し方 | [automation.md](automation.md) §1.5 |
| Connection 認証種別と Link Name 命名 | [integrations.md](integrations.md) §2 |

## クイックリファレンス

```deluge
// 変数（動的型付け、末尾 ; 必須）
name = "John";
total = 0.0;

// Map / List
m = Map(); m.put("k","v");
lst = {"a","b","c"};

// 条件・ループ
if (x > 0) { info "pos"; } else if (x == 0) { info "zero"; } else { info "neg"; }
for each item in lst { info item; }
for each index i in lst { info i + ":" + lst.get(i); }

// 三項相当
result = if(x > 0, "pos", "non-pos");

// null 安全
safe = ifNull(maybe_null, "default");

// HTTP（task 形式が現行・推奨）
resp = invokeurl [
    url: "https://api.example.com/v1/things"
    type: POST
    body: m.toString()
    headers: {"Content-Type":"application/json"}
    connection: "my_oauth_conn"
];

// CRM レコード
zoho.crm.createRecord("Leads", m);
zoho.crm.updateRecord("Leads", lead_id, m);
zoho.crm.searchRecords("Leads", "(Email:equals:a@b.com)");

// メール
sendmail[
    from: zoho.adminuserid
    to: "ops@example.com"
    subject: "subj"
    message: "<p>body</p>"
    content type: HTML
];

// 例外
try { x = lst.get(99); } catch (e) { info e.message; }
```

## 絶対に覚えておくべき上限値（[error-handling.md](error-handling.md) に詳細）

| 項目 | 上限 |
|---|---|
| Function 内 statement 実行数 | **5,000**（ループの繰り返しは1回ごとに加算） |
| Function 内 function 呼び出し数 | 75 |
| `invokeurl` リクエストタイムアウト | **40 秒** |
| `invokeurl` レスポンスサイズ | 5 MB |
| `sendmail` 添付サイズ | 15 MB |
| `info` + `alert` 出力 | 500 KB（超過分は切り捨て） |
| Custom Schedule 実行時間 | **5 分** |
| Custom Schedule 実行行数 | 200,000 |
| 1組織あたり Active Schedule | 10 |
| Workflow Rule あたり Function 数 | 6（即時1 + 時刻起動5） |
| 1日あたり `sendmail` | 500 通 |
| 1日あたり `invokeurl/getUrl/postUrl` | 2,000 |

## 絶対に踏みたくない 3 大トラップ

1. **`get()` は欠落キーで `null` を返す**。`ifNull(m.get(k), default)` か `containKey` を必ず噛ませる。
2. **`invokeurl` の `body` と `parameters` は同時指定不可**。Map を body にすると既定で `multipart/form-data` になるので、JSON で送るなら `headers` で `Content-Type: application/json` を明示し、`m.toString()` を `body` に渡す。
3. **`5000 statement` は実行数**。10 行のループ × 600 件 = 6,000 で死ぬ。`bulkCreateRecords` や List 一括投入を使う。

## 学習・参照戦略

- まず作りたいものが**自動化トリガー**か**API 呼び出し**か**データ加工**かを切り分けて、対応するファイルだけ読む（[automation.md](automation.md) / [integrations.md](integrations.md) / [functions.md](functions.md)）。
- 構文の細部は [language.md](language.md) を当たる。エディタの補完は信用しない（Zoho サービスごとに微差がある）。
- バグ調査・限界調査は [error-handling.md](error-handling.md) と [pitfalls.md](pitfalls.md) を両方読む。
- 末尾に**公式ドキュメント URL** を引用付きで残してあるので、挙動が疑わしい場合は出典に当たる。

## 出典

すべての記述は `https://www.zoho.com/deluge/help/`、`https://www.zoho.com/crm/developer/docs/`、`https://www.zoho.com/creator/newhelp/deluge/`、および `https://www.zoho.com/flow/help/` を参照元としている。各サブファイル末尾に該当する個別 URL を列挙している。Workflow Rule 系の旧 KB URL（`help.zoho.com/portal/en/kb/crm/automate-business-processes/workflow-rules`）は 404 化済みのため、CRM Developer Docs の `programming.html` / `set-up-functions.html` から再構成した内容を [automation.md](automation.md) に記載している。
