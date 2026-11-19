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
| iPhone | 未報告 | 未報告 | Safari（版未報告） | PASS | PASS | PASS |
| Android | 未報告 | 未報告 | Chrome（版未報告） | PASS | PASS | PASS |
| iPad | 未報告 | 未報告 | Safari（版未報告） | PASS | PASS | PASS |
| Windows PC | 未報告 | Windows 11 | Edge（版未報告） | 対象外 | 対象外 | PASS |

## 各端末で記録するテスト

| ID | 確認内容 | 期待結果 | iPhone | Android | iPad | Windows PC | 備考・証拠 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AT-01 | URLを開く | タイトル、HUD、開始ボタンが表示 | PASS | PASS | PASS | PASS | ユーザー最終確認。証拠画像は未提出 |
| AT-02 | ゲーム開始 | 0/10・0点から開始 | PASS | PASS | PASS | PASS | ユーザー最終確認。証拠画像は未提出 |
| AT-03 | タップ／クリック／Space | ブロックが1回だけ落下 | PASS | PASS | PASS | PASS | 各端末で利用可能な入力によるユーザー最終確認。証拠画像は未提出 |
| AT-04 | PERFECT／NORMAL | 文字表示と得点、切り落としが正しい | PASS | PASS | PASS | PASS | ユーザー最終確認。証拠画像は未提出 |
| AT-05 | MISS | 加点せずGAME OVER | PASS | PASS | PASS | PASS | ユーザー最終確認。証拠画像は未提出 |
| AT-06 | 一時停止・復帰 | 位置跳びせず明示再開 | PASS | PASS | PASS | PASS | ユーザー最終確認。証拠画像は未提出 |
| AT-07 | 連打・長押し | 二重着地・二重加点なし | PASS | PASS | PASS | PASS | ユーザー最終確認。証拠画像は未提出 |
| AT-08 | 再挑戦 | 0階・0点から新規開始 | PASS | PASS | PASS | PASS | ユーザー最終確認。証拠画像は未提出 |
| AT-09 | 10階CLEAR | CLEAR画面、11個目なし | PASS | PASS | PASS | PASS | ユーザー最終確認。証拠画像は未提出 |
| AT-10 | 自己ベスト | 再読込後も最高階・スコア保持 | PASS | PASS | PASS | PASS | ユーザー最終確認。証拠画像は未提出 |
| AT-11 | 画面回転・拡大 | UI欠け・誤スクロールなし | PASS | PASS | PASS | PASS | ユーザー最終確認。証拠画像は未提出 |
| AT-12 | 極細ブロック | 正の重なりなら継続し視認可能 | PASS | PASS | PASS | PASS | ユーザー最終確認。証拠画像は未提出 |

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
- AT-01〜AT-12: 全端末でPASS（ユーザー最終確認）
- 画面回転、ブラウザ拡大、極細ブロックの視認性: PASS

端末別およびAT-01〜AT-12のPASSは、ユーザー本人による最終確認報告に基づく。端末型番、OS・ブラウザの詳細版、サーバーURL、ファイアウォール・VPN状態、証拠画像は報告されていないため補完していない。
