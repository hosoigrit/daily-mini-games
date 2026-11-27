# Game #0012『時間の分身』 T2条件付き受入記録

ユーザーが2026年11月27日（JST）にT2-EX-001の限定採用とT2の例外付き受入を正式承認しました。T2総合の確定判定は **`CLOSED_WITH_EXCEPTION`** です。承認元は本会話の「T2-EX-001 限定例外正式採用・T2条件付き受入記録【ユーザー正式承認済み】」です。

| 対象 | 確定判定 |
|---|---|
| T2-EX-001 | `APPROVED_WITH_LIMITATIONS`。固定SHA上の人工配送2件に限定 |
| T2-F01 | `PASS`。停止中の状態変更を拒否する独立検証 |
| T2-F02 | 通常入力の検証 `PASS`。合成異常系列2件は個別の `FAIL` を保持して例外受容 |
| T2-F03 | `PASS`。必須P0の証跡独立監査 |
| 製品是正累積 | **2/5回** |

固定対象は `hosoigrit/daily-mini-games` の `codex/game-0012-development`、Tested SHA `85d0f42a44aebf6c464fa880194bb34c1c23c18b` です。製品ソースは `games/0012_time-clone/`、承認原本はE1固定SHA `85f51abd7260fc71b3abe11880269fb0c9c1b800` の `handoffs/game-0012/e1/` です。 [固定コミット](https://github.com/hosoigrit/daily-mini-games/commit/85d0f42a44aebf6c464fa880194bb34c1c23c18b) · [例外台帳](T2-EX-001-exception-register.md)

## 受入根拠

| 検証 | 確認結果 | 根拠 |
|---|---|---|
| T1既存 | 179/179 PASS | R02・R03実測ログとR04照合 |
| T2追加 | 20/20 PASS | R03独立オラクル10件とランタイム10件の既存実測 |
| 既存境界 | 10/10 PASS | R03既存実測ログ |
| 以前の旧FAIL | 4/4 PASS | R02個別再検証 |
| GC-01〜07 | 7/7 PASS | R03既存実測ログとR04照合 |
| T1-H01記録イベント | 41/41枠一致 | R04でE1状態差分から独立再導出 |
| 必須P0証跡 | 153件の監査PASS | 固定SHAのR02・R03独立証跡監査 |
| F01・F03 | 独立検証PASS | R02・R03実測・監査をR04で照合 |
| R02独自検証 | 17件中15 PASS・2 FAIL | R02原本とR03再判定が一致 |
| 合成異常系列2件 | 個別FAILを保持 | T2-EX-001限定例外を正式承認 |

R04は参照証跡のハッシュ照合、元のFAILの照合、H01期待値の独立再導出を行いました。上表の製品テスト件数・結果は既存の実測ログと監査証跡による確認です。R04および今回の承認記録作成では製品テストを再実行していません。 [R04照合記録](../game-0012-t2-r04/evidence-review.json) · [R03ケース結果](../game-0012-t2-r03/case-results.csv) · [旧FAIL4件再検証](../game-0012-t2-r02/prior-failures-retest.json) · [P0独立証跡監査](../game-0012-t2-r03/independent-evidence-audit.json)

## 原本保全と後続ゲート

E1原本は固定E1・固定Tested SHA・ローカル作業ツリーで21/21件のSHA-256とバイト数が一致しました。うち20件は承認マニフェスト記載値、マニフェスト自身はE1-R01-R1で外部承認された値で確認しました。製品・テストコードと旧FAILの元ログも保全されています。

GitHubは読取のみで、書込0件、対象PR 0件です。開発HEADとE1 HEADは固定SHAのまま、`main` は `11331d4dda3eb5c4ed66d362f45b49bd41c9d68c` のままです。Game #0012は `main` のGitHub Pages用公開ディレクトリに存在せず、今回の作業でGitHub Pagesへの公開やChatGPT Sitesの構築・公開は行っていません。

T3実機QAは `NOT_RUN`、T4最適性証明と最終受入は別ゲートで `HOLD` です。T3・T4対象の既存11件は `NOT_RUN` のままです。DD-H14の最適性は未証明、DD-H16の別タブ保存競合リスクは承認済みの条件付き受容を維持します。 [T3実機QA引継ぎ](T3-device-QA-handoff.md)
