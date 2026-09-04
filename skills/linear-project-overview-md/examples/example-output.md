概要

CAPE 業務で利用するメールワイズ（運用上は Gmail）の送受信データを、Google スプレッドシートへ自動転記する仕組み（GAS）。

対応時期

依頼された日: 2026-03-16（Linear: `RAR-1964` 作成日）

稼働開始日: 不明

依頼者

部署: 不明

依頼者名: 不明

プロジェクト/タスクのリンク

- Linearプロジェクト: `https://linear.app/...`
- Linearチケット: `https://linear.app/...`

Gitlabプロジェクト

- `projects/cape_gmail_response_alert/`

目的

目的

- メールワイズ（運用上Gmail）の送受信データをスプレッドシートへ自動転記し、手作業（CSV出力・転記）を削減する
- 転記データを後続の運用監視・自動化（アラート等）の土台にする

非目的

- 返信期限（24h）未返信検知と Chatwork 等への通知（未実装）
- 必須メールの送信漏れ検知（未実装）

背景

- 手動 CSV 出力と転記の運用工数が大きく、返信漏れ/送信漏れリスクもあるため、自動化の相談として開始

利用サービス

- Gmail（メールワイズ運用）
- Google Apps Script（時間主導トリガー）
- Google スプレッドシート
- clasp

関連資料

- `README.md`
- `setup-guide.md`

