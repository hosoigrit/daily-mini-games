# Game #0009 — Phase 1 ローカル準備結果 v1.0

## 判定
**Phase 1 ローカル検証：PASS。GitHub反映：未実施。戦闘/UI実装：未実施。**

## 入力証明
- 設計凍結ZIP SHA-256: `a779d7ea1bb18f66d7562bf3115ef41c62727d261643ebbc278323dfb336ea52`
- ZIP収録: 19ファイル（SHA256SUMS.txtを除く18ファイルのSHA-256一致）
- manifestの原文とバイト列を維持。`manifestStatus=PROPOSED_NOT_APPROVED`は履歴ラベルとして維持
- canonical fingerprint: `56a8502f8ac2b90597bedf90b940ff5536b6cf231f541a5b1e6c87ff21bfc620`
- canonical payload UTF-8: 7658バイト

## 固定フィクスチャ検証
- ステージ: 16
- 3カード事前編成期待値: 960（各ステージ60）
- 公式固有勝利手順: 112、勝利する原編成数: 138
- 固有勝利の星1/2/3: 45/45/22
- 代表ゴールデン: 64
- 境界ケース: 14
- 保存ケース: 27
- JSON Schema: ステージ/進捗例/設定例の3種に対し検証PASS
- Node標準テスト結果: PASS（詳細は `PHASE1_TEST_OUTPUT.txt`）

## Phase 1とPhase 2の境界
この成果物のテストは凍結データと期待値の自己整合性を検査する。**ゲーム戦闘エンジンの実装やそのテストではない**。独立したエンジンに対する960件の振る舞い照合はPhase 2まで未実施。

## 今後の書込禁止と承認
- 禁止: `main`含むGitHub上のすべての変更、PR/マージ/Pages、既存ゲーム、`docs/`、`shared/`、CI変更
- GitHub作業範囲は候補 `games/0009_three-move-hero/**` のみ。リポジトリの最新HEAD・既存パス衝突・ブランチ名はGitHub書込み承認時に再確認
- 次フェーズへは、Phase 1の品質レビューとユーザーの独立承認を要する
