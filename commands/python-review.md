---
description: Python差分をPEP 8、type safety、security、Pythonic designの観点でreviewする。
---

# Python Review

main contextでbaseからのPython差分を読み、projectに存在するtoolだけを実行する。

- CRITICAL: injection、unsafe deserialization、hardcoded credential
- HIGH: exception swallowing、resource leak、mutable default、type contract violation
- MEDIUM: readability、format、avoidable allocation、missing public annotation

`pyproject.toml` からPython versionとconfigured toolsを確認し、存在しないlint commandを推測でinstallしない。findingsはseverity、file/line、根拠、最小修正案で報告する。汎用diff reviewを追加する場合はmanaged `/code-review` を使う。
