---
description: Playwrightで重要なuser journeyを実行し、failure artifactを残す。
---

# E2E

main contextで対象journey、environment、test data、安全境界を確認する。金融・production・外部通知など副作用を持つjourneyは、safe environmentが明示されるまで実行しない。

1. critical pathとobservable outcomeを列挙する。
2.既存Playwright setupとselector conventionを読む。
3. 最小のjourney testを追加または選択する。
4. browserで実行し、failure時だけscreenshot、video、traceを保存する。
5. flaky behaviorは隠さず、再現率と残る不確実性を報告する。

unit seamはmanaged `/tdd`、diff reviewはmanaged `/code-review` をユーザーが選んだ場合に使う。
