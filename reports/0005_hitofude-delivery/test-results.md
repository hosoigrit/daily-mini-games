# Game #0005『ひとふで配達』テスト結果

## 1. 総合判定

**品質ゲートはHOLD**。修正後に実行可能な計画ケースはPASSしたが、人間が正式手順で行うIN-07とBR-01〜05、および#0005公開導線を対象とするRG-03の計7件はNOT RUN。ユーザーはiPhone Safari、iPad Safari、Android ChromeでLAN配信版が起動・実行できることを確認したが、全6面・全例外操作の正式受入ではないためPASSへ変更しない。ユーザーは残存リスクを認識したうえで2026-11-20に公開を明示承認した。

| 総数 | PASS | FAIL | BLOCKED | NOT RUN | N/A |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 56 | 49 | 0 | 0 | 7 | 0 |

## 2. 実行環境

- 実施日: 2026-11-19（JST）
- OS: Microsoft Windows NT 10.0.26200.0
- Node.js: v26.13.1
- npm: 11.20.0
- PowerShell: 7.6.9
- ブラウザ自動確認: インストール済みGoogle Chrome、headless new、ローカルloopback HTTP
- 実機・人間の手動操作: ユーザー報告としてiPhone Safari、iPad Safari、Android ChromeでLAN配信版の起動・実行を確認。ただし正式受入ケースは未実施。
- Git識別子: 2026-11-19のローカル実装・修正時点では新規Commit SHAなし。2026-11-20の公開依頼で別途Git反映を承認。

## 3. 56件のケース別結果

| ID | 最終判定 | 自動化・環境 | 証拠・備考 |
| --- | --- | --- | --- |
| ST-01 | PASS | Node | 6件、ID 1〜6、重複なし |
| ST-02 | PASS | Node | size 4/4/5/5/6/6、荷物1/2/2/2/3/3 |
| ST-03 | PASS | Node | 開始・ゴール・荷物・壁の役割重複なし |
| ST-04 | PASS | Node | 全座標が盤内 |
| ST-05 | PASS | Node | 設計書の例示経路6件すべて合法 |
| ST-06 | PASS | Node独立参照探索 | ヒント実装を使わず全6面の解答を確認 |
| GC-01 | PASS | Node | 初期経路、未回収、全カウンター0、playing |
| GC-02 | PASS | Node | 4近傍の合法移動 |
| GC-03 | PASS | Node | 斜め・2マス移動を拒否、状態不変 |
| GC-04 | PASS | Node | 盤外・壁を拒否 |
| GC-05 | PASS | Node | 直前以外の訪問済みセルを拒否 |
| GC-06 | PASS | Node | 直前セルと戻るボタンが同値、1回減点 |
| GC-07 | PASS | Node | 荷物セル削除で回収数を巻き戻し |
| GC-08 | PASS | Node | 有効リセットだけ回数増加 |
| GC-09 | PASS | Node | 荷物未回収ゴールを拒否 |
| GC-10 | PASS | Node | クリア1回、追加入力で状態不変。初回FAIL後修正・再実行PASS |
| SC-01 | PASS | Node | 1,000点、カウンター0 |
| SC-02 | PASS | Node | 有効な戻るだけ−50点 |
| SC-03 | PASS | Node | 有効なリセットだけ−100点、履歴維持 |
| SC-04 | PASS | Node | 成功ヒントだけ−100点 |
| SC-05 | PASS | Node | 戻る2・リセット1・ヒント1＝700点、星2、GOOD |
| SC-06 | PASS | Node | 多数減点後も100点下限 |
| SC-07 | PASS | Node | 1000/900/850/700/650/100点、PERFECT条件を検証 |
| HT-01 | PASS | Node | FOUNDの次セルが合法な4近傍 |
| HT-02 | PASS | Node＋独立完走判定 | 模範経路外の別解からFOUND |
| HT-03 | PASS | Node小規模反例 | NO_SOLUTION、無消費 |
| HT-04 | PASS | Node上限注入 | nodeLimit=0でUNAVAILABLE、無消費 |
| HT-05 | PASS | Node | 成功2回後の3回目を拒否 |
| HT-06 | PASS | Node | 同一revisionの二重適用を拒否 |
| HT-07 | PASS | Node | 経路変更後の古い結果を拒否 |
| HT-08 | PASS | Node | 1マス提示のみ、経路を自動更新しない |
| IN-01 | PASS | Node入力アダプター | クリック／タップ相当の1セル入力 |
| IN-02 | PASS | Node入力統合 | ドラッグと反復入力の経路が一致 |
| IN-03 | PASS | Node入力統合 | 同一行・列の高速移動を全中間セルへ補間 |
| IN-04 | PASS | Node入力統合 | 斜めを任意の直交ルートへ変換しない |
| IN-05 | PASS | Node入力統合 | up/cancel後に確定経路を維持し再開 |
| IN-06 | PASS | Node入力統合 | 2本目・重複終了イベントを拒否 |
| IN-07 | NOT RUN | 人間の実機操作 | 盤面ジェスチャーと盤面外スクロールは実機未確認 |
| SV-01 | PASS | NodeメモリStorage | 初回はステージ1だけ解放 |
| SV-02 | PASS | Node | クリアで次面解放、後戻りなし |
| SV-03 | PASS | Node | 低得点でベストを上書きしない |
| SV-04 | PASS | Node再生成 | 解放・ベストだけ復元、経路なし |
| SV-05 | PASS | Node例外注入 | 破損値、保存getter例外、保存先なし、読書例外でもメモリ継続・警告あり |
| UI-01 | PASS | ヘッドレスChrome E2E | タイトルからステージ選択 |
| UI-02 | PASS | ヘッドレスChrome E2E | ステージ2ロック・disabled |
| UI-03 | PASS | ヘッドレスChrome E2E | 移動・ヒント・戻る後に850点、0/1、1/2、経路1セル |
| UI-04 | PASS | ヘッドレスChrome E2E | 850点、星2、GOOD、ベスト更新、次面操作。保存失敗時の即時警告も追加確認 |
| UI-05 | PASS | ヘッドレスChrome E2E | 退出・再入場で1000点・経路1、ベスト850と解放を維持 |
| BR-01 | NOT RUN | 人間のWindows Chrome | ヘッドレス自動確認は補助証跡であり手動受入の代替にしない |
| BR-02 | NOT RUN | 人間のWindows Edge | 未実施 |
| BR-03 | NOT RUN | iPhone Safari実機 | ユーザーがLAN配信版の起動・実行を確認。ただし正式手順・全6面の証拠なし |
| BR-04 | NOT RUN | iPad Safari実機 | ユーザーがLAN配信版の起動・実行を確認。ただし正式手順・全6面の証拠なし |
| BR-05 | NOT RUN | Android Chrome実機 | ユーザーがLAN配信版の起動・実行を確認。ただし正式手順・全6面の証拠なし |
| RG-01 | PASS | Node＋Chrome | 相対CSS/JS、サブパスURLで起動、外部通信0 |
| RG-02 | PASS | Node回帰 | #0001 30/30、#0002 36/36、#0003 45/45、#0004 76/76 |
| RG-03 | NOT RUN | 公開後の導線検証 | `docs/`と既存ゲームにtracked差分がないことは確認済み。#0005の公開用コピー・トップページ導線は未実装／未公開であり、実リンク動作は未検証 |

## 4. 実行コマンドと終了コード

| コマンド | 作業場所 | 終了コード | 結果 |
| --- | --- | ---: | --- |
| `npm test` | `games/0005_hitofude-delivery` | 1 | 初回42件中41 PASS、GC-10 FAIL |
| `npm test` | 同上 | 0 | 修正後43/43 PASS（RG-01を含む） |
| `npm test` | 同上 | 0 | IR-0005-01/02追加後52/52 PASS（既存43＋追加9） |
| `node tests/hint-performance.mjs` | 同上 | 0 | 300/300 FOUND、UNAVAILABLE 0 |
| `npm run browser-check` | 同上 | 1 | sandbox内ではChrome DevTools起動不能。権限承認後に再実行 |
| `npm run browser-check` | 同上 | 0 | UI-01〜05 PASS、390/320/1280px、例外0・外部通信0 |
| `npm run browser-check` | 同上 | 0 | 小画面調整後、320px幅の6×6セル最小44pxを再確認 |
| `npm run browser-check` | 同上 | 0 | IR-0005-02〜04、2.5秒解除、古いタイマー無効化、保存失敗警告を含む最終回帰PASS |
| `npm test` | `games/0001_target-tap` | 0 | 30/30 PASS |
| `node --test tests/*.test.mjs` | `games/0002_light-panels` | 0 | 36/36 PASS |
| `npm test` | `games/0003_30sec-survival` | 0 | 45/45 PASS |
| `npm test` | `games/0004_wobbly-tower` | 0 | 76/76 PASS |
| `git diff --name-only -- docs games/0001_target-tap ... games/0004_wobbly-tower` | リポジトリルート | 0 | 出力なし |

## 5. 修正ループ

1. **GC-10（修正1回目）**: クリア後入力で得点・経路・記録は不変だったが、内部`message`が`cleared`から`inactive`へ変化した。クリア後操作は元状態をそのまま返すよう修正し、再実行PASS。
2. **レスポンシブ品質調整**: 6×6を320px幅で直接測定できるブラウザテストを追加。小画面の余白を調整して最小セル44pxを確認。FAIL起点ではない品質改善。

修正ループ上限5回に対し、不具合修正は1回。

独立レビュー修正IR-0005-01〜04では、レビューの再現条件を失敗させる追加テストを実装し、修正後の初回実行から52/52 PASS。Chrome E2Eも追加観点を含めPASSした。

## 6. ステージ・ヒント性能

- ステージ1〜6: 配置範囲、役割重複、例示経路、独立参照探索のすべてPASS。
- 探索上限: 250,000ノード／80ms。
- 測定: 6面×初期/例示経路途中×各25回＝300回。
- 結果: FOUND 300、NO_SOLUTION 0、UNAVAILABLE 0。
- 最大探索ノード: 145（ステージ5初期）。
- 独立レビュー修正後の最終測定で最大壁時計時間: 3.977ms、サンプル別中央値の最大値: 0.196ms。実行ごとの最大値には環境のスケジューリング揺れを含む。
- これはPC上の予備測定であり、実機iPhone等の性能PASS基準ではない。正式な数値受入基準は未確定。

## 7. ブラウザ自動証跡

- `chrome-stage-select-390x844.png`
- `chrome-play-390x844.png`
- `chrome-result-390x844.png`
- `chrome-result-storage-warning-390x844.png`
- 390×844、320×568、1280×720で横はみ出しなし。
- 320px幅の6×6盤面: 幅292px、最小セル44px。
- JavaScript実行時例外0、外部リクエスト0。
- 行き止まり再現: 文言表示、1000点維持、経路4セル。
- 保存書込失敗: リザルト警告表示、セッション内ベスト1000点、次ステージ操作可能。
- ヒント強調: 直後1セル、2.5秒後0セル。得点900・残1/2・方向説明は不変。画面切替後の古いタイマーも新規挑戦へ影響なし。

## 8. 未実施・残課題

| 優先度 | 項目 | 再現・確認方法 | 対処案 |
| --- | --- | --- | --- |
| P0 | iPhone Safari正式受入未完了 | `manual-device-test-procedure.md`のBR-03とIN-07 | 起動確認済み。人間が実機でタップ・長いドラッグ・高速入力・中断・縦横・保存を正式手順で実施 |
| P1 | Windows Chrome/Edgeの人間受入未確認 | BR-01/02 | 各ブラウザで代表面を手動クリアし、コンソールと保存を確認 |
| P1 | iPad Safari・Android Chrome正式受入未完了 | BR-04/05 | 起動確認済み。実機で正式手順を実施 |
| P1 | 低性能実機のヒント停止感 | 各面初期・途中でヒント時間を測る | 実測を記録。頻繁なUNAVAILABLEなら仕様変更せず再設計を相談 |
| P2 | 難易度・文言の人間試遊 | 6面を順にプレイ | 独立レビュー／人間受入で調整案を出し、ルール変更は承認後に行う |
| P1 | RG-03公開後導線 | #0005の`docs/`コピーとトップページ導線が別途承認・実装された後にリンクを操作 | 現工程ではNOT RUN。Git／公開許可後に別途検証 |

## 9. 独立レビュー指摘の対応結果

| 指摘 | 判定 | 対応 | 回帰証拠 | 残課題 |
| --- | --- | --- | --- | --- |
| IR-0005-01 High | PASS | `localStorage`取得を関数内部で捕捉。取得不可・保存先なし・読書失敗時もメモリ継続 | Node IR-0005-01A〜E、SV-05 | 実ブラウザの保存禁止設定は人間受入で追加確認可能 |
| IR-0005-02 Medium | PASS | 純粋な合法前進列挙と行き止まり判定、即時案内を追加 | Node IR-0005-02A〜D、Chrome deadEndUi | 実機表示は未確認 |
| IR-0005-03 Medium | PASS | 保存失敗直後のリザルトへ再読込後に残らない旨を表示 | Node IR-0005-01D/03、Chrome failedSaveResult、画像 | 実機保存禁止環境は未確認 |
| IR-0005-04 Low | PASS | 強調時間2.5秒、操作・画面切替時のタイマー取消と世代無効化 | Chrome hintVisible/hintExpired/afterStaleHintTimer | 実機の見え方は未確認 |
| IR-0005-05 証跡 | PASS | RG-03をNOT RUNへ変更し、既存無変更確認と公開後リンク未検証を分離 | 56件集計49 PASS / 7 NOT RUN | 公開導線実装後にRG-03を実行 |

