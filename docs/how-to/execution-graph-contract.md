# Execution Graph contract

## 実行入口

`scripts/task-goal.js graph` が既存の goal 入口を拡張する。操作は `create`, `status`, `ingest`,
`capture`, `succeed`, `fail`, `wait`, `resume`, `revise`, `revalidate`。すべて明示した絶対 `--run-dir`、git `--repo`、tracker の
`--input` を受け取り、現在の仕様 revision を照合する。Run の `graph.json` が snapshot、
`logs/events.ndjson` が遷移と取込 event の台帳である。node の shell や外部操作は自動実行しない。
呼び出し例と人回答の取込境界は `skills/start-issue/SKILL.md` を参照する。
完了済み Graph の `status` も現在の task-completion と gate 証拠を再検査し、stale なら完了として返さない。
`revalidate` は stale な最初の gate と後続 gate を失効させ、上限内なら新 attempt からやり直す。
session hook が同じ Run の gate 証拠を再退避する時も Graph の仕様・定義 revision と成果物 fingerprint を付ける。

この文書は、管理先に仕様を置く1つの Task を、ランタイムをまたいで実行・休止・再開するための
最小 Graph 契約の正本である。実装の詳細はこの契約と分けて `scripts/lib/execution-graph.js` に置く。

Graph は要求整理から使う。受け入れ条件へ安定 ID を付け、未確定な判断を質問 node、確定した作業を
依存付きの実装 node、その完了根拠を検証・レビュー node へ写像する。失敗分岐と反復上限を先に置き、
各遷移で証拠を要求へ結び直す。次の session は保存状態と許可イベントを検査し、ready な node だけを
再開する。これにより「次に何をするか」と「何をもって要求を満たしたか」を同じ Graph から読める。

## 接続点

既存の経路と Graph の接続点は次のとおり。

| 既存の入口 | 現在の責務 | Graph を接続する時点 |
|---|---|---|
| `split-issue` | 親仕様を Task Issue と依存関係へ分割する | Task 依存 DAG を作る。各 Task の内部 Graph とは別物 |
| `start-issue` | Issue と親仕様を読み、worktree と共通ゴールを作る | `task-goal.js` が仕様 revision を確定した後、Graph を作成または読み込む |
| ランタイムの goal | 1 Task を完了か停止まで進める | ready node を選び、attempt を開始する |
| `task-completion.js` | 現在の差分と gate 証拠が完了条件を満たすか検査する | 完了 node の遷移条件として呼ぶ。Graph 全体の妥当性検査には使わない |
| session start/end hooks | Run の発見、session の関連付け、gate 証拠の退避 | session を実行中 attempt に関連付ける。休止中 Task を自動再開しない |
| `runs/<run-id>/` | branch、session、gate 証拠、ライフサイクルイベントを保持する | `graph.json` を追加し、遷移を既存の `logs/events.ndjson` に追記する |
| `pipeline-runner.js` + `workflows/*.yaml` | `--loop` 時だけ YAML の step と rule を実行する | 共通 Graph の必須経路にしない。利用する場合だけ node executor adapter とする |
| `task-queue.js` | YAML workflow を選び `pipeline-runner.js` を子プロセスで呼ぶ | tracker 仕様と goal を現在は読まないため、Graph の入口にはしない |

`schemas/lifecycle-workflow.schema.json` は YAML workflow の形式を記述するが、`workflow-doctor.js` は
schema を読み込まず YAML 実体を独自に検査する。
`schemas/run.schema.json` は pipeline の実行結果の形式で、session hooks が保存する `runs/` の形式ではない。
ファイル名だけを根拠に Graph schema として再利用しない。

`pipeline-runner.js` は独自の Run metadata を書き、既定 `run_id` も session ID である。session hooks の
branch 単位 Run と自動的に同一になる経路はない。#10 は `start-issue` から共通 Graph を読み、単一
session でも node を逐次実行する経路を実装する。pipeline は任意 adapter であり、この経路の前提にしない。
#9 時点の入口はまだ `graph.json` を読み込んで自動実行しない。

Graph の作成・開始・検証・休止・再開はすべて `start-issue` から始まる同じ Run に属する。
`.claude` は契約、保存、検査を持つ。`.agents` は共有スキルの参照先にすぎず、Graph の正本や
状態を持たない。Claude Code と Codex の入口は同じ契約を呼び、ランタイム固有の goal ID、
Orca ID、コマンド名を永続形式に入れない。

## 正本と保存

- 仕様の正本は tracker の Task Issue 本文、親 Issue の目的・受け入れ条件・対象外、Task が明示参照した親の節。
- `task-goal.js` が返す12桁 lowercase hex の `revision` を無変換で `spec.revision` に保存する。
- Graph 定義と現在状態は `runs/<run-id>/graph.json`。`run_id` は既存の branch 単位の識別子を使う。
- 遷移履歴は既存の `runs/<run-id>/logs/events.ndjson`。Graph 専用のイベント台帳を増やさない。
- gate 本文は既存の `runs/<run-id>/evidence/*.json`。Graph はパスと fingerprint を参照し、本文を複製しない。
- 生トレースは既存どおり `session_id` から辿る。Graph へ会話本文を複製しない。

`task-goal.js` が必須節の欠落を `INVALID` とした場合、Graph は作成しない。入力を補完したり、Issue にない
検証方法を推測したりせず、tracker の仕様を直す判断を人へ返す。

`graph.json` の更新は一時ファイルを書いてから rename する。各遷移は一意な `transition_id` と
`before_revision` / `after_revision` を持つ。Graph snapshot を正本とし、その後に同じ ID を既存イベントへ
追記する。途中で停止してイベントが欠けた場合は snapshot の `last_transition` から1回だけ補完する。
既存 ID の追記は無視する。実装は単一 writer を保証するか、`revision` の比較交換で同時更新を拒否する。

## 識別子と関係

| 識別子 | 意味 | 安定範囲 |
|---|---|---|
| `task_id` | `<tracker>:<repository>:<task-ref>` | tracker 上の Task |
| `graph_id` | Task 内 Graph。既定は `task_id` と同値 | Graph の寿命 |
| `run_id` | 既存 Run ディレクトリ名 | branch 上の Task 実行全体 |
| `attempt_id` | node を1回開始するたびに発行する不透明 ID | 1回の node 実行 |
| `session_id` | Claude Code / Codex が発行する ID | 1ランタイムセッション |

1 Task は1 Graph、1 Graph は1 Run を使う。1 node は再試行ごとに別 attempt を持ち、1 attempt は
0個以上の session と関連できる。別セッションで再開しても attempt を継続するか新しくするかは
`resume_mode` で決める。`continue_attempt` は同じ外部作業の継続、`new_attempt` は失敗後の再試行に使う。

canonical repository identity は tracker 宣言から作る。GitHub は host、owner、name を lowercase にして
`github:<host>/<owner>/<name>` とし、host を省略した宣言は `github.com` を使う。他 tracker は `<kind>:<declared-project>` とし、URL の表示形式や
ローカル path は使わない。既存 Run の選択キーはこの identity、branch、`task_id` の組である。現行
`resolveRunSlug` は共有 store を branch 名だけで検索するため、#10 はこの3項目を `meta.json` に保存し、
一致する Run だけを再利用する。既存 `graph.json` の `task_id` が異なる場合は衝突として停止する。
linked worktree が harness 本体の外にある時も、既存 `getRunsDir` に従って中央 `~/.claude/runs` を使う。

## 最小データ契約

`graph.json` は少なくとも次を持つ。時刻は UTC の RFC 3339、ID は空でない文字列とする。次は
field shape の例であり、Task 全体の node を列挙した完全な Graph ではない。

```json
{
  "schema_version": 1,
  "revision": 4,
  "graph_id": "github:ovrsa/claude-harness:#9",
  "task_id": "github:ovrsa/claude-harness:#9",
  "run_id": "2026-09-18-feat-issue-9-graph-contract",
  "spec": {
    "source": "https://github.com/ovrsa/claude-harness/issues/9",
    "revision": "2f6e94c82d90"
  },
  "definition_revision": "sha256:4f15c9177c076900792746134fdac85a43e234cc5a785cecf2892937b7c0c333",
  "state": "stopped",
  "current": [],
  "limits": { "max_total_attempts": 12, "max_same_cause_failures": 3 },
  "nodes": [
    {
      "id": "review",
      "kind": "review",
      "role": "gate",
      "required": true,
      "requirement_ids": ["2f6e94c82d90:AC-3"],
      "depends_on": [],
      "authority": "agent",
      "permissions": ["repo:read"],
      "max_attempts": 2,
      "success_when": [{ "type": "evidence", "kind": "review", "subject": "definition", "revision_selector": "current_definition" }],
      "failure_to": "stop",
      "success_to": "complete"
    }
  ],
  "attempts": [],
  "wait": null,
  "consumed_event_ids": [],
  "last_transition": {"transition_id":"tr-4","before_revision":3,"after_revision":4},
  "updated_at": "2026-09-18T00:00:00Z"
}
```

必須項目は top-level の `schema_version`, `revision`, `graph_id`, `task_id`, `run_id`, `spec`,
`definition_revision`, `state`, `current`, `limits`, `nodes`, `attempts`, `wait`, `consumed_event_ids`,
`last_transition`, `updated_at`。
各 node は `id`, `kind`, `role`, `required`, `requirement_ids`, `depends_on`, `authority`, `permissions`,
`max_attempts`, `success_when` を持つ。
遷移先がある場合は `success_to` / `failure_to` に node ID または終端 `complete` / `stop` を置く。

`authority` は、その node の成功を確定できる主体であり、`agent`, `human`, `system` のいずれか。
`permissions` はその node で許される効果の上限で、少なくとも `repo:read`, `repo:write`,
`tracker:read`, `tracker:write`, `network:read`, `external:write` を区別する。Graph は権限を付与しない。
ランタイム側の許可がより狭ければ停止し、より広くても node の宣言を越えて使わない。

attempt は `attempt_id`, `node_id`, `number`, `state`, `session_ids`, `started_at`, `ended_at`,
`evidence_refs`, `input_revision` を持つ。`input_revision` は最低でも開始時の `spec.revision` と
`definition_revision`、対象成果物の fingerprint を含む。

`definition_revision` は `schema_version`, `graph_id`, `task_id`, `limits`, `nodes` だけから成る object を、
各階層の key を辞書順にした空白なし JSON として SHA-256 した
`sha256:<64 lowercase hex>` である。v1 の成功条件は次の3型だけを許す。

| `type` | 必須値 | 成功条件 |
|---|---|---|
| `evidence` | `kind`, `subject`, `revision_selector` | 保存 body の hash が `body_sha256` と一致し、`subject_revision` が selector の現在値と一致し、stale でない |
| `event` | `event_type`, `correlation_id` | 未消費の永続イベントが型と相関 ID に一致する |
| `task_completion` | `fingerprint_selector` | `task-completion.js` が exit 0 で、attempt に保存した実 fingerprint が selector の現在値と一致する |

`kind` は node の処理種別を表す自由な名前であり、判定ロジックを暗黙に切り替えない。`role` は
`action` または `gate` で、成功条件の判定は `success_when.type` の union、成功後の失効規則は `role` で
切り替える。Run evidence 参照は `kind`, `path`, `body_sha256`,
`subject`, `subject_revision`, `captured_at` を持つ。`body_sha256` は保存された `body` の UTF-8 bytes の
SHA-256、`subject_fingerprint` は既存 `taskFingerprint()` の返り値で、両者を混同しない。
`revision_selector` は `current_spec`, `current_definition`, `current_subject` のいずれかで、期待値を
Graph 定義へ埋め込まない。実際に使った revision は attempt と evidence に固定する。
`fingerprint_selector` は v1 では `current_task` のみで、実行時の `taskFingerprint()` を指す。

## 状態と遷移

Graph の Task 状態と OS / ランタイムプロセスの生存状態を混ぜない。

- Graph `state`: `active`, `waiting`, `completed`, `stopped`
- attempt `state`: `running`, `waiting`, `succeeded`, `failed`, `cancelled`
- process observation: `unknown`, `alive`, `dead`。診断情報であり遷移条件にはしない

node は依存 node の最新 attempt が `succeeded` で、明示した遷移が到達した時だけ ready になる。node
開始時に attempt を作り、成功条件を満たした時だけ `succeeded` にする。loop で再入場した node は新
attempt が最新になり、過去の成功を使わない。

実装・修正など action node の成功は、その action を完了した事実を表す。後続 action が成果物を変えても
先行 action を未達へ戻さない。verification、review、task completion など gate node は、成功に使った
evidence / fingerprint が stale になれば未達へ戻し、その gate と依存する下流 gate を再実行する。
`input_revision` は再開時の入力同一性を確認する記録であり、action 完了を成果物の現在 fingerprint だけで
取り消す規則ではない。spec または Graph 定義の変更が node の要求を変えた場合は、action を含めて影響する
node を新 attempt で再実行する。検証失敗は attempt を `failed` にして
`failure_to` へ進む。再試行は `max_attempts` と Graph の `max_total_attempts` の両方を超えられない。
上限到達時は `stopped` へ移り、人の判断を必要とする。

`max_total_attempts` は Graph 内の attempt 数であり、既存 goal の30ターン上限とは別に数える。
同じ正規化 cause が3回連続した場合は `max_same_cause_failures` により、attempt 上限が残っていても停止する。
`required: true` の node は完了前に成功が必要。ただし到達しなかった修正用 node は
`required: false` とし、到達して attempt を開始した場合だけ成功または明示的な取消しを必要とする。
失敗 attempt は空でない lowercase snake case の `failure_cause_code` を持つ。同じ `node_id` の attempt を
終了時刻順に見て、同じ code の失敗が3件続いた時に停止する。他 node の成功ではこの列をリセットしない。
同じ node の成功または異なる code の失敗が新しい列を始める。

`current` は v1 では長さ0または1。`active` は1つの `running` attempt、`waiting` は1つの `waiting`
attempt と同じ node を指す。`completed` / `stopped` では `current` は空である。

### 休止と再開

人への質問、権限、外部依存を待つ時は Graph を `waiting`、attempt を `waiting` にし、`wait` を保存する。

```json
{
  "wait_id": "wait-2",
  "reason": "human_decision",
  "question": "互換性を壊す案Aを採用するか",
  "attempt_id": "attempt-design-1",
  "requested_at": "2026-09-18T01:00:00Z",
  "allowed_actors": [{"kind":"human","id":"operator"}],
  "resume_on": [{ "type": "human_answer", "correlation_id": "wait-2", "required_fields": ["choice"] }],
  "resume_mode": "continue_attempt"
}
```

保存後は実行ターンを終了する。`resume_on` と一致する永続イベントだけが再開を許可する。
許可イベントは `human_answer`, `spec_change_accepted`, `permission_granted`,
`external_dependency_resolved`。共通 envelope は `event_id`, `type`, `correlation_id`, `attempt_id`,
`actor: {kind,id}`, `occurred_at`, `payload`。`correlation_id` は現在の `wait_id` と一致させる。未消費で、
現在の wait/attempt、`allowed_actors`、`required_fields` を満たすイベントだけを受理する。actor の許可は
wait 作成時に tracker の operator または node の authority から固定した `allowed_actors` で判定する。
不十分な回答、旧 attempt の回答、同じ `event_id` の再送は拒否する。
`session_started`, timeout、heartbeat、process の alive/dead、同じ質問の再送は再開イベントにならない。
session start hook は waiting Graph を発見して文脈を示せるが、状態を `active` に変えてはならない。

LLM セッションを起こすかは、起こす前に `ingest` が決める。ランタイムは waiting の Graph に届いたイベントを
すべて `ingest` に渡し、終了コード 0 かつ `wake: true` の時だけ新しいセッションを起こす。そのセッションが
同じイベントで `resume` する。上の条件を満たさないイベント、同じ wait に再開待ちの回答がすでにある時の
2件目以降の回答は、保存せず終了コード 4（`status: "HOLD"`, `wake: false`, `reason`）を返す。HOLD は
エラーではなく、起こさずに待ち続ける合図である。起こしてから無視する方式は、起動の抑制として扱わない。
wait には途中成果の参照を任意の `evidence` として置ける。別セッションは `status` でそれを質問・再開条件と
一緒に読み戻す。ゴールは、Graph が人の回答待ちになった時点で【停止】として終える。

仕様が変わった場合は `task-goal.js` の既存 `SPEC_CHANGED` を使い、人が受け入れた
`spec_change_accepted` の後だけ新 revision を採用する。再開時は Graph、tracker 仕様、git、Run の
証拠を読み、保存済み `revision` に対する比較交換で1回だけ遷移する。

`continue_attempt` は wait を null、Graph を `active`、同じ attempt を `running` にして新 session ID を
追加する。`new_attempt` は旧 attempt を `cancelled` にして `ended_at` を埋め、wait を null にし、同じ
node に新しい `running` attempt を作る。どちらも `event_id` を top-level `consumed_event_ids` へ追加し、
回答イベントと状態更新を同じ transition で確定する。
`continue_attempt` で消費した回答は、同じ attempt の `success_when` がその回答 event を要求する場合に限り
1回だけ成功条件として参照できる。別 attempt の再利用はできない。

## 証拠の有効性

証拠参照は上記の `body_sha256` と対象 revision を持つ。`body_sha256` は evidence body の現在 hash、
`subject_revision` は selector が指す期待 revision とそれぞれ照合する。両者を相互比較しない。既存 `evidence/*.json` は同じ kind の最新値で
上書きされるため、attempt は取り込み時の hash と revision を保持する。
次のどれかに当たる証拠は削除せず `stale` として扱い、成功条件には数えない。

- `spec.revision` が変わり、その証拠が仕様に対する判断を表す
- `definition_revision` が変わり、その証拠が Graph 定義のレビューを表す
- 証拠の対象成果物 fingerprint が変わる
- 参照先が無い、または保存済み fingerprint と一致しない

無関係な変更で証拠を一律失効させない。node の `success_when[].subject` が指定した対象だけを比較する。
たとえばコード変更後は verification と review が失効するが、承認済みの質問回答は、その質問や
仕様 revision が変わらない限り有効である。

## 検査境界

Graph 作成・定義変更時の静的検査で、必須情報、ID の一意性、全遷移先の存在、終端への到達可能性、
`depends_on` の DAG を確認する。各受け入れ条件 ID は1つ以上の required node と、その node の
成功条件に対応しなければならない。ID は `spec.revision` 内の受け入れ条件の出現順で
`<spec.revision>:AC-1..N` と生成し、仕様版をまたいで使い回さない。Task 依存と node の
`depends_on` に循環を許さない。

検証・修正の反復は依存 DAG に逆辺を作らず、`failure_to` から明示した loop node へ戻す。
loop に属する全 node は有限の `max_attempts` を持ち、成功による退出先と上限到達時の `stop` を持つ。
退出条件のない反復は静的検査で拒否する。

遷移時の動的検査では、現在 node、attempt 上限、権限、遷移条件、証拠の freshness を確認する。
再開時は `wait.resume_on` とイベントの一致を確認する。完了時は全必須 node の成功、fresh な証拠、
`task-completion.js` の成功を確認する。ここで機械的に保証できるのは形式、参照整合性、fingerprint、
上限、明示条件までである。レビュー内容の妥当性、質問への回答の質、宣言した権限を人や agent が
守ったかは規約と別コンテキストレビューで確認する。

別コンテキストレビューは review attempt の `session_ids` が、対象成果物を作った attempt の
`session_ids` と非重複であることを機械的に検査する。review evidence は対象の `spec.revision`,
`definition_revision`, `subject_fingerprint` を記録し、いずれかが変われば stale にする。

| 項目 | #9 時点 | #10 で機械化するもの |
|---|---|---|
| Issue 必須節と仕様 revision | `task-goal.js` が検査済み | revision を Graph へ渡す接続 |
| gate 証拠の Run 退避 | session hooks が実装済み | evidence hash と subject revision の照合 |
| Graph schema・遷移・上限 | この文書の規約 | validator と transition executor |
| waiting の再開制限 | この文書の規約 | event 消費と原子的な状態更新 |
| 別コンテキストレビュー | この文書の規約 | session 集合と fingerprint の検査 |

review gate が実際に対象成果物を別 context で評価できることの実測は #10 の実装・検証で行う。#9 は
その検査に必要な session 集合、revision、fingerprint の契約までを定める。

## 最小例

以下は遷移の要点だけを示す説明用断片で、完全な `graph.json` ではない。同じ ID、権限、成功条件を省略する。

要求を node に分解する時は、各受け入れ条件を `requirement_id` で node と証拠へ結ぶ。未確定な判断は
実装に埋めず、質問 node で解消してから分岐を選ぶ。

| 要求 | node | 完了根拠 |
|---|---|---|
| `AC-1` Graph 契約を定める | `contract` | 成果物 fingerprint |
| `AC-2` 4例で遷移を確認する | `examples` | 例の検証 evidence |
| `AC-3` 別 context で設計確認する | `review` | 非重複 session の review evidence |
| 未確定: 互換性方針 | `ask-compatibility` | `human_answer` event の `choice` |

Graph snapshot と既存 Run への内部記録は executor 自身の bookkeeping で、node permission には含めない。
作業 tree の編集と commit は `repo:write`、push は `repo:write` + `network:read` + `external:write`、
Issue / PR の作成・更新は `tracker:write` + `network:read` を必要とする。

### 正常系

```json
{
  "nodes": [
    {"id":"implement","role":"action","required":true,"requirement_ids":["2f6e94c82d90:AC-1"],"depends_on":[],"max_attempts":1,"success_to":"verify"},
    {"id":"verify","role":"gate","required":true,"requirement_ids":["2f6e94c82d90:AC-1","2f6e94c82d90:AC-2"],"depends_on":["implement"],"max_attempts":2,"success_to":"review","failure_to":"fix"},
    {"id":"fix","role":"action","required":false,"requirement_ids":["2f6e94c82d90:AC-1"],"depends_on":["implement"],"max_attempts":2,"success_to":"verify"},
    {"id":"review","role":"gate","required":true,"requirement_ids":["2f6e94c82d90:AC-3"],"depends_on":["verify"],"max_attempts":2,"success_to":"complete","failure_to":"fix"}
  ],
  "events": ["implement:succeeded", "verify:succeeded", "review:succeeded", "graph:completed"]
}
```

### 検証失敗

```json
{
  "events": [
    "verify/attempt-1:failed",
    "fix/attempt-1:succeeded",
    "verify/attempt-2:succeeded"
  ],
  "rule": "verify.max_attempts=2。2回目も失敗すれば graph:stopped"
}
```

`verify -> fix -> verify` は意図した反復であり、`depends_on` の循環ではない。成功で `review` へ退出し、
失敗上限で `stop` へ退出する。

### 人間待ち

```json
{
  "state": "waiting",
  "wait": {
    "wait_id": "wait-compatibility",
    "reason": "human_decision",
    "attempt_id": "attempt-design-1",
    "allowed_actors": [{"kind":"human","id":"operator"}],
    "resume_on": [{"type":"human_answer","correlation_id":"wait-compatibility","required_fields":["choice"]}],
    "resume_mode": "continue_attempt"
  },
  "ignored_events": ["session_started", "timeout", "heartbeat", "process_alive"]
}
```

### 別セッション再開

```json
{
  "before": {"state":"waiting","attempt_id":"attempt-review-1","session_ids":["session-a"]},
  "event": {"event_id":"answer-1","type":"human_answer","correlation_id":"wait-compatibility","attempt_id":"attempt-review-1","actor":{"kind":"human","id":"operator"},"occurred_at":"2026-09-18T02:00:00Z","payload":{"choice":"compatible"}},
  "after": {"state":"active","attempt_id":"attempt-review-1","session_ids":["session-a","session-b"]}
}
```

新しい session 自体は再開理由ではない。保存済み回答イベントが `resume_on` と一致した後にだけ、
`session-b` を同じ attempt へ関連付けて再開する。

## Orca との境界

この契約が必要とする外部能力は tracker の Task 参照、git branch、ランタイム session ID だけである。
Orca を使う場合は、その ID や操作を adapter が `task_id`, `session_id`, permission event へ写像する。
Orca が無い場合も GitHub Issue、既存 Run、Claude Code / Codex の session ID で全必須項目を満たせる。
