# リズムファクトリー 開発基盤

Game #0011 の Stage A-1 用。開発基盤の画面で、React の起動、ストア購読、Canvas 描画、テスト状態の切り替えを確認する。

- 実行環境は Node.js 26.13.1、npm 11.20.0。
- このディレクトリで `npm ci` を実行し、`npm run dev` で開発サーバーを起動する。
- `npm run typecheck`、`npm run lint`、`npm run check:architecture`、`npm test` で型・静的検査・Vitest を実行する。
- `npm run build` の後、Playwright 管理ブラウザを準備して `npm run test:e2e` を実行する。E2E は開発版と `dist` をそれぞれサブパスで検査する。

共通契約の正本は `../../handoffs/game-0011/v1.0/approved_v08/interface_contracts.d.ts`。実行時に試験した範囲、引き継ぐ範囲、環境固有の起動設定は `reports/stage-a1/` を参照。設計補足は `docs/design_addendum_stage_a1.md` を参照。
