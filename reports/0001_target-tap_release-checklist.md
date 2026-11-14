# 公開チェックリスト：0001 ターゲットタップ

## 文書情報

| 項目 | 内容 |
| --- | --- |
| 作成日／更新日 | 2026-11-14 |
| 担当者 | Codex（実装状況の記録） |
| ステータス | **最終公開方針APPROVED／一般公開未実施** |
| 公開予定URL | 未定 |

## 公開前チェック

| 完了 | 項目 | 現在の状況 |
| --- | --- | --- |
| [x] | 単体自動テスト | 30 PASS／0 FAIL。localStorage取得・読込・書込拒否を含む |
| [x] | ヘッドレスChrome／Edge | 各1スイートPASS、READY／PLAYING／RESULT×5画面サイズ確認 |
| [x] | 人間によるPC実操作 | Chrome・Edge両方で確認済み（2026-11-13、ユーザー本人報告。ブラウザ版・操作別ログ未記録） |
| [x] | Android Chrome実機 | 人間報告によるPASS、2026-11-13に本人が再確認（機種・OS・ブラウザ版不明） |
| [x] | iPad Safari実機 | 人間報告によるPASS、2026-11-13に本人が再確認（機種・OS・ブラウザ版不明） |
| [x] | iPhone Safari実機 | 公開前必須のAC-19～21を人間が確認、2026-11-13に本人が再確認（機種・OS・ブラウザ版不明） |
| [x] | ChatGPT独立レビュー | 実装最終レビューはCONDITIONAL PASS、RV-001・RV-002・RV-003aはCLOSED。ローカル公開準備の独立レビューはPASS |
| [x] | 素材ライセンス | 外部素材なし。CSS描画のみ |
| [x] | 秘密情報・外部通信 | 一般的な秘密パターンなし。ゲーム実行時の外部通信なし |
| [x] | 既存ゲームへの回帰 | `shared/`・他ゲーム・ゲーム原本は未変更。`docs/`への新規配置のみ |
| [x] | 公開用ファイル | `docs/games/0001_target-tap/`へ原本と完全一致する4ファイルを配置。トップページ導線、Chrome／Edge公開用パス検証PASS |
| [x] | 人間の公開承認 | 2026-11-14、ユーザー本人が最終公開方針をAPPROVED。commit・専用ブランチPush・Draft PR作成まで許可 |

## 公開判定

- 最終公開方針：**APPROVED**
- 一般公開状態：**未公開**
- チェック進捗：**12／12件完了**。
- Git作業権限：commit、Game 0001専用ブランチへのPush、`main`をベースとするDraft PR作成まで承認済み。
- 未承認操作：PRマージ、`main`への直接Push、GitHub Pages設定変更・公開。
- 証拠上の残存リスク：承認済み要件で求められるPC・実機のOS／ブラウザ版、実機機種は未記録のまま。2026-11-14にユーザーが残存リスクを明示的に受容し、DOC-01を**ACCEPTED（リスク受容済み）**とした。実機操作テストのPASSは維持し、追加環境情報取得を公開前必須条件から解除する。
- 自動テストの成功は公開許可を意味しない。
- 独立レビューがFAIL、または未解決のCRITICAL・MAJORがある場合は公開不可。
- CONDITIONAL PASSでは、公開を妨げる条件の解消と必要な再レビュー、または許容可能な残存リスクへの人間の明示的承認が必要。

## 2026-11-13 人間確認記録

- ユーザー本人：「Android・iPad・iPhoneすべて確認済み。補足なし」
- ユーザー本人：「先ほど、人間でのPC操作確認も取れました」
- ユーザー本人：「PC操作確認はChrome・Edgeの両方で完了しています」
- 実機での個別操作・確認環境の詳細は `games/0001_target-tap/test-plan.md` を参照。ChatGPTやCodexの直接的な実機検証ではない。
- この確認はテスト受け入れに関するものであり、**Push・PR作成・マージ・GitHub Pages公開への承認ではない**。

## 2026-11-14 公開準備記録

- `docs/index.html`にGame 0001への相対リンクを持つ最小トップページを追加。
- `docs/games/0001_target-tap/`に`index.html`、`styles.css`、`game.js`、`game-logic.js`を配置し、ゲーム原本とのSHA-256完全一致を確認。
- `docs/`を配信ルートとした`http://127.0.0.1:4174/games/0001_target-tap/`でChrome・Edge自動スモークテストPASS。
- HTML、CSS、JavaScript、ES Moduleの相対パスとHTTP 200を確認。自己ベスト保存・復元、localStorage拒否時の継続動作もPASS。
- 公開予定URLは未確定。Push、PR、マージ、Pages設定変更、公開は未実施。

## 2026-11-14 DOC-01リスク受容記録

- 詳細記録：`reports/0001_target-tap_doc01-risk-acceptance.md`
- 処理状態：**ACCEPTED（リスク受容済み）**
- 未記録の事実：PC・Android・iPad・iPhoneの機種、OS、ブラウザ詳細版の全部または一部は未記録のまま。
- 実機受け入れ：PC Chrome、PC Edge、Android Chrome、iPad Safari、iPhone Safari、およびiPhone AC-19～21のPASSを維持。
- 効果：環境情報の追加取得を公開前必須条件から解除。問題解消や環境情報取得完了を意味しない。
- 公開権限：最終公開方針はAPPROVED。GitHub Pages公開は未承認・未実施。

## 2026-11-14 最終公開承認記録

- 承認主体：ユーザー本人。
- 最終公開方針：**APPROVED**。
- DOC-01：**ACCEPTED**を維持。環境詳細は未記録のまま。
- 今回許可された操作：commit、専用ブランチへのPush、Draft PR作成。
- 未承認操作：PRマージ、`main`への直接Push、GitHub Pages設定変更・公開、外部デプロイ、note投稿。
- 一般公開状態：**未公開**。

## 公開後チェック

GitHub Pages本番URLがまだ存在しないため、すべて未実施。公開前に本番URL確認を必須とはしない。公開後に、URL到達、ゲーム完走、リンク・表示、既存ゲームの動作を確認する。
