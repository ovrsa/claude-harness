# Claude Code Harness — 共有版 (2026-08-24)

Claude Code の制御レイヤ。エージェントに開発作業をさせるときの承認ゲート、検証の証拠、
セッション継続、ライフサイクルの手順を1箇所に持つ。`~/.claude` に置いて使う。

**これは1台の個人環境から切り出したスナップショットである。** 元のリポジトリの `README.md` は
「他の開発者が自分の環境で動かすことは想定していない」と書いていた。理由は2つ挙げられていて、
そのどちらもこのパッケージ化で解消してある。

| 元の理由 | このパッケージでの状態 |
|---|---|
| デバイス固有の状態が混ざっている | `.gitignore` 済みのローカル状態（会話ログ・セッション・履歴・キャッシュ・テレメトリ）と、個人の実行記録 `runs/` を除外した |
| `~/.agents` 側に実体を持つスキルが混ざっている | 該当5件は実体を焼き込んだ。**このツリーにシンボリックリンクは1本も無い** |

そのうえで、**移植性は実測してある**（下の「確認する」）。

## 入れ方

**先に既存の `~/.claude` を確認する。** ここには Claude Code 自身が書く会話ログ
（`projects/**/*.jsonl`）とセッション記録が入っている。`mv` で上書きしようとすると、
既存ディレクトリがある場合は**中に入れ子になるだけで気づきにくい。**

```bash
# 1. 既存を確認する
ls ~/.claude 2>/dev/null && echo "既存あり: 先に退避すること"

# 2. 退避する（既存があった場合のみ。会話ログを失わないため）
mv ~/.claude ~/.claude.bak-$(date +%Y%m%d)

# 3. 配置する
mv claude-harness-2026-08-24 ~/.claude
cd ~/.claude

# 4. git リポジトリにする（必須）
git init && git add -A && git commit -m "initial: shared harness snapshot"
```

退避した会話ログを引き継ぎたい場合は `~/.claude.bak-*/projects/` を新しい `~/.claude/` に戻す
（`.gitignore` 済みなので git は追跡しない）。

**`git init` は省略できない。** ライフサイクルの重み判定が「linked worktree にいるか」で決まり
（`hooks/lifecycle-pre-commit.js`）、証拠の退避先 `runs/` も git 追跡を前提にしている。
git リポジトリでないと検証が3件落ちる（実測。下記）。

`npm install` は**要らない**。`package.json` の `dependencies` は空で、検証コードが読み込むのは
Node.js の組み込みモジュールだけ（実測済み）。lint を回したい時だけ devDeps が必要になる。

### 動作を確認した環境

**macOS / Node v26 のみ。** ここが検証済みの範囲で、それ以外は未確認である。

`package.json` は `engines: { "node": ">=18" }` と宣言しているが、18 系での通し確認はしていない。
`scripts/export-telemetry-archive.js` は `node:sqlite`（Node 22+）を使う一度きりの移行ツールで、
読み込めない場合は「利用不可」と報告して落ちない作りになっている。**22 以上を勧める。**

macOS を前提にしている箇所が2種類ある。どちらも他 OS では無害に失敗するだけで、消してもよい。

- 通知音 `afplay /System/Library/Sounds/*.aiff`（`settings.json` の `Notification` と `Stop`）
- ステータスライン `scripts/hooks/statusline.sh`

### 無害だが動かないフック

`SessionStart` に `hooks/herdr-agent-state.sh` が配線されている。これは Herdr という別ツールとの
連携用で、環境変数（`HERDR_ENV` / `HERDR_SOCKET_PATH` / `HERDR_PANE_ID`）と `python3` が揃わない限り
**即座に exit 0 する。** 使わないなら放置してよい。消しても構わない。

## 確認する

```bash
npm test
```

実測値: **1392 passed / 0 failed**（`~/.claude` の外に置いた git 初期化済みコピーで確認、
`npm install` なし、2026-08-24）。

`git init` を忘れると次の3件が落ちる。原因は1つ（git リポジトリでない）。

```
scripts/ci/validate-runtime-surface.js       git ls-files が失敗する
tests/lib/*                                  isGitRepo returns true in a git repo
tests/ci/*                                   validate-runtime-surface: passes on real project runtime surface
```

`npm run lint:repo` は eslint / knip / dependency-cruiser を回す（devDeps が必要）。
`npm run lint:markdown` は既存違反が残っており通らない。完了条件でもない。

## 採用前に自分で決めるキー

`settings.json` は**元の環境で実際に動いていたものをそのまま同梱している**。加工していないので、
以下は自分の判断で決めること。

### 権限を緩めている（必ず自分で判断する）

```json
"permissions": { "defaultMode": "auto" }
"skipDangerousModePermissionPrompt": true
"skipAutoPermissionPrompt": true
```

この3つで**ツールの承認プロンプトが出なくなる。** 元の運用者が自分の環境で選んだ設定であって、
推奨ではない。慣れるまでは外すか、`defaultMode` を既定に戻して使う。

### 個人設定（好みに変える）

| キー | 同梱値 | 備考 |
|---|---|---|
| `theme` | `dark-daltonized` | 色覚に合わせた設定 |
| `language` | `日本語` | 成果物とコメントの言語 |
| `effortLevel` | `high` | 推論の深さ |
| `model` | `opus[1m]` | **契約プランに依存する。** 使えない場合は外す |
| `voiceEnabled` | `true` | |
| `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | `60` | 自動 compaction の閾値 |

macOS 前提の2箇所（通知音とステータスライン）は「動作を確認した環境」を参照。

### フックの配線は触らなくてよい

21本すべて `${CLAUDE_PLUGIN_ROOT:-$HOME/.claude}` 形式なのでそのまま移植できる。
ただし `statusLine.command` の1箇所だけ `$HOME/.claude` 直書きで他と揃っていない。
`$HOME` なのでどのマシンでも解決するが、`~/.claude` 以外の場所にプラグインとして置くと外れる。

## 止まる場所は1つだけ

**期待値をずらさないために先に書く。** このハーネスで機械的にブロックされるのは1つだけ。

| 操作 | 挙動 |
|---|---|
| ファイル編集 | **止まらない。** `[Lifecycle Advisory]` が欠けている証拠を名指しして続行する |
| `git commit` | **止まらない。** コミットはチェックポイントであって完了の宣言ではない |
| 完了の宣言 | **止まらない。** 証拠の連鎖を機械的に検査するものは無い |
| **`main` / `master` への `git push`** | **止まる。** `hooks/git-push-guard.js`。リポジトリから対象ブランチを解決するので引数なしの `git push` も捕まる |

残りは規律と証拠成果物で担保する設計になっている。詳細は `docs/how-to/run-a-task.md`。

なお advisory が「証拠が無い」と言うのは **linked worktree にいる時だけ**である
（`hooks/lifecycle-pre-commit.js` の `isLinkedWorktree`）。worktree を作らなければ何も言わない。
worktree を作るかはエージェントの判断に任されており、強制はされていない。

## 読む順序

| 順 | 読む先 | 得られるもの |
|---|---|---|
| 1 | このファイル | 何のためのものか、入れ方 |
| 2 | [`docs/architecture.md`](docs/architecture.md) | 今どうなっているか。どこで止まるか |
| 3 | [`commands/COMMANDS.md`](commands/COMMANDS.md) | 作業が実際どう進むか（Ordered Path が正本） |
| 4 | [`docs/how-to/run-a-task.md`](docs/how-to/run-a-task.md) | 人が手で行う4つと、エージェントに任せる部分 |
| 5 | [`AGENTS.md`](AGENTS.md) | 触ると危ないもの。過去に踏んだ失敗 |
| 6 | [`docs/design/`](docs/design/) | なぜそうなっているか（必要になった時だけ、該当する1枚） |

`CLAUDE.md` は常時ロードされる運用の入口で、読み物ではなく設定に近い。
`rules/common/` の4枚も同じ扱い（`documentation.md` `git-workflow.md` `performance.md` `worktree-policy.md`）。

`docs/design/` は21枚ある。**追加only** で、日付順に「その時点の決定」が並ぶ。撤去した機構の理由も
そこに残っているので、「なぜこれが無いのか」を知りたい時はそこを見る。

## 元の環境との差分

このパッケージは元のリポジトリの追跡ファイルから `runs/` を除いた436ファイル。
そのうえで**17ファイルが元と内容が違う**（うち13枚は `著者:` 行を落としただけ）。

| ファイル | 変えた理由 |
|---|---|
| `README.md`（このファイル） | 元は「動かすことは想定していない」と書いてあり、配布物として嘘になる |
| `AGENTS.md` | シンボリックリンク5件とインストーラ lock の記述を、このツリーの実態に合わせた（リンクは0本、lock は同梱していない） |
| `docs/how-to/device-migration.md` | 導入手順を扱う doc が2枚になるため、冒頭に「正本は README」と明記した |
| `scripts/ci/validate-local-config.js` | 経緯コメントに元の運用者のホームパスが直書きされていたのでプレースホルダに置き換えた（コードは `os.homedir()` を使うので挙動は変わらない） |

加えて `docs/design/` の13枚から `著者:` 行（元の運用者名）を削除した。本文は元のままである。
`templates/design-doc-*.md` の `著者` 欄は空のまま残してあるので、新しく書く時は自分の名前を入れる。

他は元のままである。

`docs/how-to/` の `codex-operations-runbook.md` と `codex-telemetry-bridge.md` は
`~/.codex` を併用する場合の手順である。Codex を使わないなら読まなくてよい。

除外したもの:

- `runs/`（個人の実行記録。絶対パスとメールアドレスを含み、受け取り側に価値が無い）
- `.git/`（コミット履歴に個人のメールアドレスが入る）
- `node_modules/`（`dependencies` が空なので不要）
- `.gitignore` に列挙されたローカル状態すべて（`projects/` の会話ログ、`sessions/`、`history.jsonl`、
  `backups/`、`file-history/`、`image-cache/`、`paste-cache/`、`metrics/`、`plans/`、`tasks/`、
  `telemetry/`、`.state/` など）

## 派生元と第三者資産

ツリー全体の出発点は [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code)（MIT）。
2026-04-23 に取り込んだ。ライフサイクル・コマンド・ルール・フックは以降すべて書き換えており、
upstream を追従していない。`skills/skill-stocktake` が `origin: ECC` を宣言して残っているため、
同梱の `LICENSE`（MIT / Copyright (c) 2026 Affaan Mustafa）を保持している。

`skills/` の13件は外部リポジトリ由来である。**このパッケージには実体を焼き込んであり、lock ファイルは
同梱していない**（元は5件がシンボリックリンクで、zip に入れると壊れるため）。よって編集しても消えないが、
**upstream の更新も入ってこない**。

| 出典 | スキル |
|---|---|
| [mattpocock/skills](https://github.com/mattpocock/skills) | `tdd` `code-review` `implement` `to-spec` `to-tickets` `domain-modeling` `grill-with-docs` `setup-matt-pocock-skills` |
| [wshobson/agents](https://github.com/wshobson/agents) | `python-code-style` `sql-optimization-patterns` |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | `sql-code-review` `sql-optimization` |
| [spillwavesolutions/design-doc-mermaid](https://github.com/spillwavesolutions/design-doc-mermaid) | `design-doc-mermaid` |

`grill-me` と `grilling` も upstream (mattpocock/skills) 由来だが lock には載っていなかった。
`grill-me/SKILL.md` は `Run a /grilling session.` の1行だけで、**これが正しい姿**である
（元の環境で1度これを故障と誤診して上書きした記録が `AGENTS.md` にある）。

upstream 由来の `SKILL.md` を書き換えない。足りない要素は upstream ではなく `commands/` か `rules/` に置く。
自動選択から外したいだけなら `settings.json` の `skillOverrides` を使う。

```json
"skillOverrides": { "<name>": "user-invocable-only" }
```

`user-invocable-only` はモデルから隠して `/name` は残す。`off` は両方から隠す。反映は次の新規セッションから。

### ハーネス本体が名指ししているスキル

以下は `CLAUDE.md` / `rules/` / `docs/how-to/run-a-task.md` が手順の中で名指ししている。
消すと手順書が指す先を失う。

| スキル | 役割 |
|---|---|
| `grilling`（入口は `grill-me`） | 着手前の尋問。決定を固める |
| `tdd` | RED -> 最小 GREEN。refactor はループの外（review 段の仕事） |
| `design-doc-mermaid` | design doc の図。再発明せず委譲する |
| `writing-reference-docs` | doc を書くべきかの判定 |
