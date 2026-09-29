# ハーネス配置変更の切替手順

Issue #26 の配置変更を、既存の `~/.claude` に反映するときの手順です。
この手順を書いた時点では、稼働環境への切替は未実施です。

## 切替前

稼働中のフックは呼ばれるたびにスクリプトを読みます。Claude/Codex のセッションを終了してから、
通常のターミナルで作業してください。途中の配置を稼働中のセッションに読ませないためです。

1. `git status --short` で既存変更を確認し、作業ファイル、未追跡データ、Claude/Codex の設定をバックアップします。
   コミット済みの設定で上書きせず、既存の外部フックや設定変更を残します。
2. レビュー済みのブランチを人がマージします。エージェントは main へマージしません。
   追跡済みの7ディレクトリ、開発用設定、実行記録、メトリクス履歴は Git の移動で反映します。
   未コミットのフック変更は、新しい `harness/hooks/` の対応ファイルへ引き継ぎます。
3. `settings.json` のハーネス参照を新配置に更新します。既存の外部フックは保持します。
   設定と参照先が揃うまで、新しいセッションを開始しないでください。

## 未追跡データ

```bash
cd ~/.claude
node harness/scripts/layout.js --root ~/.claude --check
node harness/scripts/layout.js --root ~/.claude --apply
node harness/scripts/layout.js --root ~/.claude --check
```

最後の出力で `moves` が空になることを確認します。
移動先の同名ファイルやシンボリックリンクを見つけると、書き込み前に停止します。
衝突したデータを自動で結合したり、上書きしたりはしません。
途中でプロセスが止まった場合は `--check` で残る候補を確認してから再実行します。

対象は `harness/scripts/layout.js` にあります。`sessions/` の本体用JSONやキー、
`feedback/drafts/`、`telemetry/` の本体用イベント、`.claude.json` の自動バックアップは保持します。
別名ファイルに古いセッションメモのパスが残っていても、メモの移行後は新しい保存先から読みます。
元の別名ファイルの内容は移行処理で書き換えません。

`plugins/` には保存先を変える `CLAUDE_CODE_PLUGIN_CACHE_DIR` があります。ただし登録済み絶対パス、
管理済みスキル、Claude/Codex 双方の参照を既存データごと移す手順は未検証のため、今回は移しません。
本体の配置は [Claude Code のディレクトリ説明](https://code.claude.com/docs/en/claude-directory)、
設定可能な保存先は [環境変数の公式リファレンス](https://code.claude.com/docs/ko/env-vars) を確認しました。
`.last-cleanup`、`.last-update-result.json`、`gh-pr-status-cache.json`、`state/mcp-discover-verdicts.json` は
インストール済み Claude Code 2.1.284 に同名の参照があることも確認しています。

## 接続と確認

```bash
node harness/scripts/sync-codex-bridge.js --check
node harness/scripts/sync-codex-bridge.js --apply
node harness/scripts/sync-codex-bridge.js --check
npm test
npm run lint:repo
```

bridge は既存の管理ブロックと正確に一致する旧フックだけを更新し、変更前の設定を Codex 側に退避します。
独自に変更されたフックがある場合は停止します。`aligned` は設定の一致であり、実行の証拠ではありません。
Claude/Codex の新しいセッションで開始・終了を実行し、`harness/data/runs/` に記録されることを確認してください。
Codex のフックが未信頼なら `/hooks` で信頼します。

切替前後で `layout.js --check` の `count`、残る項目と `moves` を比較します。
失敗時は全セッションを止めたまま、バックアップしたコード、データ、両ランタイムの設定を一緒に戻します。
データだけを旧位置へ戻して新しい生成処理を動かすと、記録が分かれます。

## Orca の表示

Orca 1.4.215 のファイル一覧では `showGitIgnoredFiles` がアプリ全体の設定でした。
ワークスペース限定で隠し、解除して再表示する操作は、この変更では実現していません。
`files.exclude` 対応も確認できていないため、Orca に効くと称した `.vscode/settings.json` は追加していません。
