# Game #0005 承認・作業範囲

## 承認状態

2026-11-19（JST）、ユーザーはGame #0005『ひとふで配達』について、添付された実装依頼書・要件定義書・基本設計書・テスト計画書v0.1の内容を基準とする**ローカル実装と自動テスト**を明示的に許可した。

文書名に残る「Draft」「未承認」「未許可」は文書作成時点の履歴であり、今回の許可範囲では本書とユーザーの明示指示を優先する。

## 入力文書の同一性

| 文書 | SHA-256 |
| --- | --- |
| `0005_hitofude-delivery_codex-implementation-request_v0.1_draft.md` | `D6E55CA23E69242632F50F5AF6F9E688AD7878561EF263F71F56BA98D03D90C4` |
| `0005_hitofude-delivery_requirements_v0.1_draft.md` | `78AECC7E8A5769DB65C4253E1D5B95A4E21F0979764156D6F050D17D81450407` |
| `0005_hitofude-delivery_basic-design_v0.1_draft.md` | `0C74AB728B8A55606FDC86BD7F7EBA1A997FBC105A7D1DBC1C2B86C145E5350E` |
| `0005_hitofude-delivery_test-plan_v0.1_draft.md` | `DC3B4574F9FFB6974646A7268E1843200625F0F1BAF1F844938A1068D427390E` |

## 許可された範囲

- `games/0005_hitofude-delivery/` の新規実装、テスト、ゲーム固有文書。
- `reports/0005_hitofude-delivery/` のテスト結果、画像証跡、独立レビュー引継ぎ。
- 既存Game #0001〜#0004を変更しない読み取り・回帰テスト。
- ローカルのNodeテスト、ヘッドレスChromeによるブラウザ自動確認、結果文書化。

## 禁止・未実施

- GitのCommit、Push、ブランチ作成、PR、マージ。
- `docs/`へのコピー、トップページ導線追加、GitHub Pages公開。
- Game #0001〜#0004、共通資産、ルート設定の変更。
- 独立レビューを実装担当自身の確認で代替すること。
- PC・iPhone・iPad・Androidの人間による実機受入を未実施のままPASS扱いすること。

## 独立レビュー修正の承認

2026-11-19（JST）、ユーザーは独立レビュー指摘IR-0005-01〜05に対するローカル修正と自動再テストを明示的に許可した。修正時の入力文書は次のとおり。

| 文書 | SHA-256 |
| --- | --- |
| `0005_hitofude-delivery_codex-fix-request_v0.1.md` | `6661A4C2928D9B4D734FB913F2741A0B4909C59C1DEE72E87B04EF1BA17F2CBD` |
| `0005_hitofude-delivery_independent-review_20261119.md` | `3DDB72936FC29083FFB2D71844984256C93B673C3E99EB54C14939C3B3773B7C` |

許可範囲はGame #0005のソース・関連テスト・専用レポートのみ。既存ゲーム、`docs/`、`shared/`、ルート設定、Git状態、公開状態の変更は禁止された。

## GitHub Pages公開の承認

2026-11-20（JST）、ユーザーはGame #0005のGitHub反映とGitHub Pages公開を正式に依頼した。この依頼に限り、公開に必要な専用ブランチ作成、Commit、Push、PR作成、条件を満たしたPRの`main`へのマージ、`docs/`への公開用コピー、トップページへのGame #0005導線追加を許可した。

公開時も、強制Push、履歴破壊、ブランチ保護の回避、無関係な変更の混入は禁止。自動テスト失敗、既存ゲームへの重大な影響、仕様外変更、追加承認を要求する保護ルール、公開後の重大問題がある場合は停止する。

ユーザーはiPhone Safari、iPad Safari、Android ChromeでLAN配信したゲームが起動・実行できることを確認済みと報告した。ただし全6ステージ、全例外操作、Windows Chrome/Edgeを含む正式受入の証拠ではないため、IN-07とBR-01〜05はPASSへ変更しない。ユーザーはこの残存リスクを認識したうえで公開を許可した。

