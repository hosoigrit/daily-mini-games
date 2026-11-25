# v0.7 最終是正 — 操作許可・時計境界・型契約
## FIN-03（承認済み）
曲時刻 B、補正 o、判定時刻 b=B-o。停止処理は旧世代で発生がB以下の入力だけを受け、Performance時刻が停止要求+50000μsを超えた時点で閉じる。b以下の入力と期限を時刻順に処理して processedBefore=b+1。未到来の期限は処理しない。再開時に世代を更新して曲位置Bを維持。通常入力の下限は新世代のjudge>b、再保持モードは別。W=judgeNow-50000 が processedBefore 未満なら drainBefore を呼ばず、新規有効入力をバッファに保持する。W同値では処理領域は空、W超で通常処理へ。旧世代の遅着で未処理かつ境界内なら安全停止/復元不能ERROR、重複IDまたは境界後は無視。正式結果を巻き戻さない。停止前のCOUNTDOWNは演奏時刻を持たず初回カウントやり直し。TC-D4-028/029、D1-054/056/063を参照。

## FIN-08 操作制御
command_guard_matrix.csvは既存GameCommand 19種の許可表。command_state_crosscheck.csv は10画面×15セッション状態（NONE含む）×19種の直積。CONDITIONALは画面/状態が候補であるだけで、全追加guard成立時のみ受理。到達不能な画面状態組合せも拒否する。未掲載コマンドはERR-008。session対象の操作には現sessionId、選曲/設定/練習選択等にはnullを要求する。終端を新規READYへ戻さず別IDを生成。requestId重複は再実行しない。非同期完了はtoken照合し、長時間生成を待って停止コマンドをブロックしない。
画面の正本はAppController、セッションはGameSession、保存状態はStorageCoordinator。子画面はMUSIC_SELECT準備、PAUSE再保持、RESULT保存失敗、CALIBRATION補正。TITLE→MENU→MUSIC_SELECT/TUTORIAL/COLLECTION/SETTINGS、選曲→GAME、ゲーム→PAUSE/RESULT、RESULT→選曲/メニュー/新session、練習/収集/設定→メニュー。画面移動はAppController内部の既存画面遷移であり新ゲーム機能ではない。演奏中の画面離脱はABORT要求を経る。試聴/生成準備から離脱時はtoken無効・音声停止。補正中断は提案無効。非表示では練習/正式演奏を安全停止、補正は中止。pagehideは進行中session無効・ロック解放、pageshowは新lease/最新データ再確認。終端結果は変更不可。未解決保存があっても画面閲覧可、永続更新・正式開始は不可。排他権限がないタブは承認済みの閲覧のみとし、練習開始も禁止する安全側の解釈。未解決保存中の練習完了の永続化は禁止し、未保存を明示。これらは追加機能ではなく既存の更新制限の具体化であり、凍結前の解釈確認対象。

## FIN-15（v0.6補完型承認済み）
型宣言は原則そのまま採用。静的型チェックはゲーム動作の検証ではない。FactoryDefinitionの4機械はlane1..4各1、musicIdとfactoryId対応、全6rankの非空素材リスト、来歴と安全な相対パス必須。TutorialDefinitionはTUT-01..06各1、PPQ480、正のBPM/長さ、教材とノーツ種別整合、操作可能性を検査。設定・楽曲・譜面の実行時検証はD5規則を維持。音源の再生/停止/終了通知はplaybackId・generation・sessionId一致のみ有効。型検査・契約テスト・実機を区別。

## 未確定事項
時計初期化のタイムアウト、端末での同期精度、音源準備性能、依存版の実動作はStage Aの承認事項。仕様に反する代替動作や無断の機能追加は禁止。

セッションなし(NONE)は外部公開GameStateではREADY（sessionId=null）として表現する。NONEと実際にREADYのsessionはsessionIdで区別し、CommandResult/TransitionResultのGameState型を変更しない。

## v0.8 正式候補の補足（v0.7の記述に優先）
- 到達可能性: TITLE=NONE、MENU/MUSIC_SELECT/TUTORIAL/COLLECTION/SETTINGS/CALIBRATION=NONEまたは終了済み、GAME=READY/INITIALIZING/COUNTDOWN/PREROLL/PLAYING/PAUSING/RESUMING/FINALIZING、PAUSE=PAUSING/PAUSED/REHOLD_WAIT/RESUMING、RESULT=CLEAR/FAILEDのみ。組合せ表のreachable=YESは必要条件であり十分条件ではない。画面の正本AppControllerとセッションの正本GameSessionの両方を確認する。終了済み旧sessionを新規操作の正本として扱わない。
- mode=FORMAL/PRACTICEは内部のセッション分類。練習は同じ時計・判定・状態を利用するがlife0を理由にFAILEDへ移行しない。教材完了は内部CLEAR、UIはPRACTICE COMPLETE、IF-11はnull、正式/参考の成績・製品・解放・称号なし。完了済み練習の再挑戦は新ID。既存練習進捗のみ保存可。新しい機能ではなく既存練習終了の表現を確定する。練習中断はABORTED、未完了登録なし。
- 画面離脱で既存未解決結果を破棄しない。RESULTから選曲/メニューの閲覧可、未解決結果への復帰経路を表示。設定/初期化/次回正式開始/練習進捗書込は制限。明示破棄は現在のSAVE_ERRORと照合し、保存確認不能なら制限維持。結果の上書きなし。
- 非所有タブは閲覧専用。解放済み楽曲の非永続試聴は選曲機能として許可し、正式開始・練習・補正計測・設定書込・初期化は拒否する解釈を採用。未解決保存中でも所有タブの練習/計測は非永続操作として許可し、進捗書込/補正適用は拒否する。v0.7の安全側解釈を明文化したもの。ユーザー承認候補。
- START_GAME: MUSIC_SELECTでは新規開始（sessionId=null）、GAMEのREADYまたは再操作待ちINITIALIZINGでは同sessionIdで再試行。二重予約不可。通常のINITIALIZINGでは再試行拒否。選曲画面を離れた古い準備結果は破棄。音声再開拒否時は予約を解除しPAUSEDへ、安全な場合のみ再保持/再試行。復元不能ERROR。
- PAUSING中のABORT要求は境界整理完了まで保留。既成立FAILEDを優先し、そうでなければABORTED。停止処理が安全に確定不能ならERROR。終端後の同一コマンド再実行禁止。
- 初回COUNTDOWN中の停止は演奏開始前であるため音声開始を取り消す。再開は既存D1-051通り再開準備の後に初回COUNTDOWNを再実行。初回カウントのUI時間は3秒を基準候補とし、追加承認なしに判定条件へ影響させない。
- 補正計測の中央値/MADは整数μsの標本から半μs・四分の一μsが生じ得る。統計値だけはStatisticalUs（有限の分数を許容）を使用、判定時計は整数Usのまま。丸め前の中央値/MADで妥当性を判定、最終提案を5ms刻み・正負対称に丸める。型の整合性補正でゲームルールは不変。

