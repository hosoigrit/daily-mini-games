# Game #0006『交差点パニック』Phase E3-A 実装報告

確認日 2026-11-21

## 実装結果

既存のPure Game Engineを使い、HARD-Aを試験用難易度としたブラウザ版を実装した。画面には信号、東西・南北の切替ボタン、4方向それぞれの待機台数と危険度、残り時間と得点を表示する。車両はSnapshotの台数分を描画し、通過イベントを受けて進行方向に動かす。一時停止、手動再開、次の挑戦、最高記録の表示と保存に対応した。

100msの固定tickを進行の単位とし、各フレームの時間差が500ms以下の場合に限り最大5tick処理する。500ms超または画面非表示で一時停止し、蓄積時間と保留入力を破棄する。切替入力は次tickに割り当て、同tickの重複を抑え、黄・全赤中は予約しない。タブ復帰後はユーザーの再開操作を待つ。

新しい挑戦は `2001〜9999` から前回と異なるseedを選ぶ。結果画面にHARD-Aとseedを表示する。保存キーは `daily-mini-games.0006.records.v1.HARD-A`。クリアの最高得点と全挑戦の最高得点を別に保持し、保存できない場合にもそのページの記録をメモリに保持する。技術エラーはGRIDLOCKと異なる画面で診断コードを表示する。

画面はHTML、CSS、ES Modules、オリジナルのSVG図形で構成した。キーボード操作、44px以上の主要操作ボタン、フォーカス表示、信号と混雑の文字表示、通知頻度の制御、低モーション設定に対応した。

## E1-L01と凍結版

| 確認 | 修正前 | 修正後 |
|---|---|---|
| PAUSEDで構造上有効なSWITCHを拒否 | `NOT_RUNNING`。返却Sessionの監査記録に残らず、同sequenceを再利用可能 | `NOT_RUNNING`。同じSnapshotでBoundaryが1件増え、sequenceの再利用・逆転は `INVALID_COMMAND_BATCH` |
| READY・FINISHED・ERRORで通常操作を拒否 | `NOT_ALLOWED`。返却Sessionの監査記録に残らない | `NOT_ALLOWED`。Boundaryを1件追加し、Snapshot・status・result・faultを保持 |
| 初期状態からPAUSED中のSWITCH拒否まで再生 | 拒否コードを再現するが監査が欠落 | 同じ拒否コード・状態・監査を再現。後続の正しいsequenceによる手動再開ではtickを保持 |

凍結Sessionと現在のSessionを同じseed・入力で実行し、結果を `evidence/e3a-audit-before-after.log` に記録した。修正後はOR-019、OR-020/ST-014およびE3-UT-19/20でも検証した。INVALID_COMMAND_BATCHで有効sequenceが進まない既存契約を保持した。

E2-Cの凍結基準は `5c132310cdd45308bbc4f78d153b7a741c1bcfd64a34292829100f98f159bfa8`。実行版は15ファイルのうち14ファイルが同一で、`src/session.mjs` のみE1-L01のために変わった。ユーザーの追加承認を受け、E2-Cの凍結照合と分離CLI事前検査の2件は一時ディレクトリに凍結Sessionを配置して既存の検査をそのまま実行する。歴史版を使った検査は15/15一致。

| ファイル | SHA-256 |
|---|---|
| 凍結Sessionと `tests/fixtures/e2c/session.mjs` | `7dcb8354af099cce747300dbecc208d00e67b8ecf9a5ae9d49e8b1885208b1e0` |
| E3-Aの `src/session.mjs` | `c1a0cebabe88f4de346033360e61e3798deb3d2f6bf22d9c8348a42bb15e2d19` |
| E2-Cの `holdout/run-holdout.mjs` | `87e79952ba333c7cf11a2f612852af86ad5cd073eb5b11c858ea06c57999ad88` |

全15件の比較値はレビューZIPの `evidence/e3a-freeze-comparison.json` に収録した。固定PRNGオラクルのファイル、HARD-Aの設定、BOT判断、統計、E2-C保存済み評価データ、承認済み設計5文書は着手前のハッシュと一致した。最終評価seed 0801〜1000の再実行は0件。

## Node.js自動テスト

Windows、Node.js v26.13.1。対象ゲームのディレクトリから `npm.cmd test` を実行した。Game #0002は `node --test tests` を使用した。

| 対象 | PASS | FAIL・SKIP |
|---|---:|---:|
| Game #0006 既存 | 114 / 114 | 0 |
| Game #0006 追加 | 16 / 16 | 0 |
| Game #0001 | 30 / 30 | 0 |
| Game #0002 | 36 / 36 | 0 |
| Game #0003 | 45 / 45 | 0 |
| Game #0004 | 76 / 76 | 0 |
| Game #0005 | 52 / 52 | 0 |

追加16件でE3-UT-01〜20を網羅した。30/60/120 FPSで同じtick入力の全Session状態を照合した。500ms境界、非表示復帰、制御競合、切替のロック、600tickでの終了優先、9台目での即時終了、記録破損、拒否操作の監査・再生を検証した。既存のE2-Cテストに含まれる最終評価範囲のIDは、ガードでの拒否や合成行のラベルの確認に使われる。

## ChromeブラウザE2Eと画面証跡

Chrome 157.0.8103.79（Windows、ヘッドレス）でE3-E2E-01〜12が12/12 PASS。ループバックのサブパスで配信し、通常のCryptoとRAFでマウスによる開始・時間の進行・停止を確認した。決定論的シナリオはブラウザテストだけでRAF・seed・非表示イベント・保存拒否を制御した。ページ自身の入力ハンドラーと実装済みレンダラーが動作し、マウス・キーボードとエミュレーション上のタッチを検証した。実機のタブ切替は下記の実機確認に残る。

| HARD-Aの再現シナリオ | 観察結果 |
|---|---|
| seed 2001、無操作 | 北8台の状態で次の到着が発生し、tick 449（44.9秒）で直ちにGRIDLOCK。280点 |
| seed 2001、次tick 415・563・597で南北・東西・南北操作 | tick 600（60.0秒）でCLEAR。黄の遷移を残した状態でも正常終了。49台通過・490点・切替3回 |
| Chromeの幅320・375・768・1280および横向き667×375 | HUD・4方向の待機表示・操作ボタンが横に見切れず、主要ボタンの高さ44px以上 |

`evidence/browser/` に実画面PNG 9枚（タイトル、走行中、黄、全赤、一時停止、GRIDLOCK、CLEAR、375pxのタイトル・走行中）と全シナリオのログを収録した。

### ローカル起動と再検証

ゲームのディレクトリで実行する。プレビューは `http://127.0.0.1:8086/games/0006_traffic-panic/` を開く。

```powershell
node tests/preview-server.mjs
npm.cmd test
node tests/browser-e2e.mjs 'C:/path/to/e3a-evidence'
```

Chromeが既定の場所と異なる場合は `CHROME_PATH` に実行ファイルの絶対パスを設定する。今回の既定サンドボックスではChromeのCrashpad起動が失敗したため、ブラウザ検証のみ専用一時プロファイルを使いサンドボックス外の実行で完了した。

## 変更ファイル

| 区分 | ゲームディレクトリからのパス |
|---|---|
| 更新 | `src/session.mjs`、`tests/session-replay.test.mjs`、`tests/holdout-preparation.test.mjs` |
| 画面・ブラウザ層の追加 | `index.html`、`styles.css`、`ui/app.mjs`、`ui/browser-controller.mjs`、`ui/renderer.mjs`、`ui/persistence.mjs` |
| テスト・ローカル配信の追加 | `tests/fixtures/e2c/session.mjs`、`tests/browser-controller.test.mjs`、`tests/persistence.test.mjs`、`tests/browser-e2e.mjs`、`tests/preview-server.mjs` |
| 記録の追加 | `phase-e3-implementation-report.md`、`phase-e3-learning-log.md`、`manual-device-test-procedure.md` |

## Git状態と未解決事項

ブランチは `codex/game-0006-phase-e1`、HEADは `b5c05f06728dd10485c25388ac38e264247908f3`。ローカルの `main` と `origin/main` の参照は共に `233eb68361c492f5fedcbb191c7e70606e560a45` で、`main...HEAD` は `9 0`。追跡済みファイルに差分はない。Game #0006は作業ツリーの未追跡ファイルとして存在する。着手時のゲーム内既存61件を再照合し、許可された既存3ファイルだけに差分を確認した。Gitは読み取り確認のみ。

- 独立レビューと人間によるPC Chrome/Edge・Android・iPad・iPhone Safariでの操作確認が残る。実機の入力、タブ切替、Safariの表示と保存はNOT RUN。
- HARD-Aは試験用難易度。人間の遊びやすさと戦略性は未評価。
- ローカル `main` に対して9コミット遅れ、Game #0006は未追跡。将来の統合前に履歴と回帰の再確認が必要。
