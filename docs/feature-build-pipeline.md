# Feature Build Pipeline

この文書は「アプリ / 機能を1つ作って」と依頼されたときの**実務パイプライン**を、実在するコマンド・artifact・ゲートに対応づけてまとめる。

lifecycle の原則そのものは `docs/development-task-pipeline.md` が canonical。この文書はそれを前提に、次の3点だけを具体化する。

- 要望 → spec化（セキュリティ込み）→ 進捗を取りながら実装、のコマンド対応
- セキュリティをどこで織り込むか
- 開発順序（lifecycle order と technical layering order の区別）

## 1. 要望 → 実装の対応表

| 段 | コマンド / 仕組み | 産物 | ゲート |
|---|---|---|---|
| intake | 会話 | interpreted purpose | なし |
| shape（spec化） | `/shape-task` | task brief（success criteria / constraints / non-goals / spec要否判定） | なし（readonly） |
| research | `/research`, `search-first` | `research.md` | なし |
| plan | `/plan` | `plan.md`（リスク + TDD spec 期待値=正常/境界/異常） | **人間の承認**（heavy-risky は必須） |
| 分離 | `/worktree-start <slug>` | worktree branch | 非自明な変更で発動 |
| 実装 | `/execute-plan` / `/tdd` | コード + テスト | scope/permission 境界 |
| verify | `/verify` | `verification-summary.md` | check が通ったか |
| review | `code-reviewer` / `security-reviewer` / `/review-task` | `review-summary.md` | 受け入れてよいか |
| eval | `/eval` | 受入判定 | 重要度に応じて |
| observe | （挙動変化時）`/e2e`, browser harness | `observation-summary.md` | 挙動が変わった時のみ |
| handoff | `/post-commit-capture` | docs / skill / guardrail candidate | — |

進捗追跡（後述）は全段を通して `progress.md` + `telemetry.db` で持続する。

## 2. セキュリティの織り込みポイント

セキュリティは**1つの段ではなく、複数の層**で効く。spec に自動で章立てされる固定仕様ではない点に注意する。

- **常時**: `rules/common/security.md` のコミット前必須チェックリスト（secrets / injection / XSS / authz / rate limit / error leak）
- **shape / plan 時**: heavy-risky 判定（認証・認可・データ・deploy・migration・破壊的操作）に該当する要望は spec に security 要件を明記する。`/shape-task` の constraints と acceptance criteria に落とす。
- **実装後**: `security-reviewer` agent / `security-review` skill が入力処理・認証・API・秘密情報の取り扱いで発火
- **受入時**: `/eval` ゲートがセキュリティ観点を含めて採否判定

> 運用ルール: 要望が heavy-risky 寄りなら、`/shape-task` の出力に `Security Requirements` を明示的に含めること。汎用 `## Risks` 任せにしない。

## 3. 開発順序（重要）

順序には**2種類**ある。混同しないこと。

### 3-1. Lifecycle order（固定）

これはハーネスが決めている。飛ばせない。

```
research → plan → implementation → verification → review → observation → completion
```

`/chain-status` がこの鎖の現在地と次の必須アクションを出す。後ろの artifact があっても、前のゲートが未完なら有効化されない。

### 3-2. Technical layering order（固定されていない）

「インフラ → バックエンド → フロント」のような**技術レイヤの実装順序はハーネスに定義がない**。`plan.md` の "Break down into phases" で、タスクごとに決める裁量事項。

ただしハーネスの既存 idiom は、horizontal な層積み（インフラ全部→バックエンド全部→フロント全部）ではなく、**vertical slice / walking skeleton** に寄っている。根拠:

- `rules/common/coding-style.md`: 「organize by feature/domain, not by type」
- `rules/common/testing.md`: E2E は critical user flow 単位（= 縦に1本通す）
- TDD: 小さく通る単位で RED→GREEN を回す

#### 推奨デフォルト順序（vertical slice）

1. **Walking skeleton** — 最小の縦1本（例: 1エンドポイント → 1 DB 書き込み → 1 画面表示）を E2E で通す。インフラは「その1本に必要な分だけ」用意する。
2. **スライス追加** — 機能を縦に1本ずつ TDD で足す。各スライスで unit → integration → E2E。
3. **横断の整備** — 認証・ロギング・rate limit など cross-cutting は、必要になった時点で1段引き上げる。

#### horizontal（層先行）を選ぶケース

- インフラ/スキーマが他の全レイヤを強く規定し、後戻りコストが高い
- 既存システムへの contract が先に固まっている
- チーム分業で層ごとに担当が分かれる

この場合は `plan.md` の phases に「層先行」を明示し、各層の境界に検証ゲートを置く。

### 3-3. まとめ

- **何を先にやるか（lifecycle）= 決まっている**
- **どの技術レイヤを先に作るか = 決まっていない。plan で決める。デフォルトは vertical slice**

## 4. 進捗追跡（二層）

中断・再開に強い二層構造。

- **`progress.md`** — 人間可読。Current Phase / Last Completed Step / Next Action / Blockers / Delegated Work / Checkpoint。本文は日本語、hooks が読む checkpoint 形式は維持。
- **`telemetry/telemetry.db`（SQLite）** — run state と resume hint のランタイム真実。`progress.md` はそのプロジェクション。

確認コマンド:

- `/chain-status` — lifecycle のどこにいるか、次の必須アクション
- `/next-action` — 次の一手
- `/trace-status` — telemetry の run メトリクス

## 5. 頼み方の型

完走させたい場合の依頼例:

> 「○○なアプリを作って。セキュリティ要件も spec に明記して。worktree を切って、vertical slice で TDD しながら進めて、進捗を progress.md に残して。最後に PR も出して。」

これで `/shape-task`（spec化・security 明記）→ `/plan`（承認待ち）→ `/worktree-start` → `/execute-plan`（縦スライス TDD）→ `/verify` → review → PR まで、承認ゲートを挟みつつ流れる。

## Non-Goals

- technical layering order を global に固定しない（plan の裁量を残す）
- 全タスクに security 章を強制しない（重み判定で要否を決める）
- 人間の承認・採否を automation で置き換えない
