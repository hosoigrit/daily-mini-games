# Game #0004 実機受け入れテスト記録

## 環境

| 項目 | 記録 |
| --- | --- |
| 実施日（JST） | 2026-11-19（正確な時刻は未報告） |
| 記録根拠 | ユーザー本人による実機操作結果の報告 |
| Windows PC IPv4 | 未報告 |
| サーバーURL | 未報告 |
| 同一Wi-Fi確認 | 信頼できる自宅Wi-Fi（ユーザー報告） |
| ファイアウォール変更 | 未報告 |
| VPN状態 | 未報告 |

## 端末別結果

| 端末 | 型番 | OS版 | ブラウザ・版 | 縦向き | 横向き | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| iPhone | 未報告 | 未報告 | Safari（版未報告） | 未報告 | NOT RUN | PASS |
| Android | 未報告 | 未報告 | Chrome（版未報告） | 未報告 | NOT RUN | PASS |
| iPad | 未報告 | 未報告 | Safari（版未報告） | 未報告 | NOT RUN | PASS |
| Windows PC | 未報告 | Windows 11 | Edge（版未報告） | 対象外 | 対象外 | PASS |

## 各端末で記録するテスト

| ID | 確認内容 | 期待結果 | iPhone | Android | iPad | Windows PC | 備考・証拠 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AT-01 | URLを開く | タイトル、HUD、開始ボタンが表示 | PASS | PASS | PASS | PASS | ゲーム操作完了のユーザー報告 |
| AT-02 | ゲーム開始 | 0/10・0点から開始 | PASS | PASS | PASS | PASS | ゲーム操作完了のユーザー報告 |
| AT-03 | タップ／クリック／Space | ブロックが1回だけ落下 | PASS | PASS | PASS | PASS | ゲーム操作完了のユーザー報告。個別入力方式の内訳は未報告 |
| AT-04 | PERFECT／NORMAL | 文字表示と得点、切り落としが正しい | NOT RUN | NOT RUN | NOT RUN | NOT RUN |  |
| AT-05 | MISS | 加点せずGAME OVER | PASS | PASS | PASS | PASS | GAME OVER画面・動作PASSのユーザー報告 |
| AT-06 | 一時停止・復帰 | 位置跳びせず明示再開 | NOT RUN | NOT RUN | NOT RUN | NOT RUN |  |
| AT-07 | 連打・長押し | 二重着地・二重加点なし | NOT RUN | NOT RUN | NOT RUN | NOT RUN |  |
| AT-08 | 再挑戦 | 0階・0点から新規開始 | NOT RUN | NOT RUN | NOT RUN | NOT RUN |  |
| AT-09 | 10階CLEAR | CLEAR画面、11個目なし | PASS | PASS | PASS | PASS | CLEAR画面・動作PASSのユーザー報告 |
| AT-10 | 自己ベスト | 再読込後も最高階・スコア保持 | NOT RUN | NOT RUN | NOT RUN | NOT RUN |  |
| AT-11 | 画面回転・拡大 | UI欠け・誤スクロールなし | NOT RUN | NOT RUN | NOT RUN | NOT RUN |  |
| AT-12 | 極細ブロック | 正の重なりなら継続し視認可能 | NOT RUN | NOT RUN | NOT RUN | NOT RUN |  |

## 不具合記録

| Bug ID | 端末・環境 | 再現手順 | 期待結果 | 実際結果 | 再現率 | 画像・動画 | 判定 |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |

実機未実施項目をPASSに変更しない。エミュレーション結果と実機結果を区別して記録する。

## 受け入れ判定

- iPhone Safari（TC-042）: PASS
- Android Chrome: PASS
- iPad Safari: PASS
- Windows Edge手動操作: PASS
- Windows Chrome手動操作: NOT RUN（自動Chrome確認のみ）
- 画面回転、ブラウザ拡大、極細ブロックの視認性: NOT RUN

端末別の総合PASSは、ユーザーが各環境でゲーム操作、CLEAR画面、GAME OVER画面に問題がないことを確認した報告に基づく。個別の実施報告がないAT-04、AT-06〜08、AT-10〜12は推測でPASSにしていない。
