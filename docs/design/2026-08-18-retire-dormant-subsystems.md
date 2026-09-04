# 休眠していた部分系を撤去し、コマンド起動を計測する

## Objective

4ヶ月動いていない学習ループと、役割を譲った TypeScript アダプタを撤去する。
そして**スラッシュコマンドの起動を記録し始める** — 未記載コマンドの判断が
「測れないから決められない」で止まっていたため。

## なぜ今これか

ライフサイクルの作り直し（`2026-08-17-lifecycle-five-steps.md`）で先送りにした項目が
残っていた。調査で**前提が2つ覆った。**

**1. `validate-skills.js` の失敗は直す対象ではなかった。**
`tests/ci/validators.test.js` が `exit 1` を意図的に assert していた
（"Quarantined skills surface should not be treated as canonical green"）。
保留された既知状態で、不具合ではなかった。

本当の未決事項は `2026-08-10-skill-scope-narrowing.md` が挙げていた方だった —
**学習ループが成果を出していない。撤去か有効化かの判断が未着手。**
実測: `skills/learned/` の成果物1件（2026-07-30）、`observer.enabled` は `false`、
`instinct-cli.py` の python 実行3回。

**2. `engine-adapter.ts` は放置された未完成品ではなく、置き換えられた前任だった。**
追加コミット `4db52f1`「route /execute-plan through pipeline-runner + TS engine adapter」が
示す差し込み口（`pipeline-runner.js` の `--adapter-command` + `spawnSync`）は、今
`scripts/provider-adapters/{codex,claude-code}.js` が埋めている
（`2026-05-13-takt-patterns-import.md`「Provider adapters must be small, inspectable
programs called by...」）。参照ゼロは役割を譲った結果。

**3. コマンドの使用実績は計測可能だった。** `settings.json` に `UserPromptSubmit` の
配線が1本も無かった。ここは生の入力を見るので `/command` を記録できる。

## Non-goals

- **未記載コマンド19本の書く/消す判断は今回しない。** 計測を始めた側なので、
  データが溜まるまで判断材料が無い
- `buildLifecycleState` の plan/progress 段は触らない（波及195箇所）
- `typescript` / `tsx` を依存に追加しない。`scripts/lib/*.d.ts` 4本は
  JS ライブラリのエディタ型として機能しているので残す
- 完全なプロンプトパーサは書かない。コマンド名を1つ拾えれば足りる

## 決定

**1. 学習ループを撤去する。** `continuous-learning-v2` / `learned` / instinct 系コマンド4本 /
`evaluate-session.js`（80行、ログを出すだけで抽出はしていなかった）/ 配線3本。

加えて `evolve` と `promote` も撤去する。**どちらも全体が instincts 依存**で
（「continuous-learning output を curating する時」「in continuous-learning-v2」）、
撤去後は存在しないシステムを指す孤児になる。承認時の一覧には無かったが、同じ判断の範囲。

`/learn` と `/learn-eval` は**残して retarget する。** 書き込み先が
`skills/learned/` だったのを通常のスキル置き場に変えた。手動の抽出は自動の観測ループとは
別物で、承認された一覧にも入っていない。去就は他の未記載コマンドと一緒に、
計測データが出てから決める。

**2. `engine-adapter` 一式を撤去する。** 416行。`tests/run-all.js` の
`Skipped files` が 0 になる。

**3. コマンド起動を `session_events` に記録する。** テーブルは追加しない。
`recordSessionEvent({ eventType: 'command_invoked', metadata: { command } })`。

このフックは**入力経路の上にいる**ので、契約を2つ置く:

- **exit は常に 0。** 記録の失敗でプロンプトを止めない
- **stdout は常に空。** `UserPromptSubmit` の stdout はプロンプトに注入され得るので、
  計測が会話に混ざってはいけない

コマンド名は `/^\/([a-z][a-z0-9-]*)(?:\s|$)/i` で拾う。英数字始まりを要求するので
`/Users/<name>/f.md` のようなパスや `/../../etc/passwd` は無視される。区切りが `\s` か終端なので
`/verify; rm -rf /` も記録されない — **記録漏れの側に倒れるのが安全な向き。**

## 却下した案

| 案 | 却下の理由 |
|---|---|
| 学習ループを有効化して様子を見る | observer がバックグラウンドでエージェントを起動する。「指示がない限り Agent を使わない」運用と衝突する |
| `skills/learned/` に `SKILL.md` を置いて validator を通す | 4ヶ月成果1件の置き場を維持する理由が無い |
| `engine-adapter` を配線する（typescript + tsx を追加） | 差し込み口は provider-adapters が既に埋めている。依存を2つ増やして重複を作る |
| コマンド計測用のテーブルを新設する | `session_events` が `eventType` を取るので不要。テーブルを増やすと読む場所が増える |
| `Stop` フックでプロンプト履歴を後から集計する | 起動と失敗が区別できない。`UserPromptSubmit` は起動そのものを見られる |
| `/learn` `/learn-eval` も撤去する | 承認された一覧に無い。手動抽出は自動ループとは別で、計測後に判断できる |

## 触る対象

**契約が変わるもの**:

- `tests/ci/validators.test.js` — `validate-skills` の期待値が exit 1 → exit 0
- `scripts/ci/validate-hooks.js` — `VALID_EVENTS` に `UserPromptSubmit` を追加
- `scripts/hooks/command-telemetry.js`（新設）— 上記2つの契約（exit 0 / stdout 空）

**回帰ガードの移し替え**: 撤去した機能を「入れ物」にしていた汎用テストがあった。
box 描画の回帰4件が `instincts()` に、フックの堅牢性1件が `evaluate-session.js` に乗っていた。
機能ごと消すとガードが黙って失われるので、別のメソッド／フックへ移した
（詳細は `verification-summary.md`）。

## 数字

- CI: 10/11 PASS → **11/11 PASS**（`validate-skills.js` が初めて素で通る）
- lint: エラー1件 → **0件**
- `tests/run-all.js`: `Skipped files` 1 → **0**、テスト 1,305 → 1,314
- 削除: 5,157行（学習ループ + engine-adapter 416行）

## 許容したリスク・負債

- **計測開始前の起動は残っていない。** 古いコマンドの実績がゼロに見えるのは
  「使われていない」ではなく「まだ測っていない」。`docs/how-to/run-a-task.md` に明記した
- **`eval-aggregates.js` の未使用エクスポート9件は内部化できなかった。**
  knip の誤報で、テストが `require(変数)` の形で読み込むため静的に解決できていない。
  内部化したらテストが落ちたので revert した
- **`skills/skill-stocktake/SKILL.md` が撤去済みスキルを例文として参照している。**
  日付付き記録の `results.json` は触らない方針だが、`SKILL.md` の例文は残った

## Open Issues

- 未記載コマンド19本の判断（計測データ待ち）
- `/learn` `/learn-eval` の去就（同上）
- knip の動的 require 誤報を検出する手段（`commands/refactor-clean.md` は
  「advisory first」と書いているが具体例が無い）
