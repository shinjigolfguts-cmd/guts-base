# GitHub版 GUTS BASE の運用・停止手順

対象は `shinjigolfguts-cmd/guts-base` と https://shinjigolfguts-cmd.github.io/guts-base/ のみ。他サイト・旧Sites版の編集権限や、将来のPRの公開承認を含まない。

## 更新開始前

1. 接続済みGitHubで最新 `main`、未取り込みPR、最近のコミット、実行中Actionsを確認する。同時編集があれば一方の変更を上書きせず、担当・基準を整理する。
2. 最新 `main` を基準に、対象ファイルの内容・ハッシュと元の版を保持する。旧Sites書き出しへの巻き戻しや、他担当の変更の無条件な上書きをしない。
3. `github-preparation-2026-10-29.md` は移行時の記録。このリポジトリには `export-github.mjs`、`build-discovery.mjs`、`check-release.mjs`、`test-github-export.cjs` は存在しない。不存在のコマンドを通常更新手順として実行しない。
4. 公式取得の成功は価格・在庫・全仕様の一致と別に記録する。取得失敗だけで削除・閉業・値下げ・確認日更新を推定しない。既知のアクセス拒否を再試行や別経路で回避しない。

## 修正と検査

必要な差分だけを作り、下書きPRで確認する。実在するオフライン検査は次の通り（画像を含む完全なチェックアウトが必要な項目あり）。

```sh
node scripts/check-static.mjs
python3 -m unittest discover -s tests
node --test scripts/test-modal-focus.mjs scripts/test-catalog-prices.mjs scripts/test-render-control-focus.mjs scripts/test-favorites-ui.mjs
node --check catalog.js
node --check app.js
node --check selection.js
node --check guts-analytics.js
```

- `check-static.mjs` はカタログ・画像・参照・検索用メタデータ等の整合検査。ファイル不足で未実施ならその範囲を明示し、正確なPR headのCI全体検査で確認する。
- Pythonの `test_*.py` は外部通信なし。実カタログ等のローカル整合検査と固定応答fixtureによる検査がある。`scripts/check-live.py` と `scripts/check_sources.py` 本体は実際に公開URLへ接続するので、オフラインテストの代わりに起動しない。
- 変更前の失敗が新テストで再現する場合は負例対照を保存する。既存テストの再実行だけを新しい情報監査や実障害復旧の進捗とは数えない。

## 取り込み・公開の完了条件

1. PR番号・対象・headを特定した取り込み承認を得る。一般的な継続指示や別PRの承認で代用しない。
2. 承認後も `main`、PR head・差分、CI、競合を再照合。head移動や未確認の差分があれば取り込みを止める。
3. 通常の取り込みを行い、結果が不確かなら現在のPR・mainを読み取ってから判断する。重複操作、保護設定変更、force上書きをしない。
4. 取り込みコミットに対応する正式Pagesとmain CIの終端を確認する。自動で始まった実行を重複して手動起動しない。
5. `live` のJSONで `commit`・`passed`・`resources`・`failures` を確認する。PR11時点の対象は263（カタログ242件の画像・10検索ページ・JS/CSS・2サイトマップ・robots・404・所有権確認ファイル）。リポジトリ全ファイルの検査という意味ではない。データや構成変更時は実対象から件数を再計算する。
6. UIに影響する変更は、変更後の実公開版で必要な実ブラウザ操作を確認する。変更前のモバイル合格結果を変更後へ無条件に流用しない。

## 失敗・中断時

- 取り込み前の検査が失敗したら公開しない。取り込み後のPages/CIが失敗した場合は、コミット・run・job・最初の原因・現在の公開状態を記録して報告する。
- 旧バイトやキャッシュ遅延は直ちにデータ破損と断定しない。既存の最大12回・15秒間隔の公開照合を終端まで確認し、設定や対象を変えて成功扱いにしない。
- チェッカーがレポート作成前に停止した場合も、シェルは失敗として扱う。全12回失敗なら終了コード1、存在しないJSONを成功証跡にしない。artifactは `always()` で保存を試みるが、ファイル不在時はエラー。ログも確認する。
- 実際の修復やrevertが必要なら、現在のmainとの差分・戻す対象・影響・承認範囲を特定し、通常の修正PRとして確認する。古いスナップショットをmainへ強制上書きしない。実復旧を検証していない段階で「復旧済み」と報告しない。
- ログや最後の有効なレポートの保持と、本番rollbackの成功は別の証拠。故意に本番を壊して実績を作らない。

## 定期実行と未確認範囲

- 既存Catalog checksは毎週月曜10:30 JST、Official source link reviewは11:00 JST。追加・変更・重複起動をしない。
- Catalog checksは検査であって価格・在庫の自動書換えではない。source reviewも掲載データや確認日を書き換えない。
- 定期成功の証拠には実際の `event=schedule` と対象コミット・終端・artifactが必要。PR/push CI成功は代替しない。
- Search Consoleの処理・登録状態は認証済み画面等の証拠が必要。公開URL成功やsitemap整合だけではGoogle登録を断定しない。
- 2026-10-31 PR11公開時点では、263件の実公開一致と通常成功時artifact保存は確認済み。初回定期実行、実rollback、実障害後復旧、新UIのスマホ検証は別途未確認。公式107/242件の部分照合は全項目・在庫の検証ではない。

## 追加した無通信失敗経路

PR11の17テストに、(1)全URL fixture検査後のGitメタデータ取得失敗、(2)レポート作成前に2回異常終了後の回復、(3)同異常が12回続いて停止・JSONなし、の3経路を追加。
いずれも本番通信・待機・workflow起動なし。Git/HTTP応答とPython/sleepはfixtureに置き換える。実インフラ障害や実rollbackの実証とは扱わない。
