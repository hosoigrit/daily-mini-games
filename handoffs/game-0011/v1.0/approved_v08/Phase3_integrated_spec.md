# Game #0011 リズムファクトリー — Phase 3 最終是正候補 v0.8
2026-11-25 / 設計のみ。正式承認前。GitHub書込・Codex Cloud実装は禁止。

## 0. 位置づけ・優先順位
Phase 0企画v1.0、Phase 1要件v1.0、Phase 2基本設計v1.0、Phase 3 D1〜D4およびD5 v0.5の方針承認済み。第5回回答により入力主体、時計監視、保存世代、SFX最大4音/ピーク0.25、Node26 LTS/React19.3候補、310 TC/125 AT/581行を採用。本文はチャット上の承認済み内容を再構成した統合候補であり、旧本文の逐語コピーではない。D5_integration_spec.mdは前回の補完設計の参照用で、そこに残る「提案」「未承認」は第5回回答で採用した事項に関しては本書を優先。意図しない仕様変更がないか承認時に確認する。v0.6の追加設計判断はユーザー承認済み。v0.7の具体化は operation_and_boundary_rules.md、lifecycle_and_ui_routes.md、approved_design_crosswalk.md を参照。相違が見つかれば推測で実装しない。

## 1. ゲーム要件（FR-01〜18）
無料1人用Web、ログイン不要、外部バックエンド不要。4縦レーン、タップ/ロング/同時/連打。PC既定KeyD/F/J/K、スマホ実DOM4ボタン、左右親指1/2・3/4固定担当で全15譜面を正解時刻で攻略可能。曲1のみ初回解放、前曲のどの難易度でもCLEARで次曲の全3難易度を解放、再ロックなし（全進捗初期化除く）。60〜90秒、5曲×EASY/NORMAL/HARD、4種類すべてを各譜面に配置。かわいいポップな2D、5専用工場/5製品、各6品質（30外観）、収集記録は譜面別最高品質15件。BGM/効果音はオリジナル、来歴保存。オンラインランキング・ログイン・クラウド保存・外部音楽/譜面入力・経営シム・本番区間練習は対象外。

|FR|機能|
|---|---|
|01|タイトル・メニュー・全機能への遷移|
|02|5オリジナル曲、Web Audio、共通拍、難易度で同一曲、音質と権利|
|03|15固有譜面、4レーン・4種、親指制約、自動構造検証・理想入力|
|04|キー・タッチ、押下保持解放、同時入力、重複除外・スクロール抑制|
|05|判定・得点・コンボ・空打ち・確定履歴|
|06|ライフ初期100、難易度差、同時一括、CLEAR/FAILED|
|07|順次解放・保存・再ロックなし|
|08|4機械連動・時間進捗・コンボ・品質・未完成・軽量・視認性|
|09|結果・ランク・判定内訳・到達率・製品・再挑戦|
|10|称号、最高品質、参考FAILED記録|
|11|6練習・スキップ・失敗終了なし・本編記録分離|
|12|補正範囲/刻み・計測・承認適用・リセット・保存・演奏中変更禁止|
|13|音量・表示速度・物理キー・FAST/SLOW・演出・振動|
|14|停止・再保持・再開・中断・リトライ|
|15|固有保存キー・schemaVersion・整合性・失敗通知・最高記録保持・初期化|
|16|PC/スマホ/タブレット、画面回転、親指操作|
|17|色以外の識別、視認性、軽量演出、補助|
|18|解放曲12秒試聴、ユーザー操作、排他、画面離脱で停止|
子要件109件は requirements_traceability.csv のFR行が索引。NFR14/BR30/EX22/CHR12/SAVE15/その他設計制約も同表。承認済み要件変更はユーザー再承認。

## 2. アーキテクチャと開発環境（BD-01/11/13, DD-18）
React/TypeScript/Vite、CSS Modules/共通CSS、Canvas2D、独立GameSession・GameStore(useSyncExternalStore)、OfflineAudioContext + AudioContext/AudioBufferSourceNode、Performance API/getOutputTimestamp、Pointer/Keyboard Events、LocalStorage+Web Locks、SVG、Vitest/RTL/Playwright/ESLint/jsdom。Composition Rootがサービス所有、Presentation→Application→Domain/抽象契約、Infrastructureが抽象契約実装。DomainはDOM/React/Audio/実時計非依存。循環依存禁止。GameSessionのみ判定・得点・ライフの正本。GameStoreは変更不能の表示snapshot、同値なら同じ参照。Canvas高頻度描画はReactから分離。Strict ModeでEffect再実行時の解放と重複起動を検査。入力・判定・音声・描画・保存は互いに独立し、GameControllerがコマンドを直列化するが長いPromiseの完了待ちで中断/入力を止めない。
ゲーム内 `games/0011_rhythm-factory/` に package/lock/config、src/{app,contracts,domain,infrastructure,presentation,content}、public/assets、tests/{unit,contract,integration,component,browser,fixtures}、tools、docs、reports。distはビルド出力。既存repoルート・shared・CI・Pages設定は無断変更禁止。Vite base='./'、画面遷移は内部state、SPA rewrite不要。公開対象にQA診断・fixture・秘密情報を含めない。公開承認済みdistの同一ファイルを配置。Pages現行のdocs配下パス・CIはPhase4読取確認。
Node26 LTS・React/ReactDOM19.3系を候補、TS/Vite/Vitest/RTL/Playwright/ESLint/jsdomは互換性確認後 exact pin。npm ci、npm ls、typecheck、lint、test:unit/contract/integration/component/e2e、validate:content、build、preview、test:regression。依存強制回避禁止。環境情報・ロックファイル・ブラウザ版を記録。2026-11-25公式確認: https://nodejs.org/en/about/previous-releases ; https://react.dev/versions 。実際の組合せ・Codex環境未確認。Stage A-1で依存の解決と再現性を実証する。

## 3. 共通時刻・音声（DD-01/02）
PPQ480、4/4、固定整数BPM。tick→μs = round(tick*60000000/(480*BPM))。絶対tickを変換、丸め済み長を累積しない。内部は整数μs、API秒/Performance msとの境界を型で区別、有限・safe integerを検証。実精度をμs保証しない。固定世代アンカー(a0秒,p0ms)、再生開始as秒、開始楽曲位置sμs。song(p)=s+round((a0+(p-p0)/1000-as)*1e6)。judge=song-offsetUs。補正は表示・入力・期限に一度のみ、曲BPM/曲データ/正解tick不変。フレームごとの加算禁止。描画 y=line-speed*(target-judge)。工場進行は補正前曲時刻。100msごとに最新getOutputTimestampと固定アンカー予測差を比較、20ms超/逆行/中断/不能で安全停止。初期有効アンカーを取得できなければ開始保留。許容値・監視頻度はStage Aで測り変更承認。音声物理遅延20ms保証ではない。世代内の過去入力を再変換しない。
48kHz 2ch、32bit float、固定seed、1曲のみキャッシュ、生成同時1件。選曲変更は最新要求のみ有効、古いPromise完了は破棄。事前レンダリングを必ず待つ。ユーザー操作でAudioContext開始/再開、必要なら準備後再操作。AudioBufferSourceは再生ごと新規、BGM同時1、SFX最大4、各ピーク0.0625で全SFX合計0.25、曲単体peak<=10^(-3/20)、合成波形検証。旧音源のended通知は世代/再生IDで無効化。音量別gain、BGM70/SFX50既定。生成失敗再試行・旧キャッシュ参照解放。曲終端の余韻はアウトロ内収束、余分な音楽時間追加不可。
曲長D、最初の正解Tmin、最後Tmax、offset o。すべてμs。Spre=min(0,Tmin+o-150000)（曲時刻）、C=max(D,Tmax+o+150000)、F=C+50000。COUNTDOWNは演奏入力無効、必要なPREROLLはSpreから受け付ける。曲時刻C以下まで新規有効入力/空打ち、C超の発生は集計なし。F同値では終了未確定、F超で全判定確定後CLEAR。ただし先行FAILEDは優先。音源終了後もAudioContext時刻を維持、途中再開FINALIZINGではBGM再生なし。PREROLLの負の再生位置はAudioBufferに渡さず再生開始予定を調整。

## 4. 入力・判定・成績（DD-03〜06）
ブラウザ入力発生時刻Event.timeStampと受信Performance時刻を区別し正規化。sequenceは同時刻の記録済み順序。入力主体とレーンはDOWNからUPまで固定。pointer capture、移動による別レーンDOWNなし、疑似click/マウス・キーリピート除外。物理ボタン即時反応と論理押下状態を分離。1レーン1主体、同一/別主体による重複DOWNは無効（元の保持を奪わず、空打ちもなし）。UPに対応する保持がなければ無視。CANCELは中断、通常UP扱いなし。
W=judgeNow-50000。排他的境界: 発生時刻<Wのみ処理、期限<Wのみ期限処理。同値は次回へ。processedBeforeを単調に保持し未処理イベントでこれより古いものは安全停止・復元不能ERROR。50ms超の遅延は記録し、処理済み境界を越えた場合と区別。終了封印後の旧通知は診断のみ。配送上限の保証はなくStage Aで検証。順序: W未満の入力と期限を時刻順にマージ、同時刻は入力(sequence順)→期限。論理DOWN/UP更新後に候補検索。正式集計は別の論理時刻順、後続を先に確定しない。
TAP/HOLD_STARTは同一レーンの未判定、絶対誤差150000μs以下の候補のみ。最小絶対誤差、同値は早い正解時刻。1有効DOWN最大1判定、候補なし空打ち1000減点/コンボ0/ライフ変化なし。P <=50000、G <=100000、GOOD <=150000、それ以外対象外、未入力期限経過MISS。FASTは誤差負、SLOW正。正解時刻同一グループの全結果RESOLVED、正解時刻<処理済み境界、先行論理イベント確定、同時刻空打ち確定可能でCOMMIT。空打ちはjudge入力時刻、同時刻ならノーツ群→空打ち。全成功群はコンボ人数分加算、MISS含む群は最大コンボ加算なし・現在0。同時刻空打ちは成功群の最大を記録してから現在0。後続の暫定結果は先行FAILEDで破棄し未プレイ。
ライフ内部200、各P/G/GOOD/MISS: E +6/+4/+2/-12、N +4/+2/0/-16、H +2/+1/0/-20。グループ一括増減→clamp 0..200。ゼロで同論理時刻の空打ちまで処理しFAILED封印、以降の得点・回復なし。CLEARは曲完走・全判定確定・life>0（0.5可）。S=max(0,round(1000000*(10P+7G+3D)/(10N))-1000E)。累積E維持、Nは全判定数、P+G+GOOD+MISS+未プレイ=N。判定精度は空打ち減点前の加重率/N。SS>=980000,S>=950000,A>=900000,B>=800000,C>=700000,その他D。正式最高記録はCLEARのみ、FAILEDは別記録。FAILEDの到達率は論理終了judge時刻/Dを0..1へclamp（保存千分率）、実停止遅延で水増ししない。
ロングは開始DOWNと終了UPの2判定。同じ主体が継続保持、終了範囲内のUPは時刻判定、早期UP/期限超過/開始MISSで終了MISS決定。再押下で復活不可。失敗時の終了MISSは終了正解時刻の集計まで前倒ししない。正常保持中のみ再保持対象。状態WAITING→HOLDING/BROKEN→END_RESOLVED→COMPLETED/FAILED。HOLDING→SUSPENDED→REHOLD_WAIT→HOLDING。後続結果は先行FAILEDなら未プレイ。

## 5. セッション・停止・画面（DD-05/06/13）
状態14: READY, INITIALIZING, COUNTDOWN, PREROLL, PLAYING, PAUSING, PAUSED, REHOLD_WAIT, RESUMING, FINALIZING, CLEAR, FAILED, ABORTED, ERROR。許可遷移は state_transition_matrix.csv、未掲載の要求は拒否/旧通知は無視。終端一意。リトライは古いセッションを破棄し新ID。練習PracticeSessionは同判定だがライフ0で終了しない・正式記録/製品/解放/称号なし。練習完了のみ保存可。
停止境界Bは旧世代の曲時刻、b=B-o（judge軸）。旧入力の発生<=BをPerformance時刻で配送待ち50ms超まで整理し、論理境界<=bまで処理。b後の期限を前倒ししない。音声停止、時計凍結、先行FAILEDがあれば優先。正常保持のみSUSPENDED。再保持のDOWN/UPは得点/空打ちなし、必要レーン全保持で3秒カウント、解除でREHOLD_WAIT。再開時新世代・停止位置から再開。COUNTDOWNからは初回カウントをやり直す、PREROLLは音声開始再予約、FINALIZINGは判定のみ。旧境界b以下を再処理しない。後述§13の補足: 再開直後はW<b+1になるため、有効processedBeforeを後退させずWが追いつくまで通常処理を待つ。停止前入力を再開世代に再変換しない。中断復元不能ERROR・保存なし。回数制限なし、停止使用でも正式記録可、レーンを覆う。
9主要画面: タイトル/メニュー/選曲/演奏/一時停止/結果/練習/収集/設定。子画面: 楽曲準備、再保持、保存失敗、補正計測、排他不可・エラー・初期化確認。試聴は解放曲のみ、12秒、選曲変更/演奏開始/画面離脱で停止。HUDはReact、Canvasはノーツ/工場、操作はDOM。320×568・768×1024・1280×720 CSS px基準、スマホ縦持ち、iPad縦横、PC横長。44×44 CSS px以上、safe area、回転停止と再レイアウト。色/記号/形状。UI以外のスクロール拡大制限なし。設定画面でキー入力を演奏判定しない。
練習6: TUT-01 4レーン基本、02 通常8打点程度、03 ロング、04 同時、05 連打3〜5、06 混合。各10〜20秒基準、スキップ可。設定: BGM70/SFX50（0..100整数）、速度1.0（0.5..2.0/0.1刻み）、補正0（±200/5ms刻み）、FAST/SLOW ON、演出NORMAL/LIGHT、振動OFF/非対応無効、物理キーA〜Z/0〜9のみ・重複禁止、Escape予約。セッション開始時設定snapshot、演奏中変更不可。補正計測100BPM 16拍（最初4ウォームアップ）、最寄りの全拍±300ms、等距離早い拍、1拍最初1件、使用済み/ウォームアップは破棄（再割当なし）。最後拍+300msまで、配送待ち後確定。有効10以上、中央値絶対<=200ms、MAD<=50ms、5ms刻みに正負対称half-away丸め。既存補正は計測に適用せず承認後のみ保存。中断/範囲外は再計測。

## 6. 楽曲・譜面制作（DD-07〜09）
|ID/楽曲|BPM/調/小節/秒|イントロ/主/展開/高潮/終奏|主/展開コード|音色|試聴開始小節(1始まり)|
|---|---|---|---|---|---|
|music-01 Happy Assembly|100 C major 28 67.2|4/8/4/8/4|C G Am F / Am Em F G|マリンバ、ベル、柔らかいベース、キック/スネア|5|
|music-02 Candy Groove|120 F major 32 64|4/8/8/8/4|Fmaj7 Dm7 Gm7 C7 / Bbmaj7 Am7 Gm7 C7|クラビネット風、スタッカート、ファンクベース|5|
|music-03 Electric Workshop|128 A minor 36 67.5|4/8/8/12/4|Am F C G / Dm Am F E7|シンセ、アルペジオ、4つ打ち|21|
|music-04 Turbo Drive|144 E minor 48 80|4/12/12/16/4|Em C G D / Am C Em B7|歪み系リード、パワーコード風、ロックドラム|29|
|music-05 Beyond the Stars|160 D minor 56 84|8/12/12/20/4|Dm Bb F C / Gm Bb Dm A|トランスリード、パッド、高速アルペジオ|33|
コードと音色は制作基準、メロディは新規制作。単なるBPM/音色違いの同一ループ不可。MusicMasterを拍/小節/時間の正本、startBar 0始まり。MIDI0..127、velocity(0,1]、durationTicks正、発音開始は終端未満。各ID一意、楽器参照、セクション連続、試聴区間内、余韻終端内、固定seed。音色ADSR/波形/ノイズ/フィルター/歪み/パンの詳細は型宣言とD5規則。正式音源の完成と試聴はStage B/C。
|曲|Lv E/N/H|目標判定数 E/N/H|
|---|---|---|
|01|1/3/5|74/130/210|
|02|2/4/6|72/128/205|
|03|2/5/7|80/142/230|
|04|3/6/9|96/180/275|
|05|4/7/10|110/200/320|
ChartId CHART-01-E〜CHART-05-H、4レーン・4種を各譜面に含む。密度E 0.8..1.4/N 1.5..2.5/H 2.6..4.0判定/秒。TAP1判定、HOLD2、CHORD左右1ずつ2、RAPID同一レーン3..8打点・150ms以上、打点独立。左右交互高速16分はTAP列。HOLD>=400ms、TAP保持50ms→100ms準備、同親指押下間隔>=150ms、HOLD解放後>=150ms、同親指の保持/押下重複禁止。全15譜面で正解時刻の入力列生成→本エンジン再生→全P/100万/空打ち0/CLEAR。無操作FAILED。tick→整数μs丸め後に間隔を比較。架空のμs境界はコンパイル後fixtureで試し、JSON検査は実際に表現可能なtickで検査する。データ検証コードCHART-E01〜16、型宣言・D5仕様・CSVに準拠。音楽イベント参照がある場合は存在検査、配置は音楽的意図を記録。理想列の自動成功は人間操作性のPASSではない。

## 7. 工場・製品・演出（DD-14）
|工場|製品|機械1/2/3/4|モチーフ|
|---|---|---|---|
|FAC-01 玩具|ロボット|木材プレス/接合/彩色/組立|木製玩具・歯車|
|FAC-02 スイーツ|菓子箱|型抜き/加熱接合/コーティング/箱詰め|キャンディ・リボン|
|FAC-03 ロボット|アンドロイド|金属加工/溶接/表面処理/精密組立|電子回路・精密部品|
|FAC-04 自動車|レーシングカー|車体加工/フレーム接合/塗装/最終組立|車輪・工具|
|FAC-05 宇宙船|宇宙船|装甲加工/機体接合/耐熱処理/組立|星空・ドック|
SVG背景1280×720、機械256×256、製品512×512のviewBox基準。各固定/可動/ランプ/加工物を分離、外部URL/外部フォント/script禁止。必要素材を事前読込・ラスタ化。色違いだけは禁止。D/C/B/A/S/SSで形・部品・装飾差分、各5×6=30外観、保存は15件。品質名称: 低品質品/標準品/優良品/高品質品/特級品/最高傑作。進捗clamp(song/D)、25/50/75/100%工程、CLEARまで完成品獲得不可、FAILEDは未完成表示。AN-01待機1〜2拍、02単発160ms、03保持継続、04両側成功220ms、05連打各最大100ms、06コンボ10/25/50/100最大500ms、07進行、08完成約1.2秒、09停止約300ms、10品質、11即時ボタン発光。演出は判定に非干渉、同一機械の演出を有限に管理、軽量でも成績不変。VQ/VISは§10。

## 8. 保存・排他（DD-11/12）
キー daily-mini-games.game0011.save.v1、ロック daily-mini-games.game0011.writer（版共通）。Web Locks exclusive ifAvailable、所有コールバックを維持し取得通知を分離。未取得/非対応は閲覧のみ・正式プレイ/更新禁止。対象5環境で成立しなければStage A HOLD。ロック奪取禁止。queryは診断のみ。lease世代と実所有状態を照合。visibility hiddenは停止・ロック維持、pagehideは旧session無効・解放、pageshow/BFCacheは再取得・最新保存読込、再読込は中断。イベント発火を保証しないため終了時保存に依存しない。
SaveDataV1は型宣言を正本とする。単一JSONでsettings, progress, records, collection, achievements, commitReceipt, schemaVersion, saveEpoch, revision。初回Track01、他記録空。保存読込/書込前/読戻しでSD-V01〜15検証、破損/未知版の無断上書き・削除禁止。設定初期化は設定のみ、全進捗初期化は設定を維持し成績/解放/称号/練習初期化、新epoch・revision0、receipt null。localStorage.clear禁止。レコードIDと内容の一致、非負安全整数、曲/譜面/判定数/最高品質/称号/解放連続性を検査。
正式終了結果CLEAR/FAILEDのみ、sessionId・epoch・baseRevision・digest・lease世代を現在のPendingCommitに固定。保存要求は現pendingのみ。最新データ・lease再確認→純粋RecordUpdate→revision+1・receipt付与→単一書込→読戻し。receipt同session/digest/epoch/baseRevision+1一致なら再加算なし。不明なrevision変更/権限喪失で停止。receipt.revisionは登録時点なので後続設定更新で保存revisionより小さくても正常。未解決保存中は次の正式プレイ、設定保存、全初期化、練習進捗書込を禁止。結果表示と保存状態を分離。保存不明時の破棄は読戻しで状態確認してから、保存済みなら巻戻しなし。ページ終了でメモリpendingを失う可能性を通知。全セッションID履歴無制限保持はしない。digestは同一性用で改ざん防止ではない。
CLEARでbestScore/bestRank/bestCombo/clearCount/FC/APを更新（独立最高値、同点bestScoreResult保持）。FAILEDで参考最高得点/最長到達率/最大コンボ/失敗回数/最新内訳・位置のみ更新。ABORTED/ERRORは両方更新なし。称号ACH-01 FIRST PRODUCTION 初CLEAR、02 FULL COMBO 無MISS/空打ち/未プレイ、03 ALL PERFECT 全P空打ち0、04 FACTORY EXPLORER 全5曲任意、05 COMPLETE COLLECTION 全15、06 HARD CHALLENGER 全5HARD、07 MASTER OPERATOR 全15 S以上、08 PERFECT FACTORY 全15 AP。複数同時獲得可、全進捗初期化以外取消不可。

## 9. 契約（DD-10）
interface_contracts.d.tsのIF-01〜20と内部ポート、D5_integration_spec.mdの全IF事前条件/戻り値/異常条件を参照。型は実装ではない。全IFは契約テストTC-D4-001〜020。想定内失敗Result、想定外ERR-017/018、古い要求破棄。エラーERR-001楽曲,002譜面,003生成,004音声開始,005時計基準,006同期,007配送,008状態遷移,009排他不可,010非対応,011権限喪失,012保存破損,013書込,014未知版,015素材,016保存確認不能,017内部,018契約違反。表示は日本語messageKey。単位・値検査とエラー時の部分更新禁止。変更不能snapshot、購読解除冪等。検証は型だけでなく実行時。全フィールド・ポートの実装方法は契約に従い、未定義/矛盾はAG-01が報告し承認を得る。

## 10. 品質保証（DD-15/16/17/19）
MQ配点20/20/15/15/10/10/10（旋律/リズム/音色伴奏/展開/曲間差別化/世界観/音質）。CQ25/20/20/15/10/10（楽曲整合/難易度/楽しさ/多様性/親指操作/視認性）。VQ20/20/20/15/15/10（世界観/工場差別化/機械演出/品質差分/連動/視認性）。0欠落、1大幅不足、2明確不足、3基本成立・改善必要、4良好軽微改善、5優秀。各項目の定性的判断はチャットD2/D4アンカーを踏襲。実際に評価できない項目はNOT RUN、0点と区別。独立評価が複数有効なら最低合計点、平均相殺禁止。各曲80以上・5曲平均85以上、各15譜面80以上、各5工場80以上。VIS-01〜08必須、重大問題・権利・未試聴/未評価区間でHOLD。Stage B MQ-05除外90点、VQ-02除外80点を100点換算し各80以上。全曲/全工場完成後正式評価。全15譜面を実タッチ端末で人間評価、未到達区間は追加評価、PC代表譜面・必須機能。独立試聴不能なエージェントはNOT RUN、人間独立評価者で補完可、公開承認は別。
PF: 55FPS中央値以上、各試行P95<=33.4ms、最大<=100ms（最初3秒除外、指定2譜面×5環境×3回）。FPS=1000/中央値フレーム間隔ms、P95 nearest rank。内部同期20ms以内。入力配送中央値/P95/P99/max/50ms超件数記録。冷キャッシュ下り1.6Mbps上り750kbps RTT150msの3回中央値10秒以内、初期取得3MB上限候補、内部予算1.2MB。全曲各環境の冷生成3回中央値5秒・最長10秒以内、音源1曲・同時生成1、連続20操作異常なし。メモリ総量は測定手段があれば記録、音源理論32.26MB最大・実測総量と区別。基準の変更は実測根拠・ユーザー承認。
DEV-01 Galaxy S26 Chrome、02 iPhone SE2 Safari、03 iPad mini 6 Safari、04 Win11 Chrome、05 Win11 Edge。OS・ブラウザ版を実測記録。DEV-T01 起動全画面、02 試聴/開始、03 4種、04 親指（タッチ）、05 補正、06 停止再保持、07 ロック復帰（タッチ）、08 回転（タッチ）、09 保存復元、10 2タブ排他、11 FAILED、12 リトライ、13 性能。PCキー、フォーカス喪失、音声中断も各環境確認。譜面担当 E/N/H: 01 iPhone/Android/Android、02 Android/iPad/iPhone、03 iPad/iPhone/Android、04 iPhone/Android/iPad、05 iPad/iPhone/Android。エミュレーションは実機代替不可。
310 TC・125 AT・581行を維持、test_cases.csvとrequirements_traceability.csvは統合候補。状態/手順/fixtureの意味レビューの残課題は別紙。すべてのゲームテストはNOT RUN。実行環境、固定SHA、実入力、実測、期待との比較、担当者、証跡記録。N/A根拠、RUNは合否未確定、BLOCKEDは実行不能、HOLDは工程移行不可。自動テストだけで人間受入省略不可。

## 11. Stage・役割・リリース
AG-01統括（契約/依存/ビルド/統合）、02作曲、03音声時刻、04譜面/検証器、05判定/入力/進行、06React、07SVG/Canvas、08保存排他、09QA、10独立コード、11独立楽曲、12独立ゲームバランス、13 Release QA。13論理役割は並列起動保証でない。担当ファイルを分離、共通契約変更はAG-01へ提案・承認。固定SHAでレビュー、実行主体と独立性証跡、重大/高は全解消、MEDIUMは原則解消・残存個別承認、LOWは記録・受容。最大5是正ループ後HOLD。GitHub書込/PR/マージ/公開は個別許可。
Stage A-1基盤（POC13/14/16/18）、A-2 20〜30秒試験曲/4種譜面（POC01〜08/10/15/17）、A-3 5実機基盤/独立証跡（POC09/11/12）。POC01曲再生、02同期、03四種、04境界、05同時成績、06競合、07再保持、08補正、09物理端末、10排他保存、11証跡、12重大基盤未解決なし、13 React分離、14 Strict Mode、15配送停止、16本番サブパス、17生成キャッシュ、18型契約。Stage B Happy Assembly1曲/3譜面/工場/6品質、REF01〜10（完成曲、3譜面、親指、理想入力、MQ>=80、CQ各>=80、工場、実人間受入、重大高解消、ユーザー承認）＋VQ暫定>=80。Stage C 残4曲/12譜面/4工場、正式品質採点。Stage D統合。段階ごと実績・ユーザー承認、技術実証失敗なら量産禁止。試験曲の結果を正式曲の合格へ転用しない。
QG01全必須自動PASS、02全15譜面構造/親指、03全5曲MQ、04全15CQ、05重大高解消、06全5実機必須PASS、07既存10ゲーム回帰、08人間受入、09来歴/権利、10承認ビルドと配信物同一、11全5工場VQ/VIS。QG10は公開前予定物照合と公開後実配信照合を分離。公開後照合未実施で最終PASS禁止。独立レビュー証跡なし/未評価はHOLD。実行ログ・指摘台帳・成績・評価表・端末・ハッシュをreports/stage-a〜dで管理。大容量証跡の登録は別途承認。

## 12. 残存課題・引継ぎ
全310 TC/125 AT/581行を維持。v0.8では旧保留80件の個別条件を再点検し、操作の到達性・練習終了・音声再試行・統計型を補完した。操作表、状態表、DEVマトリクス、全要求行のリンク先期待値を正本の一部とする。独立した全文章/全要求条件の意味的完全性証明、テスト実行は未実施。具体的な追加承認事項と後工程の実証をapproval_decision.mdに分離記載。Phase4は依存候補・現行repo構成照合と承認済み文書の凍結、Stage Aは実機同期/配送/排他/生成/性能、Stage B〜Dは実コンテンツ品質・全自動/実機/独立レビュー。設計上の新規機能はなし。GitHub/Codex開始未許可。

## 13. v0.6統合時の補足（今回ユーザー承認済み）
- 停止境界の曲時刻Bとjudge軸bを明示。処理済み排他的境界はb+1μsまで進め、再開後のWが追いつくまで後退・再確定を行わない。停止中の待機はPerformance時刻。新世代の通常入力はbより後、再保持は例外。安全な境界が得られない場合ERROR。
- Stage Aの時計監視は100ms候補、観測差20ms超なら安全停止。初期化待機の上限・実機遅延分布は未確定（Stage Aで承認）。
- チャート/音源の検査用μs合成fixtureと正式tickデータは分離する。BPM100で1tick=1250μs、399999μs等の正確な境界値をJSONへ無理に入れない。
- 音声再生アンカーにplaybackIdを追加しendedの所有権を判別。進捗更新は保存epochを参照し、成果物ハッシュ・結果同一性のためcanonicalな固定順直列化を使う（詳細はD5規則、ハッシュ計算の実装は未着手）。
- ロング保持状態・工場/チュートリアル・補正・保存/描画の補完型を宣言へ追加。Factory/Tutorialの実行時検証・全具体アニメーション上限は凍結前に最終確認。新規機能は追加しない。

## 14. v0.7 最終是正結果（履歴）
操作コマンド19種と全画面/セッション組合せ候補表、ライフサイクル補足、承認判断照合台帳を追加。310 TC/125 AT/581行は維持。参照検査と静的型検査は実施したが、全TCの意味網羅性と全承認本文の完全照合は未保証。FIN-09/10/11はPARTIAL、Phase 3はHOLD。実装/書込/公開は未許可。

## 15. v0.8 正本の追加・優先規則
operation_and_boundary_rules.md のv0.8補足、lifecycle_and_ui_routes.md、command_guard_matrix.csv、command_state_crosscheck.csv、state_transition_matrix.csv、device_acceptance_matrix.csvを適用。練習は内部CLEARでも正式結果なし。準備中断・再試行・再開拒否の経路を明確化。補正統計値の分数はStatisticalUs、時計は整数Us。D4-015/036の許可条件・未掲載拒否を適用。承認後の解釈は本補足が優先し、変更が必要なら承認申請。D5 v0.5は契約正常異常条件の履歴参照、相違は現行正本に従う。旧v0.7判定は履歴。最新ゲート判定はapproval_decision.mdのみを参照。
