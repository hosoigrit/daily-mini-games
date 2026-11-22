# Codex実装依頼｜Game #0007 おてんきベーカリー｜E1開始許可済み

## 実行許可と停止境界
2026-11-21、ユーザーから「許可する」と明示回答があったため、**E1（シナリオ／ゲーム計算／状態遷移とそれらの単体テスト）に限り実装を許可します**。
先行資料 `07_codex_readonly_preflight.md` と `08_codex_implementation_request_HOLD.md` の「実装未許可」という表記は**E1についてだけ本書で上書き**します。
E2（画面・ストレージ）、E3（ブラウザ統合・回帰）、E4（独立レビュー）、**リモートへのPush・PR作成・マージ・GitHub Pages公開は未許可**です。
特にCodex CloudでPRを自動作成する設定・フローがあれば利用せず、リモート変更を行う前に停止してください。

## 対象と正本
- Repository: `hosoigrit/daily-mini-games`
- 事前のmain観測値（2026-11-21）: `233eb68361c492f5fedcbb191c7e70606e560a45`。実行時には現在のHEADを再取得し、差異を報告すること。
- 正本: `02_requirements_APPROVED_v0.4.1.md`, `03_basic_design_APPROVED_v0.4.1.md`, `04_test_plan_APPROVED_v0.4.1.md`, `06_scenario_matrix_v0.4.json`。`AGENTS.md`に従う。
- 本パックに含まれるv0.4.1の古い「実装未許可」表示は作成時点の履歴であり、本E1許可と矛盾する箇所のみこちらの文書を優先する。**ルール数値・設計内容の変更権限ではない**。

## 実行手順（この依頼は計画の作成だけではなく、E1の実装・テスト実行まで）
1. `AGENTS.md`、既存の `games/0005_hitofude-delivery`、Git状態、Nodeバージョン、ESM/テスト慣例を読み取る。未コミット変更や想定外のブランチ、#0006との作業競合があれば、既存変更を保護し報告する。強制Git操作はしない。
2. 作業範囲をE1に限定してローカルワークツリーで実装。新しいGame #0007専用ディレクトリを使う。既存ゲーム、`shared/`, `docs/`, CI、ルート設定は変更しない。必要ならゲームディレクトリ内に最小の `package.json` を追加する。依存パッケージは増やさない。
3. `games/0007_weather-bakery/src/config.js` に固定値を定義:
   - INITIAL_CASH=30, UNIT_COST=2, MAX_BAKE=12, PRICES=[3,4,5], DEFAULT_PRICE=4, DAY_COUNT=5, demandDelta=-2..2, demandCap=12
   - 晴れ: 価格3/4/5のペナルティ 0/1/3、曇り: 0/2/4、雨: 0/2/5
   - RULES_VERSION='rules-v3', 星率58/75/90%（切上げ）
4. `src/scenario-catalog.js` に W01〜W06の6週×5日を**添付JSONと一致**させて読み込める形で配置する。週ID一意、日番号1..5、天気値、整数、変動、理論最大利益、星閾値の不正があれば起動拒否する。乱数・ネット通信は禁止。
5. `src/game-core.js` に**DOM/保存を含まない純粋な計算および状態遷移**を実装:
   - 予報 `clamp(baseDemand -/+ 2 - penalty,0,12)`、実需要 `clamp(baseDemand+delta-penalty,0,12)`。
   - `sold=min(baked,demand)`, `leftovers=baked-sold`, `revenue=sold*price`, `cost=baked*2`, `profit=revenue-cost`, `nextCash=cash+profit`。
   - TITLE→PLAN→DAY_RESULT→FINAL、START/SELECT_WEEK/SET_PRICE/SET_BAKE_COUNT/OPEN_SHOP/NEXT_DAY/SHOW_FINAL/RETRY_SAME_WEEK/CHOOSE_WEEKのガードを実装。
   - PLAN/DAY_RESULTのREQUEST_ABORT/CANCEL_ABORT/CONFIRM_ABORTをサポート。確認中は他操作拒否。キャンセルはゲーム進行値不変、確定はTITLE/W01に初期化、履歴破棄。
   - 所持金制約・整数範囲を検証。製造0でも正常開店可。OPEN_SHOPを同日二度適用しない。5日目に6日目を作らない。
   - 日次結果に scenarioId を必須。履歴の利益合計＝ cash-30、販売数+廃棄数＝製造数、cash>=0 を維持。
   - 週別のランクは`verifiedMaxProfit`と58/75/90%から計算し、閾値境界を保証する。
   - ここではUI、HTML、CSS、localStorage、ブラウザE2Eの実装には進まない。
6. Node標準`node:test`を用いて、独立期待値から計算するテストを追加:
   - シナリオのスキーマ・JSON一致、6×5×3=90予報、6×5×3×13=1,170取引、境界値。
   - W01日1:価格4/製造6→需要6/売上24/原価12/日利益12/資金42。
   - W02日3:価格3/製造3→需要3/利益3。
   - 状態初期化、W05選択、誤ID、異常な価格と数量、所持金不足、OPEN_SHOP二重呼出、5日境界、再挑戦、他週切替、中断キャンセル/確定、確認中操作拒否を検証。
   - 6週間について資金制約込みの独立DPで理論最大利益 `[60,69,79,66,67,60]` と到達可能な合法行動列を検証。価格3/4/5が各週の少なくとも1日で最適になる検査も追加。
   - ランク境界と決定論的再実行。UIと保存のテストは未実施／E2で実施と明記。
7. 実際にテストコマンドを実行し、環境・件数・PASS/FAIL/SKIP・失敗時のログを保存。未実施をPASSと表現しない。修正ループは原則最大5回。
8. 実装結果を報告して**E1終了時点で停止**。E2の開発やリモートGitHub変更を勝手に続けない。

## 期待する変更ファイル
- `games/0007_weather-bakery/src/config.js`
- `games/0007_weather-bakery/src/scenario-catalog.js`
- `games/0007_weather-bakery/src/game-core.js`
- `games/0007_weather-bakery/tests/scenario-catalog.test.js`
- `games/0007_weather-bakery/tests/game-core.test.js`
- `games/0007_weather-bakery/tests/transitions.test.js`
- `games/0007_weather-bakery/learning-log.md`
- 必要なゲーム内の最小設定・同梱JSON・承認済み仕様の参照コピー（勝手な内容変更不可）

## E1合格ゲート
- データ・ルールがv0.4.1正本と完全一致。
- 指定の予報90条件、理論的な取引1,170条件を全件検証（通常の状態遷移テストとは別）。
- 独立DPによる全6週の到達可能な最大利益と検算用経路が一致。
- 主要状態遷移／連打／中断／整数・資金境界テストがPASS。
- E1対象のFR・AC対応表を作成し、UI/保存/実機関連は正直に未実施と報告。
- GitHub Push/PR/マージ/Pages公開がいずれも未実施。

## 完了時の返答フォーマット
1. リポジトリHEAD SHA・ブランチ・未コミット状態（開始前後）
2. 変更/新規/削除ファイル一覧
3. E1実装概要、仕様上の判断と設計との差異
4. FR/AC対応状況
5. 実行したテストと全結果、証拠ログ
6. 不具合・未解決リスク・E2向け引継ぎ
7. 禁止したGitHubリモート操作が未実施であること

**本件のE1実装開始は承認済みです。再確認だけで作業を止めず、指定範囲を実装し、テストし、結果報告してください。**
