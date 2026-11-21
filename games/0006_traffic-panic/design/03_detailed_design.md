# Game #0006『交差点パニック』詳細設計書

- 版: **v1.0-rc3**（承認候補・未承認）
- 文書ID: TP6-DETAIL
- 対応: [01_requirements.md](01_requirements.md) / [02_basic_design.md](02_basic_design.md)
- 本書は**インターフェース・状態契約の仕様**であり、ゲームの実装コードではない。

## 1. 論理データ契約

### 1.1 Session
| 名称 | 型・制約 | 意味 |
|---|---|---|
| status | READY/RUNNING/PAUSED/FINISHED/ERROR | 操作・進行の制御権限 |
| snapshot | GameSnapshot | 最後に検証・確定したゲーム状態 |
| result | null/CLEAR/GRIDLOCK | FINISHED時のみ値を持つ |
| failureDirection | null/NORTH/SOUTH/EAST/WEST | GRIDLOCK時のみ値を持つ |
| fault | null/TechnicalFault | ERROR時のみ値を持つ |
| sessionId | string | リトライ時に新規作成 |

`Session.status`はエンジンが内部から勝手に更新するのではなく、ControllerがEngine返却結果と制御操作から決定する。`FINISHED`後は通常のtick更新を拒否し、RETRYは新しいSessionを作成する。

### 1.2 GameSnapshot
| 名称 | 型・制約 | 意味 |
|---|---|---|
| elapsedTick | integer [0,600] | 最後に確定したtick |
| signal | SignalState | 信号状態 |
| queues | {north,south,east,west}:各integer [0,8] | 4方向待機台数 |
| spawnCursor | integer [0,schedule.length] | 既処理発生イベント数＝次の参照位置 |
| arrivalAttempts | integer [0,schedule.length] | 到着試行数（超過を含む） |
| passedVehicles | nonnegative integer | 通過済数 |
| overflowVehicles | 0/1 | 9台目超過数 |
| switchCount | nonnegative integer | 受理された切替指示数 |
| maxQueueLength | integer [0,8] | 過去に観測された1方向最大待機数 |

`score`は`passedVehicles * scorePerVehicle`から導出し、重複した可変状態を持たない。プレイ結果はSessionに保持する。

### 1.3 SignalState
`phase`はEW_GREEN、EW_YELLOW、ALL_RED_TO_NS、NS_GREEN、NS_YELLOW、ALL_RED_TO_EWのいずれか。`phaseStartTick`は開始tick。黄・全赤中の`nextTransitionTick`は整数、青ではnull。青のときだけ`greenStartTick=phaseStartTick`、黄・全赤中はnull。

### 1.4 SpawnSchedule
各レコードは`eventId`（1から連続する整数）、`spawnTick`（整数1〜599）、`direction`（N/S/E/W）で構成。`spawnTick`昇順、同tickは`eventId`昇順。人工予定では同tick複数到着を許す。途中で超過した場合、そのイベントの`spawnCursor`を1進めてから処理を停止し、以降は未処理のままとする。

### 1.5 Config
ルール版、バランス設定ID、生成器版、tick長、ゲーム終了tick、黄・全赤・通過tick、発生フェーズと方向別比率、1台得点を持つ。基本ルールの変更とバランス値の変更は別の承認対象。設定はセッション作成時に検証し、プレイ中は不変。

## 2. API契約（概念仕様）
| API | 入力 | 成功出力 | 失敗 |
|---|---|---|---|
| createSession | Config, seedId | READY Session, immutable Schedule | INVALID_CONFIG / INVALID_SEED |
| applyControl | Session, control batch | 更新Session, 制御イベント | NOT_ALLOWED / INVALID_CONTROL |
| advanceTick | RUNNING Snapshot, targetTick, switch commands, Config, Schedule | 新Snapshot, domain events, command outcomes, terminal? | NOT_RUNNING / INVALID_SNAPSHOT / ENGINE_FAULT |
| getObservation | Session, 公開Config | BOT/人間が参照できる公開情報 | INVALID_SESSION |
| validateSnapshot | Snapshot, Schedule, Config | valid/violations | 検証結果のみ。黙って修正しない |
| generateSchedule | seedId, Config, generatorVersion | 検証済みSchedule | INVALID_CONFIG / INVALID_SEED |

`advanceTick`は元Snapshotを破壊的に変更しない。成功時の`terminal`は`null/CLEAR/GRIDLOCK(direction)`。Controllerがterminalに従ってSessionをFINISHEDへ移行する。失敗時は更新途中のSnapshotとドメインイベントを確定してはならず、最後の検証済みSnapshotを保持してControllerがERRORにする。

## 3. tickと入力境界
- STARTはREADY→RUNNING・tick0のまま。発生・通過処理なし。
- `elapsedTick=k`の次に処理するtickは`k+1`。有効な切替指示の`targetTick=k+1`。
- 切替指示の有効性は**自動信号遷移を行う直前の信号状態**で評価する。
- ただし、そのtickで切替が受理された場合は直ちに黄へ移り、そのtickは新規通過しない。
- tick600でCLEAR判定したらコマンドは実行しない。ログ上の理由は`TIME_UP_NOT_EXECUTED`（ゲーム操作の拒否というより未実行）とする。
- 1tick処理は **tick決定→時間切れ→信号操作→信号自動遷移→車両通過→車両到着→終了・不変条件検証→確定**。フェーズは設定とtickから純粋に導く（独立した可変状態にしない）。

### 3.1 信号切替オラクル
初期EW_GREEN、greenStartTick=0。tick100にSWITCH_NS受理：
- tick100〜109 EW_YELLOW。`phaseStartTick=100`,`nextTransitionTick=110`。
- tick110〜114 ALL_RED_TO_NS。`phaseStartTick=110`,`nextTransitionTick=115`。
- tick115からNS_GREEN。`greenStartTick=115`,`nextTransitionTick=null`。
- tick115に評価されるSWITCH_EWは、直前確定状態がALL_REDなので`TRANSITION_LOCKED`。tick116以降の有効な反対側指示は受理可能。
- NS最初の通過機会はtick127。

### 3.2 通過機会の条件
対象方向が青であり、`tick-greenStartTick>=passInterval`かつ`(tick-greenStartTick) mod passInterval = 0`なら通過機会。待機列が1以上なら1台通過、0なら空振り。青の2方向は同一tickにそれぞれ最大1台を処理できる。処理順とイベント記録順は北→南→東→西に固定。

### 3.3 到着・9台目
そのtickに発生予定がある場合、イベントID順に処理する。`arrivalAttempts`と`spawnCursor`を1増加。対象方向の待機数が8未満なら1増加、`maxQueueLength`を更新。既に8なら待機数は変えず`overflowVehicles=1`、`GRIDLOCK`確定、`failureDirection`を記録し、当該tickの後続到着を処理しない。**9台目に猶予なし、待機数9は作らない**。

## 4. セッション制御とコマンド競合
### 4.1 バッチとリプレイ記録
`InputBatch`は、順序を保証した`boundaryId`、評価前の`beforeTick`、受理された`commands[]`（各`commandSequence`付き）、操作結果を持つ。`boundaryId`は実際に入力バッチを評価するたび単調増加し、ゲームtickと独立する。空の無操作バッチを記録する必要はない。リプレイは入力バッチの順序とtick進行記録を組み合わせて再現する。

### 4.2 制御の優先順位
1. 非表示によるPAUSEと、明示的PAUSEを最優先する。有効なPAUSEを含む同一バッチの切替・RESUMEは破棄。
2. PAUSEDで、PAUSEが存在しない別のバッチのRESUMEを受理するとRUNNINGへ復帰。ただし同バッチの切替は破棄（次の独立した入力境界で受付）。
3. READYのSTARTは初期化のみ。STARTと同バッチの信号切替は破棄。
4. その他の有効な信号操作だけを次tickに割り当てる。FINISHED/ERRORの通常操作は拒否。

信号切替を含むバッチでは次の検証順序を使う：セッション状態→コマンド形式→`targetTick`→同tickの受理済み操作→信号が黄/全赤か→既に青の方向か→受理。最初の無効コマンドが後続の有効コマンドを塞がない。最初の有効切替が確定すると、残りの切替は`DUPLICATE`で拒否。拒否理由例：NOT_RUNNING、INVALID_TARGET、WRONG_TICK、DUPLICATE、TRANSITION_LOCKED、ALREADY_ACTIVE。

## 5. PRNG（実装と独立した規範仕様）
### 5.1 FNV-1a 32bit
- UTF-8バイト列、offset=`0x811C9DC5`、prime=`0x01000193`、各段階で32bitを超える部分を捨てる。
- 入力文字列：`TP6-v06|{seedId}|{EARLY/MIDDLE/LATE}`。seedIdは4桁文字列（例`0001`）。
- ハッシュ0は`0x9E3779B9`に置換。

### 5.2 xorshift32
順序：`x ^= (x << 13)`→`x ^= (x >>> 17)`→`x ^= (x << 5)`。全段階を32bit符号なし値として扱い、右シフトは論理シフト。1発生イベントにつき1回状態更新。正規化が必要なら`unsignedValue / 2^32`。

### 5.3 方向割当（整数の「未満」境界）
| フェーズ | N未満境界 | S未満境界 | E未満境界 | 残り |
|---|---|---|---|---|
| EARLY | `0x40000000` | `0x80000000` | `0xC0000000` | W |
| MIDDLE | `0x26666667` | `0x4CCCCCCD` | `0xA6666667` | W |
| LATE | `0x5999999A` | `0xB3333334` | `0xD999999A` | W |

`u < N境界`ならN、それ以外で`u < S境界`ならS、`u < E境界`ならE、その他W。32bit整数区間を確率の四捨五入なしで固定する。

### 5.4 固定ハッシュとPRNG先頭出力
| 入力 | ハッシュ | xorshift出力1/2/3 |
|---|---|---|
| `TP6-v06|0001|EARLY` | `F219EBB0` | `229E0CE7` / `835131A6` / `09D1C194` |
| `TP6-v06|0001|MIDDLE` | `FD1DB64C` | `31566766` / `4AE1EEDB` / `906C1D86` |
| `TP6-v06|0001|LATE` | `0F6F2025` | `86154790` / `F20D4C83` / `283D28ED` |

その他：FNV-1a(`hello`) = `0x4F9F2CAB`、xorshift32(初期値1)の1回目=270369。

## 6. BOTの契約
- BOTは直前の確定Snapshot（tick t-1）から得た公開Observationで、処理予定のtick t向けに決定する。
- BOT-01：操作なし。
- BOT-02：tick50、100、150…に、現在**青**の方向の反対を指示。黄/全赤ならその回はスキップし、予約・繰越しなし。
- BOT-03：tick70、140、210…に上記と同様。
- BOT-04：各tick判断。切替中なら操作なし。赤側の最大待機R>=7なら切替。そうでなければR>=5かつR−G>=2かつ`(t-greenStartTick)>=24`で切替。G=青側2方向の最大待機。それ以外は維持。
- BOT-05：tick tが5の倍数のときのみ判断（黄・全赤なら操作なし）。赤側最大>=7で即切替。次に`(t-greenStartTick)<12`なら維持。その他で予測による最大負荷改善が5000以上なら切替、同点は維持。

### 6.1 BOT-05の予測仕様
予測対象はtick `t`〜`min(t+39,599)`（最大40tick）。初期負荷＝観測時点(t-1)の各待機台数×10000。比べる行動は「現在青を維持」と「tick tですぐ反対青へ切替」のみ。予測中の追加切替なし。
- 各tick、候補行動・信号遷移→通過機会→公開ルールに基づく発生予定時刻の期待流入、の順に更新。
- 出現が予定されるtickに限り、現在フェーズの方向別確率（EARLY=2500ずつ、MIDDLE=1500/1500/3500/3500、LATE=3500/3500/1500/1500）を各方向の固定小数点負荷へ加算。
- 青の各方向で通過機会があれば`Q=max(0,Q-10000)`。赤・黄・全赤の通過減算なし。
- 初期負荷および各tick後の4方向の最大負荷を候補ごとに求める。予測上は9台相当でも打ち切らず比較する（これは真の待機台数の数学的期待値ではなく近似指標）。
- 比較値`R_hold - R_switch >= 5000`なら切替、未満なら維持。
- 公開設定による発生**時刻**は利用可能だが、seed由来の実際の方向・将来スケジュール自体は不可。

BOT-06は未来方向を読む検証専用でMVP必須ではない。BOTが例外を投げた場合は「操作なし＋診断」を返し、Engineは操作を捏造しない。

## 7. 不変条件
| ID | 条件 |
|---|---|
| INV-01 | N/S/E/Wの待機数は整数で0〜8 |
| INV-02 | 東西と南北が同時に青になる状態は存在しない |
| INV-03 | 黄・全赤中の新規車両通過イベントは0 |
| INV-04 | `arrivalAttempts = passedVehicles + sum(queues) + overflowVehicles` |
| INV-05 | `spawnCursor = arrivalAttempts`（イベントを先頭から順次処理する条件下） |
| INV-06 | `overflowVehicles`は0または1、1ならGRIDLOCK終了 |
| INV-07 | 得点は`passedVehicles × scorePerVehicle` |
| INV-08 | CLEARはelapsedTick=600、GRIDLOCKはelapsedTick<600 |
| INV-09 | `switchCount`は受理済み切替数 |
| INV-10 | `maxQueueLength`は過去の方向別待機最大値。超過車両は含まない |
| INV-11 | PAUSEDで進行状態が変化しない。FINISHED後は結果不変 |
| INV-12 | 版と初期状態・seed・操作バッチログを一致させた再実行で全確定状態・ドメインイベント一致 |

## 8. エラー契約
- 正常更新: `ok=true`、新Snapshotとイベントを返し、一括でコミット可能。
- 入力形式・コマンド無効: コマンドを拒否するが、合法な他操作・ゲーム進行を停止しない。
- 不正なセッション初期値、スケジュール不整合: セッション作成時に拒否。
- 更新中の不変条件違反: `ok=false`、faultと検査段階のみを返す。部分更新Snapshotを返さず、Controllerは保全済みSnapshotを維持しSessionをERRORへ移行。
- RendererやStorageの障害: ゲームルール上の敗北とはしない。

## 9. 設計の採否と未確定
本書はP0技術契約の**採用候補**。人間の承認前に仕様凍結を宣言しない。BASE最終難度、UI演出、最高記録表示位置、停止閾値の実機調整は実装・実測後にP1として扱う。設計の変更には影響要件・テストID・再検証範囲を記録する。
