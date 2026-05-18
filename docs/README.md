# Docs Index

このディレクトリは、`.claude` ハーネスの説明・仕様ドキュメントを置く場所。
ルート直下には入口だけを残し、判断や運用の詳細はここへ置く。

## 読む順番

1. `harness-operating-loop.md`
   - 普段の作業ループと、どの順番で判断するか。
2. `harness-structure-and-ownership.md`
   - ハーネス全体の構造、各ディレクトリや文書の責務。
3. `development-task-pipeline.md`
   - タスクを intake して、計画、実装、検証、受け入れまで進める流れ。
4. `command-permission-policy.md`
   - コマンド実行時の許可、確認、禁止の境界。
5. `runtime-evidence-requirements.md`
   - 動作確認や runtime evidence が必要になる条件。
6. `session-resume-state.md`
   - セッション継続、resume、checkpoint の扱い。

## 命名ルール

- ファイル名は「中で何を判断する文書か」が分かる名前にする。
- 抽象名だけの `model`, `policy`, `architecture` は避ける。
- 一時的なタスク資料は `plan/<task-name>/` に置く。
