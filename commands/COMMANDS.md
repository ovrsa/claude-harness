# Command Surface

開発ライフサイクルはmanaged `mattpocock-skills@mattpocock` が提供する。

## Managed Development Commands

- `/grill-me`: 非codeも含むfocused interview
- `/grill-with-docs`: Grillとdomain documentation
- `/to-spec`: 合意済み会話をLocal Markdownへ統合
- `/implement`: 合意済みspecを実装
- `/tdd`: testable seamのRED-GREEN-REFACTOR
- `/code-review`: standardsとspec fidelityの二軸review

通常の非自明な依頼はmodel-invoked `grilling` から始まる。managed commandsはこのdirectoryへコピーしない。

## Local Harness Commands

- `/experience-status`: Experienceの件数、容量、outcomeをread-only表示
- `/improve-harness`: 明示的なharness experiment
- `/harness-audit`: active surfaceの静的確認

その他のlocal commandsはspecialized utilitiesであり、標準ライフサイクルを定義しない。commandの存在だけで自動実行、agent委譲、Git publishingを行わない。
