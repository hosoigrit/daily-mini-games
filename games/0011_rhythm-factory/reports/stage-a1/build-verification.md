# Stage A-1 ビルド・サブパス証跡

実施時刻は 2026-11-25T22:09:16+09:00。固定起点は `3cc4dd46b644bb0b829cc97935f6e33de21ef3c4`。

Vite の本番 `base` は `./`。開発サーバーだけに絶対サブパスを指定し、本番 dist は別の一時 HTTP サーバーで同じサブパスに配置した。

同条件の連続ビルド2回でファイル集合と SHA-256 は一致した。入口 HTML の参照は相対 JS と CSS の2件。テストデータ、QA レポート、秘密情報のマーカーは配布3ファイルに含まれないことを確認した。

有効なファイルの取得・Canvas 描画・状態切り替えは3ブラウザ×2配信で6件 PASS。サブパス外や存在しないファイルの404を対照として確認した。

```text
98c31e8850ef3d4facacab299e78eec527c0ac01ab8c4da27473de03ea9cb6c0  dist/assets/index-B3ekpQ5g.css
d220ec2207702acae2b0576d89afe4e72d5f4c94b8a58aaac29ac11f3391b38d  dist/assets/index-yyVhLLux.js
8f6c6678da1621ddb721bcbaa7b4a34b6c0c0afe379d898148f3b382b15fd305  dist/index.html
```
