# upstream 由来の死んだ資産を撤去し、常時ロードをローカル決定だけにする

日付: 2026-08-10

同日の `2026-08-10-skill-scope-narrowing.md` の続き。あちらは条件ロードの skills を絞った。
こちらは**常時ロードの `rules/` と、repo の体裁**を扱う。

## Objective

毎セッション無条件で読まれる内容を、ローカルで決めたことだけにする。

## なぜ今これか

skills を81本から21本に絞った直後に測ると、その効果はトークン換算で約2,900（1M窓の0.3%）しかなかった。
本当に効いていたのは件数ではなく2つで、**似たスキル同士の干渉**と**ローカル規約との矛盾**だった。

同じ基準を `rules/` に当てると、より強く当てはまる。skills は条件ロードだが `rules/common` は**毎回**読まれる。
そして中身を調べると、常時ロード約700行のうち **352行が upstream ECC の一般論**で、内容が実態と合っていなかった。

| upstream rules の主張 | 実態 |
|---|---|
| 最低カバレッジ80%（`testing.md`） | 測定手段が無い。`package.json` に coverage も c8/nyc も無い |
| ファイル200-400行・最大800（`coding-style.md`） | 守られていない。自 repo 内で400行超24件・800行超2件 |
| 計画段階で Exa MCP を使う（`development-workflow.md`） | `mcp-configs/` に定義はあるが未接続。MCP 実績は linear のみ |
| planner / tdd-guide / architect を自発的に使え（`agents.md`） | 3.5ヶ月で0回。かつハーネス指示「Do not call the AgentTool unless the user requested it」と正面から矛盾 |

`rules/common/agents.md` は死文であり、同時に常時ロード層の矛盾源でもあった。
`skills/git-workflow` が `main` への直接 push を正解として書いていたのと同じ構図が、より悪い場所にあった。

配置も逆転していた。**常時ロード（高コスト・確実に効く）に私が既に知っていることが入り、
条件ロード（低コスト・呼ばれないと効かない）にローカル固有の知識が入っていた。**

さらに、この repo は `affaan-m/everything-claude-code`（MIT）のツリーを 2026-04-23 に取り込んだもので、
`README.md`（1330行）と `package.json` が**他者のプロジェクトを名乗ったまま**だった。remote も upstream 履歴も
無いため追従は不可能で、`HARNESS.md` の External Sources Policy（外部をライブの正本にしない）にも反していた。

## Non-goals

- ECC 由来 skills 44本の削除。1本ずつ中身を見る必要がある
- skills の `name-only` 移行（31件）
- カバレッジ測定の導入。「80%」を消すだけで、測定を入れるのは別の決定
- `rules/common/` の平坦化。4ファイルになっても `common/` は維持する
- 向きが逆転した5シンボリックリンクの正規化

## 触る対象

| 対象 | 変更内容 | 壊す可能性のあるもの |
|---|---|---|
| `rules/` 18ファイル 701行 | 削除（`README` + `common` の8件 + 言語別10件） | なし。ローカルからの参照ゼロ |
| `agents/` 12ファイル | 削除（`code-reviewer` `harness-optimizer` は残す） | `commands/plan.md` の参照1行 |
| `commands/python-review.md` `commands/e2e.md` | 削除 | なし。ともに0回、agent ラッパー |
| `README.md` | 1330行 -> 読む順序だけの入口に | `audit-harness-contract.js` の README assertion 6件 |
| `package.json` | 配布メタデータを撤去し `private: true` | **`scripts` と `devDependencies` は温存**（`npm test` が依存） |
| `knip.json` | `install.sh` エントリを削除 | なし |
| `llms.txt` `install.sh` `claude-distribution-staging/` | 削除 | なし。配布機構 |
| `scripts/ci/audit-harness-contract.js` | README への assertion 4件を実際の所在へ移す | なし |
| `CLAUDE.md` | 「実装前に既存実装を探す」1行を追加 | なし |

**契約の移動が1件ある。** `audit-harness-contract.js` は README.md に
`Repo-Local Maps` `Triage And Health Loop` `/health-status` `/triage-loop` の記述を要求していた。
README を入口に絞ったため、前2つは `HARNESS.md`、後2つは `commands/COMMANDS.md` を検査対象に変えた。
内容が実際にある場所を検査する形になり、契約の所在が1箇所に寄った。

`LICENSE`（MIT・Affaan Mustafa 名義）は**保持する**。`skills/` に `origin: ECC` の資産が44本残っており、
MIT は複製物での著作権表示の保持を求める。派生元は README に明記した。

## 却下した案

- **カバレッジ測定を入れてから「80%」を残す** — 守りたいなら測定が先。順序を逆にすると検証手段の無い数字が残る
- **矛盾している `agents.md` だけ直して残りは残す** — 死文（0回）を直しても価値が出ない
- **`rules/common/` を平坦化する** — `COMMANDS.md` など複数の参照を更新するコストに見合わない
- **`skills/configure-ecc` も同時に削除する** — Non-goal に挙げた44本の1つ。境界を跨がない

## Open Issues

- `skills/configure-ecc` が削除済みの `rules/common/coding-style.md` `rules/typescript/` `rules/python/` を参照しており壊れている。ECC の配布インストーラなので撤去が筋だが、44本の判断と一緒に扱う
- `commands/sync-global.md` が `~/.codex/rules/` を「変更しない」と書いているが、実際には `~/.claude/rules` へのシンボリックリンクなので同一物。実績0回のため未修正
- 言語別の規約（TypeScript / Python）が無くなった。必要になったらローカルの決定として書き直す
