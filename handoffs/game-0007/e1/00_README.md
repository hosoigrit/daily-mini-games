# Game #0007「おてんきベーカリー」設計承認・Codex引継ぎパック

更新：2026-11-21／版：v0.4.1（v0.4設計の非機能的文書修正）

## 現在の承認範囲
- ユーザーはv0.4の内容に認識相違がない旨を表明し、企画・要件・基本設計を承認。
- **本パックは設計と依頼文の準備資料であり、Codexによる実装着手許可ではない。**
- GitHubへのPush、PR作成、マージ、Pages公開は全て別途明示許可が必要。

## ファイル
- `01_approval_and_errata.md`：設計承認とv0.4.1の誤記修正の透明な記録
- `02_requirements_APPROVED_v0.4.1.md`：承認済み要件定義（FR-01〜33、AC-01〜36）
- `03_basic_design_APPROVED_v0.4.1.md`：承認済み基本設計
- `04_test_plan_APPROVED_v0.4.1.md`：テスト計画
- `05_balance_validation_v0.4.md`：設計バランス資料（原文のまま）
- `06_scenario_matrix_v0.4.json`：唯一の正本データ（原本バイト列維持）
- `07_codex_readonly_preflight.md`：許可前にも利用可能な読み取り限定調査依頼
- `08_codex_implementation_request_HOLD.md`：**実装許可後にのみ渡す依頼書**
- `09_traceability_and_gates.md`：実装フェーズとFR/ACの対応・保留ゲート
- `10_validation_evidence.md`：同梱JSONの独立検算結果

## 推奨の進め方
1. いま：本パックを手元に保存し、設計を凍結。必要なら`07`の読み取り限定調査だけ実施。
2. ユーザーが「Game #0007実装開始を許可」と明示した後：`08`をCodexへ提出。
3. 開発後：自動テスト→独立実装レビュー→人間による実機確認→PRや公開はそれぞれ別の許可。

※ READMEその他に記載の将来の配置案は、まだリポジトリへ反映していません。
