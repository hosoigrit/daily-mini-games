# Codex Cloud Stage A-1 開始指示案（未許可・送信禁止）
ユーザーから別途開始承認があり、固定された引渡しコミットSHAと作業ブランチが指定された後にのみ使用する。

対象 hosoigrit/daily-mini-games / Game #0011 リズムファクトリー。指定SHAの handoffs/game-0011/v1.0/ を読み、SHA256SUMS.txtの全ファイルを照合。README→APPROVAL→正式設計→付属表→計画を順に確認。AGENTS.mdのルール遵守。13論理役割を用い、実行可能な独立エージェントの実数・役割を記録。実装着手前に要件と設計・TCの意味整合を確認し、矛盾ならHOLD。
Stage A-1のみ: Node/npm/React/Vite/TS/Vitest/RTL/Playwright/ESLint/jsdom等の互換性・ライセンス・脆弱性・exact版候補を調査し、環境情報と候補表を提示。版固定・導入の明示承認後にゲーム専用開発基盤、共通契約、型検査、契約テスト、ビルド・相対パス検証、Strict Mode基盤検査を実施する。実際の依存解決が失敗ならHOLD。共有コード/他ゲーム/CI/Pages/公開用ファイル変更禁止。正式5曲/15譜面/5工場の制作、A-2以降、push/PR/merge/公開は禁止（別承認）。自動テスト未実施をPASSにしない。成果物・実行コマンド・結果・未解決指摘・差分を報告し停止。
