# GOLF GUTS 総合サイト

公開先: https://shinjigolfguts-cmd.github.io/guts-base/

2026-10-29にSites公開v52（ee0a71e1ac86cab4da432eafd43eff145f390a6b）の静的書き出しを反映。
商品・施設242件、ウェア男女各70件、その他8カテゴリ各表示10〜15件。

## 更新の基準
Sites総合サイトの検証済みソースを基準とし、scripts/export-github.mjsで上記URLへ書き出す。GitHubの変更を無条件に上書きしない。価格や順位を無根拠に自動変更しない。

## 検証
2026-10-30時点で scripts/check-static.mjs が成功。242件のID・名称・画像チェックサム、男女別カテゴリ件数、施設予算解除、学校先頭、SEO・サイトマップ・内部参照を確認。GitHub Actions のカタログ検査と Pages 公開も成功。画像の全件目視や当日の全商品の在庫確認を意味しない。

## 残る確認
アクセス計測はSites v53の受信APIへ接続。既存週次タスクにGitHub反映手順を追加（次回実行実績はまだ未確認）。公式記述が一致しないウェア2017/2119/2037/2140、公式URL取得失敗11件は確認を継続する。Google Search Console のサイトマップ処理と検索登録は外部処理の完了待ち。
