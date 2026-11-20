# Game #0005「ひとふで配達」

荷物をすべて回収し、同じマスを再通過せずにゴールを目指す固定6面の一筆書きパズルです。外部ライブラリ、外部画像、外部フォント、外部通信は使用しません。

## ローカル起動

```powershell
npm run preview
```

表示先は`http://127.0.0.1:4175/games/0005_hitofude-delivery/`です。終了は`Ctrl+C`です。

## 操作

- となりのマスをクリック／タップ、または上下左右になぞって移動。
- 直前セルへ戻るか「1マス戻る」で1マス後退。
- 全荷物を回収してから旗のマスへ到達するとクリア。
- ヒントは1挑戦2回まで。成功時だけ100点減点。
- ヒントの対象セルは2.5秒間強調され、方向説明はそのまま残る。
- リセットとステージ退出は同じ挑戦の経路を破棄する。退出後は新しい挑戦になる。

## 自動テスト

```powershell
npm test
node tests/hint-performance.mjs
npm run browser-check
```

`browser-check`はローカルHTTPサーバーとインストール済みChromeを一時起動し、終了時に停止します。追加インストールはありません。`GAME_ROOT`で任意の配信用ゲームディレクトリ、`EVIDENCE_DIRECTORY`で証跡出力先を指定できるため、GitHub Pages用コピーも同じシナリオで検証できます。

## 制約

- 進捗は`localStorage`へ保存する。保存不可でも、そのページを開いている間はメモリで続行できる。
- プレイ中経路は保存しない。再読み込み・退出後は新しい挑戦になる。
- 保存領域を取得・読書きできない場合もメモリで続行し、保存失敗直後のリザルトへ警告を表示する。
- iPhone Safari、iPad Safari、Android ChromeではユーザーがLAN配信版の起動・実行を確認済み。ただし全6面・全例外操作を含む正式受入ではなく、Windows Chrome/Edgeの人間受入も未実施。
- IN-07とBR-01〜05は正式受入の証拠がないためNOT RUNのまま。残存リスクを認識したうえで、ユーザーが2026-11-20に公開を明示承認した。

## 文書

- `approval-and-scope.md`: ユーザー承認と禁止操作
- `requirements.md`: 実装ベースラインと要件対応
- `design.md`: モジュール設計、探索上限、設計差異
- `test-plan.md`: 56件の実行対応
- `learning-log.md`: 実装・学習記録
- `manual-device-test-procedure.md`: 独立レビュー後の実機受入手順
- `../../reports/0005_hitofude-delivery/test-results.md`: ケース別結果
- `../../reports/0005_hitofude-delivery/independent-review-handoff.md`: 独立レビュー引継ぎ
- `../../reports/0005_hitofude-delivery/independent-rereview-handoff.md`: 修正後の独立再レビュー引継ぎ

