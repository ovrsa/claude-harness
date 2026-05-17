# Agentic Development Pipeline

この文書は、Agentic Engineering の読解を通じて `.claude` ハーネスに採用する開発パイプラインをまとめる。

元記事の転載ではない。読解・批判・適用検討を経て、`.claude` の運用原則として採用する内容だけを整理する。

## 目的

人間が目的、戦略、制約、採否を握り、エージェントが意図を作業へ翻訳し、ガードレール内で実行し、証跡を残し、再利用できる学びを保存する開発体験を作る。

目標は最大限の自動化ではない。目標は、境界のある自律性によって意思決定の質を上げること。

## 採用原則

### 1. Human-Owned Intent

人間が握るもの:

- 目的
- 戦略
- 制約
- リスク許容
- 採否

エージェントは、作業目標、成功条件、実装方針、検証方法を提案できる。ただし、その提案は人間の承認対象であり、採否そのものは人間が握る。

### 2. Context Is Assembled

エージェントは、信頼できる作業文脈を自然に保持しているわけではない。ハーネスが、指示、会話、ファイル、ツール結果、artifact、Git から文脈を組み立てる。

文脈はフェーズごとに選ぶ。多ければよいわけではない。

Git は、エージェントが読める作業基盤として扱う。

- 現在地
- 直近の変更
- 過去の判断
- ブランチや clone による分離
- 複数案の試行
- regression search
- handoff memory

### 3. Weight Before Workflow

すべてのタスクにフルプロセスを回さない。まずタスクの重さを決め、その重さに合わせて workflow の重さを選ぶ。

推奨する重さ:

- `trivial`: 直接回答または小さな変更
- `exploratory`: 境界を決めた調査や実験
- `standard`: 通常の実装やハーネス改善
- `behavior-changing`: ユーザーから見える挙動、runtime、UI、integration の変更
- `heavy-risky`: 認証、認可、データ、deploy、破壊的操作、security、migration、広範囲の設計変更

プロセスは、タスクに必要な分だけ重くする。

### 4. Evidence Before Acceptance

エージェントの「動きました」という主張だけで受け入れない。

採否は、タスクに合った証跡に基づける。

- diff または changed-files summary
- tests
- command output
- logs
- screenshots または browser observations
- API/manual path evidence
- review findings
- residual risks

証跡の重さは、タスクの重さに合わせる。

### 5. Knowledge Must Flow Into Decisions

知識は、次のエージェントや人間の判断を良くするときだけ有用になる。

長いメモを always-loaded なファイルに安易に追記しない。最も狭く、耐久性のある置き場所を選ぶ。

- 一時的な sensemaking は conversation のみ
- 現在のタスク継続は `progress.md`
- タスク内の推論や証跡は task artifacts
- 再利用できる説明は docs
- 繰り返し使う operator workflow は commands
- 機械的な境界は hooks
- 複雑で再利用できる手順は skills
- 再発する失敗パターンは Guardrail Candidates

## パイプライン

### 1. Sensemaking

読解、学習、戦略整理、外部ドキュメントを判断材料として適用する場面で使う。

やること:

- source claims を特定する
- ユーザーの言葉で言い換える
- 批判的に見る
- 現在のハーネスに対応づける
- adopt / hold / reject を決める

すぐに `research.md` / `plan.md` を作成・更新しない。

出力:

- 共通理解
- 採用原則
- 明示された open questions

### 2. Shape

ユーザーに目的、懸念、戦略、曖昧な要望があり、それを実行可能な作業に変換する必要があるときに使う。

shaping step では次を提案する。

- interpreted purpose
- proposed objective
- success criteria
- constraints
- non-goals
- assumptions
- open questions
- task weight
- spec need
- suggested artifact
- acceptance criteria
- evidence needed
- review weight
- human approval need
- suggested next step

`/shape-task` は v0 では明示的に呼ぶコマンドにする。always-on rule にはしない。

### 3. Decide Weight

planning や routing の前に、どれくらいのプロセスが必要かを決める。

典型的な対応:

- `trivial`: shape なし、spec なし、最小限の verification
- `exploratory`: light shape、仮説、境界を決めた observation
- `standard`: task brief、focused tests、review/evidence summary
- `behavior-changing`: task brief に加えて observation/manual path evidence
- `heavy-risky`: 明示的な spec または approved plan、強い verification、複数観点 review、residual-risk acceptance

### 4. Clarify Acceptance

作業を受け入れる前に、何が真であればよいかを明確にする。

これは、毎回 full spec を書くことではない。artifact はタスクに合わせる。

- trivial work では不要
- standard work では短い task brief
- approved execution intent を残す必要がある場合は `plan.md`
- 長期的な設計判断や高リスク境界がある場合は design spec

### 5. Route

タスクが明確になった後、どこで作業するべきかを決める。

候補:

- main context
- subagent sidecar
- task queue
- isolated clone
- human decision

委譲しないもの:

- 目的
- 採否
- scope expansion
- destructive action
- credential use
- deploy
- push
- PR creation
- residual-risk acceptance

委譲しやすいもの:

- codebase exploration
- focused research
- failing test reproduction
- approved scope 内の isolated implementation
- spec/diff/evidence consistency の review
- verification log collection
- cognitive debt を減らす walkthrough

### 6. Plan

approved execution intent が必要な作業だけ plan を作る。

plan は、未整理の brainstorming history ではなく、shaped intent と acceptance criteria に基づける。

### 7. Execute

approved scope と permission boundaries の内側だけで実行する。

standard や heavy-risky の queued work で分離が必要な場合は、isolated branch や shared clone を使う。

停止条件:

- scope が広がる
- approval がない
- baseline failure を分類できない
- external credentials や external services が必要
- destructive action や release action が要求される
- verification failure が design uncertainty を示す

### 8. Verify

タスクに合った check を実行する。

例:

- `trivial`: changed-surface sanity check
- `standard`: focused tests と relevant validators
- `behavior-changing`: tests に加えて runtime/manual path evidence
- `heavy-risky`: stronger suite、review evidence、residual-risk record

Verification が答える問い:

> check は通ったか。

### 9. Review / Evaluate

Review は、行単位の diff inspection だけではない。

Review では次を比較する。

- objective
- acceptance criteria
- diff
- tests
- logs/manual evidence
- residual risks

リスクの高いコードでは diff review は引き続き重要。ただし、人間の review の中心は acceptance、evidence、risk に移る。

Evaluation が答える問い:

> この変更を受け入れてよいか。

### 10. Handoff / Learn

完了後は、未来の判断に役立つ知識だけを残す。

候補:

- `verification-summary.md`
- `review-summary.md`
- `observation-summary.md`
- `progress.md`
- docs
- commands
- hooks
- skills
- Guardrail Candidates

一回限りの学びを、再発や明確な重大性なしに global rule へ昇格しない。

## コマンドへの含意

想定する command surface:

- `/shape-task`: 明示的な task shaping entrypoint
- `/route-task`: 明確になった task を main context、subagent、queue、human decision に振り分ける
- `/execute-plan`: approved work を実行する
- `/verify`: rerunnable evidence を記録する
- `/review-task` または `/eval`: acceptance readiness を判断する

`/shape-task` は、まず spec が必要かどうかを判断する。毎回 full spec を作らない。

`/shape-task` の推奨 output fields:

- `Task Weight`
- `Spec Needed`
- `Suggested Artifact`
- `Acceptance Criteria`
- `Evidence Needed`
- `Review Weight`
- `Human Approval Needed`
- `Suggested Next Step`

## Non-Goals

- すべての task に full spec を強制しない
- shaping 中に subagent を自動実行しない
- AI review を evidence quality なしに十分とみなさない
- 外部記事を always-loaded instructions に丸ごと追記しない
- human acceptance を automation で置き換えない
