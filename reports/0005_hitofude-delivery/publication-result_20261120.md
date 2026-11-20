# Game #0005 GitHub Pages公開結果

## 1. 結果

2026-11-20（JST）、Game #0005『ひとふで配達』をGitHub Pagesへ公開し、実URLでのRG-03をPASSと判定した。

- ゲーム一覧: <https://hosoigrit.github.io/daily-mini-games/>
- Game #0005: <https://hosoigrit.github.io/daily-mini-games/games/0005_hitofude-delivery/>
- 56件集計: 50 PASS / 0 FAIL / 0 BLOCKED / 6 NOT RUN / 0 N/A
- NOT RUN: IN-07、BR-01〜05

## 2. Git反映

| 区分 | ブランチ | Commit / Merge SHA | 結果 |
| --- | --- | --- | --- |
| 実装 | `codex/game-0005-hitofude-delivery` | `eca7315dc279fefcb9868ed4e5ab07b9d7c5c5ef` | Push済み |
| 実装main反映 | `main` | `c707f59adb38b6912dc5a15ce42ad5e346eb7b31` | 通常マージ・Push済み |
| Pages | `codex/game-0005-pages-release` | `d5d50bac71ad5e89d9a0837ee7c672b7c3aff533` | Push済み |
| Pages main反映 | `main` | `3ab07ed3addae60913415028e007950a5a53800a` | 通常マージ・Push済み |

GitHub公開APIで`main`の`protected`は`false`、required status checksは無効、リポジトリRulesetは空であることを確認した。PRは必須ではなく、ユーザーの2026-11-20指示に従いローカル通常マージとforceなしの直接Pushを使用した。ブランチ保護・認証の回避、設定変更、force pushは行っていない。

## 3. 公開前テスト

- Game #0005 `npm test`: 52/52 PASS。
- `node tests/hint-performance.mjs`: 300/300 FOUND、UNAVAILABLE 0、最大145ノード。
- ソース版`npm run browser-check`: PASS、実行時例外0、外部通信0。
- Pages用コピーを`GAME_ROOT`に指定した`npm run browser-check`: 同一シナリオPASS、実行時例外0、外部通信0。
- 既存ゲーム: #0001 30/30、#0002 36/36、#0003 45/45、#0004 76/76 PASS。
- ソースとPages用コピーの実行時8ファイル: SHA-256が全件一致。
- 一覧内のGame #0001〜#0005リンク: 全件存在。

## 4. 公開後確認（RG-03）

| 確認項目 | 判定 | 証拠 |
| --- | --- | --- |
| 一覧にGame #0005表示 | PASS | 指定タイトル、ジャンル、概要、操作、対応を公開一覧で確認 |
| 一覧リンクから起動 | PASS | 公開URLへ遷移しタイトル画面を表示 |
| ステージ選択 | PASS | 全6カード、ステージ1有効、2〜6ロックを確認 |
| ステージ1操作 | PASS | 開始マスから隣接セルへ1マス移動、経路2セル |
| ヒント | PASS | 得点900、残り1/2、「右へ1マス進めます」を確認 |
| CSS・JavaScript | PASS | 公開URLの`styles.css`と`src/main.js`を読込、HTTP 200 |
| 既存ゲームリンク | PASS | Game #0001〜#0004の公開リンクを一覧で確認、各URL HTTP 200 |
| 404・実行時エラー | PASS | 対象8 URLすべてHTTP 200、ブラウザコンソールエラー0 |

## 5. 残存リスク

- IN-07とBR-01〜05は正式受入の証拠がないためNOT RUNを維持する。
- ユーザーはiPhone Safari、iPad Safari、Android ChromeでLAN配信版の起動・実行を確認済みだが、全6面・全例外操作の正式PASSではない。
- Windows Chrome/Edgeの正式な人間受入は未実施。

