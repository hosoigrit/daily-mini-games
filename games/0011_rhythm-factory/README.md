# リズムファクトリー 統合技術実証版

Stage A-2dでは試験曲「回転灯」の24秒・63ノーツ・82判定を使い、音声、演奏入力、停止・再保持、成績と保存を検証する。

1. このディレクトリで Node.js 26.13.1 と npm 11.20.0 を使って `npm ci` を実行する。
2. 開発版は `npm run dev -- --host 127.0.0.1` で起動し、Viteが表示したローカルURLを開く。製品相当版は `npm run build` の後、`dist/` を静的配信する。アセットは相対URLを使うので、サブパスに置くときはディレクトリ末尾を `/` にして開く。
3. 新しいブラウザプロファイルまたは検証専用のオリジンを使う。Web Locksによる保存と排他には、HTTPSまたはループバックのセキュアコンテキストを使う。
4. タイトルからメニュー、選曲、「回転灯」の順に開く。準備が完了してから「演奏開始」を押す。PCはD・F・J・K、タッチ画面は4つのレーンボタンを使う。音声有効化が保留された場合は画面の案内から再操作する。

`?stage-a2d-diagnostics=1` を付けると、技術検証用のブラウザイベントを観測できる。イベントは外部へ送信されない。固定時計テストと実音声テストの手順・結果は `reports/stage-a2d/` に記録する。

## Stage A-1 開発基盤と回帰

Game #0011 の Stage A-1 用。開発基盤の画面で、React の起動、ストア購読、Canvas 描画、テスト状態の切り替えを確認する。

- 実行環境は Node.js 26.13.1、npm 11.20.0。
- このディレクトリで `npm ci` を実行し、`npm run dev` で開発サーバーを起動する。
- `npm run typecheck`、`npm run lint`、`npm run check:architecture`、`npm test` で型・静的検査・Vitest を実行する。
- `npm run build` の後、Playwright 管理ブラウザを準備して `npm run test:e2e` を実行する。E2E は開発版と `dist` をそれぞれサブパスで検査する。

共通契約の正本は `../../handoffs/game-0011/v1.0/approved_v08/interface_contracts.d.ts`。実行時に試験した範囲、引き継ぐ範囲、環境固有の起動設定は `reports/stage-a1/` を参照。設計補足は `docs/design_addendum_stage_a1.md` を参照。

## 今回の Codex Cloud 環境で再実行

タスク専用の Node・npm、依存、管理ブラウザ、起動補助を保持した作業環境では、`bash /workspace/work/game0011-stage-a1a/run-stage-a1.sh` で型、lint、依存方向、テスト、連続ビルド、Git 範囲を再検証できる。

この環境では `PLAYWRIGHT_BROWSERS_PATH` を `/workspace/work/game0011-stage-a1a/runtime-a1/playwright-browsers` に、`STAGE_A1_WEBKIT_EXECUTABLE` を `/workspace/work/game0011-stage-a1a/runtime-a1/webkit-a1` に設定した。WebKit の起動補助はローカルに抽出した Debian ライブラリを読み込む。Firefox はタスク専用 XDG ディレクトリと、ローカル試験プロセスに限定した `MOZ_DISABLE_CONTENT_SANDBOX=1` を使用した。

別の環境では、承認版の Node と npm、`npm ci`、Playwright 1.65.1 の管理ブラウザおよび必要な OS ライブラリを再準備する。Playwright の対応ホストで標準起動できる場合は、Cloud 固有の起動補助を省き `npm run build` と `npm run test:e2e` を実行する。
