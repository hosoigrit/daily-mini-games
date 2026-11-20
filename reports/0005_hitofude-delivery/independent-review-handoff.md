# Game #0005『ひとふで配達』独立レビュー引継ぎ

> この初回引継ぎは独立レビュー実施前の記録である。IR-0005-01〜05修正後の再レビューには`independent-rereview-handoff.md`を使用すること。

> この文書は実装担当Codexが作成した引継ぎであり、独立レビューそのものではない。実装担当とは別のChatGPTまたは人間が評価すること。

## 文書情報

| 項目 | 内容 |
| --- | --- |
| 作成日 | 2026-11-19（JST） |
| 実装担当 | Codex |
| レビュー状態 | 未実施／独立レビュー待ち |
| 対象 | 未コミットの`games/0005_hitofude-delivery/`と`reports/0005_hitofude-delivery/` |
| 総合テスト判定 | HOLD（50 PASS / 0 FAIL / 0 BLOCKED / 6 NOT RUN） |

## 1. レビュー基準

- `games/0005_hitofude-delivery/approval-and-scope.md`
- `games/0005_hitofude-delivery/requirements.md`
- `games/0005_hitofude-delivery/design.md`
- `games/0005_hitofude-delivery/test-plan.md`
- 入力原文4文書のSHA-256は`approval-and-scope.md`に記録。

## 2. 変更ファイル

### ゲーム領域

- `index.html`, `styles.css`, `package.json`
- `src/stages.js`
- `src/game-core.js`
- `src/hint-solver.js`
- `src/input.js`
- `src/storage.js`
- `src/main.js`
- `tests/stages.test.mjs`
- `tests/game-core.test.mjs`
- `tests/scoring.test.mjs`
- `tests/hint-solver.test.mjs`
- `tests/input.test.mjs`
- `tests/storage.test.mjs`
- `tests/distribution.test.mjs`
- `tests/hint-performance.mjs`
- `tests/preview-server.mjs`
- `tests/browser-check.mjs`
- `README.md`
- `approval-and-scope.md`
- `requirements.md`
- `design.md`
- `test-plan.md`
- `learning-log.md`
- `manual-device-test-procedure.md`

### レポート領域

- `test-results.md`
- `learning-log.md`
- `independent-review-handoff.md`
- `chrome-stage-select-390x844.png`
- `chrome-play-390x844.png`
- `chrome-result-390x844.png`

Game #0001〜#0004、`shared/`、`docs/`、ルート設定は変更していない。

## 3. 実装範囲

- 基本設計第8章どおりの固定6面。
- 4近傍移動、再訪問禁止、直前への戻り、荷物巻き戻し、早期ゴール拒否。
- 得点、星、PERFECT／EXCELLENT／GOOD／CLEAR。
- 現在経路から解を探す1マスヒント、2回上限、3状態、古い結果・二重消費防止。
- Pointer Events共通入力、高速直線の中間セル処理、複数Pointer・中断処理。
- 4画面、順次解放、自己ベスト、総合ベスト、保存例外フォールバック。
- 320px幅からPCまでのレスポンシブ表示。

## 4. テスト証跡

- ケース別結果: `test-results.md`
- Node: 43/43 PASS。
- Chrome E2E: UI-01〜05 PASS。390×844、320×568、1280×720。実行時例外0、外部通信0。
- ヒント予備測定: 300/300 FOUND、UNAVAILABLE 0、最大145ノード、最終測定最大26.673ms（中央値最大0.225ms）。
- 既存ゲーム回帰: #0001 30/30、#0002 36/36、#0003 45/45、#0004 76/76。
- 画像証跡3点はこのディレクトリ内。

## 5. 重点レビュー観点

1. **ヒントの独立性**: `solveHint`のFOUNDが本当に完走可能か、別実装または手計算で再確認する。特にステージ5・6と模範経路外。
2. **ヒント競合**: `inputRevision`が経路変更と成功ヒントで増え、古い結果・重複結果を課金しないこと。
3. **入力補間**: 高速な同一行・列移動は中間セルを通り、斜めイベントは任意の曲がり方へ変換されないこと。
4. **クリア不変性**: クリア後の追加入力で状態・得点・保存を変えないこと。GC-10は初回テストで内部メッセージ差異を検出し修正済み。
5. **保存整合性**: 破損値から不正解放せず、低得点でベストを悪化させず、他ゲームのキーへ触れないこと。
6. **アクセシビリティ**: 記号と文字を併用し、キーボードでセルボタンと主要ボタンを操作できること。読み上げ順とフォーカスは人間確認が望ましい。
7. **端末リスク**: iPhone SafariのPointer Events、ツールバー、ホームインジケーター、縦横回転は未確認。
8. **素材**: 外部画像・音声・フォントなし。Unicode絵文字とCSSのみ。外部ライセンス素材なし。

## 6. 既知の問題・未確認

- FAIL／BLOCKEDとして残るケースはない。
- IN-07とBR-01〜05はNOT RUN。特にiPhone Safariは公開前必須。
- ヒント性能の正式な数値受入基準は原仕様で未確定。PC Nodeの予備値を実機PASSへ流用しない。
- 人間による6面の難易度・楽しさ・文言の確認は未実施。
- 独立レビュー、人間の公開承認、Git操作、PR、マージ、Pages公開は未実施。

## 7. 独立レビュー担当への推奨手順

1. 入力文書ハッシュと`approval-and-scope.md`を照合する。
2. `npm test`と`node tests/hint-performance.mjs`を独立に再実行する。
3. `npm run browser-check`を再実行し、画像だけでなくDOM値と実行時例外も確認する。
4. `test-results.md`の56 IDとテスト計画の56 IDが一対一であることを照合する。
5. 別の参照探索または手動経路で6面とヒントを再確認する。
6. 人間の実機担当へ`manual-device-test-procedure.md`を渡し、NOT RUN 6件を埋める。
7. 公開可否は独立レビューと実機結果が揃うまでHOLDとする。

