# Stage A-2a-R3 第1段階　判定

| 工程 | 判定 |
| --- | --- |
| R3-01　R2固定原本・成果物検証 | PASS |
| R3-02　R2固定コミットのGitHub登録と別リポジトリ読戻し | PASS |
| R3-03　ローカル専用QAハーネス構築 | PASS |
| R3-04　QA自動テストと独立レビュー | PASS |
| Stage A-2a-R3 第1段階 | PASS |
| Stage A-2a・Stage A-2全体 | HOLD |
| QAハーネス登録・QAサイト作成と公開・Stage A-2b以降 | 未許可 |
| 物理端末試験と主観試聴 | NOT RUN |

R3-REG-01〜10はPASS。登録先は指定開発ブランチのみ、登録したR2固定HEADは8afe3cfb1d63920ba0c31c6391cc9a644ee24492。QAと今回の証跡はローカルの保存対象。

| 指摘 | 状態 | 根拠 |
| --- | --- | --- |
| A2a-CLK-01 | OPEN | Firefox隔離の起動改善は保持。長時間同期未解消 |
| A2a-CLK-02 | OPEN | 承認WebKitの初回超過。修正版の正式採用は未許可 |
| A2a-CLK-03 | OPEN | Chromium長時間同期の残存 |
| A2a-PERF-01 | OPEN | 84秒負荷fixtureの既存クラウド実測と未実施の実機性能 |
| RV-A2AR-01 | CLOSED | 20 ms同値と丸め前超過を回帰で確認 |

QAの検証は、実測されたFAIL/BLOCKEDも欠けずに記録できることを含む。既存製品のブラウザ同期ゲートと合否を分けて保全した。
