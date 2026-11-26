# Stage A-2a-R2 判定

Stage A-2a-R2 と Stage A-2a は HOLD。Firefox は隔離 PulseAudio で有効化できた。長時間同期の超過は残る。承認版 WebKit は初回の同期基準を超過。Chromium は通常条件・追加診断の双方でネイティブ時計の同期残差が20 msを超過した。

## 既存 CLK-R ゲート

| ゲート | 判定 | 根拠 |
| --- | --- | --- |
| CLK-R01 | BLOCKED | Firefox 従来環境は最小15条件と再生回帰6件で有効化せず。隔離結果はR2-G01 |
| CLK-R02 | FAIL | 承認版WPEの実再生16/16で初回超過 |
| CLK-R03 | PASS | Chromium既存短時間試験、最大0.106333 ms。長時間はR2-G05/G06 |
| CLK-R04 | FAIL | 3ブラウザの全試行を正常終了できなかった |
| CLK-R05 | PASS | 制御fixtureの境界と、実際の出力時計超過で停止・解放を確認 |
| CLK-R06 | FAIL | Vitest 30/30、既存標準 E2E 14/30。対象テストを維持 |
| CLK-R07 | PASS | A-1 Vitest 18/18、E2E 6/6、本番ビルド、サブパス配信 |
| CLK-R08 | PASS | 原本・ロック・共通型・固定世代時計と基準を維持 |
| CLK-R09 | PASS | 独立担当による固定SHAレビューと生時計再計算 |
| CLK-R10 | PASS | 音源はWeb Audio API。外部音楽生成API利用0件 |

## 比較ゲート

| ゲート | 判定 | 根拠 |
| --- | --- | --- |
| R2-G01 | PASS | Firefox隔離環境のゲーム経路、全16試行で有効化と初期アンカー |
| R2-G02 | FAIL | Firefox隔離環境で7回安全停止、最大79.000 ms |
| R2-G03 | PASS | WebKit 330138のmain修正と2.54移植を確認。WPE公式ソース2.54.3を公表値と照合 |
| R2-G04 | BLOCKED | 条件を満たす候補バイナリを確認できず、隔離実行0回 |
| R2-G05 | FAIL | Chromium24秒完走4/10、安全停止6回 |
| R2-G06 | FAIL | Chromium84秒の通常試行で2回超過、1回はハーネス期限。補足1回は完走、最大2.579 ms。元の結果を維持 |
| R2-G07 | FAIL | ChromiumとFirefox隔離の停止再開は各3/3。WebKitは0/3。全ブラウザの正常再生条件は未達 |
| R2-G08 | FAIL | 安全停止、A-1、型・静的検査とビルドはPASS。既存A-2aの実再生回帰がFAIL |
| R2-G09 | PASS | AG-10が試験コードと配布リスクをレビューし、Fractionで再計算 |
| R2-G10 | PASS | 原本・依存・無料方式を維持。隔離音声は終了してローカルソケットを撤去。システム設定差分0 |

正式採用、Stage A-2b以降、GitHub登録は未許可。POC-02の実機・主観試聴はNOT RUN。84秒fixtureのPCM正当性、生成時間、ライブ時計はそれぞれの測定結果を保持する。
