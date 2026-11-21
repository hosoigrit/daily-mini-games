# Codex実装依頼書｜Game #0006『交差点パニック』Phase E1（Pure Game Engine＋自動テスト）

- 文書版：v1.0 / 2026-11-21
- 対象リポジトリ：`hosoigrit/daily-mini-games`
- 対象ゲーム：`0006_traffic-panic`
- 実装根拠：Game #0006 v1.0-rc3 の設計資料（同梱の `design/` 5ファイル）
- 承認境界：ユーザーが **Gate A（設計）を承認**。この依頼文をCodexに渡して実行を指示した場合にのみ、下記の**ローカルのPhase E1作業**を許可する。Gate A承認だけで実装を自動開始したり、リモートGitHubを変更したりしない。

## 0. 役割と最重要原則

あなたは承認済み仕様に従って実装・テストするCodexです。**ゲームの仕様を創作・変更しないこと**。特に、十字交差点1か所、北／南／東／西の直進、各方向最大8台、同じ方向への**9台目の到着で猶予なくGRIDLOCK**を保持してください。

今フェーズは **Pure Game Engine（ブラウザ非依存）とその自動テストのみ**です。UI・ブラウザ画面・CSS・Canvas・効果音・スコア保存・BOTによる1,000seedの本格バランス評価・GitHub Pages公開は実施しません。

## 1. 仕様資料（最初に読むこと）

1. リポジトリルートの `AGENTS.md`
2. 同梱 `00_GATE_A_APPROVAL_SCOPE.md`
3. 同梱 `design/01_requirements.md`
4. 同梱 `design/02_basic_design.md`
5. 同梱 `design/03_detailed_design.md`
6. 同梱 `design/04_test_plan.md`
7. 同梱 `design/05_review_decision_log.md`
8. リポジトリの既存ゲームのディレクトリ構成、実行手順、テストの命名規則

設計資料の見出しにある「未承認」「実装禁止」は**資料作成当時の履歴**です。現在の承認状態は `00_GATE_A_APPROVAL_SCOPE.md` を参照してください。ただし、**コード実装を開始する権限は、この依頼文をCodexへ実行指示として渡した時点に限定**されます。設計を改変できるという意味ではありません。

資料が欠けている、内容が矛盾する、またはリポジトリで既にGame #0006が存在して競合する場合は、**推測で進めず変更前にBLOCKEDとして報告**してください。

## 2. 許可範囲と禁止事項

### 許可すること（この依頼をCodexに実行させる場合）
- ローカルでのリポジトリ状態の**読み取り調査**（`git status`, `git diff`, 既存構成の確認）。
- `games/0006_traffic-panic/` 配下だけでの新規・変更ファイル作成。
- JavaScript ES Modulesでの純粋なロジックとNode.js標準 `node:test` を用いた自動テスト。
- ローカルでのテスト、静的チェック、実行結果の保存（当該ゲーム配下）。
- 仕様の実装可能性・曖昧さ・テスト上の問題点の報告。

### 明示的に禁止すること
- **git push、PR作成、マージ、GitHubへの書き込み、GitHub Pages公開、GitHub Actionsの実行**。
- `git commit`、`git reset --hard`、force push、保護設定変更、既存ファイルの破壊的な変更。
- `main` への直接の変更を意図したリモート操作。
- `games/0001_*`〜`games/0005_*`、`shared/`、`docs/`、ルート設定、CI定義、既存テンプレートの編集。
- React、TypeScript、外部ゲームエンジン、追加依存パッケージの無断導入。ネットワークアクセスを伴うインストール・課金処理。
- UI / ブラウザController / Renderer / Persistence / 本格BOT・シミュレーション実装を今回の作業に混入させること。
- 設計の値・PRNG・固定オラクルを、テストに合わせて無断変更すること。

変更をリポジトリ内の他パスに広げる必要が出た場合、作業を止めて理由・代替案・影響範囲を報告してください。

## 3. Phase E1の実装対象

設計文書に沿って最小限のファイル分割を決め、**分割理由を説明**してください（1論理責務＝1物理ファイルを強制しない）。推奨例：

```text
games/0006_traffic-panic/
  src/
    config.mjs
    prng.mjs
    spawn-schedule.mjs
    signal-fsm.mjs
    traffic-model.mjs
    state-validator.mjs
    game-engine.mjs
    session.mjs
  tests/
    prng.test.mjs
    signal-fsm.test.mjs
    traffic.test.mjs
    engine.test.mjs
    session.test.mjs
    replay.test.mjs
  implementation-report.md
  learning-log.md
```

必要に応じて削減・整理は可。ただしファイルの増加を目的とした抽象化は禁止。

対象となる論理責務：

1. **Config / ルール検証**：BASEの600tick、1tick100ms、初期EW_GREEN、黄10tick・全赤5tick、通過12tick、発生予定15/19/24件と、各方向の上限8台。
2. **PRNG / Spawn Generator**：UTF-8 FNV-1a 32bit、xorshift32、フェーズ別独立乱数、seed→不変なSpawnSchedule。`Math.random()`は利用禁止。
3. **Signal FSM**：6状態、操作受付判定、黄・全赤遷移tick、青方向の通過機会。
4. **Traffic Model**：N/S/E/W待機数、通過→到着、同一方向9台目到着時の即GRIDLOCK、車両数保存則。
5. **Game Engine**：入力Snapshotを破壊せず1tick処理、処理順固定、tick600 CLEAR優先、ドメインイベント／拒否理由を返す。
6. **State Validator**：不変条件、発生カーソル、到着試行、スコア導出、状態の妥当性。
7. **Pure Session Control**：READY/RUNNING/PAUSED/FINISHED/ERRORを分離し、START/PAUSE/RESUME/RETRYと同境界でのPAUSE優先を、ブラウザに依存せず検証できる最低限の契約。
8. **Deterministic Replay Tests**：同じseed・Config・操作バッチ列で全Snapshot／ドメインイベントが一致すること。

### 実装の細部で必ず守ること
- 処理tick `t` は直前の確定tick＋1。`t=600`なら車両発生・通過・切替指示を処理せず即CLEAR。
- 通常tickは、操作評価→信号遷移→通過→発生→9台目判定→不変条件確認→確定。
- 操作有効性の判定には当該tickの自動遷移**前**の信号を使用。切替受理時は即黄信号となり、そのtickの新規通過は不可。
- 青開始12tick後に初めて通過機会が発生。待機0の場合は空振りし繰越しなし。
- 同じtickの通過と到着では通過優先。各方向は北→南→東→西の固定順に処理・記録。
- 同一方向で8台待機中に到着したら、待機数を8に保ち`overflowVehicles=1`、到着試行数とcursorは1増加させ即GRIDLOCK。
- `arrivalAttempts = passedVehicles + sum(queues) + overflowVehicles`、`spawnCursor = arrivalAttempts`を維持。
- セッションのERRORとゲーム結果のGRIDLOCKを区別。更新途中に失敗した場合、部分更新を確定しない。
- 1つの入力バッチにPAUSEがあればPAUSEを優先し、同バッチのRESUME／SWITCHを破棄。入力の次tickへの予約繰越しをしない。
- Invalid commandは明示コードで拒否し、後続の有効コマンドを不必要に抑止しない。`TIME_UP_NOT_EXECUTED`はtick600の未実行を表す。

## 4. 自動テスト要求（実装前に固定オラクルを読むこと）

`design/04_test_plan.md` のテストを正とし、最低限以下のグループをNode.js標準テストでカバーする。

| グループ | 必須確認 |
|---|---|
| Golden PRNG | OR-001〜008：FNV-1a、xorshift32、seed0001、58件、先頭2件等 |
| 信号FSM | OR-009〜013、ST-001〜004：tick100/110/115/127、切替中入力拒否 |
| 車両・終了 | OR-014〜017、CASE-A/B/C：9台目、通過優先、tick600 CLEAR、seed0001無操作 |
| 入力制御 | ST-005〜014：連打、同tick先着有効指示、PAUSE/RESUME、予約禁止 |
| 不変条件 | INV-01〜12、ERR-T01〜05：不正状態、全件整合、原子的更新 |
| 決定論 | OR-018〜020、ERR-T09：同条件リプレイ完全一致、停止後不変、版差異 |

主要な固定数値：

- FNV-1a(`hello`) = `0x4F9F2CAB`
- xorshift32（初期値1、初回）= `270369`（`0x00042021`）
- `TP6-v06|0001|EARLY` → `0xF219EBB0`
- `TP6-v06|0001|MIDDLE` → `0xFD1DB64C`
- `TP6-v06|0001|LATE` → `0x0F6F2025`
- BASE全発生予定58件（15/19/24）
- seed `0001`：イベント1 tick13/N、イベント2 tick26/E
- seed `0001`・無操作：tick350、北方向GRIDLOCK、通過13、130点、到着試行30、待機N8/S8/E0/W0、超過1。

期待値を**実装自身から生成して正解にしない**こと。人工SpawnScheduleを使うテストは、合法なSnapShot／履歴とイベントID連続性を保つ（正常ケース）。不正入力テストは意図を明記する。

テスト未実施をPASSと書かない。すべての必須テストに対してPASS/FAIL/BLOCKED/NOT RUNを明示し、実行コマンドと件数を残す。設計ファイルのオラクル不一致が見つかったら値を書き換えず、**仕様差異として報告して停止**する。

## 5. 推奨作業順序

1. 変更を伴わない事前調査：`AGENTS.md`、設計5文書、既存Game #0001〜05の規則、作業ツリーの状態。既存のユーザー変更を絶対に上書きしない。
2. 実装計画：実装する関数とテスト対応表を簡潔に作成。重要仕様に疑義がある場合はBLOCKEDとして停止。
3. 設計オラクルを固定したテストの準備（Redを確認できる範囲で）。
4. PRNG → Spawn → Signal FSM → Traffic → Engine → Pure Session Controlの順に段階的に実装。
5. それぞれのテストを実行し、通過時点で不変条件と再現性を検証。
6. 既存ゲームの回帰に影響しないかを調査。共通コードを変更していない場合も、実行可能な既存テストを適切な範囲で走らせる。
7. `implementation-report.md` と `learning-log.md` を作成し、独立レビュー用の結果をまとめる。
8. 変更ファイル・テスト結果・未解決点・禁止操作未実施を報告して終了。**コミット・Push・PR作成は禁止**。

## 6. 成功判定と後続フェーズ

Phase E1の完了条件：コアの正常・境界・異常系テスト全件PASS、重要オラクル完全一致、不変条件違反0件、同seed・同操作ログのリプレイ一致、ゲームコードが既存ゲームを破壊しないこと、実行証跡と報告が揃っていること。

BOT-01〜05の実装、1,000seedバランス評価、ブラウザUI、E2E、スマホ実機、GitHub反映・公開は**別フェーズ**です。Phase E1の合格をもって、それらを自動実行しないでください。

## 7. 最終報告フォーマット（省略不可）

1. 作業対象のローカルブランチ名・作業開始時のHEADと`git status`
2. 新規・変更した全ファイルの一覧と役割
3. FR/NFR/OR/INV/CASE/ST/ERRごとの実装・テスト対応（未対応は明記）
4. テスト実行コマンド・Node.jsバージョン・PASS/FAIL/BLOCKED/NOT RUN件数
5. seed `0001` 無操作を含む固定オラクルの実測結果
6. 失敗テスト・未解決問題・仕様との差異・代替案
7. 既存Game #0001〜05への回帰確認範囲と結果
8. `git diff --stat` と `git status`（未追跡ファイルも含めて列挙）
9. **git commit / push / PR / merge / 公開を一切実施していないことの確認**
10. 独立ChatGPTレビューへ渡すための必要ファイルと手順

**この依頼文の終了条件：ローカルのPhase E1実装・テスト・報告まで。作業範囲の追加やリモートへの変更は人間の別途明示承認を求める。**
