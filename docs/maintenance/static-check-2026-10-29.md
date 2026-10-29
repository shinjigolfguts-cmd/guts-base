# 2026-10-29 追加検査

GitHub最新main b6a4b6444e481a437889c4037d106f010679b4cdを取得して検査。対応するPages run 40807958199は成功。

## GitHub単体で実行可能な検査
`node scripts/check-static.mjs`を追加。外部パッケージや認証は不要。週次の静的書き出し後、公開前に実行し、失敗時は公開しない。Sites側のcheck-releaseを置き換えるものではない。

今回の結果：242レコード、男女各70ウェア、その他各カテゴリ10〜15件、242掲載画像のSHA-256、11 HTMLと654内部参照、ID重複・モデル重複・ウェア予算・学校先頭・計測設定の検査に合格。
一時コピーで画像を破損させ、終了コード1で検知することも確認。公開ファイルを壊す操作は行っていない。
検査スクリプトは追加したが、新しい定期タスクやGitHub Actionsは作成していない。実行は更新手順の一部で、pushだけでは自動実行されない。

## 公式取得再試行
調布 https://www.accordiagolf.com/practice/chofu/detail.php は503、船橋 https://www.accordiagolf.com/practice/funabashi/ と柏 https://www.accordiagolf.com/practice/kashiwa/detail.php は取得タイムアウト。閉鎖とは判断せず既存情報を維持。

価格・在庫の真偽、全件画像の型番/色の目視、実機操作、計測受信はこの静的検査の対象外。4モデルの公式記述不一致、11URLの当日情報取得、全商品在庫照合、次回週次実行結果は未解消。
