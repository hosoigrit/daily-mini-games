# Game #0011『リズムファクトリー』実機QAハーネス

Stage A-2a-R3の技術検証専用です。正式判定は **HOLD** です。この段階のブラウザ自動検証はQA操作と証跡の確認に限定します。物理端末試験は別途承認待ちです。

製品音声エンジンと固定世代時計を `src/product.ts` と `src/controller.ts` から直接importします。24秒の「回転灯」と84秒のR2負荷fixtureも元のソースを直接使用します。試行ごとに新しい音声エンジンで冷生成し、`AudioBuffer` の保持数と生成数、全サンプルの有限性とピークを記録します。時計監視は初回から100 ms間隔で、20 msちょうどを許容します。異常判定は既存時計実装に従い、安全停止した点も保存します。

## ローカル実行

承認済みの Node.js 26.13.1、npm 11.20.0、既存ロックファイルの依存関係を準備済みの作業環境で使用します。以下は `games/0011_rhythm-factory/` から実行します。開発・プレビュー用サーバーはループバックに限定します。

```sh
./node_modules/.bin/vite --config qa/device-audio-clock/vite.config.ts --host 127.0.0.1 --port 4183 --strictPort --base /qa/device-audio-clock/
./node_modules/.bin/tsc -p qa/device-audio-clock/tsconfig.json
./node_modules/.bin/vitest run --config qa/device-audio-clock/vitest.config.ts
./node_modules/.bin/playwright test --config qa/device-audio-clock/playwright.config.ts
```

QAの正式なビルド証跡を作るときは、QAソースをコミットし、そのコミットをチェックアウトしたクリーンな状態でビルドします。ビルド時の Git HEAD、製品実装SHA、R2基準SHA、fixtureのソースSHA-256を画面とJSONに付与します。ローカル開発サーバーの表示値は起動時点のHEADです。ソース変更中の開発表示は同一性の証跡として扱いません。

```sh
./node_modules/.bin/vite build --config qa/device-audio-clock/vite.config.ts
STAGE_A2A_QA_TEST_PREVIEW=1 ./node_modules/.bin/playwright test --config qa/device-audio-clock/playwright.config.ts
```

QA成果物は `qa/device-audio-clock/dist/` に生成します。製品のビルド入口と設定は従来どおりです。サイト化が別途承認された場合は、R3の Sites 向け DRAFT と固定SHA・ハッシュの引き渡し一覧を使用します。

## 画面と結果の扱い

- 試行モニターは現在の同期差、最大値、有効観測数、超過数、固定アンカー、時計世代、生成時間と停止理由を表示します。グラフには既存の観測点を使用します。
- 端末区分、OS・ブラウザのバージョン、音声出力、省電力状態はユーザー申告です。画面サイズと向きはブラウザ取得値です。未申告の項目は `null` で記録します。
- 前景を離れた実行中の試行は中止扱いで保存します。画面の向き変更はイベントとして記録します。タブを閉じると未エクスポートの結果は失われるため、終了前にJSONを保存してください。
- JSON出力は端末内で実行します。保存はブラウザへのダウンロード要求です。保存先でファイルが開けることは操作者が確認します。クリップボードAPIが許可された場合は成功を表示します。利用不可の場合は理由と手動保存・コピー用のJSONを表示します。
- 結果はメモリに保持し、製品保存キーや他ゲームのストレージへアクセスしません。バックエンド、外部音楽生成サービス、端末固有IDや位置情報を使用しません。

## JSON の読み方

`schemaVersion` は `1` です。各 `trials` 要素にハーネス・製品・R2の識別子、fixture IDとハッシュ、試行ID、申告条件、アンカー、生観測、準備計測、イベント、停止・解放・再開の結果を保持します。時計時刻と生成時間の単位はフィールド名とスキーマで確認できます。無効な時刻は `null` で記録し、同期統計に含めません。閾値超過の回数は製品実装の判定から集計します。

`a0`、`currentTime`、`contextTime` は音声時計の秒です。`p0`、`performanceNow`、`performanceTime` はブラウザの Performance 時刻のミリ秒です。アンカー世代ごとの観測値から、符号付き残差を `(contextTime − a0) × 1000 − (performanceTime − p0)` で再計算できます。`intervalMs` は同じ世代の直前観測からの実時間で、初回は `null` です。

`groups` は試験ケース、プロフィール、fixture、端末申告、出力方法、診断表示などが一致した試行ごとの集計です。P95とP99には昇順の `ceil(件数 × 分位点)` 番目を採用します。条件をまたぐ `summary` は件数を保持し、時間統計を `null` にします。失敗・中止・観測打ち切りを含む全試行を保持します。物理端末による確認済みフラグは、この段階の出力では常に `false` です。

[証跡JSONスキーマ](evidence-schema.json) · [実機試験計画](device-test-plan.md)

中止後、オフライン生成や音声解放が確認できない場合も試行を残します。結果を保存してからページを再読み込みします。通常完走は対応する世代のネイティブ終了通知と、音声時計の経過フレーム数を確認します。終了イベントの時刻は Web Audio 既定1量子（128フレーム）の分解能で扱い、実測のフレーム差を記録します。同期の20 ms基準は従来どおりです。
