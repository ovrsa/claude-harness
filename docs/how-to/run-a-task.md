# How-to: このハーネスでタスクを1本通す

## いつ使うか

このハーネスで実装・修正を進めるとき。段の順序は `commands/COMMANDS.md` の Ordered Path が正本なので、
ここでは**順序を繰り返さず、人間が手で行う部分だけ**を書く。

## 前提

- [ ] 何をするタスクか1文で言える（言えないなら `/grill-me` がその作業）
- [ ] トラックの見当がついている
  - `trivial` — 変更面の検証だけ
  - `standard` — design doc + 検証証拠 + 軽い受容判断
  - `heavy-risky` — auth / payment / permissions / データモデル / 広域リファクタ / ロールアウト影響。
    **明示承認と worktree 隔離が必要**

## 自動化されている部分

エージェントかフックが勝手にやる。**人間は待っていればよい。**

- worktree の作成 — 書き込みが発生すると分かった時点でエージェントが `EnterWorktree` を呼ぶ
- 編集後の format / typecheck / quality-gate / console.log 検査
- セッション開始・終了時にゲートの証拠を `runs/<date>-<slug>/` へ退避
- compaction 前に、どの証拠成果物が存在するかのスナップショット（状態の要約はしない）
- **design doc の執筆**（`/docs-build` がやる。人間は決定を答えるだけ）
- **実装** — `skills/tdd` の RED -> 最小 GREEN。**seam の合意だけは人間に取る**（下の「手で行う部分」の3）
- **証拠成果物の執筆** — `verification-summary.md` / `review-summary.md` /
  `observation-summary.md`。**コマンドを打つ必要はない**（下の「確認」を参照）
- **仕上げ** — 変更したコード、文章、コメントを見直し、必要な修正と再検証を行う。
  セキュリティの確認と合わせて `review-summary.md` に対象と判断理由を残す。

フックの正本は `settings.json` の `hooks`。成果物の正本は `templates/` の各テンプレート。

## 手で行う部分

**手で行うのはこの4つ。** 他は自動か、エージェントに任せる。

1. **`/grill-me` と打つ。**
   - `/grill-me` は**モデルからは起動できない**（`disable-model-invocation: true`）。
     ただし実体の `grilling` には制限が無いので、**エージェント側から始めることはできる**。
     ゲートが守るのは「grilling を飛ばさないこと」であって、誰が始めるかではない
   - 一度に1問しか来ない。**事実はエージェントが自分で調べる。答えるのは決定だけ**
   - **バグ修正でも先にここへ来る。** 診断は read-only なのでこの段の仕事。
     原因が分かってから実装に入る
   - 止め時の目安 — Objective が1文 / Non-goals が1つ以上 / 却下した案と理由 /
     未確定事項 / 成功条件。**質問が尽きた時ではない**
   - ここまで read-only。**捨てるならここで捨てる**

2. **design doc を承認する。**
   - `/docs-build` が `docs/design/YYYY-MM-DD-<slug>.md` を書く。**書くのはエージェント**
   - 見るのは Non-goals と却下した案。**スコープ境界がここで決まる**
   - `heavy-risky` は承認前に実装させない
   - 承認したら実装はエージェントに任せる

3. **seam に合意する。**
   - 実装は `skills/tdd` の RED -> 最小 GREEN で進む。**refactor はループの外**（review 段の仕事）
   - upstream skill が定める唯一の人間ゲート:
     「**Test only at pre-agreed seams.** No test is written at an unconfirmed seam」
   - seam とは、内部に手を入れずに挙動を観測できる公開境界のこと。**全部はテストできないので、
     どこで観測するかを先に決める**のが、労力を重要な経路へ寄せる唯一の方法
   - **止めるものは無い。** 合意なしに書かれても機械は気づかない。実際 2026-08-21 の
     `shareability-pass` ではテスト5件が未合意の seam に書かれた

4. **観測が要るか判断する。**
   - 挙動・UI・連携が変わったなら要る。build と test が通っただけでは足りない
   - `observation-summary.md` は **具体的な source 名が1つ以上必要**
     （browser / screenshot / logs / stderr / stdout / trace / runtime health / process state / metrics）
   - 「looks good」「手で確認した」は証拠にならない

### 管理先があるプロジェクト

`.claude/tracker.json` で管理先を宣言したプロジェクトでは、2〜4 の手の動かし方が次のように変わる。
段の順序は `commands/COMMANDS.md` の「管理先があるプロジェクトの流れ」が正本。

- **2 は親 Issue の本文を承認する。** `/docs-build` は `docs/design/` ではなく親 Issue に書く。
  宣言が無いプロジェクトでは、エージェントが remote から候補を示すので、最初の起票の前に選ぶ
- **分割案を確認する。** `split-issue` が成果と依存だけの表を出す。粒度と依存が良ければ子 Issue を作らせる。
  3 と 4 は、各子 Issue の `検証方法`（検証と観測の境界）をここで確かめることで済ませる
- **新しい会話でタスクを始める。** Claude Code は `/start-issue <番号>`、Codex は `$start-issue <番号>`。
  Claude Code ではエージェントが示す `/goal` の1行を自分で実行する（エージェントは `/goal` を打てない）。
  auto mode で実行すると、ゴールのターンが許可の確認で止まらない
- **Ready for review の PR を見てマージする。** マージが承認になる。エージェントはマージしない
- **停止したら判断を返す。** Draft PR（PR が無ければ Issue）のコメントに、当たった停止条件・試したこと・
  必要な判断がある。判断を返したら、新しい会話で同じ Issue の `start-issue` から再開する。
  Issue の本文を変えていれば差分が示されるので、その仕様で進めてよいか答える
- 親 Issue は、子 Issue がすべて閉じてから受け入れ条件を確かめて閉じる

## 確認

**成果物はエージェントが黙って書く。コマンドを打つ必要はない。**

`/verify` `/review-task` `/eval` は成果物のスキーマを説明する場所として残っているが、
保持期間の全トランスクリプト（154コマンド起動）で**起動回数は0**。いっぽう成果物の側は
`verification-summary.md` 37回・`review-summary.md` 37回・`observation-summary.md` 16回
書かれている。**機構はパーサとテンプレートで、コマンドは語りだった**
（2026-08-12 の [pipeline-trim](../design/2026-08-12-pipeline-trim.md) の結論）。

| 成果物 | 中身 | 機械が見るもの |
|---|---|---|
| `verification-summary.md` | **再実行可能な検査だけ**。受容判断を混ぜない。**RED 証拠もここ**（「修正前に新しいテストが落ちた」は再実行可能な検査） | 4節の存在と、各節が空でないこと |
| `review-summary.md` | refactor / セキュリティ / コメントの過不足はここ。受容した懸念は `Residual Risks` へ移す | **テンプレートの全10節**。`CRITICAL` と `HIGH` の指摘はチェーンを止める。`MEDIUM` 以下は記録されるだけ |
| `observation-summary.md` | 挙動が変わった時だけ | 4節 + **具体的な source 名が1つ以上** |
| 受容判断（`/eval` の中身） | 上の3つと design doc の成功条件を読んで「受容してよいか」を答える | **成果物が無いので何も見ていない。** 痕跡はマージコミットだけ |

**`Security` と `Comment Adequacy` は 2026-08-21 から必須節。** それ以前は4節しか要求しておらず、
この2つは「やったかどうかが見えない活動」だった。6タスク全部で埋まっていたのはテンプレートに
載っていたからで、検査があったからではない。**中身の質は機械では見られない** — 触っていない回は
1行で足りるので、閾値を置く方法が無い。

仕上げの結果は次の観点で確認できる。

- [ ] 仕上げの対象と判断理由、実装で判明した `触る対象` と Open Issues の整理結果を確認する。
  更新作業はエージェントが完了報告前に行う。

**refactor は verification の後、review 段でやる**（`skills/tdd` が「refactoring は red→green ループの外」
と定めている）。refactor したら検証をやり直す。

### 完了前の仕上げ

完了報告、PR 作成、チケット Done の前にエージェントが実行する。利用者の追加指示は不要。

1. タスクの差分を読み、変更したコードの重複や不要な処理、文章の正確さ、コメントの過不足を確認する。
2. 必要な修正を行う。設計書や運用手順に完了済みの作業が未完了として残っていないかも確認する。
   修正不要なら、確認した対象と理由を記録する。無関係な周辺コードは整理しない。
3. 最後の修正後に必要な検証を実行し、挙動が変わった場合は観測する。
4. `review-summary.md` の `Code Quality` をテンプレートの仕上げ項目で埋める。
   最終差分と証拠を読んでから、`node ~/.claude/scripts/task-completion.js --repo <repo> --fingerprint` の出力を
   `Revision` に記録する。証拠ファイルと `runs/` は識別対象に含めない。
5. `node ~/.claude/scripts/task-completion.js --repo <repo>` を実行する。
   終了コードが 0 でなければ不足を直して再実行する。通過後に完了操作へ進む。

既定ワークフローは review → finish → verify → evaluate と進み、runner が COMPLETE 直前に
同じ検査を行う。手動経路ではエージェントが検査を呼ぶ規律に依存する。
Stop フックによる全会話の遮断や、チケット API の横取りは行わない。
検査で確認できるのは記録の形式と現在の作業内容との一致までで、レビューの質は差分から判断する。

### 証拠はどこに残るか

3つの `*-summary.md` は `.gitignore` 済みで worktree 内に書かれるので、
`ExitWorktree(action: "remove")` で消える。**消える前に JSON へ退避される。**

```
runs/<YYYY-MM-DD>-<slug>/
  meta.json              repo_root / branch / session_ids / gates
  logs/events.ndjson     どのゲートがいつ通ったか
  evidence/*.json        本文をそのまま（要約しない）
```

slug は `docs/design/YYYY-MM-DD-<slug>.md` と同じなので、決定と証拠が同じ名前で並ぶ。
`runs/` は git 追跡対象なので、worktree のマージが証拠を `main` に運ぶ。

生の実行トレースは複製しない。`meta.json` の `session_ids` から
`projects/<slug>/<session-id>.jsonl` に辿れる。

2026-08-18 より前の証拠は残っていない。`verification-summary.md` を書いた回でも
worktree ごと消えており、SQLite 側には2行の抜粋と**存在しないパスへの参照**しか無い。

### セキュリティを見るのはどんな時か

次のどれかに触れた時だけ。触れていなければ `Security` 節に1行書いて終わり。

- 許可・認証・権限の判定（allow / deny を返すコード）
- 信頼できない入力のパース（コマンド文字列・ユーザー入力・外部レスポンス）
- シェル / SQL / パスの組み立て
- 秘密情報・認証情報・トークン
- ネットワーク送信先の決定

**触れたなら、読むのではなく叩く。** 敵対的な入力を通して入出力の表を残す。

```bash
node -e "
const { classifyBashPermission } = require('./scripts/lib/permission-resolver');
for (const c of ['ls', 'git status && rm -Rf ~', 'cat x | sh']) {
  console.log(classifyBashPermission(c).behavior, JSON.stringify(c));
}
"
```

観点は最低限これだけ — 大小文字 / フラグの並び順 / `;` `&&` `||` `|` での連結 /
引用符 / コマンド置換 / 境界値（空・極大）。

`agents/code-reviewer.md` に Security (CRITICAL) のチェックリストがあり、
`skills/code-review` は Standards と Spec を並列サブエージェントで見る。
**どちらも user-invocable-only** なので、必要なら自分で呼ぶ。

### コマンドの使用実績を測る

トランスクリプトの `<command-name>` タグから数える。

```bash
node -e "
const { commandInvocations } = require('$HOME/.claude/scripts/lib/transcript-log');
const r = commandInvocations({});
console.log('total', r.total);
for (const c of r.ranked) console.log('  /' + c.command, c.count);
"
```

2026-08-20 まではここに `sqlite3 ~/.claude/telemetry/telemetry.db` のクエリが載っていた。
**そのフック（`command-telemetry.js`）は 151 件のうち 3 件しか捕まえていなかった。**
`/effort` `/compact` `/model` `/clear`（最も使われる4つ）は組み込みコマンドなので
`UserPromptSubmit` フックに届かない。トランスクリプト側は 2026-07-10 から残っている。

**保持期間には注意が必要。** トランスクリプトは Claude Code が管理していて、
実測で最古は 2026-07-07。それより古い起動は
`runs/_archive/telemetry-sqlite-2026-08-20.json` の日次集計にしか無い。
**古いコマンドの実績がゼロに見えても、使われていなかった証拠にはならない。**

スキルの方は同じ `transcript-log` の `toolFailureRate` / `collectToolEvents` で
`Skill` ツールの呼び出しとして測れる。両方を見ないと、
「コマンドは使われていないがスキル経由で呼ばれている」を見落とす。

### コメントの過不足をどう測るか

```bash
# 変更分のコメント比率
git diff <base> -- '*.js' | grep -E "^\+" | grep -cE "^\+\s*(//|\*|/\*)"
git diff <base> -- '*.js' | grep -E "^\+" | grep -vE "^\+\s*(//|\*|/\*)" | grep -vc "^+++"

# リポジトリの基準
for d in hooks scripts/lib scripts/hooks; do
  c=$(cat $d/*.js | grep -cE "^\s*(//|\*|/\*)")
  t=$(cat $d/*.js | grep -cve '^\s*$')
  echo "$d: $((c*100/t))%"
done
```

**閾値は無い。** 基準から大きく離れている時に理由を書く。判断の軸は1つ:

- **落とす** — いつ何を撤去したかの経緯。それは `docs/design/` の役目で、
  コードに書くと同じ内容が2箇所になる
- **残す** — コードだけからは読めない実装判断（なぜこの条件か、なぜこの順序か）
- **足す** — 非自明な判断が無説明で入っている箇所

## 止まる場所は1つだけ

- **`main` / `master` への `git push`** — `hooks/git-push-guard.js`。
  リポジトリから対象ブランチを解決するので**引数なしの `git push` も捕まる**

編集・`git commit`・完了宣言は**止まらない**。`[Lifecycle Advisory]` が出るだけ。

2026-08-17 まで、ここには「止まる場所は2つ」と書いてあった。完了宣言のゲートは
`progress.md` を完了状態に書き換える時しか発火せず、`progress.md` を作るコードがハーネス内に
無かったので、実際には一度も発火していなかった。フックは撤去した。

## 失敗した時

- **`/grill-me` が何も起こさない** → `/grill-me` はユーザーが打つしかない。
  エージェントに始めさせたいなら `grilling` を名指しする（そちらは制限が無い）
- **`/goal` が使えない** → hooks が無効な設定や、信頼していないワークスペースでは使えない（理由は `/goal` 自身が表示する）。
  エージェントにそう伝えると、同じ文面を終了条件にして会話の中で繰り返す
- **Codex のゴールが権限で止まる** → `workspace-write` のサンドボックスでは `.git` が読み取り専用で、
  GitHub の認証も効かないことがある（`git push`・`git fetch` と、複合コマンドの中の `gh` で観測）。
  対話の Codex で、サンドボックスの外での実行を承認する。承認できない `codex exec` では、ここで停止する
- **`main` に push したい** → できない。フックはプロファイルで無効化できない。
  remote が無いローカル運用なので、fork 元で `git merge --no-ff <branch>` して
  `ExitWorktree(action: "remove")` で片付ける
- **worktree でスキルディレクトリが空に見える** → 5件は実体が `~/.agents/skills/` 側にあり
  git 管理外なのでダングリングする。判定には `find -L` / `readlink` / `test -e` を使う。
  `diff -rq A B` は B が A へのリンクだと必ず「一致」を返すので根拠にならない
- **スキルを自動選択から外したい** → `settings.json` の `skillOverrides` に
  `"<name>": "user-invocable-only"` を足す。**`SKILL.md` を編集しない**
  （インストーラ管理下だと更新で失われる）。反映は**次の新規セッションから**
- **`plan.md` / `progress.md` はどこ** → 2026-08-17 に撤去した。決定は design doc に置く。
  **状態の要約を保存する仕組みは無いので、compaction の前にコミットする。**
  経緯は `docs/design/2026-08-17-lifecycle-five-steps.md`
