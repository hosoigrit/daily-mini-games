# DRAFT　ChatGPT Sites 向け引き渡し案

この文書は別途承認時に使う実装引き渡し案。ローカルの Stage A-2a-R3 QA を非公開の実機検証に使う。製品判定は HOLD。

| 対象 | 固定値 |
| --- | --- |
| QAビルドのソースコミット | f20b2ff7aab092bec58824a3856b6c6ca8ba8105 |
| QAソースのGit tree | 6845b07368840f27a2902608e490643404eb326c |
| 製品実装 | e34e1345e4ecd0fa0b251176f7af64136a46b0ee |
| R2の基準 | 8afe3cfb1d63920ba0c31c6391cc9a644ee24492 |

唯一の実装ソースは上記 QA コミット。Git bundle から確定SHAとゲームのソースを取り出す。必要範囲は games/0011_rhythm-factory の qa/device-audio-clock、src、tests/fixtures/a2ar2-load-track.ts、package.json、package-lock.json。音声・時計エンジン、音源定義、84秒fixtureは固定版を直接参照する。Sites側で独自に作り直さない。

ゲームディレクトリで既存ロックの依存を準備し、固定QAコミットから node_modules/.bin/vite build --config qa/device-audio-clock/vite.config.ts を実行する。QAビルドの相対 base は ./。実行アセットは次の SHA-256 と照合する。

| パス | SHA-256 |
| --- | --- |
| .vite/manifest.json | ff4ef96afddb88dd8384f2ba63eb528a13ff4c7ccb4c542060d367a95da51814 |
| assets/index-BzI_2x09.css | 48592063cd3af46ae0eae9d88af824fa40638a4cb0868961514e4e39fe5f727b |
| assets/index-D5wWTAuJ.js | 0710bb6faa5faa34900d260bb77e5e57559063d666817b5e8f961acf9c7a4fe9 |
| index.html | 141357d6517a6ee61224b161ec7b7ec707da82fd971eaeaa24ff196e6907a700 |

公開・アクセス制御の方式は別途承認する。候補は認証付き HTTPS で固定アセットのみを提供する。第三者のCDN、バックエンド、結果送信、タグ、広告、音声APIを追加しない。robots 指示だけでは非公開性を確保できない。

承認後の確認は全配布ファイルの再取得とSHA-256、画面のコミット表示、安全停止、再生に必要なWeb Audio API、相対パス、端末内JSON、外部通信0件。手順はdevice-test-plan.mdに従う。対象はGalaxy S26 Chrome、iPhone SE2 Safari、iPad mini 6 Safari、Windows 11 ChromeとEdge。実機の開始は別途承認。

Sites が固定 Git ソース／ビルド済みアセットをそのまま配布できるか、iOSのWeb Audio・保存・クリップボードに必要な実行条件、認証された非公開運用は未確認。差分を検出した場合は原因と影響を報告する。
