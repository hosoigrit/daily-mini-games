# Game #0004 独立レビュー指摘対応報告

- 対応日: 2026-11-19（JST）
- 対象レビュー: `Game0004_Independent_Review_2026-11-19.md`
- 作業範囲: Game #0004専用ディレクトリ内の修正・再テスト・再レビュー成果物

## 対応一覧

### IR-01（P1）対応済み

- `syncUi()`から毎フレームの無条件`renderOverlay()`を除去。
- `overlayKeyFor()`でTITLE、PAUSED、CLEAR/GAME_OVERの必要表示値をキー化し、キーが変わったときだけDOMを更新。
- 実Chromeでタップ開始・一時停止・再開・再挑戦、マウス開始・一時停止、Tab→Space再開を確認。
- 各ボタンを150ms押した状態で同一DOMが接続されたままであることを確認。

### IR-02（P1）対応済み

- フレーム差の`Math.min(0.1, ...)`を廃止し、`elapsedSecondsBetween()`で非負の実経過時間を全量加算。
- 60/30/10/5FPS相当の1秒後、および9秒後の多重反射で位置一致。
- 非表示・一時停止時の時計リセットと明示再開は維持。

### IR-03（P2）対応済み

- `shouldDrawMovingBlock()`を追加。
- NORMAL/PERFECT成功後のSETTLINGでは、確定済み`placed`だけを描画。
- MISSでは失敗演出用の`moving`を維持。
- 揺れは従来どおり描画オフセットだけで、モデル座標を変更しない。

## テスト結果

- Nodeテスト: 62/62 PASS（既存53＋追加9）
- Chromeブラウザチェック: PASS
- Runtime例外: 0
- TC-001〜046: 44 PASS / 0 FAIL / 0 BLOCKED / 2 NOT RUN

## 継続するNOT RUN

- TC-042: iPhone Safari実機
- TC-045: 画面回転・拡大・人間による体感確認
- 人間によるPCフルプレイとPERFECT難易度評価

本対応は公開承認、Git操作、PR、マージ、公開を含まない。
