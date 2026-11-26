# Chromium 長時間同期観測

Chromium 159.0.8154.6、既存 Playwright 設定、単一ワーカー、独立ブラウザ起動。短時間試験の最大は0.106333 ms。24秒のR2通常試行は4回完走、6回安全停止、停止再開は3回成功。84秒の通常試行は2件で同期超過を検出し、1件はハーネス全体の124秒で終了して時計の添付を回収できなかった。試験コードのオフライン準備に配分する総時間だけを延長し、この1試行を補足再計測した。元の試行は timedOut のまま保存した。

| 条件・観測 | 監視の実間隔 | 出力 performanceTime 進行 | 出力 contextTime 進行 | 符号付き残差 |
| --- | ---: | ---: | ---: | ---: |
| 既存24秒回帰 #2、66番 | 100.700 ms | 100.100 ms | 90.110 ms | −20.023 ms |
| 既存24秒回帰 #3、229番 | 134.300 ms | 140.300 ms | 100.229 ms | −40.042 ms |
| R2 24秒 #2、64番 | 103.100 ms | 161.100 ms | 110.713 ms | −50.544 ms |
| R2 24秒 #4、7番 | 112.600 ms | 241.400 ms | 70.192 ms | −170.733 ms |
| R2 84秒 #1、325番 | 193.200 ms | 191.600 ms | 80.538 ms | −121.034 ms |
| R2 84秒 #2、142番 | 138.600 ms | 135.400 ms | 38.275 ms | −97.439 ms |

超過時にもR2の AudioContext.state は running。24秒 #2のように監視自体がほぼ100 msでも、出力の2時計の増分に段差が出る。24秒のP99は0.517 msで、一部の段差が最大にほぼすべて寄与している。時計の継続的な傾きのずれだけではこれらの生データを説明できない。

固定版の Chromium ソースでは、AudioDestination は経過フレームと出力遅延から context 側位置を、コールバックの時刻から timestamp を構成する。AudioContext はグラフ内の出力位置を Performance 時刻に変換して公開する。監視間隔の伸び、ネイティブ時刻の段差、音声処理の一時的な遅れは別々に観測した。スケジューラーや音声バックエンドを原因として同定するには追加の計測が必要。

[固定版 AudioDestination](https://chromium.googlesource.com/chromium/src/+/refs/tags/159.0.8154.6/third_party/blink/renderer/platform/audio/audio_destination.cc#723) · [固定版 AudioContext](https://chromium.googlesource.com/chromium/src/+/refs/tags/159.0.8154.6/third_party/blink/renderer/modules/webaudio/audio_context.cc#1082) · [PlaybackStatsのIDL](https://chromium.googlesource.com/chromium/src/+/refs/tags/159.0.8154.6/third_party/blink/renderer/modules/webaudio/audio_playback_stats.idl)

## 追加診断

通常条件から分離した24秒2試行で PlaybackStats と cgroup を収録した。1試行完走、1試行が161番で −29.999 msに達して安全停止。この観測では実監視間隔100.600 ms、出力 Performance時刻増分100.100 ms、出力 contextTime 増分80.138 msだった。

2試行401観測の underrunEvents と underrunDuration は全件0。異常を挟む cgroup の約1秒の区間ではスロットリングの追加記録がなかった。CPU PSIはUNAVAILABLE。集計単位が粗く、オーディオスレッド個別のスケジューリングや、ブラウザがカウントしない音声の遅れは判定できない。取得した baseLatency 10.021 msと outputLatency 32 msはブラウザの報告値。

固定アンカーに入力されるネイティブ時刻で超過を確認し、製品と独立実装の境界判定は一致した。原因はUNKNOWN。通常結果と診断結果を分け、診断getterの時間が正常試行の集計に入らないようにした。

84秒 #3の補足試行は839観測で完走、最大2.578833 ms。音源生成41,586 ms、全168の0.5秒区間に信号があり、PCMは32,256,000 bytes。最初の84秒3試行の未達と、負荷fixtureの生成参考基準超過を維持した。
