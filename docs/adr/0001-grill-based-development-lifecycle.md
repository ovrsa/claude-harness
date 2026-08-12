# ADR 0001: Grill-Based Development Lifecycle

- status: accepted
- date: 2026-08-12

## Context

従来のSuperpowers、root artifact chain、SQLite session state、automatic multi-agent orchestrationは、要求理解より先に工程を固定し、個人harnessとして重かった。

## Decision

managed Matt Pocock skillsをread-only pluginとして導入し、`Grill -> final understanding confirmation -> explicit next action` を標準にする。

通常履歴はJSON Experienceへ保存する。harness比較は明示的な改善時だけExperimentsへ分離する。Claude Codeはpluginを直接利用し、Codexはregistryから同じinstall pathを解決する。

Superpowersはactive lifecycleとCodex discoveryから分離する。既存artifactは移行せず、legacy databaseは検証済みarchiveとして保持する。

## Consequences

常時ロードされる規則とhookが減り、ユーザーが工程を選べる。自動resumeや強制gateは失う一方、sanitized traceとstructured outcomeから必要時に改善材料を得られる。

## Alternatives

- 既存lifecycleを部分的に残す: 二重authorityになるため不採用
- skillsをlocal copyする: managed read-onlyという更新方針に反するため不採用
- scalar scoreだけを保存する: correctionやunknownを失うため不採用
