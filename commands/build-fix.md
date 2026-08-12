# Build And Fix

buildまたはtype errorを再現し、最小の原因単位で直す。

1. projectのbuild commandを特定してfailureを再現する。
2. exact error、file/line、dependency boundaryを確認する。
3. root causeを一文で述べる。
4. 一つだけ修正して同じcommandを再実行する。
5. errorが増えた、同じfailureが3回続いた、設計変更が必要になった場合は停止してユーザーへ状況を返す。

完了時はfixed/remaining errors、実行command、新しいfailureがないことを報告する。設計変更が必要ならmanaged `grilling` に戻り、実装継続が合意済みなら `/implement` を使う。
