# Command Permission Policy

PermissionRequestはBash commandだけを4分類し、開発ライフサイクルやExperienceとは独立して動く。

## Classes

### `auto-allow`

明らかなread-only inspection。

- `pwd`
- `ls`
- `rg`
- `sed -n`
- `cat`
- `git status`, `git diff`, `git log`

### `audit-only`

低riskなprocess/identity metadata。許可するが、raw commandの独自ログは作らない。

- `ps`
- `whoami`
- `id`
- `date`

### `ask-with-justification`

read-onlyと断定できないcommand。具体的な目的を示してhuman approvalを求める。

- test、build
- dependency install
- repository mutation
- external side effect

### `hard-deny`

明確にdestructiveなcommandをdenyし、safer alternativeへ切り替える。

- recursive force removal
- hard reset
- forced clean
- force push
- recursive world-writable permission

## Data Boundary

PermissionRequestはClaude Code所定のdecision JSONだけをstdoutへ返す。raw command、credential、approval promptを独自fileへ保存しない。通常のsanitized tool observationはExperienceが担当する。
