# Game #0004 IR-04指摘対応報告

- 対応日: 2026-11-19（JST）
- 対象: 正式依頼本文に記載されたIR-04
- 注意: 指定名`Game0004_Independent_Rereview_2026-11-19.md`は作業開始時にDownloads内で見つからなかったため、正式依頼本文を修正基準とした。

## 修正

1. `getShakeOffset()`がPAUSED時に`pausedFrom`を参照し、SETTLING停止前と同じ揺れオフセットを返すよう変更。
2. `getMovingRenderY()`を追加し、FALLING補間、SETTLING/JUDGINGの`targetY`、通常MOVINGのYを一元化。
3. PAUSED時は`pausedFrom`を実効フェーズとして、MISSの表示Yを`targetY`へ維持。
4. 成功したNORMAL/PERFECTの旧moving非表示、MISS演出、描画限定の揺れ、reduced-motionを維持。
5. PAUSED中は既存どおり`advanceAnimation()`を拒否し、演出時間を進めない。

## 追加テスト

- IR04-01〜07を`tests/ir04.test.mjs`へ追加。
- Nodeテスト: 69/69 PASS（既存62＋追加7）。
- Chrome: NORMAL/MISSのSETTLING停止・再開、PC/モバイル、IR-01〜03操作回帰、Runtime例外0を確認。

## 未実施

- iPhone Safari実機
- 画面回転・ブラウザ拡大
- 人間による操作感・PERFECT難易度評価

本対応はGit操作、PR、マージ、公開の承認を含まない。
