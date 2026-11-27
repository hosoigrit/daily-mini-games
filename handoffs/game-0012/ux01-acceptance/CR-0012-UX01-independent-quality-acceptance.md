# Game #0012『時間の分身』 CR-0012-UX01 独立品質受入記録

2026年11月27日（JST）、ユーザーは本会話の「CR-0012-UX01 独立品質受入・T2-EX-001新SHA継続適用【ユーザー正式承認済み】」で、独立レビューの受入と、固定SHAに対する限定例外の継続適用を正式承認しました。

| 項目 | 確定判定 |
|---|---|
| CR-0012-UX01 独立品質受入 | `PASS` |
| T2-EX-001 新SHA継続適用 | `APPROVED_WITH_LIMITATIONS` |
| 新SHA品質受入 | `ACCEPTED_WITH_EXCEPTION` |
| 製品是正累積 | 3/5回 |

リポジトリは `hosoigrit/daily-mini-games`、開発ブランチは `codex/game-0012-development`、製品ディレクトリは `games/0012_time-clone/` です。

| 固定参照 | SHA |
|---|---|
| 新Tested SHA | `8ca505baf28798e6e86dee201a47ba7766b7672f` |
| 変更前Tested SHA・新SHAの唯一の親 | `85d0f42a44aebf6c464fa880194bb34c1c23c18b` |
| E1原本 | `85f51abd7260fc71b3abe11880269fb0c9c1b800` |
| T2正式受入文書 | `7d323a5b87a3729fc405ab0ce1c38e00a1d7595a` |

## 独立レビューの受入根拠

GitHubから取得した固定コミットの一時環境で、Node v24.22.3とChromium 156.0.8078.79で実測した結果を受け入れました。今回の承認記録作成では、独立レビューの実測・監査証跡を照合しました。 [独立レビュー報告](../game-0012-ux01-independent-review/review-report.md) · [同一性・実測集計](../game-0012-ux01-independent-review/integrity.json)

| 検証 | 結果 |
|---|---|
| UX01-01〜18 | 18/18 PASS。個別の期待・実測と193件のアサーションを保全 |
| 独自ガイド境界 | 6/6 PASS |
| T1既存 | 179/179 PASS |
| T2追加 | 20/20 PASS |
| 既存境界 | 10/10 PASS |
| T1必須P0 | 153/153 PASS。P0証跡監査PASS |
| GC-01〜07 | 7/7 PASS |
| T1-H01記録イベント | 41/41枠一致 |
| F01・F02通常入力・F03 | 停止契約、通常入力・正当な取消、証跡要件の非回帰を確認 |

承認した例外は人工配送の2件に限ります。R02の再実行17件は15 PASS・2 FAILで、両FAILの入力・期待・実測・判定を維持しています。旧SHAのT2受入状態 `CLOSED_WITH_EXCEPTION` は当時の記録として保全しています。 [新SHAの例外継続適用記録](T2-EX-001-continuation-8ca505b.md) · [R02新SHA再実測](../game-0012-ux01-independent-review/t2-r02-replay-results.json)

## 原本保全と後続ゲート

固定E1原本21/21件と旧T2正式受入文書3/3件は、SHA-256・バイト数が承認値と一致しました。開発HEADと文書ブランチを維持し、`main` は `11331d4dda3eb5c4ed66d362f45b49bd41c9d68c` のままです。GitHub書込0件、対象PR 0件、Sites更新・公開操作0件です。

新Tested SHAをT3の受入候補に固定しました。T3は `NOT_RUN`、T4最適性証明・最終受入・公開は `HOLD` です。今回のローカル承認記録のGitHub登録、Sites更新、T3実機QA開始には、それぞれ別途正式承認が必要です。 [T3引継ぎ追補](T3-device-QA-handoff-addendum-8ca505b.md)
