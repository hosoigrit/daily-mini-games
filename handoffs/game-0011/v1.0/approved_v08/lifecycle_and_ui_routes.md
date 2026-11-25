# 非セッション画面・ライフサイクルの操作補足
画面経路（既存SCR、ユーザー操作のみ）: TITLE→MENU、MENU→MUSIC_SELECT/TUTORIAL/COLLECTION/SETTINGS、各サブ画面→MENU。MUSIC_SELECT→GAMEはSTART_GAME、GAME→PAUSEは停止処理完了、PAUSE→GAMEは再開完了、GAME→RESULTはCLEAR/FAILED封印、RESULT→MENU/MUSIC_SELECTは閲覧遷移、RESULT→GAMEはRETRY条件成立。SETTINGS→CALIBRATIONはSTART_CALIBRATION、戻る操作はSTOP_CALIBRATION。PAUSEから選曲へ戻る場合はABORTを先に実行。保存エラーのRESULT離脱は未保存警告と明示的な処理、確認不能状態の更新制限を維持。画面にいない旧非同期結果は破棄する。

|通知|演奏中・COUNTDOWN/PREROLL/FINALIZING|PAUSING/PAUSED/REHOLD_WAIT/RESUMING|非セッション・終端|
|---|---|---|---|
|HIDDEN/BLUR|PAUSING|PAUSING維持、PAUSED維持、再保持/再開はPAUSEDへ|試聴停止、補正中止、終了結果不変|
|VISIBLE|権限と時計を確認、異常時停止|自動再開しない、権限・時計再確認|最新状態確認|
|AUDIO_INTERRUPTED/POINTER_CANCEL|安全停止、cancelは通常UPでない|再保持/再開取消、安全停止|古い通知は無視、試聴/補正停止|
|RESIZE|一時停止し再レイアウト|停止維持・再レイアウト|表示再計算のみ|
|LOCK_LOST|安全停止・更新不可、復元不能ERROR|更新不可、復旧しなければERROR|閲覧モード、保存要求拒否、封印結果不変|
|PAGEHIDE|中断・旧session無効・ロック解放開始|同左|旧権限無効・保存済み結果維持、未保存喪失リスク|
|PAGESHOW|新lease・最新保存再確認、旧session復活禁止|同左|同左|
INITIALIZINGは中断時に開始予約無効化し準備状態へ戻るかERROR、COUNTDOWNへ勝手に進めない。READYは音声予約なし。全通知はsessionId/generation一致を確認し、アプリ全体の通知のみnullを許す。ページ終了時の保存/イベント発生は保証しない。旧通知で終端を変更しない。

## v0.8 経路・状態対応
画面/状態の到達可能性はcommand_state_crosscheck.csv（reachable列）に従う。練習中の中断/再保持は正式プレイと同じ仕組み、練習終了時は内部CLEARでも正式FinalResultなし。準備中断時は旧音声/生成の要求世代を無効化し、READYへ戻すか復旧不能ERROR。再開音声許可拒否はPAUSED、再開カウントを勝手に進めない。非所有タブの試聴・練習・補正の範囲、未保存結果からの閲覧復帰経路はoperation_and_boundary_rules.md v0.8を優先。

