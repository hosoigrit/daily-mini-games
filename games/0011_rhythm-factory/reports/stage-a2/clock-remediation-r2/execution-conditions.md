# 実行条件と再現手順

## 版・試行条件

Node.js 26.13.1、npm 11.20.0、Playwright 1.65.1。Playwright の固定 Chromium 159.0.8154.6、Firefox 159.0、WebKit 27.2 WPE を Linux Debian 13で使用。前回までの起動補助、ヘッドレス条件、ループバック試験のみ。Firefox 従来環境と隔離環境の間でブラウザ起動引数とセキュリティ設定は共通。環境差分はタスクソケットを指定する `PULSE_SERVER`、認証ファイルを指定する `PULSE_COOKIE`、自動起動を無効化する `PULSE_CLIENTCONFIG`。PulseAudio 自体は未権限のタスクプロセスとして起動し、パッケージ展開先と設定は既存OSから分離した。

| 条件 | 実行方法 |
| --- | --- |
| 従来回帰 | `npm run test:e2e -- --workers=1 --retries=0 --reporter=list,json stage-a2a-audio.spec.ts a2ar-trial-cycle.spec.ts subpath.spec.ts` |
| R2実機能・反復 | `STAGE_A2AR2_CONDITION=<condition> npm run test:e2e -- --workers=1 --retries=0 --project=<engine> --reporter=list,json tests/browser/a2ar2-playback.spec.ts` |
| 最小ハーネス | 前回の `tools/clock-a2ar-probe.mjs` を作業外のコピーに置き、プロファイルを1エンジンだけに絞った。各3起動。Firefox はこの診断実行にだけ `MOZ_LOG=timestamp,sync,cubeb:4,MediaTrackGraph:4` と `DEBUG=pw:browser` を指定 |
| Chromium追加診断 | `STAGE_A2AR2_CONDITION=chromium-diagnostics`、同じ再生ケースの24秒試行1–2を指定。Native PlaybackStats と1秒間隔の cgroup CPU統計を追加収録 |
| 静的回帰 | `npm run typecheck`、`npm run lint`、`npm run check:architecture`、`npm run build`、`npm test` |

Playwright には `PLAYWRIGHT_JSON_OUTPUT_FILE` で条件別の出力先を指定。既定 E2E は30件のまま。反復用ケースは環境変数があるときだけ登録し、各条件でブラウザを毎回新規起動した。同じ AudioContext での停止と再開は、1コンテキスト内の新世代と異なる音源 ID を検証する。独立した自然再生と分けて集計した。

最小ハーネスの待機打ち切りは証拠採取用。製品の音声起動条件は従来どおり。100 ms監視の初回から固定アンカーを使用し、20 msは包含して超過をその観測で停止した。PCM走査とオフラインSFXは信頼済みクリック前に実施し、再生計測と時間上分離した。

PCM、ブラウザ、ライブラリ、認証ファイルはリポジトリに置いていない。仮想出力とブラウザ計測は内部時刻の検証として扱う。物理出力、主観試聴は未実施。

## 試験収録の例外

Firefox 隔離試験の完了直後、実行中の補助シェルに診断開始待ちを追加した影響で、コンソールログがラッパーの終了エラーに上書きされた。Playwright の JSON 本文には16件すべての終了状態・時計添付・実行時間が残り、9 PASS・7 FAILを独立担当が照合した。ラッパーの終了126はブラウザ試験の判定に使っていない。

Chromium 84秒の初回 #3 は全体124秒の上限に達し、生の添付を回収できなかった。追加計測では84秒ケースの準備用枠を20秒から110秒に増やした。ライブ実行側の待機、固定アンカー方式、100 ms監視、初回を含む20 ms基準は共通。#3の追加計測は別条件とし、初回のタイムアウトを保存した。
