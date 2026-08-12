# JSON Experience Store

Experienceは通常runのsanitized observationであり、lifecycle gateや自動学習装置ではない。

## Layout

```text
experience/
  index.jsonl
  runs/<run-id>/
    manifest.json
    trace.jsonl
    outcome.json
    refs.json

experiments/<experiment-id>/
  experiment.json
  baseline.json
  candidates/
  evaluations/
  summary.jsonl
  frontier.json
```

## Contracts

- `manifest.json`: runtime、repository identity、harness fingerprint、Grill skip reason
- `trace.jsonl`: one event per line。raw promptやtranscript本文は保存しない
- `outcome.json`: `accepted | corrected | failed | abandoned | unknown`
- `refs.json`: pathやURLのreferenceだけ
- `index.jsonl`: finalized runのcompact summary

credential-shaped keys、Bearer token、opaque tokenをredactし、multiline commandとlarge resultをbounded summaryへ変換する。観測失敗はfail-open、PermissionRequestの安全判断は独立して扱う。

## Improvement And Retention

Experimentsはユーザーが明示的に改善を依頼し、evaluation setを承認した後だけ作る。candidate winnerを自動適用しない。

retention deletionも自動化しない。`/experience-status` は件数、容量、outcome、未分類runをread-onlyで報告し、pruneは明示的な依頼で行う。
