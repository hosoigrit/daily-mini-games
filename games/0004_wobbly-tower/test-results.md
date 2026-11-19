# Game #0004 IR-04修正後テスト結果

## 実行環境

| 項目 | 値 |
| --- | --- |
| 実行日 | 2026-11-19（JST） |
| OS | Windows（Codexローカル作業環境） |
| Node.js | v26.13.1 |
| npm | 11.20.0 |
| 単体・状態・契約テスト | Node.js標準 `node:test` |
| ブラウザ確認 | ローカルGoogle Chrome（CDP、外部通信なし） |
| 外部依存 | なし |

## Game #0004自動テスト

```powershell
node --test tests/*.test.mjs
```

- テストエントリ: 76（既存69＋LANプレビュー回帰7）
- PASS: 76
- FAIL: 0
- CANCELLED/SKIPPED/TODO: 0
- 構文確認: `src/` と `tests/` の `.js/.mjs` 全件PASS

## Chromeブラウザチェック

```powershell
node tests/preview-server.mjs 4176
node tests/browser-check.mjs
```

- 390×844エミュレーション: `innerWidth=390`、`scrollWidth=390`、Canvas幅358、横はみ出しなし
- タップ入力: 0/10・0点から1/10・100点へ1回だけ進行
- タップ操作: 開始、一時停止、再開、GAME OVER後の再挑戦がPASS
- タップ対象ボタン: 150ms押下中も同一DOMを維持（4/4）
- 1280×900 PC幅: `scrollWidth=1280`、横はみ出しなし
- Space入力: 0/10・0点から1/10・100点へ1回だけ進行
- マウス操作: 開始・一時停止がPASS、150ms押下中も同一DOMを維持（2/2）
- キーボード操作: Tabで再開ボタンへ移動し、Spaceで再開
- 再挑戦: 進行階数0、スコア0、オーバーレイ非表示の新規プレイへ復帰
- NORMAL着地演出: 切り落とし後の幅90ブロックだけを描画。旧幅180ブロックの再表示なし
- NORMALのSETTLING中停止・再開: PASS。停止中も保存済み揺れ位置を維持
- MISSのSETTLING中停止・再開: PASS。停止中・再開後ともブロックを着地位置に維持
- Runtime例外: 0
- 画像: `evidence-pc.png`、`evidence-mobile-emulation.png`、`evidence-normal-settling.png`、`evidence-miss-paused.png`

Computer Useによる既存Chrome/Edgeウィンドウの実操作は環境権限で拒否され、Codex内蔵ブラウザもlocalhost接続がタイムアウトした。したがって上記は実Chromeエンジンの自動確認であり、人間によるPC手動確認とは区別する。

## 既存ゲーム回帰

| 対象 | コマンド | 結果 |
| --- | --- | --- |
| Game #0001 | `npm test` | 30/30 PASS |
| Game #0002 | `node --test tests/*.test.mjs` | 36/36 PASS |
| Game #0003 | `npm test` | 45/45 PASS |

Game #0004専用ディレクトリ以外の作成・修正は行っていない。ルートトップページは変更していないため、導線追加は今回の許可範囲外である。

## TC-001〜046サマリー

- 総数: 46
- PASS: 46
- FAIL: 0
- BLOCKED: 0
- NOT RUN: 0
- P0/P1の自動テストに未解決FAILなし

## 修正ループ

1. 通常の390pxヘッドレス画像がChromeの最小ウィンドウ幅により切れたため、CDPの端末寸法エミュレーションへ変更。390×844で横はみ出しなしを確認。
2. 独立レビューIR-01〜03に対応。Node回帰9件を追加し62/62 PASS。
3. CDPのTab→Enterがボタン既定動作を発火しなかったため、要件で許容されるTab→Spaceへ変更。再実行でPASS。ゲーム実装の追加修正は不要だった。
4. IR-04の初回Chrome確認ではMISS停止操作がSETTLING終了約10ms前となりGAME OVERと競合。停止操作を演出開始側へ前倒しし再実行、PASS。ゲーム実装の追加修正は不要だった。

## IR-01〜03対応状況

| ID | 修正 | 自動テスト | ブラウザ確認 | 状態 |
| --- | --- | --- | --- | --- |
| IR-01 | オーバーレイDOMを更新キー変更時だけ再生成 | 更新キー2件PASS | タップ・マウス・Tab/Space、150ms押下中DOM同一性PASS | 対応済み |
| IR-02 | 0.1秒上限を廃止し実経過時間を全量加算 | 60/30/10/5FPS、1秒・9秒PASS | Space着地と中断復帰PASS | 対応済み |
| IR-03 | 成功SETTLINGでは旧movingを描画しない | NORMAL/PERFECT/MISS/PAUSEDの4件PASS | NORMAL演出画像で切除部分の復活なし | 対応済み |

## IR-04対応状況

| 修正 | 自動テスト | ブラウザ確認 | 状態 |
| --- | --- | --- | --- |
| PAUSEDでもSETTLING揺れを保存時間から再現 | IR04-01〜03、06 PASS | NORMAL停止・再開PASS | 対応済み |
| PAUSEDかつMISSの表示Yを`targetY`に維持 | IR04-02、04 PASS | MISS停止画像・再開PASS | 対応済み |
| NORMAL/PERFECT旧moving非表示を維持 | IR04-05 PASS | NORMAL画像PASS | 対応済み |
| FALLING停止・再開を維持 | IR04-07 PASS | 既存操作回帰PASS | 対応済み |

## 参照資料の状態

- 指定された`Game0004_Independent_Rereview_2026-11-19.md`は作業開始時にDownloads内で見つからなかった。
- 本修正は、正式依頼本文に記載されたIR-04の再現値・期待動作・IR04-01〜07を基準として実施した。

## 実機テスト用LANプレビュー確認

- 実行時にデフォルトゲートウェイを持つWi-FiのプライベートIPv4を確認（公開資料では値を省略）
- 通常待受`http://127.0.0.1:4174/`: HTML／CSS／main.mjsが各HTTP 200
- LAN待受`http://<PCのプライベートIPv4>:4174/`: HTML／CSS／main.mjsが各HTTP 200
- LAN URLのWindows Chrome確認: 開始、ブロック落下、停止、再開、GAME OVER、再挑戦、PC幅／390px幅がPASS
- Runtime例外: 0
- `0.0.0.0`・公開IPv4・loopbackの`--host`指定拒否: PASS
- Windowsファイアウォール、ネットワークプロファイル、ルーター設定: 変更なし
- Windowsネットワークプロファイルの読取はCIM権限制約で未確認。ユーザー手順に確認コマンドを記載
- iPhone Safari／Android Chrome／iPad Safariの実機接続・操作: PASS（2026-11-19ユーザー報告）

## 実機受け入れテスト結果

2026-11-19、ユーザー本人が同一の信頼できる自宅LANで次の実ブラウザ操作を実施した。

| 端末 | ブラウザ | 結果 | 確認内容 |
| --- | --- | --- | --- |
| iPhone | Safari | PASS | AT-01〜AT-12 |
| Android | Chrome | PASS | AT-01〜AT-12 |
| iPad | Safari | PASS | AT-01〜AT-12 |
| Windows PC | Edge | PASS | AT-01〜AT-12 |

- TC-042 iPhone Safari実機確認: PASS
- TC-045 画面回転・ブラウザ拡大・極細ブロック視認性: PASS
- AT-01〜AT-12: 全端末でPASS（2026-11-19ユーザー最終確認）
- Windows Chromeの人間による手動操作: NOT RUN（Chrome自動確認はPASS）
- 端末型番、OS・ブラウザの詳細版、個別操作の証拠画像: 未提出

## 未実施・残存リスク

- 人間によるPC Chromeの手動操作: NOT RUN（Windows EdgeはPASS）
- PERFECT難易度の主観評価: NOT RUN
- 端末型番、OS・ブラウザ詳細版、個別操作の証拠画像: 未提出（推測・補完なし）
- mainへのマージと公開承認: 未実施
