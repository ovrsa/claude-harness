# スキルの自動選択範囲を絞る

日付: 2026-08-10

`docs/design/` の1枚目。`0000-initial.md` は無い（ハーネスがこの規約より先に存在したため）。
全体像は `HARNESS.md`、手順は `commands/COMMANDS.md` が正本。

## Objective

エージェントが自動で選べるスキルを81本から22本に絞り、ライフサイクルの正本を Ordered Path 一本にする。

## なぜ今これか

skills 87本のうち81本が model-invocable で、毎セッション説明文がエージェントの選択候補に載っていた。
その中に**ローカル規約と矛盾する記述**があった。`skills/git-workflow`（751行・ECC由来）は
push 済みコミットの取り消し手順として `git revert HEAD && git push origin main` を正解として書いており、
`rules/common/worktree-policy.md` の「`main` への直接 push は常時禁止」と正面から衝突していた。

同種の重複が12本（合計4,000行超）あった。`rules/README.md` の設計（rules=what / skills=how）は正しいが、
ECC 由来スキルが what まで持っていたのが原因。

実使用も裏付けになった。2026-04-22〜08-10 の3.5ヶ月で起動記録があるのは資産151件中26件のみ。

## Non-goals

- スキルの削除（deprecated 3件を除く）。棚は残す。`/名前` で呼べる状態を維持する
- Pocock レーン（`/to-spec` `/to-tickets` `/implement`）を Ordered Path に接続すること。道具箱のまま置く
- SQL/Postgres 系5本、ベクトル/RAG 系5本の内容統合
- `rules/typescript/` が skill を1本も参照していない非対称の解消

## 触る対象

| 対象 | 変更内容 | 壊す可能性のあるもの |
|---|---|---|
| `skills/*/SKILL.md` 54本 | `disable-model-invocation: true` を1行追加 | なし（`/名前` での起動は維持される） |
| `skills/verification-loop/` | 削除 | なし。deprecated 済みで実績0 |
| `skills/continuous-learning/` | 削除 | `scripts/hooks/evaluate-session.js` の config 読み込み（下記） |
| `skills/coding-agent-lifecycle-guardrails/` | 削除 | なし。Ordered Path の劣化コピー |
| `commands/tdd.md` | 削除 | なし。同名 skill に奪われて到達不能だった |
| `scripts/hooks/evaluate-session.js` | config 読み込みを撤去し既定値を直書き | Stop フックの閾値。既定値と同値なので挙動不変 |
| `.gitignore` | ライフサイクル成果物を `/` でアンカー、`agents/**` を除外解除 | なし。worktree の欠落を直す方向のみ |
| `tests/hooks/evaluate-session.test.js` `tests/hooks/hooks.test.js` | config 挙動テスト9件と専用ヘルパーを削除 | テスト総数 1195 → 1186 |

**契約の変更が1件ある。** `skills/continuous-learning/config.json` は deprecated なスキルの一部ではなく、
稼働中の Stop フック `evaluate-session.js` の設定置き場だった。ただし中身は
`min_session_length: 10` と `learned_skills_path: ~/.claude/skills/learned/` の2値で、
コード側の既定値（`10` と `scripts/lib/utils.js:40` の `getLearnedSkillsDir()`）と**完全に一致**していた。
既定値を既定値で上書きする no-op だったため、config ごと撤去して既定値を直書きした。
閾値を変えたくなったら `evaluate-session.js` を直す。

## 途中で見つけた別の欠陥

`.gitignore` のライフサイクル成果物ブロックがアンカーされておらず、gitignore の仕様上
任意の階層にマッチしていた。結果として worktree から20ファイルが消えていた。

| 消えていたもの | 原因パターン |
|---|---|
| `commands/plan.md` `commands/research.md` `contexts/research.md` | `plan.md` `research.md` |
| `facets/output-contracts/plan.md` `review-summary.md` `verification-summary.md` | 同名パターン |
| `agents/*.md` 14件 | `agents/**` |

`facets/output-contracts/verification-summary.md` の欠落により、worktree では
パイプラインアダプタが `prompt assembly failed: missing facet` で block していた。
つまり `worktree-policy.md` が「強く推奨」する worktree で `/execute-plan` を走らせると必ず止まり、
`npm test` も通らないため完了ゲートを満たせなかった。

## 却下した案

- **ECC スキルの矛盾箇所を1本ずつ修正する** — upstream/外部由来資産を書き換えることになり、以後永続的な維持コストが乗る
- **`rules` に「衝突したら rules が優先」と1行足すだけ** — 最も安いが、矛盾したスキルを読んだ時に実際に効く保証がない
- **使われていない125件を削除する** — 将来必要になった時の取り直しコストが、判断ノイズの削減分を上回る

## Open Issues

- `skills/python-code-style` と `skills/xlsx` は `~/.agents/skills/` へのシンボリックリンクで、実体が git 管理外にある。未処理のため model-invocable のまま残っている（この2件を含めた実数は24本）
- SQL/Postgres 系5本（`sql-optimization` `sql-optimization-patterns` `sql-code-review` `postgres-patterns` `supabase-postgres-best-practices`）の内容が重複している。前3本は残す側にある
- `rules/typescript/` が skill を1本も参照していない（`rules/python/` は3箇所で名指し）。TypeScript が主言語なのに委譲先が無い
- `skills/learned/` は学習成果の置き場で `SKILL.md` を持たないため、`tests/ci/validators.test.js` が既知の不整合として assert し続けている
- 学習ループが成果を出していない。3.5ヶ月で `skills/learned/` の学習成果0件、`/learn` 起動0回、`continuous-learning-v2` の observer は `enabled: false`。撤去するか有効化するかの判断が未着手
