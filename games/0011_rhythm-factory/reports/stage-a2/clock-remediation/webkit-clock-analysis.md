# A2a-CLK-02 WebKit 固定アンカー同期

分類は BROWSER。管理版 WebKit 27.2 WPE の GStreamer Web Audio 経路で再現した。固定アンカーの監視は初回を含め100ms、20ms以内。内部判定時刻は整数μsを維持した。

- CASE-01〜03 で有効化、時計進行、低音量 Oscillator とバッファの終了を確認。CASE-04 ではアプリコードを読まず、3/3起動の初回監視で 99.333333、98.333333、100.666667 ms を観測した。
- 生データの同一時間軸では `performance.now()` と AudioContext の進行が約100ms、出力 `performanceTime` は約200ms進行する。開始予定をアンカー取得の後に置いた確認でも、最初の逸脱は予定した音声再生より前に発生した。初回監視違反後に発音を停止し、残りの値は無音状態の診断として保存した。
- Playwright が使用する上流 WebKit 基点の C++ 実装では、GStreamer のサンプルタイムスタンプを context 側に設定し、対応する出力時刻に単調時計の現在値と同じサンプル時間を加える。両者が実時間で進む経路では、出力時刻に進行が二重に加算される。今回の raw データと整合する。Safari や他の出力経路への一般化は行わない。

関連は IF-03/04、CLK-D-04、AT-044/120、TC-D4-030/038/043、POC-02。推奨は、別途承認の上で修正を含む WPE 管理ビルドを隔離評価し、現行の固定アンカーと全観測20msの条件で確認すること。同じ障害が出る現行版の JavaScript に比率補正や出力時計の置換を加える案は採用していない。

[該当する WebKit 基点](https://github.com/WebKit/WebKit/blob/5b391e6d3b14d549908dad2c6695999291313f30/Source/WebCore/platform/audio/gstreamer/WebKitWebAudioSourceGStreamer.cpp#L264-L272) · [未検証の上流変更候補](https://github.com/WebKit/WebKit/commit/82a63cbfae95099e50e62674de97b4619c2b9a54)

[WebKit 管理版の上流基点](https://github.com/microsoft/playwright/blob/v1.65.1/browser_patches/webkit/UPSTREAM_CONFIG.sh) · [Web Audio からの時刻公開処理](https://github.com/WebKit/WebKit/blob/5b391e6d3b14d549908dad2c6695999291313f30/Source/WebCore/Modules/webaudio/AudioContext.cpp#L220)
