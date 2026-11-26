# WebKit WPE 出力タイムスタンプ

2026-11-26 UTC に公式 Bugzilla、WebKit のコミット、Playwright リリースとブラウザマニフェストを照合した。

| 項目 | 確認結果 |
| --- | --- |
| 関連不具合 | WebKit 330138、WPE WebKit、RESOLVED FIXED |
| 上流修正 | `82a63cbfae95099e50e62674de97b4619c2b9a54`、326251@main、2026-11-10 |
| WebKitGLib 2.54への移植 | `48cd9362c826339335f579207478158fd16f2e9b`、2026-11-17 |
| 承認環境 | Playwright 1.65.1、WebKit 27.2、r2388、Debian 13、WPE MiniBrowser |
| 承認版の公開パッチ基点 | `5b391e6d3b14d549908dad2c6695999291313f30`。旧式の時刻生成あり |
| 公式比較候補として調べた配布物 | Playwright main r2401、Debian 13 amd64。正式な採用候補の条件を満たす証拠は未確認 |

旧実装では `AudioIOPosition.position` に GStreamer バッファ時刻を設定し、`AudioIOPosition.timestamp` に単調時計の現在値と同じバッファ時刻の和を入れる。2つが実時間で進むと DOM の `getOutputTimestamp().performanceTime` が約2倍で進む。WPEの最小試験では、アプリをロードしていない段階で初回の増分にこの形が出た。修正ではパイプラインの現在の実行時刻とパッドのオフセットから再生予定時刻を求め、レンダー量子のオフセットを反映する。

r2401のZIPは公式 CDN に存在し、独立担当がHTTPS取得した。公開されたビルドへのリンクが404で、内部の README はビルド日時とプラットフォームを示すが、ソース SHA を記載していない。公式の照合用ダイジェストを確認できず、CDN の ETag はバイナリ SHA-256 と一致しない。修正を含むことと Playwright 1.65.1 での互換性を証明できる候補は確認できなかった。隔離実行は BLOCKED。

Playwright 1.66.0 alpha は調査対象の r2400 と組み合わされ、その前後で WebKit 用プロトコル宣言が変わっている。アーカイブを公開することと既存ドライバーで試験できることは別の条件になる。WPE公式の2.54.3ソースアーカイブは公式SHA-256と一致し、実際に修正コードを含んでいた。公開の分離署名は今回検証していない。このソース配布物と Playwright 対応バイナリは成果物が異なる。ブラウザの配布元、ソース対応、完全性、互換性の証拠をそろえてから比較を再開する。WPEの結果をSafari実機に一般化する根拠は得ていない。

- [WebKit Bugzilla 330138](https://bugs.webkit.org/show_bug.cgi?id=330138) · [上流修正](https://commits.webkit.org/326251@main) · [2.54移植](https://github.com/WebKit/WebKit/commit/48cd9362c826339335f579207478158fd16f2e9b)
- [旧タイムスタンプ生成](https://github.com/WebKit/WebKit/blob/5b391e6d3b14d549908dad2c6695999291313f30/Source/WebCore/platform/audio/gstreamer/WebKitWebAudioSourceGStreamer.cpp#L264-L272) · [DOMへの公開](https://github.com/WebKit/WebKit/blob/5b391e6d3b14d549908dad2c6695999291313f30/Source/WebCore/Modules/webaudio/AudioContext.cpp#L220)
- [承認Playwrightマニフェスト](https://github.com/microsoft/playwright/blob/v1.65.1/packages/playwright-core/browsers.json) · [Playwright r2401更新](https://github.com/microsoft/playwright/pull/44379) · [WPEリリース情報](https://wpewebkit.org/release/) · [WPE 2.54.3 公式ソースと公表ハッシュ](https://wpewebkit.org/releases/wpewebkit-2.54.3.tar.xz.sums)
