> Game #0010 / 詳細設計 v1.0 FROZEN / Phase 3 CLOSED（設計のみ） / 2026-11-25 JST
> 正式凍結承認: DESIGN-FREEZE-GAME-0010-20261125-01（設計承認記録の識別子であり実行grantではない）。現行状態は12/13のv1.0節、15/18の凍結メタデータを参照。RC9の設計・判定契約をそのまま固定する。以下の過去版のHOLD・未承認・候補等の状態記述は履歴であり、v1.0の承認状態に優先しない。ただし個別の未定義oracle・観測不能・予算不足等の停止条件は有効。Phase 4以降未許可、全実行権限なし。

# ループ・統制プロトコル
外部実行承認と凍結契約を照合。契約は不変、自己参照SHAを含めない。実行承認は承認ID・基点・handoffSHA・policy/paths digest・branch・操作・writerを外部指定。契約のfalseは権限がないことを表す初期状態、実際の許可は外部grantと契約上限の積集合。自己承認不可。固定基準を作業ブランチから独立に参照し、hash・runner・manifest・期待値・依存・集計を保護。実装前に期待値固定→実行テスト作成→別観点レビュー→mutation→テスト基準固定。テスト自身の誤りは変更要求/HOLD。独立性は実態記録。
各工程：PRECHECK→IMPLEMENT→TEST→REVIEW→予算予約→FIX→REVALIDATE→関連回帰→gate→CP。Critical（保護違反/重大保存事故等）は即停止、High/Must解消必須、Medium原則是正、Low理由記録。初回実装は是正外、是正開始で1回、中断も消費、複数工程変更は各工程1・全体1、根本原因ID別に重大2、ID変更で回避不可。単なる回帰は是正外。予算を予約、保存確認後開始。消費不明は予約最大、未開始確認のみ解除。候補生成は違法/重複も計上、実験開始でシミュレーション消費、各tick消費、探索時間は自動360分に含む。E6/途中/E8/人間後各3000枠、相互無断流用禁止。E8全必須自動再検証分確保。単一writer、別レビュー読取、元タスク停止確認、最新CP世代/前digest/台帳照合、push競合でSTOP、force禁止。再開時に全許可・基点・scope・budget・未解決・失効を照合。不明はHOLD。
停止 LS01矛盾、02範囲、03予算、04重大是正上限、05engine変更、06調整範囲、07SHA不一致STOP、08HITL、09保護違反STOP、10外部依存違反STOP、11環境BLOCKED、12重大データ事故STOP、13台帳欠落、14想定外GitHub操作STOP、15中断、16証跡不一致。自律停止後の再開は原因解消と必要承認。失効ゲート：変更された対象と依存する全後続をSTALE、過去証跡保持。E5後共通物理変更別承認、関連全stage再検証。Tested SHAとEvidence SHAの実行差分0のみ証跡引継ぎ。外部承認なしGitHub操作禁止。公開前後の検証分離。
証跡15種：implementation_summary.md, requirement_coverage.json, automated_test_results.json, physics_validation_results.json, stage_validation_results.json, stage_adjustment_ledger.json, performance_results.json, regression_results.json, test_integrity_report.json, review_findings.json, remediation_history.json, loop_execution_log.json, gate_results.json, visual_qa_handoff.md, residual_risks.md. 生ログ・試行ID・rootCause・環境・対象SHA・設定・status・実際のレビュー方式。台帳は改ざん不能ではない。保護対象差分、人間の固定SHA検証と併用。

## RC3 予算の実行前明確化
E6/INTERIM/E8/POST_HUMAN各3000回枠に正式ステージPテストを振り分け、再実行も同一枠の累計に加算。物理基礎・ルールPテストはBUD10/11へ、同じ実行証跡を複数TCが共有する場合は実際のrunId単位で一度だけ計上。探索と正式認定の実行は別。実機50攻略と人間の手動プレイは自動シミュレーション枠と別に記録し、QA補助の自動再生はその用途の枠へ計上する。E0以前に新規予算消費・環境操作なし。外部承認があっても凍結HOLDなら実行禁止。

## RC4 予算・権限の意味制約
正式stageを実行するB/Iテストもrun開始時に該当正式枠を計上（E7等の中間検証はINTERIM、E8はE8、人間指摘後はPOST_HUMAN）。基礎物理のB/I/Pも基礎枠、探索は探索枠。単体判定や静的レビューは自動時間のみ。実際の実行結果を同一runIdで複数TCに紐付ける場合は消費1回。別実行のrunId流用禁止。全自動処理時間と予約を集計、各枠を超えず累計上限も満たす。E0是正も全体に含む。CP schemaに個別上限を追加、合計・予約・重複・状態遷移は意味検証。外部grantなし/設計HOLDの場合は一切開始不可。

### 最新チェックポイントと証跡の保存順序（RC4補足案）
チェックポイントは旧世代の完全な内容をraw-events.jsonlに保持し、新世代の予約/消費内容を追記した後、最新snapshotを更新する。将来の外部Push権限がある場合、両方を同じ承認済みコミットに含めて読み戻し照合する。中断でsnapshotと履歴が一致しなければHOLD。GitHubコミットは競合防止を保証しないため元writer停止・期待する最新HEAD・通常push・読戻しを全確認。集計報告は更新可能だが生ログは追記のみ。

## RC5 統制補足
CP schemaは構造のみ。台帳を試行ID単位で再計算し、各区分の合計・予約残量・枠・累積秒・根本原因回数を照合する。未開始が確証できる予約だけ解除。予約を永続化する前に処理開始禁止。CP世代の連鎖・単一writer・remote HEADの一致を確認、競合時に強制上書き禁止。全ケースの実行結果はparent/case/subcase/runIdで照合し、集約caseは既に必要範囲の証跡を満たす個別caseを参照して合否を導く（実行を省略するskipではない）。E8段階の人間QA未実施は正当なNOT_RUN、EG-09未通過、最終受入HOLD。人間QA後の修正も予算と外部承認の範囲に限定。


## RC6 中断・再開と計測契約
外部grantはユーザーが別途発行する明示的な承認情報であり、作業台帳から生成しない。元タスクが利用可能な場合も単一writer・最新CP・予約・実消費を照合。別タスクの場合、元writer停止を確認し、許可済み専用開発ブランチの最新HEADを読取、snapshotと追記履歴を同じcommitから取得し前世代digestと履歴集計を照合。必要な証跡実体の欠落・grant不明・writer停止不明はHOLD、競合pushや固定SHA不一致はSTOP。未開始が確証できる予約のみ解除し、不明は予約最大を一度計上。台帳重複による二重計上も無断返却も不可。各工程予算不変、30分耐久専用試験は自動360分内で2100秒の予約候補を確保。手動実機は別台帳。


## RC7 既存物理テストの再現手順
07/18の有限候補gridは開始前固定、全試行を基礎物理検証枠で予約/消費。候補適格性は独立rawで評価し、DUT合否を根拠に次候補に差し替えない。候補なし/観測不能はBLOCKED。既存テストの不明な入力・期待値を実行中に自己決定しない。


## RC8 証跡の適用
親contractの複合条件はcase別割当を保ったまま実行。集約caseは指定された全caseの同一対象・環境・指紋・結果を照合し、追加runを消費しない。技術資格のないP結果をU/I結果で代用しない。RC8明示残件の設計決定が先。


## v1.0 統制状態（現行）
設計凍結済み、外部実行grant未発行。凍結は自己承認や作業権限の付与ではない。全ケースの独立意味レビュー未実施の了承は、後続の個別テスト固定前レビュー・全必須合格条件の免除ではない。
