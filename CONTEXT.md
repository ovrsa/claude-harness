# Domain Context

- **Grill**: 実装前にdesign frontierを閉じ、最終理解の確認で終了するinterview。
- **Final understanding**: Grillで確定した要求、境界、未採用案、残る不確実性の短い要約。
- **Managed skill**: Claudeがinstall・updateするread-only plugin内のskill。
- **Runtime bridge**: Codexをcanonical lifecycleとExperienceへ接続する薄い入口。
- **Experience**: 通常runから得るsanitized JSON/JSONLの観測履歴。
- **Experiment**: 明示的なharness改善でbaselineとcandidateを比較する隔離領域。
- **Local Markdown**: `.scratch/<feature>/` に置く任意のspecやticket。
- **Active harness**: `CLAUDE.md`、`AGENTS.md`、managed plugin、minimal hooksで構成する現在のcontrol plane。
