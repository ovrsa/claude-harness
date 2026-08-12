---
name: improve-harness
description: 明示的な依頼でExperienceのhard examplesを評価し、isolated experimentを提案する。
command: true
---

# Improve Harness

ユーザーがこのcommandを明示的に実行した場合だけ開始する。

1. Experienceから候補となるhard examplesをread-onlyで選ぶ。
2. raw secretやfile bodyを持ち込まず、評価に必要なsanitized referenceだけを提示する。
3. evaluation set、baseline、評価軸をユーザーへ示し、承認を待つ。
4. 承認後だけ `experiments/<experiment-id>/` を作る。
5. baselineとcandidateを同じevaluation setで比較する。
6. 結果を構造化して報告し、適用するcandidateをユーザーへ委ねる。

## Experiment Layout

```text
experiments/<experiment-id>/
  experiment.json
  baseline.json
  candidates/
  evaluations/
  summary.jsonl
  frontier.json
```

winnerを自動適用しない。scheduled実行、automatic promotion、Experience retention deletionも行わない。
