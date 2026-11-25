# Phase 6 実機・人間QAへの引き渡し資料（準備記録）

対象ソース `bc1426cf1ff84cd18207073303e7d47fd83e5b12`（PP03）。自動ゲートは **HOLD**。実機と人間QAは **NOT_RUN**、最終受入は **HOLD**。EG-08の是正・再検証・正式承認後に引き渡す。

凍結済みの `17_visual_qa_protocol.md` に沿い、指定5端末（Galaxy S26 Chrome、iPhone SE2 Safari、iPad mini 6 Safari、Windows 11 Chrome、Windows 11 Edge）で80操作と50基準攻略を確認する。認定配置は `qa/fixtures/stages.json`、自動実測は `stage_validation_results.json` を参照する。

実機で前景フレーム、描画間隔p95、操作遅延、200%文字拡大、通信校正付き起動、保存・復元・競合、背景移行、回転、音声、耐久を計測し、機種・OS・ブラウザ・対象SHAと生証跡を残す。目視と試遊の評価は自動判定と別に行う。

移植・配布候補は実行ファイルの同一性、配布パス、差分、アクセス条件を照合する。公開には個別承認を要する。
