# 『からくり工房』CR-010-R4 Phase 6 実機QA資料

- 現行Tested SHA `56334926fee679412c4978471f812d454e854525`。専用開発ブランチは `codex/game-0010-development`。
- 正式攻略配置は `qa/fixtures/cr010-certified-stages.json`。旧 `qa/fixtures/stages.json` は履歴として参照する。
- 配布対象とSHA-256は、`qa/state/runtime-manifest.json` の `CR010_R4.runtime_asset_inventory` にある46件。QA、テスト、旧証跡は移植対象外。
- 正式耐久 `TC-D7-015-C002` は実行 `CR010-R3-E8-ENDURANCE-1800-02` でPASS。
- **自動品質ゲートPASS、開発・自動検証CLOSED。** Phase 6の実機・人間評価と最終受入はHOLD。旧173件とCR-010追加5件は未実施。実機QAは別途のPhase 6承認後に開始する。

## 実機の記録条件

対象は Galaxy S26 Android Chrome、iPhone SE2 iOS Safari、iPad mini 6 iPadOS Safari、Windows 11 Chrome、Windows 11 Edge。端末・OS・ブラウザ・候補SHA・画面設定・操作方式・実測・判定を端末別に記録する。実機手順は凍結 `handoffs/game-0010/17_visual_qa_protocol.md` のDT-01〜16とCR-010改訂契約を適用する。Sitesの実際の移植差分は人間工程の `TC-D7-029-C001` で照合する。

- 通常10面では認定した星3配置を各環境で再現する。別解、初期未クリア、同じ部品IDの重複排除、ゴール表示とヒントを確認する。
- ST00の12 STEP、初回表示、スキップ、途中再開、取消、背景復帰、表示倍率、タッチ・方向キーを確認する。
- 新規保存とV1からの移行、旧原本の保全・書出し、競合・所有権交代、BFCache、音声と無音時の警告を確認する。他ゲームの保存データは変更しない。
- 人間評価では前回51点を履歴に維持し、新規評価を記録する。合格条件は総合80点以上、全項目3以上、重大・Must違反なし。

## 固定候補と残存リスク

- 実機固有のタッチ、画面回転、背景復帰、BFCache、音の聞こえ方、遊びやすさ・難易度は人間QAで記録する。
- 旧評価51点を保持し、新しい体験評価を別に記録する。
- 改訂ゲートは `qa/reports/gate_results.json` の `CR010_R4`。旧R3Cのゲートと引き渡し状態は履歴として次節に保持する。

## 旧候補・旧判定の履歴

# 『からくり工房』CR-010 改訂候補・Phase 6 実機QA資料

- 現行Tested SHA `56334926fee679412c4978471f812d454e854525`。専用開発ブランチは `codex/game-0010-development`。
- 正式攻略配置は `qa/fixtures/cr010-certified-stages.json`。旧 `qa/fixtures/stages.json` は履歴として参照する。
- 配布対象とSHA-256は、同候補の `runtime_asset_inventory` の46件。QA、テスト、旧証跡は移植対象外。
- 正式耐久 `TC-D7-015-C002` は実行 `CR010-R3-E8-ENDURANCE-1800-02` でPASS。
- **現時点はHOLD。自動品質ゲート承認後に実機QAを開始する。** 旧173件とCR-010追加5件は人間QA未実施。公開と最終受入は保留中。

## 実機の記録条件

対象は Galaxy S26 Android Chrome、iPhone SE2 iOS Safari、iPad mini 6 iPadOS Safari、Windows 11 Chrome、Windows 11 Edge。端末・OS・ブラウザ・候補SHA・画面設定・操作方式・実測・判定を端末別に記録する。実機手順は凍結 `handoffs/game-0010/17_visual_qa_protocol.md` のDT-01〜16とCR-010改訂契約を適用する。Sitesの実際の移植差分は人間工程の `TC-D7-029-C001` で照合する。

- 通常10面では認定した星3配置を各環境で再現する。別解、初期未クリア、同じ部品IDの重複排除、ゴール表示とヒントを確認する。
- ST00の12 STEP、初回表示、スキップ、途中再開、取消、背景復帰、表示倍率、タッチ・方向キーを確認する。
- 新規保存とV1からの移行、旧原本の保全・書出し、競合・所有権交代、BFCache、音声と無音時の警告を確認する。他ゲームの保存データは変更しない。
- 人間評価では前回51点を履歴に維持し、新規評価を記録する。合格条件は総合80点以上、全項目3以上、重大・Must違反なし。

以下は過去の候補と証跡の履歴。


# Game #0010『からくり工房』 Phase 6 実機・人間QA

対象ソースは `14adae996b3ec398ecced875619ae05d28a9b0ec`、物理プロファイルはPP03です。開発ブランチは `codex/game-0010-development`、凍結設計は `d5bae9f0afe6b6d860257e2dfec25e028e557a4f` です。

Phase 6の全173件は **NOT_RUN** です。最終受入は **HOLD** です。自動ゲートの現行判定は `gate_results.json`、子ケースの状態と実行証跡は `automated_test_results.json` を参照してください。

## 検証対象と記録

- 凍結版 `17_visual_qa_protocol.md` の端末と手順を使用します。Galaxy S26 Chrome、iPhone SE2 Safari、iPad mini 6 Safari、Windows 11 Chrome、Windows 11 EdgeでDT-01〜16を確認し、計80操作と10ステージ×5端末の基準攻略を記録します。DT-15は各端末の基準攻略証跡を参照できます。
- 認定配置は `qa/fixtures/stages.json`、攻略の実行IDと観測は `stage_validation_results.json`、自動ブラウザの性能・耐久は `performance_results.json` にあります。
- 各記録に実機の機種、OS、ブラウザ版、対象SHA、ケースID、実行ID、操作、期待値、実測値、判定を保存します。実機固有の前景描画、操作遅延、200%文字拡大、背景移行、端末回転、保存と競合、音声、耐久を確認します。
- 制御起動は同じ配信経路で前後に帯域とRTTを実測し、cold/warm各5試行の値を保存します。面白さ、操作、明瞭さ、難易度、自由度、再遊性、画、音について、凍結QAプロトコルの評価軸で試遊結果を記録します。
- Phase 6で配布先の比較を行う際は、実行ファイルハッシュ、配布パス、実行差分とアクセス設定を固定候補と照合し、TC-D7-029-C001に紐付けます。Sites移植と実際の配布比較は未実施です。公開には別承認が必要です。

PP03の動的板衝突は有限観測に基づきます。TC-D7-004-C002の旧実物理微小離脱・復帰はBLOCKEDで、CR007-Cによる実物理対照と製品結合の判定を保存しています。


## CR-010-R2 再QA準備資料

対象候補 `56334926fee679412c4978471f812d454e854525`。自動品質保証はHOLD。受入用の5環境確認は自動品質ゲートの終了後に、ST00全12STEP、ST01〜10、旧V1保全とV2移行、背景切り替えと復帰、体験評価を実施する。旧評価51点、合格は総合80点以上かつ全項目3以上、重大・Must違反なし。


## CR-010-R2 継続検証後

Chromiumでの実背景・BFCache・3音声モードを確認。実機5環境は採点前に自動ゲート終了を待つ。既存の評価基準を使用。


## CR-010-R3 検証報告

**自動品質ゲートはHOLDです。** Chromiumの正式30分耐久は合格しました。自動必須ケースの照合・実行が残っています。

検証候補 56334926fee679412c4978471f812d454e854525

## Chromium前景30分耐久

- 10 tickの開始・中止を100回。前景連続実測 1800.434 秒、反復 300 サイクル。背景遷移、クラッシュ、破棄後の物理更新は0件。初回部分結果は別に維持。
- 正式再試行は 1820 秒、400 world、90,550 tick。初回2,150秒を維持し、専用消費は 3,970／4,250秒。承認済みの再試行枠は消費済み。

## 個別ケースの状況

- 旧982件。164件 VERIFIED_OLD_UNCHANGED_LOCAL、485件 PASS_CURRENT_DIRECT_PROOF、46件 PASS_CURRENT_VERSIONED_LEGACY、58件 PASS_CURRENT_INDEPENDENT_REVIEW、173件 NOT_RUN_HUMAN、56件 CURRENT_ADMISSION_PENDING。
- CR-010追加・改訂78件。64件 PASS、9件 OBSERVED_PARTIAL、5件 NOT_RUN_HUMAN。
- 残りのケースIDと観測は qa/reports/automated_test_results.json。旧証跡と現候補の直接実行を区別。
- 全10面の星3、7別解、1,000回反復、30ヒントを実測・照合。ST00全12STEPと保存V2移行は既存現候補のChromium観測を維持。凍結mutation12種類および追加6種類は正常対照と意図した失敗を照合。

## Phase 6実機QAの準備

- 改訂版候補の実行資産46件のSHA-256を照合した。候補の攻略配置は qa/fixtures/cr010-certified-stages.json。自動ゲート合格後にST00、通常10面、保存V1→V2とV1原本、長時間の操作を実機で確認する。
- 5環境はGalaxy S26 Android Chrome、iPhone SE2 iOS Safari、iPad mini 6 iPadOS Safari、Windows 11 Chrome、Windows 11 Edge。採点は総合80以上、全項目3以上、重大・Must違反なし。Sitesでの差分照合はTC-D7-029-C001の実機工程。
- 旧証跡の参照先は履歴。現行候補、改訂版攻略、残件の実行条件は最新版の個別台帳を適用する。
- V2では実Web Locksの同時起動20組で同時OWNERなし。旧V1の原本とエクスポートはバイト一致し、V2初期化は主キー1件に限定。
- ST10は現行9面・星27から、実物理の2星と3星で10面・星29、30を観測。再読込で達成通知は再発火しなかった。
- 実背景・BFCacheの個別観測を採用。補助試験の終了時プロファイル削除エラーと全額精算は保持。
- 旧達成通知試験の失敗は保持し、未計測だった1 worldの消費をE8へ1,200 tick追記。旧記録を上書きしていない。
- 人間QA173件は未実施。旧体験評価51点を履歴に保持し、Phase 6および最終受入をHOLDとする。
