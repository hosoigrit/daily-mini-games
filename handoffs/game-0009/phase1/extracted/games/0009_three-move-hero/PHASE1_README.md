# Game #0009 Phase 1 — 凍結データ・テスト基盤のローカル準備

## 承認・適用範囲
- ユーザー承認済み：Game #0009 v0.9 **設計凍結**。
- 今回の対象：**Phase 1のデータ・期待値・テスト基盤準備のみ**。作業は `/mnt/data` 内のローカル成果物。
- 未許可：GitHub書き込み／ブランチ作成／Push／PR／マージ／公開、戦闘エンジン・UI実装。
- GitHub作業ツリーへのコピー・コミットは**行っていない**。転記には明示的な個別許可が必要。

## 入力正本
`Game0009_ThreeMoveHero_Design_v0.9_FreezeCandidate.zip`（配布元ZIPのSHAは最上位 `SOURCE_PROVENANCE.json` に記載）。
ZIP内の `SHA256SUMS.txt` と各ファイルの照合後、**データを一切書き換えず**コピー。
`manifestStatus=PROPOSED_NOT_APPROVED` は凍結前に生成された元データの表示ラベルとして残す。ユーザーの設計凍結承認はこれと別の会話上の承認記録に基づく。

## ファイル
- `data/`: v0.9ステージJSON、JSON Schema、リスク台帳
- `tests/fixtures/`: 凍結済み960編成期待結果、64ゴールデンケース、14境界ケース、27保存ケース、指紋・サンプル・スキーマ
- `tests/phase1_contract.test.mjs`: データ構造と期待値の自己整合性の検査のみ
- `tests/phase1_fingerprint.test.mjs`: 規範化・固定SHA・変化テスト
- `tests/phase1_checksums.test.mjs`: コピー済み13ファイルの元ZIP SHA-256照合
- `package.json`: Node標準テスト。追加パッケージなし

## テスト実行
このディレクトリで `npm test` または `node --test tests/*.test.mjs`。
**重要：** このテストはゲーム実装の振る舞いを検証していない。Phase 2で独立した戦闘エンジンを作成した後、その実装出力を本固定期待値に照合する。

## 続行ゲート
Phase 1をコードリポジトリへ反映するには、最新main SHA・対象ブランチ・許可パスの確認、および**GitHub書き込みの明示承認**が必要。
Phase 2（戦闘エンジン）も独立のユーザー承認が必要。
