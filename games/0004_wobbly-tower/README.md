# Game #0004 ぐらぐらタワー

左右に往復するブロックをクリック、タップ、またはSpaceキーで落とし、10階を目指すタイミングゲームです。

## ローカル起動

```powershell
npm run preview
```

表示先は `http://127.0.0.1:4174` です。外部通信、外部画像、外部フォント、外部ライブラリは使用しません。

## 同一LANの実機テスト

通常起動は安全なloopback待受のままです。同じ信頼できる自宅LANから実機テストする場合だけ、Windows PCで確認したプライベートIPv4を明示します。

```powershell
node tests/preview-server.mjs --host 192.168.0.123
```

`192.168.0.123`は入力例です。実際のURLは`ipconfig`で確認したWi-FiのプライベートIPv4を使います。IPアドレスはネットワーク再接続などで変わる可能性があるため、毎回確認してください。`0.0.0.0`、公開IPv4、loopbackを`--host`へ渡すと安全のため起動を拒否します。

詳しい手順は`manual-device-test-procedure.md`、記録様式は`device-acceptance-test-record.md`を参照してください。

## 自動テスト

```powershell
npm test
```

追加のChromeブラウザチェックは、プレビューサーバーをポート4176で起動したうえで次を実行します。

```powershell
node tests/preview-server.mjs 4176
node tests/browser-check.mjs
```

## 文書

- `requirements.md`: 今回の正式実装依頼で確定したローカル実装ベースライン
- `design.md`: 実装した構成と設計判断
- `test-plan.md`: TC-001〜TC-046の最終判定
- `test-results.md`: コマンド、環境、結果、未実施範囲
- `learning-log.md`: 学習事項と設計上の注意
- `independent-review-handoff.md`: 独立レビュー担当への引継ぎ
- `review-correction-response_2026-11-19.md`: IR-01〜03の修正・再テスト回答
- `review-correction-response_ir04_2026-11-19.md`: IR-04の修正・再テスト回答
- `approval-and-scope.md`: 許可範囲と禁止操作
- `manual-device-test-procedure.md`: Windows 11と実機でのLAN受け入れテスト手順
- `device-acceptance-test-record.md`: iPhone・Android・iPad・Windows PCの結果記録様式

証拠画像はPC、390×844モバイル相当、NORMAL着地中、MISS一時停止中の4種類を保存しています。
