# Game #0011 リズムファクトリー — D5統合差分 v0.5（履歴参照）

現行の正本はPhase3_integrated_spec.md v0.8と付属のoperation_and_boundary_rules.md等。承認済み判断に関する本書の「提案」「未承認」記述は履歴であり、現行仕様を覆さない。

状態: 設計レビュー用・未凍結。実装・GitHub登録・Codex実行は未許可。D1〜D4の承認済み本文を置換する単独の完全仕様書ではない。今回のファイルはD5の補完・統合資料。Phase 4で承認済み本文と合わせる。

## 契約の意味と異常時規則

型の正本候補は `interface_contracts.d.ts`。型宣言は実行コードではない。各IFの同期/非同期は宣言の通り。想定内の失敗はResultで返し、想定外例外は境界で捕捉しERR-017/018へ変換する。旧世代・旧セッションの通知は副作用なしで破棄し診断ログに記録する。UIは変更不能snapshotのみを購読する。型ブランドは実行時検査の代替ではない。

| ID | 事前条件・実行条件 | 結果・失敗時の扱い | 契約テスト |
|---|---|---|---|
| IF-01 | 正常MusicDefinition、最新Token、同時生成1件 | 48kHz/2chのPreparedTrack。ERR-001/003、古い完了は破棄 | TC-D4-001 |
| IF-02 | 楽曲IDを正本から取得 | BPM/PPQ/曲長/section一致、未知IDはERR-001 | TC-D4-002 |
| IF-03 | 再生開始位置・固定時計世代の確立済み | anchorを返す。ERR-005/006で開始/継続不可 | TC-D4-003 |
| IF-04 | Performance時刻の正規化済み、該当世代 | 単位変換と補正一回、ERR-005/006 | TC-D4-004 |
| IF-05 | 正常chartと一致するmusic context | 一意・整列済みevent列、ERR-002 | TC-D4-005 |
| IF-06 | session/世代/時刻/レーンの検査、排他的境界 | queuedまたは重複・旧session・対象外の無視。確定済み境界より古い新入力はERR-007 | TC-D4-006 |
| IF-07 | 正式確定groupまたはghost、同一イベントID未集計 | スコア状態を純粋更新、重複・不正ERR-018 | TC-D4-007 |
| IF-08 | 正常life・difficulty・group | 2倍整数lifeを一括加算しclamp、ERR-018 | TC-D4-008 |
| IF-09 | 有効session、なければ空snapshot | 読取専用、描画による状態変更なし | TC-D4-009 |
| IF-10 | 有効世代・演出イベントID | 表示のみ、古い通知を捨てる | TC-D4-010 |
| IF-11 | 終端封印済み | CLEAR/FAILEDのみFinalResult、その他null | TC-D4-011 |
| IF-12 | 正常保存データ、封印結果、固定recordedAt | 純粋に更新案生成。ERR-012/018、書込なし | TC-D4-012 |
| IF-13 | 現在のpending、lease、epoch、revision一致 | 一括書込と読戻し、ERR-011/013/016、再試行は同一pending | TC-D4-013 |
| IF-14 | 有効なsession/世代またはアプリ共通イベント | 遷移、復元不能ERROR、古い通知無視 | TC-D4-014 |
| IF-15 | 許可状態・更新権限・保存条件 | 操作受理またはERR-008/009/011等 | TC-D4-015 |
| IF-16 | 有効なストア | 同値なら同参照、変更時のみ通知、解除関数は冪等 | TC-D4-016 |
| IF-17 | API利用可能・ロック未保有 | 有効lease、競合ERR-009・非対応ERR-010 | TC-D4-017 |
| IF-18 | Wが単調、同世代、未処理境界 | W未満のみ。発生時刻・sequence順。逆行ERR-006、遅延超過ERR-007 | TC-D4-018 |
| IF-19 | unknownの入力データと検証種別 | validまたはpath/code/message。副作用なし | TC-D4-019 |
| IF-20 | 有効サービス・listener | 解除関数。旧世代を現在に適用しない | TC-D4-020 |

### 実行時制約の補完（提案）
- IDはマスターと照合し、重複・未知参照を拒否。chartIdは CHART-01-E〜CHART-05-H、musicIdは music-01〜music-05 に統一。難易度・曲番号・factoryIdの組合せを確認。数値は有限、整数項目は安全な整数。tickは0〜曲終端（発音開始は終端未満）、durationは正。MIDIは0〜127、velocityは(0,1]、seedは0〜2^32-1。
- 音色定義: ADSR時間は非負、sustain/noiseGain/gain/distortionは0〜1、panは-1〜1、oscillator ratio>0、filter周波数は0より大きくNyquist未満、Q>=0。全値有限。パーカッションにも正のdurationTicksを付与。実際の音色パラメータは制作・試聴で評価。
- ChartNoteの種別は大文字に統一。RAPID 3〜8、同一レーン150ms以上、全4種類・全4レーン。CHORDは左右各1。TAP保持50ms、解放から100ms、HOLD解放から150ms。HOLD 400ms以上。譜面の正解時刻を使う。sourceMusicEventIdsを指定した場合は存在確認。
- スコア0〜1000000、lifeUnits 0〜200、回数非負安全整数、clear時未プレイ0・life>0、failed時life=0。誤差は成功判定の整数μs、MISSは原則null。結果の判定総数は譜面に一致、maxCombo<=成功判定数。ランクはスコアから導出。
- 状態変更はControllerで直列化するが、音声生成等の長いPromiseを待って入力・中断処理をブロックしない。非同期完了は最新Tokenを照合した新規コマンドとして処理。GameSessionの封印済み結果は変更不可。Score/Lifeの更新はGameSessionが両方の成功を確認した上で一括適用。
- 1レーンの論理保持主体は1つ。別主体による重複押下は得点/空打ちの対象にせず元の保持を奪わない（D5提案）。同一時刻は記録されたsequenceで決定。順序矛盾を復元不能ならERROR。再現性の対象は同じ正規化入力履歴（sequenceを含む）であり、同じ物理操作の全ブラウザ同一配送を保証しない。
- Watermarkは排他的、入力時刻と期限が同一の場合入力を先に処理。期限順と正式成績の論理時刻順は別。停止時は旧世代の境界B以下を壁時計で待って処理、B後の期限を先取りしない。新世代はBより後の通常入力を受付、再保持は別モード。C=max(D,Tmax+offset+150000)、F=C+50000、C以降の新規入力はC同値まで有効、F超過で最終確定可能。既にFAILEDなら終了時刻までのみ集計。
- 時計監視の初期案: 演奏中100msごとに新anchorを観測、固定anchorとの差が20msを超えたら安全停止。再開時は新世代を設定。開始時の安定したanchor取得に失敗したら開始を保留し、再試行案内。監視間隔・初期化上限は実測後承認。物理音声出力20ms保証ではない。
- 音源単体peak<=10^(-3/20)。ミキサーで効果音全体の絶対ピーク予算0.25、初期候補は最大同時4ボイス、各0.0625。新規SFX時に上限を超える場合は旧SFX停止/置換を行い、その遷移も合成ピークを検査。再サンプリング・実ブラウザの最終出力は別途測定。発音/停止時の短いフェードはクリック防止目的で、曲時刻・判定は変更しない。
- 保存: revisionは同一epoch内で更新ごとに+1、全進捗初期化時は新epoch・revision=0案。receipt.revisionは最終成績登録時のrevisionであり、後続の設定更新時に保存revisionより小さくても有効。未解決pendingがある間は正式プレイ・設定保存・初期化・練習進捗書込を制限。再試行時に現在のpendingとlease/epoch/baseRevision/digest照合。書込成功不明なら最新データのreceiptを確認。古いpendingを復活させない。結果digestは改ざん防止ではない。
- 補正計測: 最も近い全16拍（使用済み含む）へ割当、等距離は早い拍。既使用拍やwarmupなら捨て、隣拍へ振替しない。最終拍+300msの受付境界まで入力を受け付け、配送待ちを経て確定。既存補正なし。中央値範囲・MAD・最小入力数判定後に5msへ正負対称丸め。

## 検証仕様統合

`test_cases.csv` は既存D1〜D4の280 IDとD5の追加30 ID。`requirements_traceability.csv` は既存のFR子要件109、NFR14、BR30、CHR12、SAVE15、EX22、IF20、QG11、各種補助制約、AT-001〜123、および追加提案AT-124（VQ）とAT-125（独立レビュー）を対応付ける索引。ATと設計IDの相互参照には同じTCへのリンクに基づく候補も含む。`mapping_check.json` はIDの重複・欠損・孤立確認。意味上の検証網羅性や具体的fixtureの成立は未検証。各行のレベル・前提条件は共通fixture方針による初稿であり、具体的な入力データファイル・ブラウザ手順の全展開はPhase 4凍結前レビューで確認する。全TCはNOT RUN。仕様の整合性とテスト実行結果を区別する。

### 共通fixtureと計測
- 時刻単位の指定なしはテスト説明上ms。実装ではμs。単体/契約テストは固定時計・決定的fixtureで、正負境界は両方独立実行。異常fixtureは1条件ずつ変える。合格判定は丸め前の値（表示用の丸めと分離）。
- 理想入力は正式エンジンへ投入。正常譜面15全件はStage C/D、Stage Aでは試験譜面だけを実行し部分スコープと記録する。Stage Bは正式1曲3譜面。試験譜面のPASSを正式15譜面のPASSへ転用しない。
- PF-01/06/07: 各端末、各指定譜面、3試行。開始3秒除外、演奏中の連続フレーム間隔を保存。各試行のFPS=1000/中央値フレーム間隔(ms)、P95はnearest-rank、最大は実測最大。55FPS以上、P95<=33.4ms、最大<=100msを各試行で評価する案。初期ロードは冷キャッシュ、下り1.6Mbps、上り750kbps、RTT150ms、3回中央値<=10秒。3MB上限候補と1.2MB内部予算を区別。準備時間は全曲各端末冷生成3回を測り、各曲各端末中央値<=5秒、最大<=10秒案。生成中は同時1件、キャッシュ1曲。メモリ総量は測定可能な場合のみ記録。
- 5曲各80点・平均85点、15譜面各80点、5工場各80点・VIS全件適合。独立評価が複数なら最低点。Stage BはMQ-05除外90点、VQ-02除外80点を100点換算し80以上。適用不能項目を未評価のまま0点換算しない。15譜面の人間評価は全てタッチ端末で分担、PCは代表譜面と必須機能。未到達区間はHOLD。重大問題・権利・未評価を平均点で相殺しない。
- 実機対象: Galaxy S26 Chrome、iPhone SE2 Safari、iPad mini 6 Safari、Windows 11 Chrome/Edge。環境バージョンを実行時記録。エミュレーションを物理端末PASSにしない。

## 開発環境・運用
- Node 26 LTS、React 19.3系候補。Vite・TypeScript・Vitest・RTL・Playwright・ESLint・jsdomの安定互換版をPhase 4で候補照合、Stage A-1の許可後にlockfile生成と実機能検証を行う。実行環境の正確な版は未確認。既存repoルート設定と共通資産は無断変更しない。
- 公式参照: https://nodejs.org/en/about/previous-releases ; https://react.dev/versions ; https://vite.dev/guide/ ; https://vitest.dev/guide/ ; https://playwright.dev/docs/intro ; https://testing-library.com/docs/react-testing-library/setup/
- Vite base=./、ゲーム固有ディレクトリ内のpackage/lockfile、build結果dist。npm ci、typecheck、lint、unit/contract/integration/component、validate:content、build、preview、e2e、regression。公開先docs配下の現行構造はPhase 4で読取照合。公開承認後にのみ同一buildを配置。QA fixture/診断機能・秘密情報は公開対象外。
- AG-01共通契約・ビルド・統合、AG-02作曲、03音声時刻、04譜面、05入力判定、06React、07素材描画、08保存、09QA、10コードレビュー、11楽曲レビュー、12譜面レビュー、13リリースQA。13論理役割は13並列起動の保証ではない。実行主体を記録し、独立レビュー不可の場合BLOCKED。AG-01以外の契約変更は変更申請。最大5是正ループ後はHOLD。
- Stage A-1基盤→A-2エンジン→A-3実機（POC-01〜18）→Stage B基準作品（REF-01〜10＋暫定VQ）→Stage C残4曲→Stage D統合。各段階の実績と承認がなければ後続へ進まない。QG-10は公開前の配信予定物照合と公開後の実配信照合に分ける。公開の明示許可が必要。

## 残課題・判定
- 静的型宣言チェックのみ実行済み（ローカルNode v22.16.0 / TypeScript 5.8.3）。ゲーム実装・実行・独立レビューは未実施。
- 参照整合性は機械検査済み。CSVの要求文とTCの意味上の網羅性、各fixtureの具体化、完全な承認済み設計文書への統合は未完了。全行が実行可能なテストであるとは主張しない。
- Phase 4でGitHub現行構成・依存候補・全設計本文を照合し、仕様差分と残課題を承認するまで凍結不可。Stage Aで音声時刻・入力遅延・排他・準備時間・実機挙動を実証する。
- 今回の新規詳細案（音色範囲、レーン重複入力、監視頻度、SFX予算、revisionリセット、性能試行単位、AT-124/125・TC-D5-001〜030）にはユーザー承認が必要。
