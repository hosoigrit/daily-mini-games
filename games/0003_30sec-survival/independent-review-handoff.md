# Game #0003 独立レビュー引継ぎ

この文書は実装担当Codexから、独立したChatGPTまたは人間のレビュー担当へ渡す情報である。実装担当自身の確認を独立レビューとは扱わない。

## レビュー対象

- 承認・権限: `approval-and-scope.md`
- 要件: `requirements.md`
- 設計: `design.md`
- テスト計画: `test-plan.md`
- 実装依頼: `implementation-request.md`
- 実装: `index.html`, `styles.css`, `src/`
- 自動テスト: `tests/`
- 実測結果: `test-results.md`
- 手動確認手順: `manual-device-test-procedure.md`
- 学習・判断記録: `learning-log.md`

## 重点レビュー観点

1. `core.js` がDOM/Canvas/localStorage/windowから分離されているか。
2. 180ステップのカウントダウン、1800ステップの生存時間、600/1200ステップの難易度境界が設計どおりか。
3. 被弾更新の次から48ステップ保護され、49ステップ目に被弾可能となるか。
4. 1.2秒境界のepsilonが採用・棄却を意図せず反転させないか。
5. 隕石の速度が生成時の宇宙船位置で固定され、追尾していないか。
6. 同一更新でライフ0と30秒が競合したときGAME_OVERを優先するか。
7. `pointerup`, `pointercancel`, `lostpointercapture`, `blur`, `visibilitychange`, `resize` で入力固着を防げるか。
8. PAUSED復帰時にフレーム時計とaccumulatorがリセットされるか。
9. localStorage不可・破損時にも起動とプレイを妨げないか。
10. 小画面・横画面・高DPIでCanvasと112px操作領域が収まり、入力方向と描画が一致するか。
11. 外部通信、外部素材、秘密情報が含まれず、既存ゲーム・shared・docsへ影響しないか。

## 実装済みShould

- FR-21: 最高星・最長生存時間のlocalStorage保存と例外フォールバック。
- FR-23: 移動方向への機体回転、無入力時は向きを維持。
- FR-25: Pointer Events共通処理によるマウスジョイスティック。

## 未実施のためレビューでPASSにしない項目

- Windows Chrome/Edgeの実操作
- Android Chrome、iPad Safari、iPhone Safari実機
- 30秒フルプレイ3回×各環境
- 回転、ブラウザズーム、DPR変更、アプリ切替の実画面確認
- 人間による難易度・公平性評価

## 公開・Git状態

- Gitコマンドは読み取りを含め未実行。
- コミット、Push、PR、マージ、`docs/` 配置、GitHub Pages公開は未実施。
- 独立レビューと人間の公開承認待ち。

## 2026-11-18 独立レビュー指摘対応後の再レビュー観点

初回独立レビューはCONDITIONAL PASS。以下は実装担当による対応であり、正式なCLOSED判定ではない。

| 指摘 | 実装担当の対応 | 再レビューでの確認事項 |
| --- | --- | --- |
| RV-002 | `visibilitychange`と`pagehide`を共通停止処理へ接続し、`pageshow`では入力・フレーム時計だけをリセット | 二重イベントで`pausedFrom`が壊れず、明示再開まで進まないか |
| RV-003 | UT-025を1秒・非境界条件へ変更し、宇宙船38単位、隕石100単位を30／60／120Hzで比較 | 許容誤差`1e-9`と期待距離が妥当か |
| RV-004 | 各上限、スキップ、消滅後再開、連続生成、中央／端、切替、seed再現性を追加 | 実配列が常に3／4／5以下か。既存360件検証も維持されているか |
| RV-005 | ステップ加算後にHUD用難易度を同期。生成は更新開始時の段階値を維持 | 600でNORMAL、1200でHARDとなり、境界生成の速度・間隔が変わっていないか |
| RV-006 | CSS変更なし | 高さ320px級の横画面は実ブラウザ確認待ち。必要なら再現条件を確定してから別途判断 |

自動テストは45/45 PASS、JavaScript構文確認は8/8 PASS。詳細は`review-correction-response_20261118.md`と`test-results.md`を参照する。

## 後続の独立再レビュー・実機報告

- RV-002〜RV-005：独立再レビューでCLOSED。
- RV-001、RV-006：Windows Chrome／Edge、iPhone Safari、Android、iPad SafariがすべてPASSとのユーザー報告に基づきCLOSED。
- Critical／Highの未解決不具合：報告なし。
- 端末型番、OS・ブラウザ詳細版、実施日時、ケース別証跡は未受領。推測で補完しない。
- 上記は品質確認結果であり、マージまたは公開許可を意味しない。
