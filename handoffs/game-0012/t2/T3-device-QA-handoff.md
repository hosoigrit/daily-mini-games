# Game #0012『時間の分身』 T3実機QA引継ぎ

T3は **`NOT_RUN`** です。別途ユーザーが開始を承認した後に、固定Tested SHA `85d0f42a44aebf6c464fa880194bb34c1c23c18b` を使い、指定5環境で全6ステージの実操作とクリアを確認します。T2-EX-001は既存の実機QA項目を免除しません。 [条件付き受入記録](T2-conditional-acceptance.md) · [例外台帳](T2-EX-001-exception-register.md)

## 5環境でのステージ確認

各セルは操作・クリア結果の記録欄です。全30セルを実機で確認し、環境ごとにスクリーンショットまたは録画と対応する実測ログを参照できるようにします。

| 指定環境 | Stage 1 | Stage 2 | Stage 3 | Stage 4 | Stage 5 | Stage 6 |
|---|---|---|---|---|---|---|
| Galaxy S26 / Android Chrome | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| iPhone SE2 / Safari | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| iPad mini 6 / Safari | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| Windows 11 / Chrome | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| Windows 11 / Edge | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |

各ステージで、実入力の受付、記録・巻き戻し・再生、該当する仕掛け、ゴール到達、クリア表示を実測します。既存のT3実施項目と承認済みの攻略・期待値を適用します。初回検証値は操作周期500 ms、FIFO容量2、単発遅延1000 ms、累積遅延750 msを使用し、操作感の判定は実機結果で行います。 [凍結テスト仕様](https://github.com/hosoigrit/daily-mini-games/blob/85f51abd7260fc71b3abe11880269fb0c9c1b800/handoffs/game-0012/e1/01_frozen/Game0012_Test_Spec_v0.3_DRAFT.md) · [承認済みT0-08実施ゲート追補](https://github.com/hosoigrit/daily-mini-games/blob/85f51abd7260fc71b3abe11880269fb0c9c1b800/handoffs/game-0012/e1/04_approval/Game0012_T0_08_Execution_Gate_Addendum_20261126_APPROVED.md)

## 重点操作と観測

| 項目 | 実機操作 | 確認する結果 |
|---|---|---|
| 短押しとFIFO | 実タッチまたは実マウスで同方向・異方向を連続短押しし、枠前に解放する | 受理済み予約が解放後も保持され、1枠最大1入力で受理順に消費される |
| キュー満杯と拒否 | 2件の予約で満杯にし、3件目を押下する。正当な取消も発生した場合はイベント順を記録する | 過去の受理済み予約が残り、拒否された方向への移動が生じない |
| 長押しとID再利用 | 長押しを複数枠続けて解放し、同じボタンと別ボタンを連続で押す。ID、終端と次の押下の順を記録する | 長押しが契約どおり継続・終了し、再利用後の新しい受理済み入力を失わない |
| 正当な取消とタッチ中断 | 操作中のスクロール、OSによる中断、マウスでのドラッグやウィンドウ切替など、端末で可能な操作を行う | 実際に届いた `pointercancel` が対応する押下を終了する。`pointerup`、`blur`、capture解除は区別して記録する |
| 停止・復帰・画面回転 | 押下中の一時停止、非表示化、フェーズ変更、対応実機での画面回転を確認し、明示再開する | 停止中に枠や座標が進まず、旧入力が隔離され、復帰後は新しい押下だけ受理する |
| 受理済み入力の消失・意図しない移動 | 上記すべてで座標列と論理枠を照合する | 正当な新規入力が失われず、拒否・旧通知・停止操作による予定外の移動が生じない |

実機で `pointerId` の再利用や `pointercancel` を発生させられなかった場合は「未観測」とし、試した操作と観測できた終端イベントを記録します。端末で操作自体を実施できない場合も理由を明記します。合成イベントの結果を実機での観測として記録することはできません。INP-25のほか、承認済みのT3再確認対象、復旧案内UI-17、保存復旧UI-18を引き続き実施します。 [P0実施ゲート](https://github.com/hosoigrit/daily-mini-games/blob/85f51abd7260fc71b3abe11880269fb0c9c1b800/handoffs/game-0012/e1/03_test_plans/Game0012_P0_Execution_Gates_v0.1_CANDIDATE.csv#L139)

## 証跡と判定の引継ぎ

環境ごとに対象SHA、実機名、OS・ブラウザ版、入力機器、画面向き、日時、担当者、ステージ、操作・期待・実測・判定を記録します。取消の前後は、取得可能な範囲でイベント種別、受信順、`pointerId`、`pointerType`、時刻、対象要素、capture状態、`isTrusted`、論理枠と座標を録画と対応づけます。

実入力で同種の入力消失、受理済み短押し予約の消失、長押しの不正終了、または意図しない移動を確認した場合は、環境と再現条件を保全し、製品受入を `HOLD` に戻してT2-EX-001を再審査します。入力制御・対象ブラウザやOS、元のFAIL証跡、例外範囲に変更がある場合も台帳の再審査条件を適用します。実機QAの開始、T4、最終受入、公開にはそれぞれの承認が必要です。 [例外台帳の失効条件](T2-EX-001-exception-register.md#例外失効と再審査)
