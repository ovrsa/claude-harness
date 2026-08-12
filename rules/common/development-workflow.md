# Development Workflow

非自明な変更は [../../CLAUDE.md](../../CLAUDE.md) のmanaged `grilling` flowから始める。Grill完了後はユーザーが選んだ `/to-spec`、`/grill-with-docs`、`/implement`、終了だけへ進む。

実装時は変更に適したfeedback loopを先に作る。testable seamではREDから始め、typecheck、unit、integration、runtime observationのうち必要なものを実行する。

完了報告には、変更点、実行したcheck、残る不確実性を含める。
