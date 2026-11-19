# Game #0004 テスト計画・最終判定

結果は `PASS` / `FAIL` / `BLOCKED` / `NOT RUN` で記録する。自動化できない実機・体感項目はPASSにしない。

| ID | 優先 | 最終判定 | 証拠・備考 |
| --- | --- | --- | --- |
| TC-001〜003 | P0/P1 | PASS | `rules.test.mjs` 速度90/130/180 |
| TC-004〜008 | P0/P1 | PASS | 反射、多重壁跨ぎ、60/120Hz相当 |
| TC-009〜019 | P0/P1 | PASS | PERFECT境界、MISS、1e-9重なり、幅継承 |
| TC-020〜025 | P0 | PASS | 採点、コンボ、上限、最高1,850点 |
| TC-026〜028 | P0/P1 | PASS | 9階MISS、10階CLEAR、再挑戦初期化 |
| TC-029〜032 | P0/P1 | PASS | 入力一回消費、演出中連打拒否、重複拒否 |
| TC-033〜034 | P1 | PASS | PAUSED中は5秒相当でも進行せず明示再開 |
| TC-035 | P1 | PASS | FALLING/SETTLING中断と続行を自動検証 |
| TC-036 | P1 | PASS | CLEAR/GAME_OVERから直接再挑戦 |
| TC-037〜040 | P1 | PASS | 保存、低下防止、破損値、読書込例外 |
| TC-041 | P1 | PASS | Chrome 1280×900/390×844、横はみ出しなし、Canvas幅358/390 |
| TC-042 | P1 | PASS | 2026-11-19、ユーザー本人がiPhone Safari実機でゲーム操作、CLEAR、GAME OVERを確認 |
| TC-043 | P2 | PASS | 文字契約テストとPC/モバイル画像で確認 |
| TC-044 | P2 | PASS | 揺れ前後でモデル不変、reduced motion時オフセット0 |
| TC-045 | P2 | NOT RUN | CSS契約はPASS。画面回転・拡大・体感確認は人間未実施 |
| TC-046 | P0 | PASS | 既存0001〜0003の自動テスト30/30、36/36、45/45。既存ファイル変更なし |

## TCサマリー

| 総数 | PASS | FAIL | BLOCKED | NOT RUN |
| ---: | ---: | ---: | ---: | ---: |
| 46 | 45 | 0 | 0 | 1 |

## 独立レビュー指摘の回帰テスト

| ID | 自動テスト | ブラウザ確認 | 判定 |
| --- | --- | --- | --- |
| IR-01 | 同一状態の更新キー不変、状態遷移時のキー変更 | タップ開始・停止・再開・再挑戦、マウス開始・停止、Tab→Space再開。各150ms押下中のDOM同一性 | PASS |
| IR-02 | 60/30/10/5FPS相当で1秒後と9秒後（多重反射）の位置一致 | 中断復帰とSpace着地を再確認 | PASS |
| IR-03 | NORMAL/PERFECT成功時は旧moving非表示、MISS時は表示、一時停止時も成功旧moving非表示 | NORMALのSETTLING中に証拠画像を取得し、切除部分の再表示なし | PASS |

- IR-01〜03追加テスト: 9件
- IR-01〜03対応時点のNodeテスト合計: 62件（62 PASS / 0 FAIL）

## IR-04回帰テスト

| ID | 内容 | 結果 |
| --- | --- | --- |
| IR04-01 | SETTLING停止前後の揺れオフセット一致 | PASS |
| IR04-02 | PAUSED中の演出時間・揺れ・MISS表示Y凍結 | PASS |
| IR04-03 | 再開後に保存済み演出時間から続行 | PASS |
| IR04-04 | MISS停止前後・再開後の表示Y一致 | PASS |
| IR04-05 | NORMAL/PERFECT停止中も旧moving非表示 | PASS |
| IR04-06 | reduced-motion時の揺れオフセット0 | PASS |
| IR04-07 | FALLING停止・再開の進捗・表示Y維持 | PASS |

- IR-04追加テスト: 7件
- Nodeテスト合計: 69件（既存62＋IR-04追加7、69 PASS / 0 FAIL）

## LANプレビュー回帰テスト

| ID | 内容 | 結果 |
| --- | --- | --- |
| LAN-01 | 引数なしは`127.0.0.1:4174` | PASS |
| LAN-02 | `--host`指定時だけLANモード | PASS |
| LAN-03 | RFC1918の3範囲を判定 | PASS |
| LAN-04 | `0.0.0.0`・公開IP・loopbackを拒否 | PASS |
| LAN-05 | 既定／`--port`／位置引数ポート | PASS |
| LAN-06 | 不正ポート・不足値・未知引数を拒否 | PASS |
| LAN-07 | `--host=`／`--port=`形式 | PASS |

- LAN追加テスト: 7件
- Nodeテスト合計: 76件（既存69＋LAN追加7、76 PASS / 0 FAIL）
- iPhone Safari、Android Chrome、iPad Safari、Windows Edgeの実機／実ブラウザ操作: PASS（2026-11-19ユーザー報告）
- Windows Chromeの人間による手動操作: NOT RUN（Chrome自動確認はPASS）
- 画面回転、ブラウザ拡大、極細ブロックの視認性: NOT RUN
