# Game #0012『時間の分身』 T2-EX-001 正式例外台帳

| 項目 | 正式記録 |
|---|---|
| 例外ID | T2-EX-001 |
| 承認状態 | `APPROVED_WITH_LIMITATIONS` |
| 承認日・承認者 | 2026年11月27日（JST）、ユーザー |
| 承認根拠 | 本会話の「T2-EX-001 限定例外正式採用・T2条件付き受入記録【ユーザー正式承認済み】」第1〜4節 |
| リポジトリ・開発ブランチ | `hosoigrit/daily-mini-games` · `codex/game-0012-development` |
| 固定Tested SHA | `85d0f42a44aebf6c464fa880194bb34c1c23c18b` |
| E1固定SHA | `85f51abd7260fc71b3abe11880269fb0c9c1b800` |
| T2総合 | `CLOSED_WITH_EXCEPTION`。下記2件の個別判定はともに `FAIL` |

## 適用範囲

本例外は固定Tested SHAにおいて、押下の終了処理が完了し、同じ `pointerId` の新しい押下が受理された後、試験ハーネスが古い押下の `pointercancel` を人工配送する下記2件に限ります。

実ブラウザが生成する通常入力、正当な `pointercancel`、容量2のFIFOと予約順序、受理済み短押し予約の保持、拒否入力の非採用、長押し継続、停止・復帰時の入力隔離、その他の全承認済みP0要件には、従来の合否条件を適用します。通常のライフサイクルを再現する合成テストとINP-25のT3再確認も従来の範囲で実施します。 [凍結詳細設計v0.4 §7・§14](https://github.com/hosoigrit/daily-mini-games/blob/85f51abd7260fc71b3abe11880269fb0c9c1b800/handoffs/game-0012/e1/01_frozen/Game0012_Detailed_Design_v0.4_DRAFT.md#L135) · [凍結テスト仕様v0.3 INP-25](https://github.com/hosoigrit/daily-mini-games/blob/85f51abd7260fc71b3abe11880269fb0c9c1b800/handoffs/game-0012/e1/01_frozen/Game0012_Test_Spec_v0.3_DRAFT.md#L188) · [INP-25実施ゲート](https://github.com/hosoigrit/daily-mini-games/blob/85f51abd7260fc71b3abe11880269fb0c9c1b800/handoffs/game-0012/e1/03_test_plans/Game0012_P0_Execution_Gates_v0.1_CANDIDATE.csv#L139)

## 保全する2件のFAIL

| ケースID・実行環境 | 入力系列 | 期待 | 実測・判定 | FAIL理由 |
|---|---|---|---|---|
| `F02-NODE-STALE-CANCEL-AFTER-REUSE` · Node v24.22.3 | 古いLEFTを解放して予約を消費。同じ `pointer:1` で新しいRIGHTを受理し長押し中に、古いLEFTの取消を呼び出す | 予約 `[2]`、長押し `[2]`、消費 `RIGHT → RIGHT` | 予約と長押しがともに `[]`、消費 `WAIT → WAIT`。**FAIL** | 取消処理が同じ入力元IDの現在押下を選び、新しい受理済み予約と長押しを消した |
| `F02-CHROMIUM-STALE-CANCEL-AFTER-REUSE` · ヘッドレスChromium 156.0.8078.79 | Stage 1で古いLEFT用の合成取消を生成し、そのLEFTを終了。同じIDで新しいRIGHTを受理後、古い取消を `dispatchEvent` で配送して2枠進める | 座標 `(2,1) → (3,1)` | 座標 `(1,1) → (1,1)`。旧通知は新しい押下より前に生成し、`isTrusted=false`。**FAIL** | DOM入力処理が同一IDの新しい押下に取消を適用し、2枠で期待した移動が発生しなかった |

両ケースの実行対象は表頭の固定Tested SHAです。R02とR03の元ログはバイト単位で同一で、SHA-256は `21c8bd48c7aa0df41ca34ca2e1b514146596e143686fc23a4036f28a71807fdd` です。旧結果の入力・期待値・実測値・判定を元ログに保持し、例外台帳とT2総合記録でも両件をFAILとして扱います。 [R02実測原本](../game-0012-t2-r02/additional-review-results.json) · [R03再判定](../game-0012-t2-r03/r02-additional-results.json) · [R04照合記録](../game-0012-t2-r04/evidence-review.json)

## 技術的根拠と保証範囲

W3C仕様では活動中のポインターIDが一意で、終了したIDの再利用が可能です。`pointerup` と `pointercancel` は各ポインターストリームの終端に関わり、captureは配送先を制御します。R03ではChromiumが生成したマウス・仮想タッチ・パンの終端や取消が次の押下より先に届きました。正当な取消、短押し予約の保持、拒否入力、停止・復帰を含む通常入力について、保証の根拠は凍結仕様の検証と固定SHAの実測範囲です。 [W3C Pointer Events Level 3](https://www.w3.org/TR/2026/REC-pointerevents3-20260630/) · [R03技術プローブ](../game-0012-t2-r03/pointer-probe-results.json) · [R03製品画面とブラウザ生成イベント](../game-0012-t2-r03/pointer-product-ua-results.json)

人工配送ではDOMの `dispatchEvent` を使って古い通知を任意の時点で同期配送できます。R03の属性衝突では古い取消と現在の取消が時刻67.5 ms、ID、対象、入力種別、capture状態、`isTrusted=false` で一致しました。内部の受付シーケンスは予約を識別しますが、到着したDOM通知の押下世代を復元する識別子は確認できません。別エンジン、OS割込み、入力変換層で同種の順序が発生する可能性は未確定です。R04は凍結仕様の通常入力の範囲を保持し、この人工配送2件だけを例外候補と判定しました。 [DOM Standard](https://dom.spec.whatwg.org/#dom-eventtarget-dispatchevent) · [R03技術プローブ](../game-0012-t2-r03/pointer-probe-results.json) · [R04独立審査](../game-0012-t2-r04/T2-EX-001-review.md)

同種の取消が通常入力へ到達した場合、正当な新規押下が効かない、短押し予約が失われる、長押しが途中停止する可能性があります。実測2件では意図しない移動の追加は発生していません。T3では受理済み入力の消失と意図しない移動の両方を確認します。 [T3引継ぎ](T3-device-QA-handoff.md)

## 例外失効と再審査

- 実際のタッチ・マウス操作で同種の入力消失、受理済み短押し予約の消失、長押しの不正終了、意図しない移動を確認した場合は、例外を再審査し、製品受入を `HOLD` に戻します。
- 入力制御コードや固定対象を変更した場合、対象ブラウザ・OSの変更で新たなリスクが確認された場合、元のFAIL証跡が欠落した場合、適用範囲の変更が必要になった場合は、既存承認の適用を止めて再審査します。適用判断に必要な根拠が不足している間は、製品受入を `HOLD` とします。
- 失効時も当時の `CLOSED_WITH_EXCEPTION` と2件の `FAIL` は履歴として保持します。後続の受入には再審査の判定が必要です。
