# Game #0004 独立レビュー引継ぎ

## レビュー対象

- 要件: `requirements.md`
- 設計: `design.md`
- 実装: `index.html`、`styles.css`、`src/*.mjs`
- テスト: `tests/*.test.mjs`、`tests/browser-check.mjs`
- 結果: `test-plan.md`、`test-results.md`
- 証拠画像: `evidence-pc.png`、`evidence-mobile-emulation.png`、`evidence-normal-settling.png`、`evidence-miss-paused.png`
- スコープ: `approval-and-scope.md`

## 実装結果

- 10階CLEAR、MISS、通常切り落とし、PERFECT吸着、コンボ、最高1,850点を実装。
- MOVING/FALLING/JUDGING/SETTLING/PAUSED/CLEAR/GAME_OVERを独立状態として実装。
- 外部通信、外部素材、外部ライブラリなし。
- ゲーム本体Nodeテスト69/69 PASS（既存62＋IR-04回帰7）。LANプレビュー回帰7件を含む最新合計は76/76 PASS。
- TC計画45/46 PASS、FAIL 0、NOT RUN 1。iPhone Safari、Android Chrome、iPad Safari、Windows Edgeの実機／実ブラウザ受け入れはユーザー報告によりPASS。

## 独立レビューIR-01〜03の対応

| ID | 対応 | 再テスト |
| --- | --- | --- |
| IR-01 | オーバーレイを毎フレーム再生成せず、状態・表示値の更新キー変更時だけ更新 | タップ4操作、マウス2操作、Tab→Space、150ms押下中DOM同一性PASS |
| IR-02 | フレーム差の0.1秒切捨てを廃止 | 60/30/10/5FPS、1秒後・多重反射後の位置一致PASS |
| IR-03 | 成功SETTLINGで旧movingを非表示、MISS演出は維持 | NORMAL/PERFECT/MISS/PAUSED自動テスト、NORMAL演出画像PASS |
| IR-04 | PAUSED中も停止前のSETTLING/FALLINGを描画上の実効フェーズとして扱う | IR04-01〜07、NORMAL/MISS停止・再開Chrome確認PASS |

## 設計との差分

- 状態機械をDOMから独立して検証するため `src/state.mjs` を追加。
- 外部依存なしのChrome確認用に `tests/browser-check.mjs` とプレビューサーバーを追加。
- 未確定だったDD-04は直接再挑戦、DD-05は演出停止・復帰後続行という基本設計の推奨案を採用。

## 特にレビューしてほしい事項

1. 極小正重なりとPERFECT境界で浮動小数点の扱いが要件どおりか。
2. 入力時刻補正、演出中連打、visibility/pagehideの停止・再開に競合がないか。
3. 10階目で11個目を生成しないこと、MISS時に加点しないこと。
4. `localStorage`の破損・権限例外時にゲーム継続できること。
5. Canvas描画上の最小幅0.45pxがモデル幅へ逆流していないこと。
6. 画面回転・ブラウザ拡大・極細ブロックの視認性、Windows Chrome手動操作が未確認であることを適切に扱っているか。
7. IR-01〜03の修正が指摘を解消し、新しい入力・描画回帰を生んでいないか。
8. IR-04で揺れ・MISS/FALLING表示Yが停止前後で維持され、モデル座標へ影響していないか。

本ファイルは独立レビュー結果ではない。実装担当Codex自身の説明資料であり、レビュー担当は別のChatGPTまたは人間とする。
