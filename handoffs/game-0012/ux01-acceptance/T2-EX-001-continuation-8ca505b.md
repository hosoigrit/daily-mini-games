# Game #0012『時間の分身』 T2-EX-001 新SHA継続適用記録

| 項目 | 正式記録 |
|---|---|
| 例外ID・承認状態 | T2-EX-001 · `APPROVED_WITH_LIMITATIONS` |
| 承認日・承認者 | 2026年11月27日（JST）、ユーザー |
| 承認根拠 | 本会話の「CR-0012-UX01 独立品質受入・T2-EX-001新SHA継続適用【ユーザー正式承認済み】」第1・4・5節 |
| 新固定Tested SHA | `8ca505baf28798e6e86dee201a47ba7766b7672f` |
| 旧固定Tested SHA | `85d0f42a44aebf6c464fa880194bb34c1c23c18b` |
| 旧T2正式記録のSHA | `7d323a5b87a3729fc405ab0ce1c38e00a1d7595a` |
| 新SHA品質受入 | `ACCEPTED_WITH_EXCEPTION` |

## 適用範囲

終了処理済みの押下の古い `pointercancel` を、同じ `pointerId` の新規押下を受理した後に試験ハーネスが人工配送する、下記2件だけに適用します。旧SHAの正式例外台帳とT2総合 `CLOSED_WITH_EXCEPTION` はそのまま保全します。 [旧例外台帳](https://github.com/hosoigrit/daily-mini-games/blob/7d323a5b87a3729fc405ab0ce1c38e00a1d7595a/handoffs/game-0012/t2/T2-EX-001-exception-register.md)

通常入力、正当な取消、容量2のFIFO・予約順序、受理済み短押し予約の保持、長押し、停止・復帰、入力隔離には、凍結仕様の従来の合否条件を適用します。新SHAの独立レビューではInputQueue実装のバイト不変を確認し、Chromiumが生成したガイド中の解放・取消から明示再開後の新規入力を検証しました。実機・他ブラウザでの確認はT3に引き継ぎます。 [独立プローブ](../game-0012-ux01-independent-review/independent-guide-probes.json) · [凍結テスト仕様 INP-25](https://github.com/hosoigrit/daily-mini-games/blob/85f51abd7260fc71b3abe11880269fb0c9c1b800/handoffs/game-0012/e1/01_frozen/Game0012_Test_Spec_v0.3_DRAFT.md#L188)

## 保全する2件のFAIL

| ケース・実行環境 | 入力系列 | 期待 | 実測・判定 |
|---|---|---|---|
| `F02-NODE-STALE-CANCEL-AFTER-REUSE` · Node v24.22.3 | 古いLEFTを解放・消費。同じ `pointer:1` で新しいRIGHTを受理した後、旧LEFTの取消を呼び出す | 予約・長押しは各 `[2]`、`RIGHT → RIGHT` | 予約・長押しは各 `[]`、`WAIT → WAIT`。**FAIL** |
| `F02-CHROMIUM-STALE-CANCEL-AFTER-REUSE` · ヘッドレスChromium 156.0.8078.79 | Stage 1で旧LEFTの合成取消を生成し、旧押下を終了。同じIDで新しいRIGHTを受理後、旧取消を人工配送して2枠進める | `(2,1) → (3,1)` | `(1,1) → (1,1)`。**FAIL** |

R02・R03の旧SHA結果ファイルは実バイトで同一で、SHA-256は `21c8bd48c7aa0df41ca34ca2e1b514146596e143686fc23a4036f28a71807fdd` です。新SHAの独立再実行では17件すべての結果行が一致し、新SHAの実測は別ファイルに保持しています。そのSHA-256は `be5db8f4ea52c6e1c60d526cc118757b4a92f2412c2a8cc2413747f3d61bd3bf` です。例外付き受入の総合状態と、個別2件のFAILをそれぞれ保持します。 [旧R02元ログ](../game-0012-t2-r02/additional-review-results.json) · [旧R03結果](../game-0012-t2-r03/r02-additional-results.json) · [新SHA再実測](../game-0012-ux01-independent-review/t2-r02-replay-results.json)

## 再審査と製品受入のHOLD

以下のいずれかに該当した場合、T2-EX-001の新SHAへの適用を再審査し、製品受入を `HOLD` に戻します。

- 実機で受理済み入力が失われた、または短押し予約が欠落した。
- 長押しが不正に終了した。
- 意図しない移動または入力の誤解除が発生した。
- 入力制御に関係する製品コードが変更された。
- 対象OS・ブラウザで新たな入力リスクが確認された。
- 旧FAILの証跡が欠落した。
- 例外の適用範囲を拡大する必要が生じた。

再審査では対象SHA、環境、再現操作、期待・実測、録画や入力トレースを保全します。旧例外台帳と両FAILは履歴として保持します。 [T3引継ぎ追補](T3-device-QA-handoff-addendum-8ca505b.md)
