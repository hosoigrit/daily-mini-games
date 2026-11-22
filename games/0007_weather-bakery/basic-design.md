# 基本設計書｜Game #0007 おてんきベーカリー v0.4.1（承認済み・誤記修正のみ）

作成・更新：2026-11-21｜担当：ChatGPT｜**2026-11-21 ユーザー設計承認済み・実装未許可（v0.4.1は非機能的な文書修正）**  
参照要件：`02_requirements_APPROVED_v0.4.1.md`  
参照データ：`06_scenario_matrix_v0.4.json`  
将来の配置案：`games/0007_weather-bakery/basic-design.md`（未反映）

## 1. 設計方針

- HTML/CSS/JavaScript（ES modules）。当面フレームワークとサーバーを導入しない。
- **シナリオデータ（事実）とゲームコア（計算）と画面表示（描画）を分離**する。UIが需要・利益・ランクを独自再計算しない。
- シナリオはすべてデータ定義し、`scenarioId`で選択。プレイ中は変更不可。
- 乱数の取り扱いは初版不要。**同一週＋同一行動列は完全再現可能**。
- ルールに無効な値や欠けたデータがあれば処理を拒否。価格・在庫・評価で不整合状態を許さない。
- 記録は各週の整数ベストのみ。データ破損や書込拒否でゲームを止めない。

## 2. 全体構成

```text
タイトル：週を選択→開始
   │ 操作イベント
   ▼
 app.js ────────→ view/render（同一ファイル内の関数でも可）
   │ dispatch                                │
   ▼                                         ▼
 game-core.js ──→新 state ────────────→ DOM/UI表示
   │
   ├── rules/config.js [価格ペナルティ・基本定数・評価式]
   └── scenario-catalog.js [検証済みW01〜W06]
   │
   └────────────────→ storage.js [週別ベストの読み書き]
```

| 構成 | 責務 | 行わないこと |
| --- | --- | --- |
| `scenario-catalog.js` | 6週×5日の定数、週ID・名称・最大利益の参照、週データ検証 | DOM更新・乱数生成 |
| `config.js` | 原価・価格・天気ペナルティ・評価率の設定 | ゲームイベント処理 |
| `game-core.js` | 状態遷移、予報、実需要、売買、累計利益、週別ランク | 保存・DOM操作 |
| `app.js` | クリック等をアクションへ変換、描画、フォーカス・エラー案内 | 利益や閾値の独立した計算 |
| `storage.js` | W01〜W06のベスト保存、値とバージョンの検証 | 取引計算 |
| `index.html`／`styles.css` | セマンティックな操作画面、スマホ対応、絵本風デザイン | 見た目でゲーム状態を隠ぺい |

## 3. データ契約

### 3.1 定数

```text
RULES_VERSION     = 'rules-v3'  （設計用識別子。数値変更によりv0.3案から更新）
INITIAL_CASH      = 30
UNIT_COST         = 2
MAX_BAKE          = 12
PRICES            = [3,4,5]
DEFAULT_PRICE     = 4
DAY_COUNT         = 5
DEMAND_DELTA_MIN  = -2
DEMAND_DELTA_MAX  = +2
DEMAND_CAP        = 12
STAR_RATE         = {star1:58, star2:75, star3:90} （分母100）
```

`PRICE_PENALTIES`は `06_scenario_matrix_v0.4.json` の `settings.weatherPricePenalties` に一致させる。

### 3.2 ScenarioとDailyScenarioのスキーマ

```text
Scenario {
  id: 'W01'..'W06',              // 一意・必須
  name: string,                 // 日本語の短い週名
  days: DailyScenario[5],      // ちょうど5件
  verifiedMaxProfit: integer,  // 独立DP検算に基づく固定の理論値
  starThresholds: {star1,star2,star3} // ceil(M×比率)と一致
}

DailyScenario {
  dayNo: 1..5,                   // 連続・重複不可
  weather: 'はれ'|'くもり'|'あめ',
  baseDemand: integer,          // 0..12
  demandDelta: integer          // -2..+2
}
```

- データはJSON正本とゲーム組込用の定数の**内容一致**をテストで確認する。
- 同一のシナリオ定義はプレイ中に変更されず、stateにはIDを持つ。データは非表示の補助定数であり、秘匿保証はない。
- `verifiedMaxProfit`は実行時に全経路探索せず参照する。設計変更時にはオラクルのDP検算で再生成／更新する。
- 値を変えた際は`RULES_VERSION`更新を必須とし、旧ベストとはキーを分ける。

### 3.3 週別データ

数値の正本：`06_scenario_matrix_v0.4.json`。検証・目視のための一覧は以下。

| 週 | 日 | 天気 | 基礎客数 | 変動（ゲーム画面では開店前非表示） |
| --- | ---: | --- | ---: | ---: |
| W01 | 1 | くもり | 7 | +1 |
| W01 | 2 | あめ | 4 | -1 |
| W01 | 3 | はれ | 8 | +0 |
| W01 | 4 | くもり | 7 | -2 |
| W01 | 5 | はれ | 9 | +2 |
| W02 | 1 | あめ | 6 | +2 |
| W02 | 2 | くもり | 8 | +1 |
| W02 | 3 | あめ | 5 | -2 |
| W02 | 4 | はれ | 8 | +1 |
| W02 | 5 | くもり | 9 | +2 |
| W03 | 1 | はれ | 8 | -1 |
| W03 | 2 | はれ | 10 | +1 |
| W03 | 3 | くもり | 9 | +0 |
| W03 | 4 | はれ | 9 | +2 |
| W03 | 5 | あめ | 6 | -2 |
| W04 | 1 | くもり | 10 | -2 |
| W04 | 2 | はれ | 7 | +2 |
| W04 | 3 | あめ | 5 | -2 |
| W04 | 4 | くもり | 6 | +2 |
| W04 | 5 | はれ | 8 | +2 |
| W05 | 1 | あめ | 5 | -2 |
| W05 | 2 | あめ | 6 | +1 |
| W05 | 3 | くもり | 8 | +2 |
| W05 | 4 | はれ | 10 | -1 |
| W05 | 5 | はれ | 9 | +0 |
| W06 | 1 | くもり | 9 | +1 |
| W06 | 2 | くもり | 7 | -2 |
| W06 | 3 | あめ | 5 | -2 |
| W06 | 4 | くもり | 10 | -1 |
| W06 | 5 | はれ | 7 | +2 |

## 4. 画面仕様

| 画面ID | 内容 | 操作 |
| --- | --- | --- |
| TITLE | タイトル・遊び方・6週カード・週別ベスト/★達成状況・ランク閾値・開始・5営業日の説明 | SELECT_WEEK、START |
| PLAN | 「Wxx 週名／n日目」、今日の天気/基礎客数、価格別予報、所持金、製造数、製造費、0個警告 | SET_PRICE、SET_BAKE_COUNT、OPEN_SHOP、REQUEST_ABORT |
| DAY_RESULT | 今日の客数、売上、販売数、残り、費用、日次利益、現金、週名と日数 | NEXT_DAYまたはSHOW_FINAL、REQUEST_ABORT |
| FINAL | 週名、累計利益、星ランク、当該週ベスト、5日履歴、2種類の再挑戦ボタン | RETRY_SAME_WEEK、CHOOSE_WEEK |

### 4.1 スマホ向けタイトルラフ

```text
┌───────────────────────────┐
│ 🍞 おてんきベーカリー         │
│ 5日間で利益を増やそう！        │
│ 原価：2/個  値段：3・4・5      │
├───────────────────────────┤
│ 遊ぶ週をえらぼう               │
│ (●) W01 はじめての一週間       │
│     自己ベスト：未挑戦         │
│ ( ) W02 あめの月曜日           │
│     自己ベスト：未挑戦         │
│ ... W03〜W06 ...              │
├───────────────────────────┤
│ この週の★1/★2/★3目標        │
│ 35 / 45 / 54コイン (W01例)    │
│ [          はじめる         ] │
└───────────────────────────┘
```

- 320px幅では1列カード。375px以上でも最低タッチサイズ44pxと十分な文字幅を優先する。
- 週選択時にベストとランク閾値を更新。選択した週はラジオ等の文字ラベルで識別できる。
- 6週全解放、ランク未達も「再挑戦」を妨げない。
- **当日需要変動はPLANに表示しない**。未来の天気・基礎客数・変動値は非表示。値段別の客数予報は**今日の可能な範囲であり保証ではない**と記す。
- **0個で開店**時の売上0／取り消し不可メッセージをボタンの直前に常時表示。数量が1以上ならメッセージ非表示。0個でも通常のOPEN_SHOPを実行可能。
- PLANとDAY_RESULTの下部に「途中でやめる」。タップ後、確認ダイアログ「ここまでの5日間の進行は消えます。タイトルに戻りますか？」。キャンセル時にstateを変更せず、確定時のみ破棄。
- アクセシビリティ：中断確認でフォーカスをダイアログへ移し、キャンセル時は「途中でやめる」ボタンに戻す。中断確定後はTITLE見出しへフォーカス。

### 4.2 計画画面ラフ（W01日1）

```text
┌───────────────────────────┐
│ W01 はじめての一週間 1/5日目 │
│ 今日：くもり　基礎客数：7人   │
│ 現在資金：30コイン            │
├───────────────────────────┤
│ 値段を選ぼう                  │
│ ○ 3コイン：予報5〜9人         │
│ ● 4コイン：予報3〜7人         │
│ ○ 5コイン：予報1〜5人         │
├───────────────────────────┤
│ 焼く数                        │
│ [ − ]     0個    [ ＋ ]      │
│ 製造費0コイン (1個2コイン)    │
│ [          開店！          ] │
└───────────────────────────┘
```

- 価格ボタンはネイティブラジオ優先。キーボードTab/矢印/Enter/Spaceの通常操作を妨げない。
- 画面切替では見出しへフォーカスを移し、Tab順が視覚順に一致する。
- 保存失敗時の警告はテキストで表示し、重複する読み上げや連続通知をしない。
- 絵本風のCSSデザインとし、ゲームプレイに不可欠な要素を画像化しない。

## 5. 状態管理と画面遷移

```text
TITLE --SELECT_WEEK--> TITLE
TITLE --START [valid week]--> PLAN(dayIndex=0)
PLAN  --SET_PRICE / SET_BAKE_COUNT--> PLAN
PLAN  --OPEN_SHOP [valid]--> DAY_RESULT
DAY_RESULT --NEXT_DAY [0..3]--> PLAN(dayIndex+1)
DAY_RESULT --SHOW_FINAL [4]--> FINAL
PLAN / DAY_RESULT --REQUEST_ABORT--> 同フェーズ（abortPending=true）
同フェーズ --CANCEL_ABORT--> 同フェーズ（abortPending=false）
同フェーズ --CONFIRM_ABORT [abortPending]--> TITLE（進行破棄、初期化）
FINAL --RETRY_SAME_WEEK--> PLAN(dayIndex=0, same scenarioId)
FINAL --CHOOSE_WEEK--> TITLE(default selected W01)
```

| state | 型・条件 | 初期値 | 更新契機 |
| --- | --- | --- | --- |
| `phase` | TITLE/PLAN/DAY_RESULT/FINAL | TITLE | START/OPEN_SHOP/NEXT_DAY/SHOW_FINAL/RETRY/CHOOSE |
| `selectedScenarioId` | W01〜W06 | W01 | TITLEのSELECT_WEEK、CHOOSE_WEEKでW01へ |
| `activeScenarioId` | W01〜W06またはnull | null | STARTでセット、CHOOSE_WEEKでnullへ |
| `dayIndex` | 0〜4 | 0 | NEXT_DAY/START/RETRY/CHOOSE |
| `cash` | 非負の安全整数 | 30 | OPEN_SHOP/START/RETRY/CHOOSE |
| `selectedPrice` | 3/4/5 | 4 | SET_PRICE、次の日・再挑戦で初期化 |
| `bakeCount` | 整数0〜min(12,floor(cash/2)) | 0 | SET_BAKE_COUNT、次の日・再挑戦で初期化 |
| `dailyResult` | DailyResult/null | null | OPEN_SHOP、NEXT_DAY、RETRY/CHOOSE |
| `history` | 日番号順DailyResult[]、最大5 | [] | OPEN_SHOPで1件追加、RETRY/CHOOSEで初期化 |
| `bestProfitByScenario` | UI層のMap/record（6週分） | storage検査で読込 | FINALでのみベスト更新 |
| `bestSaveStatus` | saved/unregistered/corrupt/read-error/write-error | storageの成否 | ロード・保存成功/失敗 |
| `abortPending` | boolean、PLAN/DAY_RESULTでのみtrue | false | REQUEST_ABORT/CANCEL_ABORT/CONFIRM_ABORT |

`DailyResult`はv0.2のフィールド `dayNo,weather,price,baked,demand,sold,leftovers,revenue,cost,profit,cashAfter`に加え、必須の `scenarioId` を含む。各要素の`scenarioId`は`activeScenarioId`と一致しなければならない。

### 5.1 アクションのガード

- TITLE以外のSELECT_WEEK、PLAN以外のOPEN_SHOP、結果以外のNEXT_DAY/SHOW_FINAL、FINAL以外のRETRY/CHOOSEは状態を変更しない。
- `abortPending=true`中は`CANCEL_ABORT`／`CONFIRM_ABORT`以外の取引・日送り・選択変更アクションを拒否。`REQUEST_ABORT`はPLAN/DAY_RESULTのみで有効。`CANCEL_ABORT`はstateの確認フラグだけをfalseに戻す。`CONFIRM_ABORT`はTITLE/W01・現金30・履歴空に初期化し、**ベスト保存は行わない**。
- PLAY中の `activeScenarioId` への外部変更は許可しない。選択UIを一時的に隠すだけでなく、コア側でガードする。
- 有効なOPEN_SHOPは**同期的にDAY_RESULT状態へ移してから表示を更新**する。二重イベントはガードで拒否。
- STARTはTITLEからのみ、選択IDがカタログに存在するときだけ受理。標準定数の読み込み失敗時はゲームを開始しない。
- CHOOSE_WEEKはTITLEに戻し、週選択をW01に初期化する（予期しない前週自動再選択を避ける）。
- END後のRETRYは同じ週に1日目からやり直す。ベスト記録は初期化しない。

## 6. 計算フロー・不変条件

### 6.1 予報、客数、売買

```text
day = getScenario(activeScenarioId).days[dayIndex]
penalty = PRICE_PENALTIES[day.weather][selectedPrice]
forecast = [clamp(day.baseDemand - 2 - penalty,0,12),
            clamp(day.baseDemand + 2 - penalty,0,12)]
demand = clamp(day.baseDemand + day.demandDelta - penalty,0,12)
sold = min(bakeCount, demand)
leftovers = bakeCount - sold
revenue = sold * selectedPrice
cost = bakeCount * 2
profit = revenue - cost
nextCash = cash + profit
```

- `0 <= sold <= baked <= 12`、`sold + leftovers = baked`、`cost <= cashBefore`。
- `nextCash >= 0`、`sum(history.profit) = currentCash - 30`。
- `history.length <= 5`、同週の連続する日番号のみを含む。
- `forecast.low <= demand <= forecast.high`が6週30日×3価格のすべてで成立。

### 6.2 ランク計算

```text
M = catalog[activeScenarioId].verifiedMaxProfit
threshold1 = ceil(M * 58 / 100)
threshold2 = ceil(M * 75 / 100)
threshold3 = ceil(M * 90 / 100)
profit = cash - 30
rank = profit >= threshold3 ? 3
     : profit >= threshold2 ? 2
     : profit >= threshold1 ? 1
     : 0
```

- 週ごとのMは設定値を使用するが、テストでは**設定から独立したDPで完全情報の最適最終資金を探索**し一致を検証する。
- 同じ利益でも週が違えばランクは異なり得る。タイトルやFINALで「この週の目標」と明記する。
- ランク3をすでに得た週も再挑戦可能。負利益も「未達」で表示する。

## 7. 保存・読み込み設計

- `localStorage`の**キー案**：`daily-mini-games:0007:best-profit:rules-v3:W01` 〜 `:W06`。
- 保存値：10進整数の正規文字列。余分な記号・小数・NaN・Infinity・空欄・範囲外は破損扱い。
- 妥当な範囲：`-30 <= value <= catalog[scenarioId].verifiedMaxProfit`。スコアの大小はあくまで週内で比較する。
- `best`が未登録ならマイナス値も初回保存可。新しい利益が大きい場合だけ上書き。同点はそのまま。
- 読込結果を `found(valid value)` / `unregistered(null)` / `corrupt(invalid string)` / `read-error(exception)` に区別する。`read-error`時は旧記録の値を確認できないので**上書きしない**。`corrupt`は破損データを保持し続けず、正しい完走結果で再保存できる。
- FINALで**今回利益**は常に表示。「保存済みベスト」は読込確認できた値のみ表示し、未登録・破損・読込不可を区別。書込が成功した場合のみ保存成功を通知し、書込失敗時は過去の有効なベストをそのまま表示して「今回の結果は保存されていません」と明示する。
- Storageの読み込み・書き込みは`try/catch`、失敗時は端末内に記録できない旨を表示。コアの結果は正しく表示する。
- `rules-v3`はv0.4案の識別子。以前の案は未リリースのため既存記録の移行処理は不要。将来リリース後にルールやシナリオを変更する場合は別キーに分離する。
- 週別の★3達成数は保存値と週別閾値から導出する。別の累計データは保存しない。

## 8. 例外処理

| 状況 | 検出 | ユーザー向け挙動／復旧 |
| --- | --- | --- |
| W99、空の週ID、二重週ID | カタログ／core | 開始拒否。既存選択を維持 |
| 日数が5でない・不正天気・delta範囲外・M不正 | カタログ検証 | 起動時設定エラー、取引確定しない。仕様修正まで停止 |
| 価格や製造数の不正値 | core | 更新拒否。正しいボタン選択に戻す |
| 所持金不足 | coreとUI | 加算禁止・開店拒否、数量を修正 |
| OPEN_SHOP連打 | フェーズガード | 1回目のみ受理・履歴1件 |
| 中断確認中の開店・日送り | `abortPending`ガード | 無視しダイアログを維持 |
| 中断キャンセル／確定 | 要求元フェーズを照合 | キャンセルは処理しない／確定時のみ進行破棄、ベスト維持 |
| 0個開店の誤認 | 数量0のUI条件 | 売上0・取り消し不可を事前表示。開店自体は許可 |
| PLAY中に週変更を要求 | フェーズガード | 無効・状態不変 |
| NEXT_DAYの境界超過 | 日番号ガード | 5日目はSHOW_FINALのみ受理 |
| localStorageの破損値・別週キー | storage | 対象週は「記録破損」と表示し、完走後に妥当な値で上書き可能。別週のベストは維持 |
| localStorage使用拒否 | storage | プレイ継続・保存不可を案内。読込例外時は上書きしない |
| 以前保存されたベストが不明／破損 | storage.readの結果を区別 | 不明は「記録確認不可」、破損は「記録破損」。不明を「未挑戦」と偽らない |
| ブラウザ再読込 | 初期化 | TITLE/W01に戻す。途中復元なし |
| 予報と実客数が食い違う | 単体テスト・設定検証 | 誤値のまま取引せず修正（制作時） |

## 9. 将来のディレクトリ構成案（**未作成**）

```text
requirements/
└── 0007_weather-bakery.md

games/0007_weather-bakery/
├── basic-design.md
├── index.html
├── styles.css
├── src/
│   ├── config.js
│   ├── scenario-catalog.js
│   ├── game-core.js
│   ├── app.js
│   └── storage.js
├── tests/
│   ├── scenario-catalog.test.js
│   ├── game-core.test.js
│   ├── transitions.test.js
│   ├── storage.test.js
│   └── e2e/                    # 導入判断後のみ
└── learning-log.md

# ユーザーによる公開承認後のみ
docs/games/0007_weather-bakery/
└── ...
```

- 開発・テストの実行方法とパッケージ導入は、承認済み設計に従う。ES modulesは `file://`直開きではなくHTTPサーバーで確認する。
- 自動テストの推奨はNode標準テストランナー。リポジトリ共通設定への追加は変更承認が必要。
- `shared/`・既存ゲームを無断更新しない。公開時の原本コピーとURLの整合性・SHA-256一致を別ゲートで検証する。

## 10. 設計判断ログ

| ID | 採用提案 | 理由 | 代替・リスク |
| --- | --- | --- | --- |
| DD-01 | 検算済み6週固定 | リプレイと決定論的検証を両立 | 無限ランダムではない、暗記できる |
| DD-02 | 週選択は開始前のみ | 誤った途中切替を防ぐ | 途中変更不可。途中中断は確認後に可 |
| DD-03 | 価格・原価・ペナルティを共通化 | 週ごとに攻略ポイントを変えつつルールを統一 | ルール変更時は全週再検算 |
| DD-04 | 週別の最大利益比でランク | 週ごとの利益規模差を補正 | ★3の体感難度は完全に一致しない |
| DD-05 | 週別のベストのみ保存 | 異なる週の生利益を比べない | 記録管理対象が6件に増える |
| DD-06 | 初回W01、全週開放 | 初心者導線と自由選択を両立 | 週選択UIの設計が必要 |
| DD-07 | シナリオはカタログ定数 | ゲームコアのテスト・追加週に適する | 不正データ時は起動拒否の設計必要 |
| DD-08 | CSS中心の絵本風 | 素材ライセンス・軽量さ | イラスト演出は控えめ |
| DD-09 | 雨の日・価格5ペナルティを5 | 曇りと雨のゲーム上の違いを作る | 両天気を同じに戻す。最大利益・ランクは6週とも再検算で不変 |
| DD-10 | 途中中断は確認後のみ可能 | 週を誤選択した際の離脱経路 | 中断不可は離脱障壁。途中の週変更は引き続き不可 |
| DD-11 | 0個開店は許可し事前警告 | 緊急回避の合法行動を残し、誤操作を減らす | 二重確認は操作負担が大きい |
| DD-12 | 保存状態と今回利益を分けて表示 | 保存拒否時の誤認や失われたベストを防ぐ | 保存を強制するとプレイ不能になり得る |

## 11. 未決事項とゲート

- 設計承認済み：6週方式、星比率、雨価格5のペナルティ5、途中中断、0個警告、週選択UIの詳細、実機対象。
- v0.4設計内容は**2026-11-21ユーザー承認済み**。本v0.4.1は誤記の修正のみ。
- 実装／Push／PR／公開は、明示指示なしに実施しない。
