# Game #0003「30秒サバイバル」

360×480のCanvas内で宇宙船を操作し、四方から飛来する隕石を30秒間よけるWebミニゲームです。

## ローカル起動

ES Modulesを使うため、このディレクトリをHTTPサーバーで配信して `index.html` を開きます。外部依存やビルドはありません。

## 自動テスト

```powershell
node --test tests/*.test.mjs
```

テストはNode.js標準の `node:test` のみを使用します。

## 文書

- `approval-and-scope.md`: 2026-11-18時点の承認・権限範囲
- `requirements.md`: 承認済み要件定義v0.2
- `design.md`: 承認済み基本設計v0.1
- `test-plan.md`: 承認済みテスト計画v0.1
- `implementation-request.md`: 承認済みCodex実装依頼書v0.1
- `learning-log.md`: 実装判断と学習事項
- `manual-device-test-procedure.md`: 独立レビュー・実機確認へ渡す手順

文書名・本文に残る「未承認」「実装禁止」は作成時点の履歴です。現在の状態は `approval-and-scope.md` を優先します。
