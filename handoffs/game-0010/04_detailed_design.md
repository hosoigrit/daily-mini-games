> Game #0010 / 詳細設計 v1.0 FROZEN / Phase 3 CLOSED（設計のみ） / 2026-11-25 JST
> 正式凍結承認: DESIGN-FREEZE-GAME-0010-20261125-01（設計承認記録の識別子であり実行grantではない）。現行状態は12/13のv1.0節、15/18の凍結メタデータを参照。RC9の設計・判定契約をそのまま固定する。以下の過去版のHOLD・未承認・候補等の状態記述は履歴であり、v1.0の承認状態に優先しない。ただし個別の未定義oracle・観測不能・予算不足等の停止条件は有効。Phase 4以降未許可、全実行権限なし。

# D1〜D8 統合詳細設計・D9 v0.3
## D1 物理
960×720論理、40×30区画、24単位、100単位/m、x=.24gx, y=7.2-.24gy, θp=−θdegπ/180。60Hz game tick、PP01(1 substep,8/3)、PP02(1,12/8)、PP03(2,8/3)、順次評価し初めて品質基準と性能を満たすものを採用。最大5tick/frame、余剰整数tick破棄、端数保持、250ms以上の停止・背景・回転は自動PAUSED、明示再開時に蓄積初期化。固定更新数だけ時間加算。Planck.js 1.5.1候補固定、正規配布物・MIT・SHA確認は未実施。動的sleep無効候補。球r=.20m、m=.20kg（.15〜.30、刻み.05）、密度=m/(πr²)、初速/角速0、bullet、回転有効。g=(0,−9.8)、大きさ8.8〜10.8刻み.2。並進減衰.04（0〜.08、.02）、角減衰.05（0〜.10、.025）。速度ノルム12、角速60上限、並進30超・非有限は先にERROR。全物体静止貫通.01、高速.06、板支点.02、角度超過2°、往復・同一環境誤差1e−6各単位。未確定の異常位置飛びのoracleはHOLD。
| 材質 | 摩擦 初期/範囲 | 反発 初期/範囲 |
|---|---|---|
| 球 | .35/.25〜.45 | .05/0〜.10 |
| 坂道 | .30/.20〜.40 | .05/0〜.10 |
| 足場 | .50/.40〜.60 | .05/0〜.10 |
| バネ | .30/.20〜.40 | 0固定 |
| 板 | .40/.30〜.50 | .05/0〜.10 |
| 障害物 | .45/.35〜.55 | .05/0〜.10 |
| ゴール | .70/.60〜.85 | 0固定 |
摩擦・反発刻み.05、実効摩擦幾何平均・反発最大（実際の版で確認）。固定障害物等→固定パーツ→自由配置→joint→球の順、種類・数値座標・角度の正規キーで順序固定。ランダムIDや操作順を物理優先度に使用しない。
1 tick：状態確認→停止/中止受付→有限検証・速度制限→接触収集→物理更新→有限・拘束検証→接触正規化→バネ選定/作動（更新外）→異常再確認→必須使用→tick加算→終端→軌跡→演出。内部サブステップ各時点も観測。接触オブジェクト参照を保持せず値をコピー。E1/E3で必要な証跡取得能力を実証。
## D2 配置・4パーツ
| 種類 | 長さ×厚さm | 角度 | 物理 |
|---|---|---|---|
| R | 1.68×.16 | −60〜60、15刻み | Static |
| P | 1.20×.16 | 0 | Static |
| B | .72×.24 | −45〜45、15刻み | Static |
| S | 1.92×.16 | 配置0、実験±30 | Dynamic板＋Static支点、RevoluteJoint |
整数グリッド、吸着 floor(x/24+.5)、角度wrapなし、境界接触可、内部重複拒否（配置誤差1e−6m）。AABB→SAT、円矩形最近接点、共通合法性で全形状/在庫/固定/初期球/ゴール/予約領域を検証。板の予約領域：角度−32,-30,-25,…,30,32の15矩形、各辺外側.065m拡張。中心支点、モーターなし、質量比1.5（1〜2.5刻み.5）、角減衰1.2（.6〜2.0刻み.2）、自動水平復帰なし。支点Fixtureなし。再実験で水平・角速0。
バネ：上面実接触、法線差≤30°、接触点の面距離≤.025、衝突前接近≥.40m/s。n=(sinθ,cosθ)、v=Vn、初期V=9.5、8〜10刻み.5、角速維持し上限適用。固定更新終了時に作動面外側・外周距離≤.25、他物体から球への法線との内積≤−.5の継続接触で抑止、離脱後の有効阻害衝突でも無効化。候補集約は接近速度と法線一致度を.001整数化、降順、最後に正規キー昇順、1tick最大1回。READY→CONTACT→WAIT_RELEASE（不作動・非選択も）、全substep無接触・距離≥.04mが2完全tick連続でREADY。物理イベント順の観測詳細・障害衝突閾値は未確定ならHOLD。
編集：IDLE/NEW_PART/SELECTED/DRAGGING/CONFIRMING。新規仮回転可、ドラッグ途中は仮状態、終端合法時のみ確定。無効・中断は元状態、在庫は定義−配置から導出。Undo50、有効変更のみ1件、ベスト読込は確認後1Undo、リセットは履歴/軌跡消去・進捗維持。選択は単一状態。
## D3 ゲームルール
ゴール底面中央ローカル：底(0,−.08)幅1.52高さ.16、左右壁(±.68,.36)幅.16高さ.72。保護領域X±.76,Y−.16〜.80。内領域X±.61,Y−.01〜.72（左右底の静止誤差.01）、球中心X±.41,Y.19〜.52、比較誤差1e−6。v≤.15、初回安定観測後30完全tick連続、substep観測違反でリセット。固定閾値は調整禁止。20秒=1200tick。場外は中心 x<−.20 または x>9.80、y<−.20 または y>7.40、角でも一辺条件、境界は継続、複数方向は下・上・左・右順。終端優先 ERROR > 安定かつ必須達成CLEAR > 安定かつ必須未達FL006 > 場外FL001〜004 > 時間切れFL005 > 継続。ABORTは正常終了でない。実験IDごと1回確定。
必須：ST01自由坂道上面、法線30°以内、3tick以上、下方向正味.24m（水平は左右絶対値）、ST02は非水平。微小切れ1tick≤.005mのみ区間維持・非接触移動加算なし。足場上面接近≥.20、同一衝突Jup/m≥.10、法線30°以内。バネ正常作動。板上面・支点距離≥.12・荷重方向5°以上・同一区間、因果証跡。固定物は対象外、達成flagはrun内保持。ST05/07〜10自由。
星：正常クリアでN≤Tなら3、N=T+1なら2、それ以上1、未クリア0。開始時の全自由配置数、未使用も含む。ベストは同互換性で少数更新、同数維持。歴代実績保護。軌跡0,6,12…tickと終点（重複なし）最大201、直近正常終了のみ、編集後も旧と表示、中止/ERROR維持、リセット/移動/再読込消去、永続なし。ヒント3段階・減点なし・自動配置なし・レベル3は検証済み一部（1個攻略例外）。
## D4 ステージ（全候補物理未検証）
左下グリッド(u,v)、物理(.24u,.24v)、保存(gx=u,gy=30−v)。R/P/B/Sは上記種類、W中心・幅高はグリッド単位、Gは底面上端中央。初期自由配置0。固定物・球は指定小数可。

| ST | 球 | G | 固定 | SOL-A | SOL-B | 在庫R/P/B/S | 星3 | 必須 |
|---|---|---|---|---|---|---|---|---|
| 01 はじめての発明 | (3, 28.5) | (19, 12) | [('R', 5, 26, 15)] | [('R', 11, 21, 30)] | — | (1, 0, 0, 0) | 1 | 坂道 |
| 02 傾きのひみつ | (36, 28.5) | (21, 11) | [('R', 34, 26, -15), ('W', 35, 17, 4, 2)] | [('R', 28, 21, -45)] | — | (2, 0, 0, 0) | 1 | 傾斜坂道 |
| 03 落とさないで！ | (4, 28.5) | (25, 10) | [('R', 6, 26, 15)] | [('P', 12, 21), ('R', 18, 19, 30)] | — | (2, 2, 0, 0) | 2 | 足場 |
| 04 大きな谷を越えて | (6, 11) | (21, 16) | [('W', 13, 7, 2, 14)] | [('B', 6, 5, 15)] | [('R', 6, 9, -30), ('B', 3, 4, 30)] | (2, 1, 1, 0) | 2 | バネ |
| 05 空まで届け | (8, 10) | (32, 14) | [('W', 19, 7, 2, 14)] | [('B', 8, 5, 30)] | [('R', 10, 7, 15), ('B', 15, 4, 15)] | (3, 2, 2, 0) | 3 | なし |
| 06 てこの原理 | (13, 26) | (25, 9) | [('W', 5, 11, 4, 2)] | [('S', 11, 21), ('R', 19, 15, 30)] | [('S', 11, 21), ('P', 17, 16), ('R', 23, 15, 30)] | (2, 2, 0, 1) | 3 | シーソー |
| 07 ぐるっと回り道 | (6, 27) | (34, 9) | [('W', 20, 6, 2, 12)] | [('R', 8, 23, 15), ('R', 15, 20, 15), ('R', 22, 17, 15), ('P', 29, 13)] | [('B', 5, 4, 45)] | (3, 2, 1, 1) | 4 | なし |
| 08 ジャンプ・リレー | (5, 8) | (16, 21) | [('W', 18, 5, 2, 10)] | [('B', 5, 3, 30), ('B', 31, 10, -15)] | [('B', 5, 3, 30), ('B', 31, 10, -15), ('R', 23, 26, -30)] | (3, 2, 3, 1) | 5 | なし |
| 09 からくり連鎖 | (13, 27) | (32, 17) | [('W', 22, 5, 2, 10)] | [('S', 11, 22), ('B', 17, 9, 15)] | [('R', 13, 23, 30), ('P', 18, 16), ('B', 18, 8, 15)] | (4, 3, 2, 2) | 6 | なし |
| 10 最後の大発明 | (6, 26) | (32, 17) | [('W', 17, 25, 2, 10), ('W', 24, 6, 2, 12)] | [('R', 8, 22, 30), ('S', 13, 15), ('B', 17, 7, 15)] | [('R', 8, 22, 30), ('P', 13, 15), ('R', 18, 12, -30), ('B', 14, 7, 15), ('R', 27, 24, 30)] | (4, 4, 3, 2) | 7 | なし |
独立補助計算：Shapely回転矩形、球256分割近似、予約15矩形union、内部交差面積>1e−9m²、盤面許容1e−6m。正式SATテストの代替ではない。

| ST | 初期構造 | A合法/生成 | B合法/生成 |
|---|---|---|---|
| 1 | 適合 | 6/6 | — |
| 2 | 適合 | 6/6 | — |
| 3 | 適合 | 8/10 | — |
| 4 | 適合 | 6/6 | 11/12 |
| 5 | 適合 | 6/6 | 12/12 |
| 6 | 適合 | 9/10 | 10/14 |
| 7 | 適合 | 21/22 | 5/5 |
| 8 | 適合 | 12/12 | 17/18 |
| 9 | 適合 | 10/10 | 16/16 |
| 10 | 適合 | 16/16 | 28/28 |
全候補17件の内部重複は検出されず。物理実証0件。基準攻略10件、追加7件、100回×10、ヒント30、初期0パーツ全不クリア、近傍序盤L≥4、S≥2、100S≥50L、以降L≥10、S≥2、100S≥20L。総星3目標34→近傍生成最大204。候補A/Bは認定ではない。ST04〜06はB優先。使用されない部品で水増し不可。定義調整は初期基準±2、障害物寸法±1、在庫±1（ゼロ種類追加不可、必須削除不可、ST01固定、総13以内）、その他は16参照。共通設定E5固定後変更禁止。星3閾値は別承認。検索は決定的局所＋ビーム20、候補正規キー重複排除、成功判定は本番ルール。探索/正式検証予算分離。時間1080tick超は追加レビュー、プレイヤーの合法クリアは20秒まで。
## D5〜D8
保存は06、UIは05、評価は07/08/18、運用は09/14/15/19/20参照。各正規情報源の矛盾はHOLD。
## 詳細設計ID索引
| ID | 責務/契約名 |
|---|---|
| DD-D1-001 | createWorld |
| DD-D1-002 | createBall |
| DD-D1-003 | createStaticBody |
| DD-D1-004 | createDynamicBody |
| DD-D1-005 | createRevoluteJoint |
| DD-D1-006 | advancePhysicsTick |
| DD-D1-007 | collectContactEvidence |
| DD-D1-008 | getPhysicsSnapshot |
| DD-D1-009 | validatePhysicsState |
| DD-D1-010 | applyVelocityLimit |
| DD-D1-011 | disposeWorld |
| DD-D1-012 | transformCoordinates |
| DD-D1-013 | canonicalizePlacements |
| DD-D1-014 | getDiagnostics |
| DD-D2-001 | getPartDefinition |
| DD-D2-002 | snapToGrid |
| DD-D2-003 | validateAngle |
| DD-D2-004 | getOrientedRectangle |
| DD-D2-005 | intersectRectangles |
| DD-D2-006 | intersectCircleRectangle |
| DD-D2-007 | getSweptEnvelope |
| DD-D2-008 | validatePlacement |
| DD-D2-009 | applyEditCommand |
| DD-D2-010 | calculateInventory |
| DD-D2-011 | pushUndoSnapshot |
| DD-D2-012 | restoreUndoSnapshot |
| DD-D2-013 | evaluateSpringContact |
| DD-D2-014 | selectSpringActivation |
| DD-D2-015 | updateSpringRelease |
| DD-D2-016 | applySpringLaunch |
| DD-D2-017 | createSeesawAssembly |
| DD-D2-018 | evaluateSeesawState |
| DD-D2-019 | collectUsageEvidence |
| DD-D2-020 | cancelPendingEdit |
| DD-D3-001 | getGoalDefinition |
| DD-D3-002 | createGoalGeometry |
| DD-D3-003 | containsBall |
| DD-D3-004 | evaluateBallSpeed |
| DD-D3-005 | updateStableCounter |
| DD-D3-006 | evaluateOutOfBounds |
| DD-D3-007 | evaluateTimeLimit |
| DD-D3-008 | evaluateRampUsage |
| DD-D3-009 | evaluatePlatformUsage |
| DD-D3-010 | evaluateSpringUsage |
| DD-D3-011 | evaluateSeesawUsage |
| DD-D3-012 | evaluateTerminal |
| DD-D3-013 | finalizeExperiment |
| DD-D3-014 | calculateStars |
| DD-D3-015 | updateBestAndProgress |
| DD-D3-016 | resolveStageUnlock |
| DD-D3-017 | manageTrajectory |
| DD-D3-018 | resolveHint |
| DD-D4-001 | validateStageDefinition |
| DD-D4-002 | normalizeStageCoordinates |
| DD-D4-003 | validateInitialGeometry |
| DD-D4-004 | loadSolutionFixture |
| DD-D4-005 | runStageSimulation |
| DD-D4-006 | generateNeighborCandidates |
| DD-D4-007 | evaluateRobustness |
| DD-D4-008 | classifySolutionPath |
| DD-D4-009 | validateHintReference |
| DD-D4-010 | generateSearchCandidates |
| DD-D4-011 | evaluateAdjustmentPolicy |
| DD-D4-012 | consumeSearchBudget |
| DD-D4-013 | qualifySolution |
| DD-D4-014 | freezeStageCandidate |
| DD-D5-001 | createDefaultSave |
| DD-D5-002 | parseSaveData |
| DD-D5-003 | validateSaveSchema |
| DD-D5-004 | validateStageRecord |
| DD-D5-005 | validateSavedPlacement |
| DD-D5-006 | validateBestRecord |
| DD-D5-007 | recoverSaveData |
| DD-D5-008 | resolveCompatibility |
| DD-D5-009 | archivePreviousBest |
| DD-D5-010 | buildSaveSnapshot |
| DD-D5-011 | acquireSaveLock |
| DD-D5-012 | releaseSaveLock |
| DD-D5-013 | reconcileStorage |
| DD-D5-014 | commitSave |
| DD-D5-015 | resetGameData |
| DD-D5-016 | handleStorageEvent |
| DD-D5-017 | handlePageRestore |
| DD-D5-018 | getSaveStatus |
| DD-D6-001 | resolveScreen |
| DD-D6-002 | resolveLayout |
| DD-D6-003 | renderBoard |
| DD-D6-004 | transformPointerPosition |
| DD-D6-005 | resolvePartSelection |
| DD-D6-006 | handlePointerInput |
| DD-D6-007 | handleKeyboardInput |
| DD-D6-008 | renderPartList |
| DD-D6-009 | renderInventory |
| DD-D6-010 | renderExperimentState |
| DD-D6-011 | renderResult |
| DD-D6-012 | renderSaveStatus |
| DD-D6-013 | renderTrajectory |
| DD-D6-014 | renderHint |
| DD-D6-015 | manageDialog |
| DD-D6-016 | resolveCharacterExpression |
| DD-D6-017 | manageDecorativeAnimation |
| DD-D6-018 | initializeAudio |
| DD-D6-019 | dispatchSoundEvent |
| DD-D6-020 | applyAudioSettings |
| DD-D7-001 | testRecordFixtures |
| DD-D7-002 | independentOracle |
| DD-D7-003 | traceability |
| DD-D7-004 | engineeringGates |
| DD-D7-005 | physicsStageEvaluation |
| DD-D7-006 | performanceEvaluation |
| DD-D7-007 | regressionRelease |
| DD-D7-008 | deviceQa |
| DD-D7-009 | humanEvaluation |
| DD-D7-010 | evidenceStatus |
| DD-D8-001 | loadExecutionPolicy |
| DD-D8-002 | validateAuthorization |
| DD-D8-003 | runPreflight |
| DD-D8-004 | validateChangeScope |
| DD-D8-005 | verifyProtectedAssets |
| DD-D8-006 | resolveEngineeringStage |
| DD-D8-007 | reserveBudget |
| DD-D8-008 | settleBudgetUsage |
| DD-D8-009 | executeTestManifest |
| DD-D8-010 | registerReviewFinding |
| DD-D8-011 | resolveRemediationScope |
| DD-D8-012 | evaluateEngineeringGate |
| DD-D8-013 | invalidateAffectedGates |
| DD-D8-014 | createCheckpoint |
| DD-D8-015 | restoreCheckpoint |
| DD-D8-016 | collectExecutionEvidence |
| DD-D8-017 | buildHumanQaHandoff |
| DD-D8-018 | evaluateReleaseAuthorization |

## RC3 ヒント草案の収録（D4承認済みの趣旨、文言再構成）
| Stage | H-nn-1 発想 | H-nn-2 方法 | H-nn-3 配置例 |
|---|---|---|---|
| 01 | 途切れた道をつなぐ | 固定坂道の先に右下の坂道 | R(11,21,30) |
| 02 | 傾きで方向が変わる | 左下へ傾く坂道でゴール側へ | R(28,21,-45) |
| 03 | 落下を受け止める | 足場の先に坂道 | P(12,21) |
| 04 | 高さには跳躍 | 落下先のバネで壁を越える角度 | B(6,5,15) |
| 05 | 高く跳ぶと遠く跳ぶは違う | 坂道で跳躍位置を変える | R(10,7,15) / B候補 |
| 06 | 支点から離れて荷重 | 右側へ落とし次の道を作る | S(11,21) |
| 07 | 障害物を避ける方法は複数 | 坂道連結またはバネ | R(15,20,15); R(22,17,15) |
| 08 | 次の跳躍につなぐ | 右から左へ連続跳躍 | B(5,3,30) |
| 09 | 仕掛けで次の仕掛けを動かす | シーソーからバネへ | S(11,22) |
| 10 | 学んだ仕掛けを組み合わせる | 坂道→シーソー→バネ | S(13,15); B(17,7,15) |
全30件DRAFT。E6認定済み攻略と照合して更新、未実証の例を正式表示しない。

## RC4 物理観測契約（承認候補）
異常値検証はcap前・各内部更新後・バネ作動後、全動的bodyのposition/velocity/angle/angularVelocityが有限であること。球の並進>30m/sはERROR。球角速や板の異常速度の明確な安全閾値は未確定（凍結前判断）。速度上限12/60は従来値。サブステップ間も場外観測を記録し、異常優先、終端処理は固定更新境界で一度だけ行う。バネの後続阻害衝突の時系列が観測不能ならE1/E3 BLOCKED。面接触判定にはローカル上面・実接触点・面法線を使用、角の曖昧接触は有効と推測しない。坂道の微小切れを反復して距離を稼がないよう、同一エピソード中の1更新だけを許容する案（既存許可の厳密化・承認待ち）。
RC4で独立幾何補助計算を再実施。10初期構造と17候補の内部重複なし、既存近傍数に一致。Shapely矩形/円近似（円quad_segs=256）、15予約矩形、交差面積>1e-9m²、盤面1e-6m許容。これは正式SAT/円矩形validatorの代替ではなく、物理実証0件。

## RC5 統合境界補足（既存判定を維持、追加数値は承認候補）
- 異常判定は全動的bodyの位置・速度・角度・角速度の有限性を、各substep前後およびバネ作動後、clampより先に確認。球並進>30m/sは既存ERROR。未定義だった球角速度>150rad/s、板並進>30m/s、板角速度>150rad/sを異常候補とする。板には球の速度clampを適用しない。支点/角度の許容誤差は既存基準のまま。閾値の追加は本稿の提案で未承認。
- バネ上面判定：矩形ローカル上面y=h/2からの距離≤.025mかつ接触点のxが[-w/2,+w/2]内、接触法線をバネ→球へ正規化し上面法線と≤30°。角の上面法線条件に合格する実接触のみ許可。接近速度はpre-solveの接触点における相対速度の負の法線射影（球角速度を含む）。end判定は球中心の上面外側（符号付き距離≥0）かつ円外周からバネ矩形までの最短非負距離≤.25m。後続阻害衝突は同tick・後続順が証明でき・他物体から球への法線 dot launch≤-.5・正常力積>1e−6 N·s（候補）。継続する阻害接触は既承認条件で抑止。順序不明は技術検証BLOCKED、勝手に通知順を物理順としない。
- 坂道の1tick微小gapは距離≤.005、2連続gapや他部品への切替で未達区間終了。接触中の観測区間のみ符号付き変位を加算し、gap区間は0。少なくとも3有効更新、傾斜下方正味.24m以上（水平は絶対値）。板は同じ上面接触区間で支点offset≥.12、球から板への正の法線力積>1e−6 N·s（候補）と角度変化5°の荷重方向一致を確認。接触前角を基準に、無接触後の慣性だけを達成に加算しない。
- 固定更新と描画：PP-03の各substep観測で異常/安定逸脱を記録、固定tickは1回だけ加算。単純resizeは座標変換のみ、端末回転時は仮編集取消と明示再開。Undoと未確定新規配置は別操作、仮状態は保存しない。
- 04のD4初期座標・17候補は旧設計どおり物理未認定。今回物理演算は実行しない。


## RC6 現行物理・判定契約（FD採用方針反映）
FD-01〜04: 異常検査は各game tick開始、各substep直前直後、バネ作動直前直後。全物体の位置/速度/角度/角速度の有限性、球並進ノルム>30m/s、球|ω|>150rad/s、板並進ノルム>30m/s、板|ω|>150rad/sはERROR。閾値ちょうどはこの異常判定ではない。異常チェック前にclampしない。球の通常cap 12m/s,60rad/sは各substepの前後および作動後に適用。板に球capを適用しない。支点偏差.02m超・許容角度超過2°超は拘束異常。球のcap前速度を計測し、ゴール安定評価も観測のcap前値が閾値を超えていたら安定区間にしない。
接触は物理のcontact pointの相対速度(v+ω×r)を利用、pre-solveの球側接近速度=-dot(vBallPoint-vOtherPoint,nOtherToBall)。上面接触はローカルy=h/2から絶対距離≤.025m、xが[-w/2,w/2]内、正規化法線との角度≤30°。角接触でも全条件成立が必要。バネ終了条件は球中心の上面符号付き距離≥0、円外周・矩形の最短非負距離≤.25m。接触継続阻害は法線dot跳躍方向≤-.5で力積に関係なく抑止、離脱後の同tick後続阻害は同dotかつ正常な正の法線力積J>1e-6 N·s。Jは力積そのもの（質量除算値ではない）。順序を証明できないCCD通知はBLOCKED。量子化は非負量をround(x*1000)し降順、同値はtype ASCII→数値gridX→gridY→angleDegの順。IDは使わない。同一物理イベントは一度だけ集約。
坂道: 有効上面接触が維持された完全game tick区間を1区間とし、区間開始/終了の球中心を接線に射影。観測途中の離脱区間は距離・有効回数とも0。隙間≤.005mで非接触が1区間だけなら累積を維持、2連続区間/距離超/他partへの切替で未達累積をリセット。符号付き合計（非水平は下り方向、水平は絶対値）、3有効区間以上かつ.24m以上で成立。板: 上面接触episode開始前角度を記録、接触点支点からの接線距離絶対値≥.12m、球→板の正の法線力積>1e-6 N·sを同episodeで確認し、その点の荷重トルク方向に角変化≥5°。episode終了後の変位を加算しない。支点中央/他物体/無接触回転は未達。FD-05 中央荷重QAは120tick・偏差≤2°。
独立幾何oracle: 円中心を矩形ローカルへ変換しd=abs(p)-halfExtent。signedDistance=norm(max(d,0))（外側）またはmax(d)（内側）。penetration=max(0,r-signedDistance)。静止≤.01m、高速≤.06m。静的壁の近側面外から遠側面外まで、接触前後・各substep・取得可能なCCD内部の時系列位置と有限矩形の接線範囲を独立照合。近側から遠側へ横断する軌道が有限板の内部を通過すればFAIL。動的板は同じ時刻の板中心・回転でローカル変換し、両側への遷移と円矩形の交差を評価。取得できない時点に隠れた横断を否定できない場合はBLOCKED。補間軌跡のみで連続性を保証しない。正式観測可否はE1、作動時系列はE3。物理試験失敗時はPP段階評価・承認済み範囲でのみ改善し、条件が成立しなければ停止。
別解認定: 同stage・同物理設定の正常clear同士。作用列は実際の有効上面接触（連続episodeを1事象）、バネ作動、荷重で傾く板の事象順を記録。同一type/作用順で座標だけ微小変更は別解にしない。変更/追加した作用部品を各1件ずつ除去した合法配置を再実験し、clear不可になるか、残る作用列または障害物経路分類が変化することを確認（除去した部品の事象が消えるだけでは不足）。経路分類: 同じ固定矩形障害物の中心xを球中心が横切る時、球下端が障害物上端以上なら上、球上端が下端以下なら下。中心yを横切る時は円右端≤左端を左、円左端≥右端を右。比較は同じ軸・通過方向で行い、途中実測点と交差時の観測により確認。分類不能は別解の根拠にしない。Reviewerが具体的な差・証跡を記載。認定不能なら別候補探索、基準緩和禁止。
探索候補生成はtype ASCII・gridX昇順・gridY昇順・angle昇順、配置順を正規化。元候補を優先し、近傍は各正規化部品に対しx-1,x+1,y-1,y+1,angle-15,angle+15順。合法性・重複除外。候補数は生成時、runは開始時に計上。ビーム20の比較順は正常clear優先→必須条件達成優先→観測された最小ゴール中心距離昇順→使用数昇順→正規配置キー。距離は物理観測値の整数µm丸め、NaN/ERRORは候補失格。候補作成・調整範囲は16のまま。高負荷fixtureは認定基準から同じtype/grid/angle順で最初の合法追加を繰返し、在庫または追加候補が尽きた状態（極大、数学的な最大とは限らない）。


## RC7 判定契約の限定補足
D1/D2/D3/D6/D7の既存仕様の範囲内で、実接触・途中観測・編集禁止の固定fixtureを07/18に定義。4物理fixtureはQA専用の初期状態であり、本番の初速0、グリッド・在庫制約、固定設定を変更しない。候補選定は独立raw観測を根拠に実装結果から独立。判定不能はBLOCKED、未確定oracleはHOLD。FD-01〜12と要件190件は不変。

## RC9 現行・承認済み5論点
STAGE 06の自由配置シーソーの現runに限る。同じ有効上面接触episodeで、支点→接触点のベクトルrと球→板の正常力積ベクトルJから物理座標で符号s=sign(r_x*J_y-r_y*J_x)を独立計算（s=0は未達）。接線offset絶対値≥0.12m、球由来の正常法線力積の大きさ>1e-6 N·s、同一有効衝突直前/直後のs*(ω_after−ω_before)>1e-6rad/sを全て要求する。角度の基準は当該episodeの最初の適格荷重直前のθ0（物理CCW正、rad）。同じepisode中にs*(θ−θ0)≥5°（π/36 rad）で初めて有効使用成立。異なる荷重方向の変位を合算しない。episode終了後の変位は不算入、成立済みフラグはrun終了まで保持。既回転自体を禁止せず、接触による同方向の角速度変化がなければ未達。力積と角速度差は別条件。rawの時系列・球由来の前後値を分離できなければBLOCKED。これは操作的因果判定であり反実仮想の完全証明ではない。

足場・バネの閾値は既承認値を維持。U/I厳密値とP独立実観測の資格を07/18 RC9で分離。未使用パーツ比較最大24合法候補は正式検証枠、受入基準は不変。通信校正は17 RC9。
