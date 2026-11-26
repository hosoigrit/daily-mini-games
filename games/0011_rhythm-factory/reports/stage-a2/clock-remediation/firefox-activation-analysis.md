# A2a-CLK-01 Firefox 音声有効化

分類は ENVIRONMENT。Firefox 159.0 がこの承認済み環境で選んだ PulseAudio のコンテキスト初期化に失敗し、出力チャンネルが0で AudioContext が再開しないことを確認した。デーモン、ソケット、接続ポリシーのどれが初期化失敗を起こしたかは未確定。

- 同一管理版の新規起動3回、CASE-01〜04 の15条件で `event.isTrusted=true`、`navigator.userActivation.isActive=true`。初期状態も観測打ち切りも suspended、currentTime と出力 contextTime は0、resume は保留。
- クリック直後の resume、Oscillator/Gain の接続順両方、オフラインバッファ準備後のクリックで同じ結果。最小構成の CASE-01 から再現する。
- AG-10 が同じ承認済み設定で Firefox のネイティブログを収集。AudioIPC は libpulse をロードした後、pulse context が ready になるのを待つ段階で失敗。AudioCallbackDriver の初期化で出力チャンネル0。環境に `/dev/snd`、`/run/user/1000/pulse/native` は見えず、実出力に使える別の音声サービスは取得できなかった。
- ヘッドレスで比較した。既存環境に表示ソケットと Xvfb が存在せず、headed は BLOCKED。autoplay 設定、サンドボックス、OS、バックエンド、ブラウザ版の更新は0件。

関連は POC-01/02、IF-03、CLK-D-01、AT-044/083/106、TC-D4-003/040。推奨は同じ Firefox バイナリを、既に利用可能なローカル音声サービスとテスト用出力先がある隔離された環境で検証すること。新規 OS パッケージの導入や音声サーバー設定が必要なら、取得元、権限、分離、復元方法を先に承認する。

[Firefox 管理版の上流基点](https://github.com/microsoft/playwright/blob/v1.65.1/browser_patches/firefox/UPSTREAM_CONFIG.sh) · [Firefox の音声グラフ起動処理](https://github.com/mozilla-firefox/firefox/blob/9a2dc53c369c7ae5172018b35988e1d2ffeff402/dom/media/GraphDriver.cpp#L526)
