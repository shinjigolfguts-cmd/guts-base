# GOLF GUTS 総合サイト

公開先: https://shinjigolfguts-cmd.github.io/guts-base/

2026-10-29にSites公開v52（ee0a71e1ac86cab4da432eafd43eff145f390a6b）の静的書き出しを反映。
商品・施設242件、ウェア男女各70件、その他8カテゴリ各表示10〜15件。

## 更新の基準
通常の更新は、このGitHubリポジトリの最新 `main` と未取り込みPRの差分を確認して進める。旧Sites版から一括で上書きしない。価格・順位・確認日を無根拠に自動変更しない。
移行時に使った `scripts/export-github.mjs` はこのリポジトリには含まれず、ここで実行する更新コマンドではない。既存Sitesを変更・再書き出しする場合は別途対象と権限を確認する。
現在の確認・取り込み・失敗時の停止手順は [GitHub版の運用手順](docs/maintenance/github-operations.md) を参照。

## 検証
2026-10-30時点で scripts/check-static.mjs が成功。242件のID・名称・画像チェックサム、男女別カテゴリ件数、施設予算解除、学校先頭、SEO・サイトマップ・内部参照、重複ID・画像代替テキスト・外部リンク保護属性を確認。GitHub Actions のカタログ検査、Pages 公開、公開内容のバイト照合も成功。画像の全件目視や当日の全商品の在庫確認を意味しない。

## 現在の状態
公開済み。現在の状態は最新コミットに対応するActions・Pages・公開照合結果を確認する。[公開状態（2026-10-30）](docs/maintenance/release-status-2026-10-30.md) と [current-status.json](docs/maintenance/current-status.json) は記載日時の状態で、以後の全変更の検証完了を意味しない。更新ごとの証跡と未確認範囲は [GitHub版の運用手順](docs/maintenance/github-operations.md) に沿って区別する。

## 残る確認
アクセス計測はSites v53の受信APIへ接続。既存週次タスクにGitHub反映手順を追加（次回実行実績はまだ未確認）。公式記述が一致しないウェア2017/2119/2037/2140は、利用者向けの断定を避けた説明へ修正済み。メーカー側の記述解消は継続確認する。公式URLは全239本を対象に取得点検。取得成功は価格・在庫確認を意味せず、取得制限はリンク切れと断定しない。メンテナンス・自動取得制限のある7施設には電話案内を併記。最新結果は docs/maintenance/source-health-2026-10-30.json と再検査記録を参照。Google Search Console のサイトマップ処理状況と検索登録状況は、認証が必要なため未確認。公開サイトの正常取得とGoogle登録成功は別に扱う。
