# GOLF GUTS — GitHub公開運用 / 2026-10-29

対象は総合サイトGOLF GUTSだけ。関東版・全国版と混ぜない。
現在の公開先: https://golf-edit-guts.nutmegcoin18.chatgpt.site/
サイトID: appgprj_6ad911425730819198af61cb1eb945f2

## 準備済み
- 242件のcatalog.jsと画像、男女各70件のウェア・他8カテゴリ10〜15件。
- 9カテゴリの検索向けページ、canonical・OG画像・サイトマップ・内部リンク。
- scripts/export-github.mjs: 確定した公開URLに合わせた静的書き出し。リポジトリ配下パスにも対応。
- scripts/test-github-export.cjs: 10ページ/626内部参照、画像参照、上書き禁止、秘密情報・APIの非混入を検査。
- scripts/check_sources.py: 公式URLの接続検査。価格・在庫等の確認日や掲載データを自動変更しない。
- Sites版とGitHub公開版は計測を接続済み。公開書き出しには --analytics を指定する。未指定の準備用書き出しは計測未接続。

## 接続後の順序
1. GitHubの実リポジトリと現在のPages公開URL・ブランチ・ワークフローを読み取る。ユーザー名やリポジトリ名を推測しない。
2. 既存GitHub版との差分を確認。既存コミット・独自ドメイン・計測設定・データを無断で上書きしない。
3. `node scripts/build-discovery.mjs` と `node scripts/check-release.mjs` を実行。
4. 確定したURL（末尾/付き）と空の絶対出力先で `node scripts/export-github.mjs <実際のPages公開URL> <空の絶対出力先>` を実行。
5. 既存ワークフローに合わせて配置・公開。GitHub Pagesは静的ホスティングなので、Vinextサーバー・DB・APIをそのままPagesへコピーしない。
6. 計測は実GitHubのoriginを既存サーバーの許可元へ追加し、クライアント送信先・プライバシー文言・GUTS DESK表示を同時に検証してから接続する。秘密キーはフロントへ置かない。
7. Sites版とGitHub版のどちらを情報更新の基準とするかを実ファイルで確認。二重の定期実行を作らない。既存の週次更新タスクにはGitHub反映手順を追加済み。次回実行の成功は実績取得まで未確認とする。
8. 実公開URLで男女各70ウェア、カテゴリ、詳細、画像、公式リンク、予算解除、スクール先頭、男女切替スクロール、sitemap/canonicalを確認。
9. Search Console登録状況・所有権を確認。未登録や所有権確認未済を登録済みと報告しない。

## 未完了・外部条件
- GitHub接続・Pages公開・計測受信接続は完了。公開先は https://shinjigolfguts-cmd.github.io/guts-base/ 。次回の定期実行実績とGUTS DESK画面での表示確認は未確認。
- 公式サイトの一部はHTTPエラーや地域・リダイレクト制限があり、価格・在庫の全モデル精査は未完了。reportsとUPDATE_LOG参照。
- Sitesの公開URLはブラウザーでは表示・操作できるが、実行環境の直接HTTP取得では403となった。原因・検索エンジンからの取得可否は未確定。検索掲載済みとはしない。
- スマートフォン実機/各ブラウザーでの網羅的検証は未実施。

公式仕様: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages

## 失敗時
チェックに失敗したら公開しない。通信失敗で商品を削除/順位変更/確認日更新しない。
GitHubとの同期成功を確認するまで既存のSites公開版と週次運用を維持。

## 2026-10-29 GitHub接続後
実リポジトリ shinjigolfguts-cmd/guts-base、公開URL https://shinjigolfguts-cmd.github.io/guts-base/。v52移行のPages公開成功。旧PR #1は移行で包含し終了。
計測対応を含む以後の書き出しでは、受信側の許可を公開確認した後に第3引数 --analytics を付ける。既存週次タスクにGitHubの差分確認・反映・公開検証を追加した。次回実行の成功を先に断言しない。
