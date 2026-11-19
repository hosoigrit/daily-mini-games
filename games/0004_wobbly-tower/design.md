# Game #0004『ぐらぐらタワー』実装設計

## 構成

| ファイル | 責務 |
| --- | --- |
| `src/rules.mjs` | 速度、反射移動、重なり、PERFECT、得点の純粋関数 |
| `src/state.mjs` | ゲーム状態、着地の一回消費、演出進行、中断・再開、CLEAR/MISS |
| `src/renderer.mjs` | 360×560論理Canvas、高DPI描画、モデル非干渉の揺れ・文字演出 |
| `src/storage.mjs` | 専用キーによる自己ベスト読込・更新・例外吸収 |
| `src/main.mjs` | DOM初期化、入力調停、ライフサイクル、HUD・オーバーレイ |

依存方向は `main → state/rules/renderer/storage`、`state → rules`、`renderer → state/rules` とし、ルールと状態はDOM/Canvasに依存しない。

## 状態遷移

```text
TITLE → MOVING → FALLING → JUDGING → SETTLING
                    └ MISS ───────────────→ GAME_OVER
SETTLING ─ success floor<10 → MOVING
SETTLING ─ success floor=10 → CLEAR
MOVING/FALLING/JUDGING/SETTLING → PAUSED → 元の状態
CLEAR/GAME_OVER → MOVING（再挑戦）
```

`JUDGING`は同期的に一度だけ適用する。`FALLING`と`SETTLING`中は`requestDrop`を拒否する。非表示中は演出時間も進めず、再開時にフレーム時計を初期化する。

## 座標と描画

- 土台は `(90, 520, 180, 26)`。
- 着地済みブロックは土台から26pxずつ上へ積む。
- 移動位置は三角波 `travel - abs((phase mod 2*travel) - travel)` で算出し、フレーム回数を使わない。
- 奇数階は左、偶数階は右から開始する。
- 極細幅の判定値は丸めない。描画だけ最小0.45pxを使い、モデル値へ戻さない。
- 揺れはCanvas描画時の水平オフセットだけで表現する。
- 成功判定後の`SETTLING`では`placed`へ確定したブロックだけを描画し、判定前の`moving`は描かない。MISSだけは失敗演出用の`moving`を維持する。
- `PAUSED`中の描画は`pausedFrom`を実効フェーズとして扱う。SETTLING停止中の揺れは保存済み`animationElapsedSec`から同じオフセットを再現し、MISSブロックは`targetY`へ固定する。
- FALLING停止中は保存済み落下進捗から表示Yを再現する。PAUSED中は状態更新を行わず、再開後に保存時点から続行する。

## フレーム時間とUI更新

- MOVINGには`requestAnimationFrame`の実経過時間を切り捨てずに渡す。5FPS相当の200msフレームも0.2秒として加算する。
- 非表示・一時停止では従来どおりフレーム時計を`null`へ戻し、復帰中の経過時間を加算しない。
- オーバーレイは`TITLE`、`PAUSED`、`CLEAR`、`GAME_OVER`と表示値から更新キーを作り、キー変更時だけ`innerHTML`を更新する。HUDとステータス文字は通常フレームで個別更新する。
- ボタンを押している途中に毎フレームDOMが置換されないため、マウス・タップ・Tab操作の押下から解放まで要素の同一性を維持する。

## 設計決定

| ID | 決定 | 理由・影響 |
| --- | --- | --- |
| DD-01 | PERFECT式 `min(8, width/4)` | 正式依頼で明示 |
| DD-02 | 360×560、幅180、高さ26 | 正式依頼で明示 |
| DD-03 | 基本100、PERFECT+50、連続上限+50 | 正式依頼で明示 |
| DD-04 | 結果から直接MOVINGへ再挑戦 | 基本設計の推奨案を採用。TC-036を確定 |
| DD-05 | 演出中も停止し、復帰後に続行 | 基本設計の推奨案を採用。TC-035を確定 |
| DD-06 | 極細の論理幅を偽らない | 実機の視認性は別工程 |
| DD-07 | 揺れ0.25秒 | 指定範囲0.2〜0.3秒の中間値 |

## 設計との差異

- 基本設計案の4モジュールに `state.mjs` を追加した。状態機械をDOMから独立させ、TC-026〜036をNodeで直接検証するための責務分離であり、ゲーム仕様の変更ではない。
- Chrome確認用にNode標準機能だけの `tests/browser-check.mjs` と `tests/preview-server.mjs` を追加した。実行時依存は増やしていない。

## 独立レビュー指摘対応（2026-11-19）

| ID | 設計対応 | 仕様への影響 |
| --- | --- | --- |
| IR-01 | オーバーレイ更新キーを導入し、状態・表示値の変更時だけDOMを再生成 | なし。入力の安定性を改善 |
| IR-02 | `elapsedSecondsBetween`で実経過時間の全量をMOVINGへ渡す | 指定速度とFPS非依存性へ適合 |
| IR-03 | `shouldDrawMovingBlock`で成功SETTLINGの旧movingを非表示 | 判定・得点は不変。演出だけ修正 |
| IR-04 | PAUSED時も`pausedFrom`を使って揺れ・FALLING/MISS表示Yを再現 | モデル・判定・得点は不変。停止中の表示位置を保持 |

## 実機テスト用LANプレビュー

- 引数なしでは`127.0.0.1:4174`だけで待ち受ける。
- `--host <IPv4>`を明示した場合だけ、そのアドレスで待ち受ける。
- 許可するホストはRFC1918の`10/8`、`172.16/12`、`192.168/16`だけとし、`0.0.0.0`、公開IPv4、loopback、ホスト名は拒否する。
- ポート既定値4174と、ブラウザチェックで使用する従来の位置引数ポートを維持する。`--port`も利用できる。
- Node.js標準`http`、`net`のみを使用し、外部依存・外部通信・ルーター設定・ファイアウォール変更を行わない。
- LANモードは実行中プロセスだけに有効で、`Ctrl+C`による停止後は待受が消える。通常起動に戻すとloopback限定になる。
