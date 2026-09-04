# 個人パス検査を実行面まで広げる

日付: 2026-08-21

## Objective

`validate-no-personal-paths.js` の検査対象を「他マシンでの実行を決める面」と「新規読者が最初に読む面」まで広げ、実在する2件の個人ホーム直書きを除去する。

## なぜ今これか

ハーネスを他の開発者へ共有したい。検査器は既にあり緑だったが、対象が `README.md` / `skills` / `commands` / `agents` / `docs` / `.opencode/commands` の6つに限られていた。

唯一の実害である `settings.json:190` はその外にある。`settings.json` が配線するフックコマンド22本のうち18本が `${CLAUDE_PLUGIN_ROOT:-$HOME/.claude}` でスクリプトを解決している中で、この1本だけが `/Users/<me>/.claude/...` の形を直書きしており、**他マシンでは絶対に発火しない。** 検査器はその間ずっと緑だった。

この doc 自身が検査対象なので、欠陥は `file:line` で指し、リテラルの絶対パスは書かない。

CLAUDE.md が2度警告している「空虚に満たせるゲート」（撤去した edit ブロックと完了ゲート）と同じ形をしている。ここでは対象範囲が狭いことが理由。

## Non-goals

- `tests/` を検査対象に含めない。テスト内の個人パスは他マシンの実行を壊さず、既にある placeholder（`tests/lib/run-record.test.js:155` / `tests/lib/transcript-log.test.js:577`）が偽陽性になる。摩擦で検査器ごと無効化される方が高くつく
- フックコマンドが移植形式（`${CLAUDE_PLUGIN_ROOT:-$HOME/.claude}`）を使っているかの検査は入れない。個人パス検査で実害は捕まる
- 秘密情報（APIキー・外部連携先）の検査は対象外。別の関心事
- `docs/design/` の既存記述は触らない（追加only）

## 触る対象

| 対象 | 変更内容 | 壊す可能性のあるもの |
|---|---|---|
| `scripts/ci/validate-no-personal-paths.js` | `TARGETS` に `settings.json` / `hooks` / `scripts` / `rules` / `templates` / `AGENTS.md` / `CLAUDE.md` / `package.json` を追加。成功メッセージを実際の範囲に合わせる | 拡張先に偽陽性が出れば `npm test` が落ちる。事前計測では追加分の hit は `settings.json:190` と `AGENTS.md:5` のみ |
| `settings.json:190` | `hooks/herdr-agent-state.sh` の絶対パス起動を `${CLAUDE_PLUGIN_ROOT:-$HOME/.claude}` 形式へ | SessionStart の herdr フック配線。引用の付け方を誤ると発火しなくなる |
| `AGENTS.md:5` | `CLAUDE.md` への絶対パスリンクを相対へ | なし |
| `commands/next-action.md:23` / `commands/execute-plan.md:43` | 撤去済み SQLite テレメトリへの参照を除去 | なし（記述のみ） |
| `scripts/ci/audit-harness-contract.js:284` | 回帰ガードのコメントを実態へ。`progress.md` への書き込みは 2026-08-17 に撤去済み（`scripts/hooks/subagent-stop.js:99`）で、`pre-compact.js` にも無い | ガード自体は残す。使い捨てリポジトリを渡す必要は別の理由（セッションファイル）で残る |
| 契約（`TARGETS`） | 「共有時に個人パスを含めない面」の定義そのもの。コード側の1箇所に置く | 定義を doc に複製すると乖離する。doc には書かない |

## 却下した案

- **`tests/` も含めて `ALLOWED` に `someone` を追加する** — 検査対象を広げる利益（他マシンの実行に無関係）より、偽陽性の摩擦の方が高い
- **検査器を広げず、2件だけ直す** — 同じ穴に次が落ちる。緑が意味を持たない状態が残る
- **フック配線の書式を正規表現で強制する** — 実害は個人パス検査で捕まる。二重の契約になる

## Open Issues

- 個人パス検査を回避する書き方（`$(whoami)` 展開など）は捕まらない
- ホーム名だけを書いた表記（末尾にスラッシュを付けない形。`scripts/ci/validate-local-config.js:6` のコメントがそれ）は現在の正規表現に当たらない。計測済みで `scripts/` の hit は0件。意図した除外ではなく副作用で、パターンを厳しくすると当たるようになる（推定）
- `.mcp.json` は現在リポジトリに無いため対象に入れても空振りする。将来追加された時に対象漏れになる
