# Agent Map

This is the thin cross-runtime entrypoint for `~/.claude`.

The canonical lifecycle source remains [CLAUDE.md](./CLAUDE.md).
Use that file for the full operating model, artifact chain, and lifecycle rules.

## Runtime Rule

- `~/.claude` is the harness source of truth
- `Codex` is a runtime bridge, not a second lifecycle definition
- do not redefine the lifecycle locally when this directory is the active workspace

## Managed Grill

For non-trivial work, resolve the managed `grilling` skill before entering the distribution
lifecycle:

```bash
node ~/.claude/harness/scripts/resolve-managed-skill.js grilling
```

Read the returned `SKILL.md` completely and follow it. Present the final understanding and wait
for confirmation. After confirmation, wait for an explicit instruction before writing files.

## Codex Start / End

When running in `Codex`, execute these commands every session:

Start:

```bash
node ~/.claude/harness/scripts/hooks/runtime-session-start.js
```

End:

```bash
node ~/.claude/harness/scripts/hooks/runtime-session-end.js
```

This captures the gate evidence into `harness/data/runs/<date>-<slug>/`, shared with Claude Code sessions.
The SQLite store these hooks used to write was retired on 2026-08-20; the archive of it is at
`harness/data/runs/_archive/telemetry-sqlite-2026-08-20.json`.

## Improvement Rule

- if a recurring failure appears, record it under `Guardrail Candidates`
- do not auto-promote recurring candidates
- run `/improve-harness` only when an explicit improvement pass is requested

## Mistakes To Avoid

追記only。同じ失敗が起きたら1行足す。

- **1行の `SKILL.md` を「壊れている」と判断して書き換えない。** `skills/grill-me/SKILL.md` は upstream
  (mattpocock/skills) の入口スキルで、`Run a /grilling` の1行が正しい姿。実体は `skills/grilling/`。
  2026-07-27 にこれを故障と誤診して上書きし、翌日 upstream から復元した。
  upstream 由来の資産に足りない要素があるときは、upstream を編集せずローカル側（command / rule）に置く。
- **スキル/ディレクトリを消す前にシンボリックリンクを疑う。** 元の環境では `~/.claude/skills/` と
  `~/.agents/skills/` が相互にリンクで参照し合っており、**向きが一様でなかった**。
  **この配布版にはリンクが1本も無い**（パッケージ化の時に実体を焼き込んだ。`README.md` の「元の環境との差分」）。
  スキルインストーラを入れると同じ構造が復活するので、判定手順だけ残す。
  `find` は既定でリンクを辿らないので「空に見える」。判定には `find -L` / `readlink` / `test -e` を使う。
  元の環境では 2026-07-28 に方向を逆に読み、70件を張り替えてリンクループを作った（全復元済み）。
  `diff -rq A B` は B が A へのリンクだと自分自身との比較になり、必ず「一致」を返す。同一性の根拠にならない。
- **インストーラ管理下のスキルの `SKILL.md` を編集しない。** 元の環境では `~/.agents/.skill-lock.json` が
  upstream URL と `skillFolderHash` で13件を追跡していた（mattpocock/skills, wshobson/agents,
  github/awesome-copilot, spillwavesolutions）。編集は更新で失われる。
  **この配布版に lock ファイルは無いので、13件は更新に追従しない**（出典は `README.md` の一覧）。
  自動選択から外したいだけなら `settings.json` の `skillOverrides` を使う。

  ```json
  "skillOverrides": { "<name>": "user-invocable-only" }
  ```

  `user-invocable-only` はモデルから隠し `/name` は残す。`off` は両方から隠す。
  2026-08-10 の絞り込みでは、ローカル/ECC 由来の54件は `SKILL.md` に `disable-model-invocation: true` を
  足したが、インストーラ管理下の3件は `skillOverrides` で処理した。**新規はこちらを使う**（1箇所に集まり、
  git 追跡され、upstream を汚さない）。
- **`plan.md` / `progress.md` を復活させない。** 2026-08-17 に撤去した
  （`docs/design/2026-08-17-lifecycle-five-steps.md`）。決定は `docs/design/` に置く。
  雛形の復活は `audit-harness-contract.js` の `retired-artifact` が検出するが、
  書き込みコードの復活は検出しない。**状態の要約を保存する仕組みは無いので、
  compaction の前にコミットする。**
- **ブロックすると書くなら、フックを名指しする。** `audit-harness-contract.js` の
  `blocking-gate-unnamed` が、そのフックの存在と `settings.json` への配線まで検査する。
  2026-08-17 まで `CLAUDE.md` は完了宣言を無条件のブロックとして書いていたが、
  実装は一度も発火していなかった。**ブロックすること自体の確認と、いつ発火するかの確認は別物。**
- **`npm test` に実リポジトリを触らせない。** フックは cwd のリポジトリを見る。
  テストから起動する時は使い捨ての git リポジトリを cwd に渡す
  （`hooks.test.js` の `getSandboxRepo()`）。重み判定が linked worktree かどうかで決まる
  ようになったので、その手の助言を検証するテストは `createLinkedWorktree()` を使う。
  2026-08-12 まで、テスト実行のたびに本物のセッション状態がフィクスチャ値で上書きされていた。

## Upstream Assets

ローカルで書いたものではない。編集する前に upstream を確認する。

github.com/mattpocock/skills 由来の10個（`grilling` `grill-me` `grill-with-docs` `domain-modeling` `to-spec`
`to-tickets` `tdd` `implement` `setup-matt-pocock-skills` `code-review`）は `skills/` に置かず、プラグイン
`mattpocock-skills` が提供する（`settings.json` の `enabledPlugins`）。更新はプラグインの更新で入る。
Codex は `node ~/.claude/harness/scripts/resolve-managed-skill.js <名前>` が返す `SKILL.md` を読む。

**`skills/` に残る下の表の5個は実ファイルとして焼き込まれており、lock ファイルは同梱していない。**
つまりどれを編集しても消えないが、**upstream の更新も入ってこない**。元の環境での「インストーラ管理下」列は、
再インストールした時にどれが上書きされ得るかの目安として残す。

| パス | upstream | 元の環境で lock 管理 |
|---|---|---|
| `skills/design-doc-mermaid/` | github.com/spillwavesolutions/design-doc-mermaid | **有り** |
| `skills/python-code-style/` `skills/sql-optimization-patterns/` | github.com/wshobson/agents | **有り** |
| `skills/sql-code-review/` `skills/sql-optimization/` | github.com/github/awesome-copilot | **有り** |

## Pointers

- canonical lifecycle: [CLAUDE.md](CLAUDE.md)
- 今どうなっているか: [docs/architecture.md](docs/architecture.md)
- 流れの正本: [commands/COMMANDS.md](commands/COMMANDS.md)
- Issue からゴールで進める入口（両ランタイム共通）: [skills/draft-issue](skills/draft-issue/SKILL.md) / [skills/split-issue](skills/split-issue/SKILL.md) / [skills/start-issue](skills/start-issue/SKILL.md)。
  Codex では `$start-issue <Issue>` のように明示して呼ぶ
- Codex runbook: [docs/how-to/codex-operations-runbook.md](docs/how-to/codex-operations-runbook.md)
- Codex SQLite bridge: [docs/how-to/codex-telemetry-bridge.md](docs/how-to/codex-telemetry-bridge.md)
