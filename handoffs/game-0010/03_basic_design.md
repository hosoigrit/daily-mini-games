> Game #0010 / 詳細設計 v1.0 FROZEN / Phase 3 CLOSED（設計のみ） / 2026-11-25 JST
> 正式凍結承認: DESIGN-FREEZE-GAME-0010-20261125-01（設計承認記録の識別子であり実行grantではない）。現行状態は12/13のv1.0節、15/18の凍結メタデータを参照。RC9の設計・判定契約をそのまま固定する。以下の過去版のHOLD・未承認・候補等の状態記述は履歴であり、v1.0の承認状態に優先しない。ただし個別の未定義oracle・観測不能・予算不足等の停止条件は有効。Phase 4以降未許可、全実行権限なし。

# 基本設計31単位
| ID | 責務 |
|---|---|
| BD-001 | App Controller |
| BD-002 | Stage Repository |
| BD-003 | Design Editor |
| BD-004 | Placement Validator |
| BD-005 | Geometry |
| BD-006 | Undo Manager |
| BD-007 | Simulation Controller |
| BD-008 | Physics Adapter |
| BD-009 | Body Factory |
| BD-010 | Spring Controller |
| BD-011 | Seesaw Controller |
| BD-012 | Tutorial Evaluator |
| BD-013 | Result Evaluator |
| BD-014 | Trajectory Recorder |
| BD-015 | Score Service |
| BD-016 | Save Repository |
| BD-017 | Save Validator |
| BD-018 | Input Controller |
| BD-019 | Canvas Renderer |
| BD-020 | UI Controller |
| BD-021 | Character Controller |
| BD-022 | Audio Controller |
| BD-023 | QA Harness |
| BD-024 | Stage Evaluator |
| BD-025 | Adjustment Governance |
| BD-026 | Test Integrity Guard |
| BD-027 | Loop Orchestrator |
| BD-028 | Release Management |
| BD-029 | Human QA Protocol |
| BD-030 | Dependency Management |
| BD-031 | Evidence Management |

依存規則：domainはDOMなし、physicsはadapter経由、renderer・audio・characterは読取のみ、保存はrunを変更しない、QAは本番ルールを使用し本番はQAを参照しない、ステージ定義はデータ、循環依存禁止。アプリ状態 BOOT/TITLE/SELECT/DESIGN/RUNNING/PAUSED/FAILED/CLEARED/ERROR。状態・編集・実験・保存の責務分離。
