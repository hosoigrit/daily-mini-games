# 開発環境・依存関係の固定計画
2026-11-25 公式資料確認: Node.js 26 LTS https://nodejs.org/en/about/previous-releases ; React 19.3.0 https://react.dev/versions ; Vitest 5の最低条件 Node >=22.12.0、Vite >=6.4.0 https://vitest.dev/guide/migration/ 。これは候補レベルの互換性であり、全依存の組合せの実証ではない。

採用候補: Node26 LTS、React/ReactDOM19.3系同版、TypeScript、Vite、React plugin、Vitest、React Testing Library、Playwright、ESLint、jsdom。npmはNode互換版。Stage A-1許可後に npm view の engines/peerDependencies/dist-tags、公式資料、ライセンス、既知脆弱性を記録し、exact version案を提出。承認後にゲーム専用ディレクトリでのみ固定し package-lock.jsonを作成、npm ci、npm ls、型検査、lint、契約テスト、build、preview、サブパスE2Eを検証する。--force/--legacy-peer-deps禁止。実際のCodex環境・ブラウザバイナリ・ネットワーク利用可否は未確認。代替版に変更する場合は承認を求める。今回の型宣言検査はローカルNode22.16.0/TS5.8.3のみ。
