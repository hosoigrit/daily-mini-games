> Game #0010 / 詳細設計 v1.0 FROZEN / Phase 3 CLOSED（設計のみ） / 2026-11-25 JST
> 正式凍結承認: DESIGN-FREEZE-GAME-0010-20261125-01（設計承認記録の識別子であり実行grantではない）。現行状態は12/13のv1.0節、15/18の凍結メタデータを参照。RC9の設計・判定契約をそのまま固定する。以下の過去版のHOLD・未承認・候補等の状態記述は履歴であり、v1.0の承認状態に優先しない。ただし個別の未定義oracle・観測不能・予算不足等の停止条件は有効。Phase 4以降未許可、全実行権限なし。

# 296親テスト仕様
18のケース一覧が実行契約候補。既存IDを全保持。個別実行、各方法別ケース、反復/行列を分離。全NOT_RUN。具体値未確定と広い複合ケースは凍結前に補強が必要。

| ID | 入力 | 期待結果 | 方式/工程 | 子ケース数 | 状態 |
|---|---|---|---|---|---|
| TC-D1-001 | planck@1.5.1正規配布物 | 承認ハッシュ・版・MIT通知一致 | I/E1,R/E1 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D1-002 | 同一配布物をNodeと最小静的HTTPで読込 | 両方起動、CDN不要 | B/E1,I/E1 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D1-003 | 論理(0,0) | 物理(0,7.2) | U/E1 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D1-004 | 論理(960,720) | 物理(9.6,0) | U/E1 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D1-005 | 全41×31格子点往復 | 誤差≤1e-6m | U/E1 | 5 | RC4_REVIEW_CANDIDATE |
| TC-D1-006 | −60〜60°を15°刻み | −角度×π/180と一致 | U/E1 | 10 | RC4_REVIEW_CANDIDATE |
| TC-D1-007 | FX02生成 | 半径0.2、質量0.2、速度0、bullet=true、回転可 | I/E1 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D1-008 | 同じ3パーツを全6順で生成 | 正規キー・生成順一致 | P/E1,U/E1 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D1-009 | FX03、60tick、減衰0 | Y=1.6±0.10、vy=−9.8±0.01 | P/E1 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D1-010 | FX04上面から中心1m上、初速0 | 上面接触、反対側通過なし | P/E1 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D1-011 | FX05±30°上面から転動 | 傾斜下方の正味変位>0 | P/E1 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D1-012 | 水平面上、初速3m/s、摩擦0.2と0.6 | 高摩擦側の滑り速度減少が大 | P/E1 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D1-013 | 垂直入射3m/s、実効反発0と0.1 | 0.1側の反発速度が大 | P/E1 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D1-014 | 高速行列、静的、入射0° | すり抜けなし | P/E1 | 12 | RC4_REVIEW_CANDIDATE |
| TC-D1-015 | 高速行列、静的、入射30/60° | すり抜けなし、有限 | P/E1 | 24 | RC4_REVIEW_CANDIDATE |
| TC-D1-016 | 矩形端から内側0.10mに向け入射 | 異常位置飛び・貫通なし（定量条件要確定） | P/E1 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D1-017 | 高速行列、動的回転拘束板 | 衝突解決、支点誤差≤0.02m、角度超過≤2° | P/E1 | 36 | RC4_REVIEW_CANDIDATE |
| TC-D1-018 | 静止接触と高速行列 | 実形状貫通≤0.01m／0.06m、すり抜けなし | P/E1 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D1-019 | FX07左右荷重 | 支点誤差≤0.02m、角度超過≤2° | P/E1 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D1-020 | 0/1/60/1200tick | 0/1÷60/1/20秒 | I/E1,U/E1 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D1-021 | 描画60Hz/30Hz/不規則 | 同じtickで位置・速度・角度差≤1e-6各単位 | B/E1,P/E1 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D1-022 | 描画あり／なし | 同じtick・終端一致 | P/E1 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D1-023 | 100ms遅延／250ms停止／背景移行 | 最大5tick、長停止はPAUSED、追いつきなし | B/E1,U/E1 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D1-024 | v=(12,9)、ω=80 | v=(9.6,7.2)、ω=60 | U/E1 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D1-025 | 同一tickの重複接触 | 事象の欠落・不正重複なし | I/E1,P/E1 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D1-026 | Fixture A/B反転 | 正規法線・接近速度一致 | P/E1,U/E1 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D1-027 | tick内begin/end接触 | 一時接触証跡保持 | P/E1 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D1-028 | NaN／Infinity／速度30m/s超注入 | ERROR、正常クリアなし | I/E1,U/E1 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D1-029 | 物理更新例外 | 安全停止、診断記録 | I/E1 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D1-030 | 同一世界100回新規生成 | 各tick差≤1e-6各単位・結果一致（代表状態要確定） | P/E1 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D1-031 | 世界生成・破棄100回 | 不要参照・購読・ループ残存0 | I/E1,P/E1 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D1-032 | バネ作動・板傾斜後再実験 | 初期位置速度角度・接触履歴初期化 | I/E4,P/E4 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D2-001 | 4種類定義 | 承認寸法・属性一致 | U/E2 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D2-002 | 坂道−60〜60を15°刻み、範囲外 | 9角度のみ受理 | U/E2 | 18 | RC4_REVIEW_CANDIDATE |
| TC-D2-003 | 足場0,±15° | 0のみ受理 | U/E2 | 4 | RC4_REVIEW_CANDIDATE |
| TC-D2-004 | バネ−45〜45を15°刻み、範囲外 | 7角度のみ受理 | U/E2 | 16 | RC4_REVIEW_CANDIDATE |
| TC-D2-005 | 板0,±15° | 0のみ受理 | U/E2 | 4 | RC4_REVIEW_CANDIDATE |
| TC-D2-006 | 論理座標11,12,13,36 | 吸着0,24,24,48 | U/E2 | 5 | RC4_REVIEW_CANDIDATE |
| TC-D2-007 | 中心が盤面端／内部 | 全形状収容時のみ許可 | U/E2 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D2-008 | 在庫1で2個目追加 | 拒否、配置・在庫・Undo不変 | I/E2 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D2-009 | 固定物を移動／削除／回転 | 拒否、状態不変 | I/E2 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D2-010 | 水平足場同士の中心距離1.20m | 接触許可 | U/E2 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D2-011 | 水平足場同士の中心距離1.19m | 内部重複拒否 | U/E2 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D2-012 | AABBのみ重複する回転矩形 | SATで許可（座標要確定） | U/E2 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D2-013 | 初期球外周接触／0.01m侵入 | 許可／拒否 | U/E2 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D2-014 | ゴール保護領域内部／境界接触 | 拒否／許可 | U/E2 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D2-015 | I:接近.400/.500、P:実測接近≥.400の適格上面 | 適格接触で正常作動1回。P資格なしBLOCKED | I/E3,P/E3 | 2 | RC9_CONTRACT_CONFIRMED_NOT_RUN |
| TC-D2-016 | 側面／裏面／法線差30°超 | 作動なし | I/E3,P/E3 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D2-017 | 接近0.399／0.400／0.401 | 未達／候補／候補 | U/E3 | 3 | RC4_REVIEW_CANDIDATE |
| TC-D2-018 | 許可7角度で有効接触 | v=V(sinθ,cosθ) | I/E3,P/E3 | 8 | RC4_REVIEW_CANDIDATE |
| TC-D2-019 | 入射1／3／6m/s | 同じ設定速度へ置換 | I/E3,P/E3 | 4 | RC4_REVIEW_CANDIDATE |
| TC-D2-020 | 連続接触10tick | 再作動なし | I/E3,P/E3 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D2-021 | 離隔0.04m以上・無接触2tick→再接触 | 再作動可 | I/E3,P/E3 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D2-022 | 0.039m／無接触1tick／途中再接触 | 再作動不可 | I/E3,P/E3 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D2-023 | 2／3個同時有効接触 | 最大1回/tick | I/E3,P/E3 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D2-024 | 非選択バネへの接触継続 | 翌tickの遅延作動なし | I/E3,P/E3 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D2-025 | 候補通知全順序変更 | 選択同一 | I/E3,U/E3 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D2-026 | PP03の両内部更新に候補 | 最大1回/game tick | P/E3 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D2-027 | FX07左右0.60m荷重 | 荷重方向へ回転 | P/E4 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D2-028 | FX07中央荷重 | 強制回転なし（角度許容値要確定） | P/E4 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D2-029 | 左右最大荷重・速度 | ±30°超過≤2° | P/E4 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D2-030 | 荷重・高速衝突 | 支点誤差≤0.02m | P/E4 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D2-031 | 初期板非重複、予約領域内部干渉 | 拒否 | U/E2 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D2-032 | サンプル角度間の干渉 | 拒否 | U/E2 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D2-033 | 2板の予約領域内部重複 | 拒否 | U/E2 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D2-034 | 同じ完成配置を逆順追加 | 合法性一致 | I/E2,U/E2 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D2-035 | 傾斜後再実験 | 水平・角速度0 | P/E4 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D2-036 | 仮坂道+30°を合法位置へ配置 | 指定角度で1回確定 | B/E7,I/E2 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D2-037 | 無効移動／pointercancel／回転中断 | 確定状態不変 | B/E7,I/E2 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D2-038 | 配置→移動→回転→削除→順次Undo | 各直前状態と在庫復元 | I/E2 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D2-039 | 有効操作51回→Undo51回 | 50回のみ復元 | I/E2 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D2-040 | リセット／確認済みベスト読込 | 履歴消去／1操作としてUndo可 | B/E7,I/E2 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D3-001 | FX08生成 | U字、内幅1.20内高0.72、壁底0.16 | I/E5,U/E5 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D3-002 | ゴール内部・入口保護範囲への配置 | 拒否 | U/E5 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D3-003 | 球中心ローカル(0,0.30) | 収容成立 | U/E5 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D3-004 | 中心(0,0.60) | 収容未成立 | U/E5 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D3-005 | X=0.41/0.410002、Y=0.19/0.52（他軸有効） | 境界受理／拒否／受理／受理 | U/E5 | 8 | RC4_REVIEW_CANDIDATE |
| TC-D3-006 | 速度0／0.10／0.15 | 安定条件成立 | U/E5 | 3 | RC4_REVIEW_CANDIDATE |
| TC-D3-007 | 速度0.1501／0.25 | 安定条件未成立 | U/E5 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D3-008 | 初回安定100→129 | 29区間、未クリア | U/E5 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D3-009 | 初回安定100→130、必須達成 | 30区間、CLEARED | U/E5 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D3-010 | 安定途中1tick速度超過／領域外 | カウンターリセット | I/E5,U/E5 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D3-011 | PP03内部観測で安定逸脱 | リセット | I/E5,P/E5 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D3-012 | U字へ真上・斜め入射 | 指定基準ケースで自然安定（初期値要確定） | P/E5 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D3-013 | X=−0.10/9.70、Y=−0.10/7.30 | 他条件なしなら継続 | U/E5 | 5 | RC4_REVIEW_CANDIDATE |
| TC-D3-014 | X=−0.21/9.81、Y=−0.21/7.41 | 各方向FAILED | U/E5 | 6 | RC4_REVIEW_CANDIDATE |
| TC-D3-015 | X=−0.20/9.80、Y=−0.20/7.40 | 境界接触は継続 | U/E5 | 9 | RC4_REVIEW_CANDIDATE |
| TC-D3-016 | 1199tick、他条件なし | RUNNING | U/E5 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D3-017 | 1200tick、他条件なし | FL-005 | U/E5 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D3-018 | 1200tickで安定30区間、必須達成 | CLEARED優先 | I/E5,U/E5 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D3-019 | 数値異常とクリア同時 | ERROR優先 | I/E5,U/E5 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D3-020 | 安定30区間、必須false | FL-006 | U/E5 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D3-021 | 中止後の旧実験イベント | 進捗・評価・軌跡不変 | I/E5 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D3-022 | 同一終端通知10回 | 結果・進捗更新1回のみ | I/E5 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D3-023 | 自由坂道上面3tick、正味0.24m下方 | 達成 | P/E5,U/E5 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D3-024 | 上面接触、正味0.239m | 未達 | U/E5 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D3-025 | ±0.10m往復 | 不正加算なし | U/E5 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D3-026 | ST02で0／+15／−15°有効使用 | 水平のみ未達 | P/E5,U/E5 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D3-027 | U:接近.20/Jup/m=.10、4質量。P:固定落下候補から実測資格 | 各質量で達成。P資格なしBLOCKED | P/E5,U/E5 | 8 | RC9_CONTRACT_CONFIRMED_NOT_RUN |
| TC-D3-028 | U:側面/.19/.099各独立。P:実測側面/低接近/低力積 | 各対象足場使用未達。P資格なしBLOCKED | P/E5,U/E5 | 6 | RC9_CONTRACT_CONFIRMED_NOT_RUN |
| TC-D3-029 | 正常SPRING_ACTIVATED | 達成 | I/E5,P/E5 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D3-030 | 不作動／非選択 | 未達 | I/E5,P/E5 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D3-031 | 有効上面荷重・offset・正常力積・荷重方向角速度差・同episode角変化 | 正例のみ使用達成、各境界/負例未達。実観測不可BLOCKED | P/E5,U/E5 | 2 | RC9_CONTRACT_CONFIRMED_NOT_RUN |
| TC-D3-032 | 固定/旧run/中央/無接触/既回転無加速/逆向き荷重/離脱後変位 | 各独立負例で使用未達。実観測不可BLOCKED | I/E5,P/E5 | 2 | RC9_CONTRACT_CONFIRMED_NOT_RUN |
| TC-D3-033 | T=3、N=2/3、正常クリア | 星3 | U/E5 | 4 | RC4_REVIEW_CANDIDATE |
| TC-D3-034 | T=3、N=4、正常クリア | 星2 | U/E5 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D3-035 | T=3、N=5/6、正常クリア | 星1 | U/E5 | 3 | RC4_REVIEW_CANDIDATE |
| TC-D3-036 | 同じ攻略、失敗・ヒント・Undo回数変更 | 星不変 | I/E5,U/E5 | 4 | RC4_REVIEW_CANDIDATE |
| TC-D3-037 | ベストなし→5→4→4→6 | 登録・改善・維持・維持 | I/E5 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D3-038 | 旧互換ベスト3、現行初クリア4 | 現行新規登録 | I/E5 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D3-039 | 初期→ST01クリア→再失敗 | ST02解放維持 | I/E5 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D3-040 | 9/10→10/10→30星 | 達成表示対応、通知一意 | B/E7,I/E5 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D3-041 | tick0〜60 | 0,6,…60の11点 | U/E5 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D3-042 | tick15終端 | 0,6,12,15の4点 | U/E5 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D3-043 | tick1197／1200終端 | 201点以内、終点重複なし | U/E5 | 3 | RC4_REVIEW_CANDIDATE |
| TC-D3-044 | 正常クリア／通常失敗／中止／ERROR | 正常終了のみ軌跡置換 | I/E5 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D3-045 | 編集／Undo／ベスト／リセット／ステージ移動 | 前3維持、後2消去 | I/E5 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D3-046 | LEVEL1〜3任意順 | 指定ヒント、回数制限なし | B/E7,I/E6 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D3-047 | ヒント表示前後の配置・在庫 | 不変、物理形状なし | I/E6 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D3-048 | 旧互換性ヒント | 現行攻略として適用しない | I/E6,U/E6 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D4-001 | 10定義、欠落・重複注入 | 01〜10各1件のみ | U/E6 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D4-002 | 補助座標(10,20)/(3,28.5) | 左上(10,10)/(3,1.5)、物理(2.4,4.8)/(.72,6.84) | U/E6 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D4-003 | 全固定構造・ゴール | 盤面収容 | U/E6 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D4-004 | 全初期球・固定構造 | 内部重複なし | U/E6 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D4-005 | 在庫・星3目標・調整差分 | 承認基準一致 | R/E6,U/E6 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D4-006 | 初期17候補と初期定義 | 共通配置判定で合法（物理未認定） | I/E6,U/E6 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D4-007 | 全10ステージ自由配置0 | 正常終了、クリア0 | P/E6 | 10 | RC4_REVIEW_CANDIDATE |
| TC-D4-008 | 認定基準・別解を通常操作系列で構築 | 全件再現可 | B/E7,I/E6 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D4-009 | 基準攻略10件 | 全クリア | P/E6 | 10 | RC4_REVIEW_CANDIDATE |
| TC-D4-010 | 基準攻略10件 | 全星3 | P/E6 | 10 | RC4_REVIEW_CANDIDATE |
| TC-D4-011 | ST01/02/03/04/06 | 必須使用全達成 | P/E6 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D4-012 | 各基準攻略100回新規世界 | 1000/1000成功 | P/E6 | 10 | RC4_REVIEW_CANDIDATE |
| TC-D4-013 | ST04〜10の別解各1以上 | 7件以上成功 | P/E6 | 7 | RC4_REVIEW_CANDIDATE |
| TC-D4-014 | 基準と別解の使用・軌跡・除去比較 | 意味ある差（認定細則要確定） | P/E6,R/E6 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D4-015 | I:未使用追加の固定証跡。P:最大24合法追加候補 | 別解認定false、P適格なしBLOCKED | I/E6,P/E6 | 2 | RC9_CONTRACT_CONFIRMED_NOT_RUN |
| TC-D4-016 | 数値異常・すり抜け注入 | 攻略認定拒否 | P/E6 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D4-017 | 10基準攻略終端tick | ≤1200、1080超は追加レビュー | P/E6 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D4-018 | 10攻略×5環境 | 50件クリア・星・必須一致 | D/HUMAN_QA | 50 | RC4_REVIEW_CANDIDATE |
| TC-D4-019 | 各パーツ上下左右・角度±1段階 | 全合法近傍生成、重複なし | U/E6 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D4-020 | 範囲外／重複／在庫違反 | 分母から除外 | U/E6 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D4-021 | 序盤6中3／中盤10中2／11中2 | 合格／合格／不合格、全実測近傍も評価 | P/E6,U/E6 | 14 | RC4_REVIEW_CANDIDATE |
| TC-D4-022 | 合法0／序盤3／以降9 | 不合格 | U/E6 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D4-023 | 全30ヒント対認定攻略 | 30/30整合 | R/E6 | 30 | RC4_REVIEW_CANDIDATE |
| TC-D4-024 | 定義変更後旧ヒント | 再検証まで不適用 | I/E6 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D4-025 | 初期固定座標・ゴール各軸±2 | 他条件適合時受理 | U/E6 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D4-026 | 初期から+2後さらに+1 | 累積+3拒否 | U/E6 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D4-027 | 星目標／必須／共通物理を無断変更 | 拒否・停止 | I/E6,R/E6 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D4-028 | 各2000／累計20000回到達 | 追加探索不可、未達HOLD | I/E6 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D4-029 | 同一配置を異なる順で生成 | 同一キー・重複排除 | U/E6 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D4-030 | 候補固定後の設定・証跡 | 同一設定・SHA・参照一致 | I/E6,R/E6 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D5-001 | 保存キーなしで初回起動 | 正規初期、ST01のみ解放 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-002 | 初期データ | 10ステージ・型値適合 | U/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-003 | 合法新規配置確定 | 最新配置、revision+1 | B/E7,I/E7 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D5-004 | 移動→回転→削除 | 各確定後の状態保存 | B/E7,I/E7 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D5-005 | Undo／確認済みベスト読込 | 復元配置保存 | I/E7 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D5-006 | 在庫超過／重複編集 | 文字列・revision不変 | I/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-007 | ドラッグ中、pointerup前 | 書込0 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-008 | 正常クリア | 進捗・星・ベスト一括書込 | I/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-009 | 失敗／中止／ERROR | 進捗・ベスト不変 | I/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-010 | 配置保存→実験→再読込 | 最後の配置、物理初期化 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-011 | 音量0/.7/1、mute ON/OFF | 保存復元一致 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-012 | 最大構成正規データ | 65536 UTF16単位以内、復元可 | B/E7,U/E7 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D5-013 | 不完全JSON | 元文字列保護、警告 | B/E7,U/E7 | 5 | RC4_REVIEW_CANDIDATE |
| TC-D5-014 | null／配列／別gameId | 適用拒否 | U/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-015 | schemaVersion 0/2/文字列 | 無断上書きなし | B/E7,U/E7 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D5-016 | X−1/41/小数、未知type、不正角度 | 拒否 | U/E7 | 8 | RC4_REVIEW_CANDIDATE |
| TC-D5-017 | 在庫超過／重複ID／14件 | 拒否 | U/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-018 | ST03配置だけ破損 | 他9ステージ維持 | I/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-019 | usedParts=1、配置2件 | 現行ベスト認定拒否 | U/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-020 | cleared=true、stars不正／欠落 | クリア維持、評価不明 | I/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-021 | volume−.1/1.1/文字列、mute不正 | 既定値への復旧候補 | U/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-022 | storage取得／読込例外 | 一時プレイ・警告 | B/E7,I/E7 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D5-023 | quota／setItem例外 | 元データ維持、未保存 | B/E7,I/E7 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D5-024 | 復旧確認取消 | 元文字列不変 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-025 | 通常単一タブ | OWNER・保存可 | B/E7,D/HUMAN_QA | 2 | RC4_REVIEW_CANDIDATE |
| TC-D5-026 | A起動後B起動 | A OWNER、B READ_ONLY | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-027 | 同一保存コンテキスト2タブ同時起動20回 | 同時OWNERなし | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-028 | READ_ONLY編集／クリア／初期化 | 一時プレイ可、永続書込不可 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-029 | Aの保存更新 | Bに更新通知 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-030 | OWNER中外部置換 | 検知後書込停止、上書きなし | B/E7,I/E7 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D5-031 | A解放後B取得 | 最新読込後OWNER | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-032 | 未保存ありで再取得 | 破棄確認、取消時維持 | B/E7 | 3 | RC4_REVIEW_CANDIDATE |
| TC-D5-033 | 世代1の処理を世代2で実行 | 拒否 | I/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-034 | 背景移行→復帰 | 権限確認、自動再開なし | B/E7,D/HUMAN_QA | 2 | RC4_REVIEW_CANDIDATE |
| TC-D5-035 | BFCache復元・別タブ更新 | 再取得・最新照合 | B/E7,D/HUMAN_QA | 2 | RC4_REVIEW_CANDIDATE |
| TC-D5-036 | Web Locksなし／拒否 | 安全保存停止、無断代替なし | B/E7,I/E7 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D5-037 | 旧互換ベスト→新定義 | 歴代保持、現行未記録 | I/E7,U/E7 | 10 | RC4_REVIEW_CANDIDATE |
| TC-D5-038 | geometryId変更、合法配置 | 再検証後復元 | I/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-039 | geometryId変更、障害物重複 | 無条件復元なし | I/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-040 | 旧ベスト1個、現行初クリア3個 | 現行新規登録 | I/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-041 | ST03欠落、04/05正常 | 正常実績・解放維持 | I/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-042 | 配置リセット | 配置・Undo・軌跡消去、実績維持 | B/E7,I/E7 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D5-043 | 他ゲームキーあり、全体初期化 | 専用キーのみ変更 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D5-044 | 書込例外／読み戻し不一致／revision異常 | 誤成功なし、追加書込停止 | B/E7,I/E7,U/E7 | 12 | RC4_REVIEW_CANDIDATE |
| TC-D6-001 | タイトル起動 | 開始・遊び方・設定 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D6-002 | 初期／途中／全クリア | 10ステージ、正確な星 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D6-003 | ロック中選択 | 開始不可、解放条件 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D6-004 | SC03全編集操作 | 必須操作利用可 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D6-005 | 実験開始 | 時間・必須・停止・中止、編集不可 | B/E7,I/E7 | 15 | RC4_REVIEW_CANDIDATE |
| TC-D6-006 | 手動／自動停止→再開／中止 | 規定遷移 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D6-007 | FL001〜006／ERROR | 理由区別 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D6-008 | 星1/2/3、ベスト更新有無 | 正確な評価・保存状態 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D6-009 | 9/10、10/10、30星 | 達成表示正確 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D6-010 | 音量・ミュート・初期化確認／取消 | 正常 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D6-011 | 3段階ヒント、LEVEL3確認／取消 | 指定表示、取消は非表示 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D6-012 | 設定／ヒント／結果から復帰 | 元画面、誤編集なし | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D6-013 | 320px幅、通常文字倍率 | 横スクロールなし、主要44px以上 | B/E7,D/HUMAN_QA | 2 | RC4_REVIEW_CANDIDATE |
| TC-D6-014 | 768/1280px、短い横画面 | 盤面と操作利用可 | B/E7,D/HUMAN_QA | 2 | RC4_REVIEW_CANDIDATE |
| TC-D6-015 | タッチで指定グリッドに配置 | 正しい座標1回確定 | B/E7,D/HUMAN_QA | 2 | RC4_REVIEW_CANDIDATE |
| TC-D6-016 | マウスで同じ操作 | 同じ配置 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D6-017 | 合法／無効ドラッグ | 合法最終位置のみ確定 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D6-018 | 移動5/6/7 CSS px | タップ／ドラッグ／ドラッグ | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D6-019 | 方向・回転連続 | 1グリッド／15° | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D6-020 | 実形状外7/8/9px | 選択／選択／対象外、物理不変 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D6-021 | 盤面とHTML一覧交互選択 | 単一状態同期 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D6-022 | pointercancel／lostpointercapture前後 | 未確定のみ取消 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D6-023 | 2本目の指追加 | 誤編集・二重確定なし | B/E7,D/HUMAN_QA | 2 | RC4_REVIEW_CANDIDATE |
| TC-D6-024 | 編集中・実験中に端末回転 | 仮編集取消、停止、座標維持 | B/E7,D/HUMAN_QA | 2 | RC4_REVIEW_CANDIDATE |
| TC-D6-025 | スクロール・フォーカス・キー | 過度な干渉なし | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D6-026 | ドラッグなしで基準攻略 | 通常代替操作で再現可 | B/E7,D/HUMAN_QA | 2 | RC4_REVIEW_CANDIDATE |
| TC-D6-027 | 素材一覧・表示 | オリジナル2名、視覚識別 | H/HUMAN_QA,R/E7 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D6-028 | CH01〜06表示 | 6状態表示／人間が識別 | B/E7,H/HUMAN_QA | 2 | RC4_REVIEW_CANDIDATE |
| TC-D6-029 | FAILED／CLEARED | CH02／CH03・06 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D6-030 | 説明／ヒント | CH04／CH05 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D6-031 | 同一人物の3表情比較 | 顔・体格・衣装・配色一貫 | H/HUMAN_QA,R/E7 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D6-032 | 画像読込失敗 | 代替表示、ルール継続 | B/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D6-033 | 装飾あり／なし同一実験 | 物理・操作結果一致 | B/E7,I/E7 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D6-034 | Should演出・動き軽減・BGM採否 | 採用時正常、未採用理由記録 | B/E7,R/E7 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D6-035 | SE01〜08 | 8種類定義・発音／識別可 | B/E7,H/HUMAN_QA | 2 | RC4_REVIEW_CANDIDATE |
| TC-D6-036 | 有効配置・回転／無効操作 | 有効時のみ要求 | B/E7,I/E7 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D6-037 | J/m=.149/.150/.151、連続 | 閾値・100ms間隔遵守 | B/E7,I/E7 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D6-038 | バネ作動／不作動／非選択 | 正常作動だけ発音要求 | B/E7,I/E7 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D6-039 | 板角度差4.9/5/5.1° | 有効動作時発音、250ms間隔 | B/E7,I/E7 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D6-040 | 成功／失敗／初星／歴代向上 | 規定音、重複なし | B/E7,I/E7 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D6-041 | 起動前後・ユーザー操作 | 無断発音なし、操作後利用 | B/E7,D/HUMAN_QA | 2 | RC4_REVIEW_CANDIDATE |
| TC-D6-042 | 音量変更／ミュート／予約音 | 即時反映、ミュート中無音 | B/E7,D/HUMAN_QA | 2 | RC4_REVIEW_CANDIDATE |
| TC-D6-043 | 停止／中止／旧実験イベント | 不要音停止・拒否 | B/E7,I/E7 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D6-044 | AudioContext生成／再開失敗 | 無音で継続 | B/E7,B/E8,I/E7 | 22 | RC4_REVIEW_CANDIDATE |
| TC-D6-045 | 全形状・角度・球・ゴール | 描画座標寸法一致／目視違和感なし | B/E7,H/HUMAN_QA | 2 | RC4_REVIEW_CANDIDATE |
| TC-D6-046 | 保存済・未保存・不明・一時・旧軌跡 | 状態識別、予測と誤認なし | B/E7,H/HUMAN_QA | 3 | RC4_REVIEW_CANDIDATE |
| TC-D6-047 | 操作領域・一覧・警告・フォーカス | 44px、非色依存、代替操作 | B/E7,D/HUMAN_QA | 2 | RC4_REVIEW_CANDIDATE |
| TC-D6-048 | 素材・通信・高負荷 | 権利・外部依存・性能基準適合 | B/E8,D/HUMAN_QA,R/E8 | 3 | RC4_REVIEW_CANDIDATE |
| TC-D7-001 | バネ接触後離脱し阻害衝突 | 古い候補無効化 | I/E3,P/E3 | 6 | RC4_REVIEW_CANDIDATE |
| TC-D7-002 | 接近速度・法線整数同順位 | 正規キーで一意決定 | P/E3,U/E3 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D7-003 | 連続作動、速度上限／異常閾値 | 上限遵守、異常隠蔽なし | P/E3 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D7-004 | 坂道微小切れ／完全離脱／別坂道 | 1tick≤.005mのみ保持、非接触加算なし | P/E5,U/E5 | 7 | RC4_REVIEW_CANDIDATE |
| TC-D7-005 | ゴール支持接触／貫通／高速通過 | 正常収容安定だけ成立 | P/E5 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D7-006 | 更新境界の中止／停止／クリア競合 | 二重更新・確定結果取消なし | I/E5 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D7-007 | 1パーツ／多段／偽別解 | 水増し認定なし | P/E6,R/E6 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D7-008 | 保存結果不明→新値／旧値／別値／読込失敗 | 保存確認／未保存／停止／不明維持 | B/E7,I/E7 | 7 | RC4_REVIEW_CANDIDATE |
| TC-D7-009 | 非互換変更2回、間のクリアなし | 過去配置・歴代実績保持 | I/E7 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D7-010 | 5音以上／ミュート／優先音 | 最大4音、優先音、不要音停止 | B/E7,I/E7 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D7-011 | 320px・文字拡大・キー | 主要操作欠落なし（倍率等要確定） | B/E7,D/HUMAN_QA | 2 | RC4_REVIEW_CANDIDATE |
| TC-D7-012 | ST09/10高負荷、各5回 | 平均≥30FPS、間隔p95≤50ms、進行率≥95% | D/HUMAN_QA | 6 | RC4_REVIEW_CANDIDATE |
| TC-D7-013 | 配置・方向・回転・Undo各30回 | 応答p95≤100ms | B/E8,D/HUMAN_QA | 7 | RC4_REVIEW_CANDIDATE |
| TC-D7-014 | E8/DV01〜05個別、通信校正前後、cold/warm各5 | 校正RTT45〜55ms・下り9〜11Mbps、cold中央値≤3s/warm≤1.5s。制御不能BLOCKED | B/E8,D/HUMAN_QA | 2 | RC9_CONTRACT_CONFIRMED_NOT_RUN |
| TC-D7-015 | 100連続実験・30分利用 | 資源異常蓄積なし、操作不能・クラッシュ0 | B/E8,D/HUMAN_QA,I/E8 | 8 | RC4_REVIEW_CANDIDATE |
| TC-D7-016 | Pages相当サブパスHTTP | 相対パス・素材・起動正常 | B/E8 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D7-017 | 起動・攻略中通信監視 | 外部API/CDN/個人情報送信0、無料・ログイン不要 | B/E8,R/E8 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D7-018 | 固定依存・本番QA資産 | 版・ハッシュ・権利一致 | I/E1,R/E1,R/E8 | 3 | RC4_REVIEW_CANDIDATE |
| TC-D7-019 | 配布候補一覧・アクセス | QA操作・不要資産なし | B/E8,R/E8 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D7-020 | 固定基点と候補の既存ゲーム | 回帰全PASS・未承認差分0 | B/E8,R/E8 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D7-021 | 固定SHA・保護・許可パス | 不一致検出・停止 | I/E0,R/E0 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D7-022 | テスト削除／skip／期待値／集計改変 | 検出・停止 | I/E0,R/E0 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D7-023 | MUT01〜12隔離注入 | 対象assertが意図した理由でFAIL | I/E0,I/E2,I/E3,I/E4,I/E5,I/E7,I/E8 | 24 | RC4_REVIEW_CANDIDATE |
| TC-D7-024 | 5/30/2上限境界 | 超過拒否 | I/E0 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D7-025 | 再起動／履歴欠落／中断 | 予算維持、不明HOLD | I/E0 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D7-026 | 先行FAIL／設定変更／再検証未完 | 進行不可、STALE | I/E0 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D7-027 | Tested SHAとEvidence SHA差分 | 証跡のみ許容、実行差分再検証 | R/E8 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D7-028 | 要件・設計・承認・権利・証跡 | 不正参照・欠落・未承認検出 | R/E8 | 21 | RC4_REVIEW_CANDIDATE |
| TC-D7-029 | 固定SHA Sites、5環境 | 同一性・操作・表示・音声・証跡適合 | D/HUMAN_QA,R/HUMAN_QA | 81 | RC4_REVIEW_CANDIDATE |
| TC-D7-030 | ユーザー・第三者評価・最終判定 | 総合80以上、全項目3以上、重大なし、第三者未実施は明示受容 | H/HUMAN_QA,R/HUMAN_QA | 3 | RC4_REVIEW_CANDIDATE |
| TC-D8-001 | 実装false／approvalId欠落 | 実装開始不可 | I/E0 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D8-002 | 固定基点／ハンドオフSHA不一致 | PRECHECK停止 | I/E0,R/E0,R/PHASE4 | 3 | RC4_REVIEW_CANDIDATE |
| TC-D8-003 | 指定外ブランチ／repo | 停止 | I/E0,R/E0 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D8-004 | 指定外追加／削除／移動／リンク経由 | 拒否・差分検出 | I/E0,R/E0 | 9 | RC4_REVIEW_CANDIDATE |
| TC-D8-005 | main Push／PR／merge／publish要求（モック） | 個別承認なし拒否 | I/E0 | 8 | RC4_REVIEW_CANDIDATE |
| TC-D8-006 | テストと作業側ハッシュ同時改変 | 固定基準不一致 | I/E0,R/E0 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D8-007 | skip／削除／期待値変更 | ゲート停止 | I/E0,R/E0 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D8-008 | 未知ポリシー版／操作／必須設定欠落 | 停止 | I/E0 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D8-009 | 工程4/5、累計29/30 | 境界正しく予約／拒否 | I/E0 | 5 | RC4_REVIEW_CANDIDATE |
| TC-D8-010 | 同一重大根本原因を別IDで再登録 | 2回上限維持 | I/E0 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D8-011 | 探索1999/2000、累計20000 | 超過拒否 | I/E0 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D8-012 | 候補・調整・tick・時間の各上限 | いずれか不足で停止 | I/E0 | 7 | RC4_REVIEW_CANDIDATE |
| TC-D8-013 | 再検証予約不足 | 是正開始拒否 | I/E0 | 11 | RC4_REVIEW_CANDIDATE |
| TC-D8-014 | 予約後中断、使用不明 | 予約最大を計上 | I/E0 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D8-015 | 元／別タスク復元 | 承認・台帳・差分再照合 | I/E0 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D8-016 | CP欠落／逆行／台帳不一致 | HOLD、リセットなし | I/E0 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D8-017 | 必須FAIL／NOT RUN／BLOCKED | 進行不可 | I/E0 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D8-018 | 後続必須子ケース | 固定工程割当維持 | I/E0 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D8-019 | 物理／ステージ／保存変更 | 関連ゲートSTALE | I/E0 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D8-020 | TestedとEvidence差分 | 証跡のみ許容、実行差分再検証 | R/E8 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D8-021 | 生ログと集計不一致 | PASS拒否 | I/E0 | 1 | RC4_REVIEW_CANDIDATE |
| TC-D8-022 | 独立レビュー不能 | 実際の方式・限界記録 | R/E8 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D8-023 | 人間QA未実施／移植差分 | 最終受入HOLD | I/E8,R/E8 | 2 | RC4_REVIEW_CANDIDATE |
| TC-D8-024 | E1〜E8合格、公開false | 報告のみ、公開不可 | I/E8 | 1 | RC4_REVIEW_CANDIDATE |

証跡：EV-U入力/期待/実測/assert、EV-I呼出/遷移/差分、EV-P設定/tick/接触/軌跡/終端/誤差、EV-B操作/ブラウザ/画面/保存、EV-D実機/OS/ブラウザ/SHA/結果、EV-H評価者区分/点/コメント/SHA、EV-Rファイル/差分/根拠。すべて対象SHA・環境・caseID・attemptID・生ログを紐付け。
FX01 正規世界9.6×7.2、g9.8、60Hz。FX02 球r.2 m.2初速0。FX03 (4.8,6.5)減衰0障害なし。FX04 水平(4.8,2.4)1.2×.16。FX05 (4.8,3.6)坂道±30。FX06 (4.8,2.4)バネ。FX07 (4.8,3.6)板。FX08 G(4.8,2.4)。FX09 正規保存。FX10 認定基準攻略（未取得）。FX11 破損/競合。FX12 幅320/375/768/1280。FX-HS候補は未固定：72組合せ、厚さ.16/.24/.48、速度3/6/9/12、角0/30/60、静的/動的。全初期位置・板長・独立oracle・観測窓を確定してから実行。
POC01〜12：依存1/2、自由落下9、水平10/18、斜面11、静的高速14〜16、動的17、joint19、contact25〜27、反復30とE1再生成、headless21/22、解放31、最小静的配信2。D1-032の全4パーツはE4。正式配布パスはE8。
MUT01〜12はTC-D7-023のE8用12子ケースと、RC4追加の工程別12子ケース。正常PASS、意図したassert FAIL、構文/環境失敗不可、隔離差分除去。実行可能コードは未生成。期待値を被検関数から作らない。

## RC3 具体化案（新規数値は承認待ち）
### TC-D1-012 / FX-FRICTION
- 入力・手順: g=(0,-9.8), damping=0, horizontal platform centered (4.8,2.4), width=8m, thickness=.16; ball center (3,2.68), v=(3,0), omega=0; set both fixture frictions .2 or .6; observe after 12 ticks.
- 期待値: Both stay on top; |vx + r*omega| at tick12 for .6 is smaller than for .2 by >1e-6 m/s; no teleport or clamp.
### TC-D1-013 / FX-BOUNCE
- 入力・手順: g=0, damping=0, static horizontal platform center (4.8,2.4), width=4m; ball center (4.8,2.98), v=(0,-3), omega=0; both restitution=0 or .1. Observe first post-contact substep through tick30.
- 期待値: Require contact; maximum upward velocity after first contact for .1 > that for 0 by >1e-6m/s; no pass-through. Actual restitution cutoff of selected engine must permit 3m/s test; otherwise HOLD.
### TC-D1-014 / FX-HS
- 入力・手順: Use matrix parameters already specified in each case. g=0, damping=0, ball angular speed 0, vertical wall centered (4.8,3.6), length 4m, specified thickness t. n=(-1,0), tangent=(0,1); impact center q=(4.8-t/2-.2,3.6); v=s*(cos(a),sin(a)); start=q-v*.05. Run 12 game ticks.
- 期待値: At least one physical contact. No center crosses far face plus radius along wall local normal in observed samples; no center crossing through finite wall interior between samples using independent segment vs expanded face check; penetration <=.06m at observed boundaries; all finite.
### TC-D1-015 / FX-HS
- 入力・手順: Same FX-HS, angle 30 or 60 degrees, exact matrix speed/thickness. Impact target is face center, not corner.
- 期待値: Same FX-HS oracle; contact, finite, no passage through wall, penetration <=.06m.
### TC-D1-016 / FX-EDGE
- 入力・手順: FX-HS static thickness .16, s=12, a=0; q=(4.8-.08-.2,5.50) (0.10m inside top edge), initial q-v*.05; observe 12 ticks.
- 期待値: Contact required, penetration <=.06m at boundaries; no opposite-face crossing while within tangential wall span; position increment <=.20+.06m per game tick for zero-g case (proposed independent displacement bound).
### TC-D1-017 / FX-HS-DYNAMIC
- 入力・手順: Same FX-HS center and initial face; vertical dynamic rectangle length 1.92m, thickness from matrix, mass .30kg, center revolute joint, angle limits ±30° relative to initial vertical (QA only); g=0, no motor, damping 0; 12 ticks.
- 期待値: Contact; pivot error <=.02m, angle excursion <=32°, geometric penetration <=.06m, finite. No crossing through moving face interior: evaluate relative local coordinates at each sample; moving-face continuous ambiguity must be reported, not passed.
### TC-D1-018 / FX-PEN
- 入力・手順: Static FX04 ball center (4.8,3.48), v=0, g=-9.8; sample each substep ticks 120..180. Reuse all 72 FX-HS / HS-DYNAMIC cases for high speed.
- 期待値: Independent signed distance to rectangle: outside distance=norm(max(abs(local)-halfExtent,0)); inside signed distance=max(abs(local)-halfExtent); penetration=max(0,r-signedDistance). Static max<=.01m, high speed<=.06m; record raw samples, contact and crossing checks. Inside-corner formula uses max of signed components.
### TC-D1-030 / FX-REPEAT
- 入力・手順: FX04 center (4.8,2.4), ball (4.8,3.48), default config, v=omega=0; new world for each of 100 runs, 180 ticks each; no UI.
- 期待値: Compare every recorded tick to run1 under same engine/config/environment: position, linear velocity, angle and angular velocity absolute component errors <=1e-6 (native units), terminal/contacts discrete results equal. Run1 is repeat reference, not sole physical oracle.
### TC-D2-012 / GEO-SAT
- 入力・手順: Two 1.68×.16m rectangles parallel at physical angle +45°, center A=(3,3), center B=A+(.30/sqrt(2),-.30/sqrt(2)); geometry unit fixture, not placement grid.
- 期待値: AABBs overlap but separating-axis distance .30>.16, so no internal overlap.
### TC-D2-028 / FX-CENTER
- 入力・手順: Horizontal seesaw pivot (4.8,3.6), ball center (4.8,4.4), v=0; standard mass ratio, g; observe 120 ticks.
- 期待値: Contact required, |angle|<=2° throughout, pivot error<=.02m; no artificial motor. New 2° central threshold is proposal.
### TC-D2-031 / GEO-SWEEP
- 入力・手順: Pivot (4.8,3.6); obstacle .16×.16m centered (5.52,4.08).
- 期待値: Initial board rectangle disjoint; obstacle intersects at least one reserved rectangle; reject.
### TC-D2-032 / GEO-SWEEP-MID
- 入力・手順: Pivot (4.8,3.6); point p=pivot+R(12.5°)*(0.96,0.08); tiny rectangle .002×.002m centered p (geometry-only, not game part).
- 期待値: Independent continuous orientation 12.5° intersects; expanded-sample union contains p and rejects. Tiny obstacle is a unit geometry fixture only.
### TC-D3-012 / FX-GOAL
- 入力・手順: Goal base (4.8,2.4), ball centers (4.8,3.60) v=(0,-1), and (4.56,3.60) v=(.3,-1), omega=0; initial approved physical settings. Observe through tick1200.
- 期待値: Both must reach normal stable goal (30 full intervals, speed<=.15) by tick1200, no force stop, static penetration<=.01 when stable, no illegal traversal. If not, HOLD or permitted physics tuning.
### TC-D3-031 / FX-LOAD
- 入力・手順: Unit evidence: upper-face contact offset+.12m or -.12m, positive normal impulse, signed angle delta matching load 5°; negatives offset .119, zero impulse, opposite angle, delta4.99°, or different contact episode. Physical fixture FX07 offset±.6m drop .8m; observe first uninterrupted contact.
- 期待値: Unit positive achieves, each negative rejects. Physical case must record positive normal impulse from ball and matching angle change within same episode; no threshold weakening. Proposed positive impulse cutoff >1e-6 N·s; actual causal observability remains E5 proof.
### TC-D4-014 / FX-ALT
- 入力・手順: For each ST04..10 compare canonical placements, event sequence and actual path. For each differing active part run independent removal ablation; for route-only difference log crossing above/below or left/right of the same named obstacle with whole-ball clearance.
- 期待値: Require same stage normal clear and at least one material mechanism/order change supported by ablation (removal makes fail or changes qualifying mechanism/route), or distinct obstacle-side crossing. Tiny perturbation and unused additions reject. Reviewer records named difference, evidence and independent judgment.
### TC-D7-001 / FX-SPRING-DELAY
- 入力・手順: Synthetic event sequence for one tick: valid spring pre-solve, end-contact, later post-solve on other fixture with normal dot launch<=-.5 and normal impulse>1e-6 N·s; compare no later impact, dot=-.499, stale prior tick, distance=.25/.250001. Then E3 physical reproductions with recorded substep/event sequence.
- 期待値: Suppress on later opposing impact, continued opposing contact, stale event or excessive gap; allow only otherwise valid candidates. If engine cannot establish chronological order for ambiguous CCD notifications, block the relevant P test; do not infer ordering.
### TC-D7-004 / FX-RAMP-GAP
- 入力・手順: Unit series along downhill tangent: contact delta .10m; one gap .004m with displacement .08m; contact .10m then .04m (>=3 contact intervals). Compare gap .005m and .005001m, two gaps, other part, reverse displacement.
- 期待値: Only signed contacting-interval movement contributes (.24m positive example); gap displacement excluded; a second consecutive gap or excessive distance ends episode; other part never merges. Full departure resets. Boundary .005 inclusive.
### TC-D7-011 / FX-ACCESS
- 入力・手順: Browser viewports 320×568 and 568×320; 100% and 200% text enlargement where supported; keyboard Tab/Shift+Tab, enter/escape, focus and scroll; actual devices record OS text setting.
- 期待値: No loss of required controls or content; scroll allowed vertically, no horizontal page overflow at normal 320px; main controls >=44×44 CSS px at normal size. At 200% allow reflow/scroll, no blocked focus. New 200% condition is proposal.
### TC-D7-012 / FX-PERF
- 入力・手順: For ST09 and ST10 run certified baseline plus deterministic maximal legal stock configuration: start from baseline, enumerate extra allowed types/grid/angles in fixed order, append first legal until no further addition; record actual count and fingerprint. Each configuration 5 runs on each DV; measure foreground from first update to terminal, rAF intervals excluding first timestamp; no manual pause.
- 期待値: Each measured run average>=30FPS, nearest-rank p95 interval<=50ms, simulated seconds/wall seconds>=.95. Unexpected pause or unavailable required measurement is FAIL/BLOCKED, not excluded silently. 60FPS target separate.
### TC-D7-014 / FX-BOOT
- 入力・手順: Browser-controlled downlink10Mbps/RTT50ms, fresh cache 5 cold runs and same cached profile 5 warm runs, from navigation start until title, game assets required at title, and start button enabled with input handlers. No service-worker or network bypass. On actual devices record normal network separately; controlled network where feasible.
- 期待値: Cold median<=3s, warm<=1.5s for controlled tests. Actual-device unmeasurable mandatory condition BLOCKED, no emulation substitution. Timing trace and cache setup evidence.
### TC-D7-015 / FX-ENDURANCE
- 入力・手順: On each DV use ST09/10 baseline alternating; 100 start→10 ticks→abort→design cycles, plus separate 30min sequence: select, valid nudge/undo, start→terminal or pause/resume, design, repeat. Record resource counters before/after each cycle; no intentional background.
- 期待値: No crash/hang; live worlds <=1 while running and 0 disposed, loop<=1, old subscriptions/nodes released, Undo<=50, trajectory<=201. Heap only supplementary. Actual inability to observe required counters via approved QA interface BLOCKED.
### TC-D7-020 / FX-REGRESSION
- 入力・手順: Phase4/E0 retrieve pinned main tree and enumerate actual existing game paths, test commands, fixtures and hashes. Capture command list and baseline output before candidate changes, rerun exact commands and browser boot for each extant game at E8.
- 期待値: All baseline and candidate required suites PASS and no unauthorized diff. Missing/failing baseline HOLD; exact repo-specific commands deferred to authorized E0.
### TC-D7-029 / FX-DEVICE
- 入力・手順: Use DT-01..16 steps in 17_visual_qa_protocol.md for each DV. Compare fixed SHA, runtime hashes, migration diff and access settings before device checks.
- 期待値: Each DT case matches its explicit expected result; all 5×16 recorded and baseline 10×5; no proof by emulation; target SHA not yet available.
### TC-D6-039 / FX-AUDIO-TILT
- 入力・手順: Valid ball contact episode starts at angle0; sample 4.9°,5°,5.1° then 10° at elapsed 100ms,15° at 250ms. Signed/absolute displacement from last emitted reference; first event at ≥5°; ref changes only on emission; contact end resets.
- 期待値: 4.9 silent, 5 emits once, 5.1 silent, 100ms event suppressed; 250ms event emits if delta>=5°, no idle sound. New reference rule candidate; no impact on D3 usage.

タイムアウト候補：U30秒/I120秒/P180秒/B120秒、バッチ900秒。長時間性能・反復は分割バッチまたは個別承認した時間上限を用いる。30分テストを900秒で打切り合格にしない。

## RC4 ケースレビュー・実行契約補強
RC3 834子ケース全件の必須項目・参照・状態を静的確認。親296・旧ID全保持、子ケース982件。現行の全件一覧は18を正とする。旧表の子件数・DRAFTは履歴。今回の追加境界はRC4承認候補。全テストNOT_RUN。
- Uは純粋関数に明示入力、Iは隔離fixtureと状態/副作用のbefore/after、Pは同一物理設定とtick別独立計測、Bは本番と同じ操作を隔離オリジンで実施、D/Hは実機・人間、Rは対象SHAと規則の照合。結果は全assert単位で記録する。
- 1ケースに複数条件がある場合は全条件を評価して結果を列挙。別ケースの再利用は同じrunId・設定・入力・観測範囲と結果が揃う場合のみ。単に親IDに対応があることをPASSにしない。
- TC-D4-021 の期待FAILは「被検判定=false」を意味する。テスト結果そのもののFAILではない。
- MUT01〜12は対応工程のテストコード固定前にも実施（E5/E2/E2/E3/E4/E5/E5/E5/E5/E7/E7/E0）、E8の12ケースは維持。意図したassertの失敗を確認、構文/起動失敗は不合格。
- U30/I120/P180/B120秒の個別上限、バッチ900秒は承認候補。100反復は必要に応じ分割、30分試験は専用計画枠。全必須分を予約できない場合HOLD。
- 物理実行を伴うI/Bも用途に応じ探索・正式stage・基礎物理枠を消費する。判定関数だけの実行はシミュレーション数に含めない。自動時間は全自動処理で消費。
- FX-ACCESSの200%表示、FX-CENTERの2°、FX-SPRING-DELAY/FX-LOADの力積1e-6 N·s、FX-EDGEの変位上限等はRC3/RC4候補で、採否を承認すること。連続運動を観測できない場合、サンプルのみで連続性を証明したと主張しない。
- TC-D7-012/013/015の実機別子ケースを追加。TC-D7-014は制御ネットワークの自動試験と実機の通常通信記録を別判定。実機で制御条件が必須かは凍結前に決定。
- 保存epoch、重複JSONキー、互換性変化の子ケースを追加。D5の既存閾値は変更しない。

## RC5 全982ケースの精査契約
18のcaseId・parentId・input・expected・実施方式・工程・環境・証跡・予算・timeout・依存を照合し、全ケースにレビュー状態と親契約参照を記録。既存IDはすべて維持。複合入力は同じcaseIdの配下のsubcaseIndex/独立assertで展開し、結果を全件保持する。入力が「A/B」ならAのみの実行は合格としない。前後状態比較は同一fixtureのコピーから行い、別ケースで変更した状態を流用しない。親の全合格条件は、適用必須case全件と必須assert全件がPASS。期待する拒否やFAILは被検関数結果であり、テストのFAILとは別。
E0のMUT-12はE0の統制fixtureで意図したassertを検出し、E6のステージ探索実装は後続で検証。E8の人間QA未実施状態は模擬入力と引渡し資料で確認し、実際のSites差分を要求しない。TC-D7-012-C001/TC-D7-015-C003は当該全実機個別ケースから集約（同じ実験を重複消費しない）。TC-D1-005は全1271格子点を確認し、四つの補助例で代用しない。Should機能は採否のレビューを必須とし、未採用の機能実行だけを適用外とする。
### 残る閾値・観測条件の承認候補（ゲーム機能追加なし）
- 04 RC5に記載した球角速度>150rad/s、板並進>30m/s・角速度>150rad/sを異常検出値とする候補。球の通常clampは12m/s、60rad/sのまま。TC-D1-028/TC-D7-003の注入は有限正常・閾値ちょうど・閾値超・非有限を個別に比較。例 球ω=149/150/151、板v=29/30/31、板ω=149/150/151。異常閾値ちょうどは異常判定ではない（別の拘束違反は別判定）。非有限はERROR。全数値は追加承認待ち。
- RC3のFX-HS/HS-DYNAMIC/EDGE/PEN/REPEAT、摩擦/反発/中央荷重/ゴール/足場/板/バネの観測手順は正式凍結前に具体値を採否決定。連続性の観測能力はE1/E3/E4で実証し、不成立はBLOCKED。動的板のsubstepサンプルだけで連続的なすり抜け無しを証明しない。
- FX-BOOT: 自動制御環境の5cold/5warmに加えてDV-01〜05でも同じ条件を測定する案。実機制御通信条件を実現できなければBLOCKEDとし、通常通信の参考値で合格を捏造しない。通信制御の必須範囲、200%文字拡大、長時間試験の時間予約、U30/I120/P180/B120秒・batch900秒の候補は承認待ち。
- 982行を維持したが全ケースの具体的subcase・独立oracle・証跡の意味的な十分性を証明したわけではない。未確定は明示し、凍結前に解消。


## RC6 FD-01〜12・テスト契約の確定候補
FD-01〜05,10,12は04/05/06のRC6節。FD-06〜09: U=30秒/I=120秒/P=180秒/B=120秒のatomic case上限、通常自動batch900秒。30分耐久の専用試験は1800秒の観測を完了するため準備/終了最大300秒を含む2100秒枠を予約する案（追加の具体化判断）。その他反復は分割しても全試行の合格必須。タイムアウトは実装に起因すればFAIL、証明された環境制約はBLOCKED。FD-11は実機5環境も制御通信10Mbps/RTT50msの測定を必須とする。通常通信は参考。測定不能をPASSにしない。通信条件は下りの制限値10Mbps、往復遅延50msを設定できる管理された試験経路とし、設定・計測ログを残す。コールドはHTTPキャッシュを消去した隔離コンテキスト、ウォームは同一コンテキストで初回正常読込後に再navigation。記録開始はnavigationStart、終了はタイトル描画・開始ボタン有効・必要な初期asset/handler準備が全て成立した最初の観測。5回の中央値、外れ値除外なし。200%文字拡大は操作可能性を検証。
18の各親rc6Contractは既存input/expectedを置換せず具体化する。各子caseの指定変数を優先し、他caseに割当済みの条件を重複実行する必要はない。共通fixture参照と入力単位・期待判定をcase内subcaseIndexで記録。旧候補値の「要確定」はRC6の対応契約がある範囲のみ解消。全親に契約参照を付したが、全982ケースの意味的十分性を独立証明したわけではない。
MUT-05はE2の予約領域validatorを固定する前にTC-D7-023-C017で実施（E4割当からE2へ移動）。E4は物理拘束試験、E8で全12異常実装検出を再実行。MUTの意図したassert失敗と正常PASSを区別。
### RC6 GOV直接証跡表
| 要件 | 直接証跡（E8では実施時点までを確認） |
|---|---|
| GOV-001 | 凍結済み設計・外部grantの時系列が実装開始より前 |
| GOV-002 | 全Git書込みの操作ログと個別grant |
| GOV-003 | base/handoff/branchとgrant照合ログ |
| GOV-004 | SHA256SUMS全21、保護runner/テスト固定digest |
| GOV-005 | Phase4の固定SHA全22読戻しと照合記録 |
| GOV-006 | 19の許可パス・操作別全diff |
| GOV-007 | EG00〜08判定・是正/再検証履歴 |
| GOV-008 | 設計・テスト・期待値の固定差分と変更承認 |
| GOV-009 | レビュー方式・対象SHA・範囲・指摘・再レビュー |
| GOV-010 | 生ログ、集計、全NOT_RUN/FAIL/STALE区別 |
| GOV-011 | E8時点ではPR/merge/publish未実施・個別grantなし。将来EG10別承認 |
| GOV-012 | force push・共有CI/Pages設定変更なしの操作/差分照合 |
| GOV-013 | LS発生時停止・再開承認・予算境界記録 |
| GOV-014 | 変更要求・承認・差分・失効ゲート記録 |
| GOV-015 | 基点と既存ゲームhash・回帰比較 |
| GOV-016 | 16の初期定義との差・予算台帳・全必須基準維持 |
| GOV-017 | EG08自動とEG09人間を区別、E8時点未実施はNOT_RUN |
| GOV-018 | 全試行・候補・採否・変更量の台帳 |
| GOV-019 | 期待値・保護テスト・runner固定照合、MUT結果 |
### 実行時技術確認と設計残件
E0の環境/依存/固定base回帰、E1/E3のCCD観測、E4板拘束、E5自然収容・使用証跡、E6攻略成立、E7保存/素材/ブラウザ、E8自動QA、人間QAは実証であり現在未実行。計測能力不成立はBLOCKED。個別subcaseの未定義入力は設計残件としてHOLDを維持し、Codexが実測値を期待値に採用することは禁止。


RC6追補：06に全payload固定3ベクトルを収録、TC-D5-037-C002の既存caseに関連assertとして追加。D7-001の実衝突fixtureなど5親は12の最新表に明示。E5で共通設定の再選定が必要ならE1/E3/E4に再OPENして承認済み予算・範囲で検証し、E5自体が独立に調整権限を得るわけではない。


## RC7 固定再現条件・個別assert（現行）
QA専用・本番変更なし。候補gridは列挙順の直積（右端が最速）で固定、候補IDは既存caseId内の配列indexのみ。開始前の独立幾何フィルタを適用し理由を記録。各候補を新規worldから試験。独立raw観測で最初に適格な候補（対照付きは適格なペア）を選定する。選定はDUT合否を参照しない。適格候補での不合格はFAIL、次候補で置換しない。途中観測した他の明白な異常も隠さない。全候補上限・P atomic180秒・batch900秒・残存予算を同時適用し、実行前予約。個別候補は別runId、physicsValidation枠＋自動時間、複数観測を1runとして計上。全候補を使っても適格事象が観測できない、順序の証明が不可能、又は固定入力で再現できない場合はLS-11 BLOCKED、工程ゲートHOLD。予算不足はLS-03 HOLD。実測から期待値や候補gridを変更しない。採用した候補index/設定fingerprint/生ログを保護証跡に記録、同設定でのE8再検証は同じ候補を優先（設定変更時は固定gridを再評価）。非選択PPはQA専用にPP03を実行する義務を免れない。QA物理幾何は個別fixtureで指定、D2-023/024の重複静的stressは合法ステージ認定に使わない。

### 4物理fixture

#### FX-RC7-TRANSIENT
- scope: TC-D1-027-C001; PP under evaluation, each selected profile must satisfy; E8 recheck final configuration
- world: {"size": [9.6, 7.2], "gravity": [0, 0], "linearDamping": 0, "angularDamping": 0, "ballRadius": 0.2, "ballMass": 0.2, "ballOmega": 0, "bullet": true, "sleep": false, "fixtureFriction": 0, "fixtureRestitution": 0.05}
- geometry: static box center (4.8,3.6), width .48, height .16, angle 0; upper-right corner q=(5.04,3.68); n=(1,1)/sqrt(2), t=(-1,1)/sqrt(2).
- grid: {"delta": [0.001, 0.003, 0.006], "s": [0.06, 0.08, 0.1], "speed": [8, 12]}
- candidateCount: 18
- initial: p=q+n*(.20-delta)-t*s; v=t*speed; w=0. Reject initial geometric overlap or initial touching; log skipped candidate and reason; no goal/spring or other body. Start tick=0.
- window: first 3 complete ticks, all raw engine observations, one game tick max 1/60 s; observation at actual begin/end and substep boundaries; do not infer end from missing notification.
- eligible: Same fixture pair actual begin and later end in same game tick with chronological engine observation; no pre-existing touch; end may occur in different substep of same tick. Raw event IDs distinct, captured independently before collector.
- asserts: ["At least one eligible trajectory from declared candidate set for required profile.", "For each observed eligible tick, collector retains both begin and end, each once, same pair/tick and raw sequence; no stale event on next tick.", "Every run finite, no unauthorized cap/teleport or hidden state injection."]
- maxTicksPerCandidate: 3
- staticInitialNonOverlapCount: 18

#### FX-RC7-BLOCKED-SPRING
- scope: TC-D7-001-C001; actual selected PP profile; E3 and E8
- world: {"size": [9.6, 7.2], "gravity": [0, -9.8], "ballRadius": 0.2, "ballMass": 0.2, "ballOmega": 0, "bullet": true, "sleep": false, "linearDamping": 0.04, "angularDamping": 0.05, "material": "D1 initial spring/ball/obstacle settings; final selected config rerun, no override outside QA."}
- geometry: spring center c=(4.8,3.0), width .72, height .24, design angle +45°; n=(1,1)/sqrt(2), t=(-1,1)/sqrt(2), q=c+.36*t+.12*n (upper-left endpoint). Roof horizontal static box width 1.20,height .16, center=(p.x,p.y+.20+roofGap+.08).
- grid: {"overhang": [0.02, 0.04, 0.06], "initialNormalGap": [0.002, 0.006, 0.01], "approach": [1, 2, 3], "roofGap": [0.01, 0.025, 0.04]}
- candidateCount: 81
- initial: p=q+t*overhang+n*(.20+initialNormalGap); v=9*t-approach*n; omega=0; spring READY; raw touching=false. Paired control removes roof only, all other values identical. No ball overlap at t0; roof initially above ball by roofGap.
- window: first 3 complete ticks; raw contact order, pre-solve relative point velocity, end, normal impulse and final geometric distance for each tick, including raw sample before application of launch.
- eligible: Real spring upper contact meets RC6 face/approach rule while READY; raw end occurs; then same-tick roof collision after end, dot(nRoofToBall,n)<=-.5 and positive normal impulse>1e-6 N·s. At tick end spring face/proximity alone still qualifies (center outer side and circle separation <=.25), no other disqualifier. Matched no-roof control has real valid candidate and no blocking contact; candidate eligibility decided from raw observations, not activation output.
- asserts: ["For matched eligible pair, blocked run has zero launch and no SPRING_ACTIVATED for that spring/tick; WAIT_RELEASE, no deferred activation from same contact.", "Control has exactly one launch; post-launch velocity equals selected V*n under approved tolerance; actual normal impulse and chronology retained.", "Any eligible blocked run with launch is FAIL; lack of eligible pair after all declared candidates is BLOCKED, never PASS by synthetic evidence."]
- maxTicksPerCandidate: 3
- pairedRuns: 2
- staticInitialNonOverlapCount: 81

#### FX-RC7-TWO-SUBSTEPS
- scope: TC-D2-026-C001; PP03 QA profile (2 substeps at 1/120); E3 and E8 even if another profile selected; runtime profile unchanged.
- world: {"size": [9.6, 7.2], "gravity": [0, -9.8], "ballRadius": 0.2, "ballMass": 0.2, "ballOmega": 0, "bullet": true, "sleep": false, "linearDamping": 0.04, "angularDamping": 0.05, "material": "D1 defaults, final selected physical parameters rerun except QA profile PP03."}
- geometry: Two distinct static springs width .72 height .24. A center (4.40,3.00), design angle +15°, B center (5.20+gap,3.00+heightDelta), design angle -15°. Both READY. No other bodies. p=(4.76+dx,3.25+dy); velocity=(vx,-2); omega=0.
- grid: {"gap": [0, 0.06, 0.12], "heightDelta": [-0.04, 0, 0.04], "dx": [-0.12, -0.06, 0], "dy": [0.03, 0.07], "vx": [8, 11]}
- candidateCount: 108
- initial: Use ordered Cartesian product; exclude initial circle/rectangle interior overlap or touching; exclude static spring interiors overlapping. Record analytic exclusions; no in-tick injection.
- window: first 3 game ticks, collect both real 1/120 substeps separately; eligibility from raw pre-solve contacts and fixed RC6 geometry before launch at end boundary.
- eligible: Same game tick has actual qualifying upper-face pre-solve candidate in substep 1 and substep 2, each from spring READY at tick start, and at least one candidate still eligible at end (no blocker). Same spring allowed only if both independently meet real contact/approach rules; no manufactured duplication. Candidate set is independent of controller winner.
- asserts: ["Raw candidate evidence from both substeps retained; game tick advances exactly once.", "Compare independent round(approach*1000), round(normalAlignment*1000), canonical key; exactly one eligible winner and launch event.", "Every contacting spring including loser enters WAIT_RELEASE; no second launch in same tick; chosen velocity V*(sinθ,cosθ), within approved tolerance.", "No matching raw pair means BLOCKED even when all observed nonmatching runs had ≤1 launch."]
- maxTicksPerCandidate: 3
- staticInitialNonOverlapCount: 108

#### FX-RC7-GOAL-SUBSTEP
- scope: TC-D3-011-C002; PP03 QA; E5 and E8; real world, no counter injection during step
- world: {"size": [9.6, 7.2], "gravity": [0, -9.8], "ballRadius": 0.2, "ballMass": 0.2, "ballOmega": 0, "bullet": true, "sleep": false, "linearDamping": 0.04, "angularDamping": 0.05, "material": "D1 goal/ball defaults; final parameters rerun except QA PP03."}
- geometry: D3 U-goal floor top center G=(4.8,2.4), exact D3 three fixtures; ball x=4.8, y=2.60+gap, v=(0,-speed), omega=0. No other bodies; no mandatory part.
- grid: {"gap": [0.002, 0.003, 0.004, 0.005, 0.006, 0.007, 0.008, 0.009, 0.01, 0.012, 0.014, 0.016], "speed": [0.1, 0.12, 0.14, 0.15]}
- candidateCount: 48
- initial: observe start tick 0 as stable with interval count 0; ordinary evaluator, no fake prior ticks. First physical tick only; raw cap-before values. Initial no geometric penetration. If collision skin changes behavior, eligibility depends on measured actual states.
- window: one game tick, start/substep1/substep2 observations; game boundary after any normal rule processing.
- eligible: Start and final raw observations satisfy complete goal containment and speed<=.15; substep1 fails at least one (speed>.15 or outside containment); no abnormal state. Independent geometric/velocity oracle, not DUT counter.
- asserts: ["No complete stable interval counted; end counter=0 and newly stable anchor at end tick; RUNNING; tick increments once.", "No clear, save, stars, result event.", "No matching candidate -> BLOCKED. Integration C001 separately uses prior 29 complete intervals to detect erroneous clear at boundary."]
- maxTicksPerCandidate: 1
- staticInitialNonOverlapCount: 48

### 同じ既存Pケースの補強（新規IDなし）
{
  "TC-D1-025": {
    "fixture": "FX04 static horizontal platform (4.8,2.4), 1.20×.16; ball radius .20, mass .20 at (4.8,3.48), v=(0,0), g=-9.8; selected profile; 180 ticks maximum.",
    "procedure": "Capture independent raw engine begin/pre/post/end with unique occurrence index and copy values. Select first actual begin and first two distinct pre/post occurrences for same pair (ordered by tick/substep/occurrence). Replay each copied event twice into isolated evidence collector, without changing live engine or gameplay. Compare unmodified collector result for same raw stream. Also run FX-RC7-TRANSIENT raw sequence when its matching fixture is available.",
    "assertions": [
      "Each occurrence retained once; distinct occurrences are not collapsed even for identical pair/value.",
      "Do not create physical contact by replay. Actual source raw evidence, replay counts and collector output all retained.",
      "Missing required distinct raw events or unavailable event identity: BLOCKED."
    ]
  },
  "TC-D2-020": {
    "fixture": "Horizontal spring B center (4.8,1.0) .72×.24, angle0, ball above center at y=1.32+gap, v=(0,-speed), READY, selected profile; gap=[.001,.003,.006], speed=[0,.05,.10], D1 initial then final selected settings. Max 180 ticks/candidate; 9 candidates.",
    "procedure": "No other objects. Choose first raw sustained touching episode of at least 10 complete ticks following initial contact (not necessarily launched: slow approach is intended). Compare every tick independently. I-C001 separately tests actual initial launch followed by injected continued contact.",
    "assertions": [
      "Every real contact consumes READY into WAIT_RELEASE; no release/rearm while continuous touching.",
      "At most one launch on first valid contact and none during subsequent continuous contact; if slow nonqualifying first contact then no launch anywhere in episode.",
      "No matching episode in fixed set => BLOCKED."
    ]
  },
  "TC-D2-021": {
    "fixture": "Horizontal spring center (4.8,1.0), angle0, ball at (4.8,1.60), v=(0,0), READY, selected profile and approved actual tuning; no obstacles/goal; observe up to 480 ticks. One fixed candidate, same run.",
    "procedure": "Observe initial qualifying contact/launch, airborne separation≥.04 for two complete ticks with no contact, then descending valid same-spring recontact. Independently derive rearm from raw per-tick observations, do not use controller as eligibility source.",
    "assertions": [
      "Exactly one first launch; WAIT_RELEASE; after two complete separated ticks READY (not earlier); subsequent qualifying recontact launches once and WAIT_RELEASE.",
      "If exact event chain cannot be observed within 480 ticks, BLOCKED; no synthetic substitution or physics tuning outside approved range."
    ]
  },
  "TC-D2-022": {
    "fixture": "Horizontal spring center (4.8,1.0), upper plane y=1.12. Static roof 1.20×.16 with bottom y=1.52+roofClearance, center x=4.8; ball p=(4.8,1.32+initialGap), v=(0,-speed), READY. roofClearance=[.002,.005,.010,.020,.039,.045,.060], initialGap=[.001,.003,.006], speed=[.5,1,2]. 63 fixed candidates, skip initial overlap/touch; selected profile plus PP03 QA for substep contact case. Max 120 ticks/candidate.",
    "procedure": "For each of 3 physical variants, first independent observed episode following real first contact: (a) two complete no-contact ticks with separation<.04 and at least one sample≤.039, (b) exactly one complete no-contact tick with separation≥.04 before qualifying recontact, (c) contact in at least one substep of a tick between two no-contact observations. Use raw events and independent circle-rectangle distance, fixed lexicographic order. I-C001 tests .039 exactly and exact state sequence; P tests real observations in these partitions, not claim exact .039 floating point hit.",
    "assertions": [
      "WAIT_RELEASE maintained unless 2 consecutive fully contact-free ticks with separation≥.04; b/c reset count when contact occurs. No reactivation until rearm; no false count based on final observation only.",
      "All 3 real partitions must be witnessed; missing partition => BLOCKED."
    ]
  },
  "TC-D2-023": {
    "fixture": "QA stress world only: ball p=(4.8,3.6), radius .20, v=(vx,-vy), omega=0. For two springs θ=[-45,+45]; for three θ=[-45,0,+45]; normal nθ=(sinθ,cosθ), spring center c=p−(.20+.12+gapθ)*nθ, size .72×.24. gap for each spring independently [.001,.003,.006]; vx=[-.5,0,.5], vy=[2,3]. 54 candidates for 2,162 for 3. Both use selected profile, max 3 ticks. QA-only static rectangles may overlap each other (not a legal stage); ball initially separated, no dynamic body overlap. No extra runtime pathway. Canonical numeric key uses QA gridX=c.x/.24, gridY=(7.2−c.y)/.24 and angle, never persists or bypasses production editor.",
    "procedure": "First raw same-tick observation of 2 or 3 distinct qualifying upper faces (respectively), READY at tick start; final eligibility and blockers computed by independent RC6 rules. For stress inputs where multiple springs are valid before final checks but no final candidate remains, not qualifying. Check both cardinalities. I-C001 tests explicit competition independently.",
    "assertions": [
      "Exactly one eligible launch; independent sorted priority matches selected; all contacting READY→WAIT_RELEASE; no double activation; no invalid geometry accepted as normal stage.",
      "If either cardinality cannot be observed, BLOCKED."
    ]
  },
  "TC-D2-024": {
    "fixture": "Reuse TC-D2-023 two-spring QA family with θ=[-45,+45], 54 candidates. Extend window to 4 ticks; also fixed FX-RC7-TWO-SUBSTEPS candidates if required. Selected profile. No midrun manipulation.",
    "procedure": "First raw observation with ≥2 distinct candidate springs in tick k, independently valid winner at end, loser had qualifying contact and still has real contact at tick k+1. Eligibility for loser is established independent of selected output; evaluate raw continued-contact sequence.",
    "assertions": [
      "Winner in k launches exactly once; loser WAIT_RELEASE. In k+1 no delayed launch from loser, even if its contact evidence still qualifies except READY; preserve release counter.",
      "Matching real continued contact absent in both finite families => BLOCKED."
    ]
  }
}

### 編集禁止 fixture
{
  "stageId": "04",
  "ball": "D4初期球(6,11)、ゴールG(21,16)、W(13,7,2,14)、在庫R2/P1/B1/S0。",
  "coordinateSystem": "保存gx,gy (左上); 下記R(5,23)は左下表記なので(5,7)。",
  "draftBeforeEdit": [
    {
      "id": "spring-qa",
      "type": "spring",
      "gridX": 6,
      "gridY": 25,
      "angleDeg": 15
    }
  ],
  "addRampCandidates": [
    {
      "id": "ramp-qa",
      "type": "ramp",
      "gridX": 5,
      "gridY": 7,
      "angleDeg": 0
    },
    {
      "id": "ramp-qa",
      "type": "ramp",
      "gridX": 8,
      "gridY": 7,
      "angleDeg": 0
    }
  ],
  "best": "E6の同一compatibilityで認定済みST04基準攻略を実際の正常クリアとして取得したベスト（星3）。候補は先頭から、ベストと異なる最初のdraftを採用。比較はIDではなくtype/gridX/gridY/angle。",
  "setup": "隔離OWNERの正規save（E6認定基準攻略の正常クリアをST01→04の順で実施済み。ST04解放・現行ベスト保存済み）、springのみのdraftから合法addRampを1回確定。Undo=[springのみ]、現在draft=spring+ramp、残在庫R1/P1/B0/S0。選択ramp-qa。開始時snapshotをcopy、tick0・runId=qa-edit-lock。実際の開始コマンドでRUNNING、PAUSED側は明示pauseをtick0で受理。テスト中は更新境界の同期dispatchでtickを進めない。QA外部fixtureだけに限定。各操作ごとに新規隔離状態に戻す。",
  "designControl": "同じdraft・履歴・認定ベストを使ったDESIGN対照では各要求が有効で状態が変わることを確認。reset/loadBestは確認済み引数。拒否が違法座標・在庫切れ・確認不足に由来しないことを保証。"
}
C001通常UI、C002〜015の全操作引数と期待値は18のrc7AssertPlan。

### 既存ケースの補強
全982件について構造・参照・未実施を点検。変更したcaseのrc7AssertPlanは個別入力・期待値を補足し、未変更caseには従来の入力/期待値/親契約を使用。PとIを同一証跡扱いしない。複合assertは同一caseId内で全variantの結果を保持。個別assertの完全な独立意味レビューは未完であり、未確定のfixture/期待値を実行者が自己決定しない。



## RC8 親契約補強（現行、既存IDのみ）
RC8の明示的case修正と具体化契約を適用する。case固有の入力・期待値・方式・対象stage/DV・RC7個別assert・固定vectorは維持し、親のRC8契約は当該caseに割当済みの変種に限定。RC6/7の詳細fixtureとRC8が矛盾する場合はLS01 HOLD（勝手に基準変更しない）。複合入力は全指定変種・対照・assertをsubcaseIndexで記録。未確定oracleをE0以降へ移さない。

| 親TC | 入力・手順 | 独立期待値 |
|---|---|---|
| TC-D1-001 | E0で外部grant後に固定したplanck@1.5.1の実ファイル、配布元dist.integrity、ライセンス、import閉包を読取。各実行時参照ファイルを列挙。 | Rは固定版・配布元・MIT通知・各hashがE0記録と一致。IはNodeが実際に同一バイトのESMを読込、未解決importなし。E0記録なしはBLOCKED。 |
| TC-D1-002 | E1最小静的HTTPのサブパスから同一ESMを読込、Node側も同一hash。独立世界に半径.2の球と静的矩形を作り1tick進める。 | 両者でbody生成・1tick更新、有限、初期化例外なし。全実行資産hash一致、外部CDN要求0。E7完成UIを前提にしない。 |
| TC-D1-005 | gx=0..40, gy=0..30の直積1271点。 | x=.24gx,y=7.2-.24gyを独立計算。両軸誤差≤1e-6m、逆変換整数gx/gy完全一致。個別4点も各case指定値と照合。 |
| TC-D1-007 | FX02で初期設定m=.20,r=.20、位置(4.8,6.5)、v=(0,0),ω=0。E0選定後の本番設定生成は採用質量を比較。 | 円形fixture半径.20、mass=.20（初期設定）、密度=.20/(π*.20²)、center一致、速度/角速度0、bullet=true、回転可。許容1e-6各単位。 |
| TC-D1-009 | FX03：g=(0,-9.8)、減衰0、球(4.8,6.5)、v=(0,0)、ω=0、60 game tick。 | x=4.8±1e-6、Y∈[1.50,1.70]m、vy∈[-9.81,-9.79]、vx=0±1e-6、有限。初期重力の固定QAであり調整後値と混同しない。 |
| TC-D1-010 | FX04上面y=2.48、球(4.8,3.48)、v=ω=0、通常g、180tickまで。 | 上面接触を独立rawで確認、底面遠側への横断なし、120..180tickの貫通≤.01m、異常なし。接触がなければFAIL。 |
| TC-D1-019 | E1の最小joint fixture：中心(4.8,3.6)、初期水平1.92×.16、質量.30、revolute±30、motorなし、球(4.2,4.4)/(5.4,4.4)、v=ω=0、各120tick。 | 独立観測で接触、支点変位≤.02m、\|θ\|≤32°、有限。E4の製品シーソー制御とは別。製品質量・角減衰の確認はD2-027〜030。 |
| TC-D1-022 | FX-REPEATを新規生成し、描画なしと描画ありを180tick。描画ありはD1-021の60Hz条件。 | 同tickで全動的body位置・速度・角速度/角度成分差≤1e-6、終端/接触事象列一致。描画が状態を変更しない。 |
| TC-D1-029 | 隔離したadapterのstepをtick1で例外、次に別世界で正常step。 | 例外時ERROR一回、結果/進捗/ベスト更新0、診断にrunId/tick/原因、以降stepなし。別世界の新規実験が正常に開始できる。 |
| TC-D1-031 | FX-REPEAT新規生成→10tick→disposeを100回、各終了直後の登録参照を確認。 | active world≤1、終了済み世界のアプリ参照・購読・更新ループ0。二重dispose安全、旧通知が次runへ到達しない。heapの瞬間値は合否に使わない。 |
| TC-D1-032 | E4でD2-018の0°正常バネ作動とD2-027左右荷重を各実行し終了後、同じ設計から新規世界を生成（P）。Iは両方の状態を汚染した隔離fixtureから新run。 | 旧runの発火/接触/軌跡/時間/必須flagを新runへ持ち込まない。初期球位置、v/ω=0、板水平、バネREADY、world ID新規。Pの正常作動・傾斜は独立証跡必須。 |
| TC-D2-001 | 4種類について04の寸法、角度、物理種類、材質初期値、板拘束を個別取得。 | R1.68×.16・9角度・static、P1.20×.16・0°・static、B.72×.24・7角度・static、S1.92×.16・0°・dynamic＋revolute±30。材質は04初期表、選定後は固定設定と一致。 |
| TC-D2-007 | 水平P（幅1.2厚.16）中心(0,3.6),(9.6,3.6),(4.8,0),(4.8,7.2),(4.8,3.6)をgeometry unitで比較。境界接触は(.6,3.6),(9,3.6),(4.8,.08),(4.8,7.12)も比較。 | 最初4件は盤面外形侵入で拒否、中央・境界接触4件は受理。格子/他制約は独立に成立させ、ここでは盤面幾何のみ。 |
| TC-D2-008 | ST01初期空からSOL01-Aを追加し、次の別合法位置（ST01初期定義で単独配置を全grid・角度正規順で検証した最初の非干渉点）へもう1個追加を要求。 | 1回目成功・残数0。2回目在庫理由で拒否、配置・選択・Undo・保存文字列不変。2回目位置は在庫以外の幾何合法性を独立確認。 |
| TC-D2-009 | ST01固定R(5,26,+15)を選択IDとしてmove(6,26),rotate(+30),deleteを各新規状態で直接要求。 | 全て固定物として拒否、配置/固定定義/在庫/Undo/保存不変。対象存在・通常のDESIGN状態を確認し別理由による拒否で合格させない。 |
| TC-D2-010 | P中心(2.4,2.4),(3.6,2.4)、水平。 | 矩形境界接触のみ、内部侵入0、許可。低レベル幾何で確認。 |
| TC-D2-011 | P中心(2.4,2.4),(3.59,2.4)、水平。 | 内部重なり幅.01m、拒否。独立幾何確認。MUT02でこのassertが失敗する。 |
| TC-D2-013 | P中心(2.4,2.4)、球中心(2.4,2.68)／(2.4,2.67)、r=.20。 | 接触のみ許可、.01m侵入拒否。低レベル幾何。 |
| TC-D2-014 | G原点(4.8,2.4)、P水平中心(4.8,3.0)／(4.8+.76+.60,3.0)。 | 前者保護領域内部侵入で拒否、後者x境界接触のみ許可（他制約なしの幾何単体）。 |
| TC-D2-019 | PケースはB中心(4.8,2.4),θ=0,球(4.8,2.77),g=0、v=(0,-1/-3/-6)、ω=0、READY、各60tickまで。Iケースは指定の合成候補。 | 各Pで実上面有効接触と終了資格を独立観測、作動1回、直後v=(0,V)±1e-6、ω維持（cap内）。Iの固定V=9.5も一致。正常な入射速度を足し込まない。観測不可BLOCKED。 |
| TC-D2-027 | FX07球中心(4.2,4.4)/(5.4,4.4)、通常g、v=ω=0、各120tick、採用板設定。 | 左右とも有効荷重接触、角変化の符号が荷重トルク方向、非ゼロ。支点≤.02・\|θ\|≤32、motorなし。接触後の無関係な回転を正例にしない。 |
| TC-D2-033 | 2枚Sの水平中心(3.0,3.6),(3.0,4.1)、初期矩形間隔.50m。 | 初期矩形非重複だが15拡張矩形union同士は内部重複、拒否。低レベルgeometry。 |
| TC-D2-034 | ST03初期定義のSOL03-AのP/Rを順序P→RとR→Pで配置（初期値を使用）。 | 両完成配置合法、正規化配置キー・在庫一致。途中不合法をすり抜けて確定しない。 |
| TC-D2-035 | D2-027で傾斜を独立観測した世界を破棄し、同じ設計から新規生成。 | 新世界の板角0、角速度0、支点初期位置、バネ/接触等旧run情報なし。観測不能ならBLOCKED。 |
| TC-D2-036 | ST01初期定義、坂道仮選択→+15→+30→SOL01-A位置(gx11,gy9)で確定。 | 仮操作中は在庫・Undo・永続書込不変、確定後R1個+30°、残0、Undo1回、保存対象1変更。E2はコマンド、実UIはE7のD6。 |
| TC-D2-037 | ST03初期定義SOL03-Aを構築、Rのmove先をPと同じ中心、次に別合法位置へ仮drag→cancel、次にdrag→orientation change。 | 全試行で確定配置・在庫・Undo・保存不変、仮状態のみ破棄。E2は中断コマンド、実pointerはE7。 |
| TC-D2-038 | QA用ST04初期定義の空からR(gx6,gy21,-30)を配置、合法な隣接座標の最初へ移動、許可角度の最初の合法な±15変更、削除、4回Undo。 | 各段階は独立配置snapshotと完全一致。Undo順に削除前→回転前→移動前→空、各残在庫一致、履歴0。合法候補の列挙順は04正規順。 |
| TC-D2-039 | ST01 SOL01-Aを配置後、合法な隣接点または角度1段の最初の組を選び、同じ2状態間で50回確定変更（合計51）。 | Undoは50回成功し最初の配置状態に戻る、51回目拒否。各履歴の実値照合、無効操作を回数に含めない。 |
| TC-D2-040 | E2の隔離データfixtureに2種類の合法な異なるdraftと合法ベスト（テスト用、実績認定ではない）、履歴2件、軌跡1件を入れる。リセット取消/確定、別初期状態でベスト読込取消/確定/Undo。 | 取消は全状態不変、reset確定で配置/履歴/軌跡消去・実績保持、best読込で履歴1件増、Undoで元draft。E7で実際の認定best保存連携を検証。 |
| TC-D3-001 | G原点(4.8,2.4)で生成、局所矩形3個を抽出。 | 底中心(0,-.08)幅1.52高.16、壁(±.68,.36)幅.16高.72、内幅1.2、開口上端.72。保護範囲X±.76,Y-.16..+.80。静的・反発0。 |
| TC-D3-002 | D2-014の保護領域内と、G原点から局所y=.79の入口内のP（境界外への跨りも含む）。 | 両方内部侵入で拒否。ゴールの実fixtureと重なっていなくても保護領域侵入を拒否。 |
| TC-D3-008 | 初回安定tick100、100..129の全観測で中心(0,.30)局所、速度.10、必須true。 | tick129で29完全区間、RUNNING、進捗/結果/終端通知0。 |
| TC-D3-009 | 初回安定100、100..130の全観測で中心(0,.30)、速度.10、必須true。 | tick130で30完全区間、CLEARED一度。129まではRUNNING。 |
| TC-D3-010 | 安定29区間後、速度.1501又は局所中心(0,.60)の一方だけを1tick入力、次tick正常値。 | 逸脱時カウンター0、次の初回安定観測でも0区間。再び30完全区間までクリアしない。 |
| TC-D3-021 | run Aをtick10でABORT、run B開始後AのCLEARED/FAILED/STAR/TRAJECTORY通知を各投入。 | Bの状態、歴代実績、現行best、前回軌跡、保存revisionと文字列不変、Aの通知で結果や音声を発行しない。 |
| TC-D3-022 | 同一run Aの正規CLEARED通知を10回、別fixtureでFAILED通知10回。 | 各runの終端結果は1回、clear進捗/best保存最大1回、failは進捗不変、軌跡置換1回。結果/効果音の重複なし。 |
| TC-D3-024 | 同一自由R上面の有効3完全区間で符号付き移動+.10,+.10,+.039m、他条件成立。 | 合計.239m、必須未達。次の有効区間+.001mで.24m到達時のみ成立（比較許容は04の規則に従う）。 |
| TC-D3-025 | 同一自由R上面で+.10,-.10を3往復、他条件成立。 | 有効区間6、正味0、未達。絶対移動の合算.60を使用しない。 |
| TC-D3-026 | U: ST02の同一有効上面証跡をθ=0,+15,-15で比較、各下り方向（水平は同方向）.24m以上、3完全区間。Pは04の坂道有効条件を独立rawで観測する専用fixtureを使用（RC8物理契約）。 | 水平だけ未達、非水平2条件は達成。物理で有効な区間が成立しない場合はBLOCKED、境界はUで固定検証。 |
| TC-D3-029 | I: current runの自由springの実際に選択された正常作動eventを1件入力、旧runを除外。P: D2-018のθ=0正常作動世界でST04必須判定を同時観測。 | 正規作動時だけflag false→true、同runで保持。接触候補だけでは達成しない。Pはraw資格と作動証跡必須。 |
| TC-D3-030 | I: D2-016の不適格・D2-023の非選択候補のイベント列で対象springだけ自由必須対象にした隔離評価入力。P: D2-016側面/裏面とD2-023の非選択springの実証を対象別に照合（同tickで他の自由spring作動なら全体flag達成は正しい）。 | 不作動または非選択spring個別の使用記録なし、全体flagは選択された自由springの有無で決定。全体flagを誤ってfalseに強制しない。 |
| TC-D3-036 | T=3,N=3で正常clear、独立fixtureで失敗回数0/3、Undo0/2、ヒントなし/L1〜3を1つずつ変える。 | 全clear星3、評価はNだけに依存。失敗中は星0、以前の歴代記録は維持。 |
| TC-D3-037 | 同互換性T=3、ベストなし→N=5→4→4（別合法配置）→6の正常clear snapshot。別caseで入力配列/要素を開始後変更。 | 記録数5,4,4,4、各星1,2,2,2、同数時旧配置保持。開始時コピーとbestが後続変更から独立。 |
| TC-D3-038 | 旧互換性best N3、歴代星3、現行なし、現行T=3,N4正常clear。 | 現行N4星2新規、歴代3保持、旧配置はpreviousBestのみ。異互換性の3と比較して更新拒否しない。 |
| TC-D3-039 | 正規初期全未クリア、ST01正常clear、ST01再失敗。 | 初期解放{01}、clear後{01,02}、再失敗後同じ。星・best・clearを失敗で減らさない。 |
| TC-D3-040 | ST01〜09をclear、ST10を初clear星2→再clear星3（他9は星3）。同終端通知重複とreload。 | 9/10時全達成なし、ST10初clearで全達成1回、29星、再clearで30星達成1回。重複通知/reloadで達成演出の再発火なし。 |
| TC-D3-041 | tick iで球中心(1+i*.001,2)の固定観測列i=0..60。 | 点tick=[0,6,...,60]の11個、座標は対応i、時間i/60。補間追加なし。 |
| TC-D3-042 | 同じ観測列i=0..15で正常終端。 | tick=[0,6,12,15]、4点、終端15一度。時間.25秒。 |
| TC-D3-043 | 正常終端1197／1200、i=0..終端の上記観測列。 | 1197は0..1194の6刻み200点＋1197=201点、1200は0..1200の201点。終点重複なし、最大201。 |
| TC-D3-044 | 以前の正常軌跡Aを保持し、正常clear B、正常fail C、abort D、ERROR Eを順に発生。 | A→B→C→C→C、各runIdと結果ラベル一致。abort/errorにより正常軌跡を上書きしない。 |
| TC-D3-045 | 前回軌跡Aから、合法編集/Undo/ベスト呼出し/表示OFF→ONを各独立実行、別状態でreset/ステージ移動/reload。 | 前4はA維持し「前回」を表示、OFF時非表示のみ。後3は記録なし。RUNNING/PAUSEDでは非表示。 |
| TC-D3-046 | 同stageの認定ヒントL1,L2,L3を3→1→2→3→1順で開閉、L3初回確認取消/承認を分ける。 | 任意順・回数制限なし、初回取消でghostなし、承認後のみL3、正しいlevel内容。E5は契約用仮ヒント、E6認定/E7画面で追証。 |
| TC-D3-047 | 正常draftを複製、L1/2/3を各表示、L3承認後閉じる。 | 配置/残在庫/Undo/保存文字列/物理fixture数不変。ghostは表示のみ。実験開始/移動で消去。 |
| TC-D3-048 | 認定参照H1のcompatibility A、現行Bに切替（QA）。 | 旧参照を現行L3として表示しない。再認定前のヒントは正式証跡に含めず、実行不能ならHOLD。 |
| TC-D4-001 | 04の初期10件を読込。ST01を削除、ST01を重複、ST11を追加した各変異も個別入力。 | 初期ID01〜10各1件、変異は全拒否。名前・初期球・goal・固定・在庫・必須・Tの参照が対応する。 |
| TC-D4-005 | 04表の初期在庫/Tと16の変更規則で候補を比較。各stage/typeを±1、初期ゼロ→1、必須→0、ST01変更、総14、T変更。 | ±1は許可条件全部成立時のみ受理、他列挙条件拒否。T不変。初期値から累積差分で比較。 |
| TC-D4-006 | 04の初期10定義と全17配置を保存座標(gx=u,gy=30-v)へ変換し、初期定義のまま検証。 | 各17候補を合法として確認、初期値と変換の一致。物理成功や正式認定はassertしない。E6調整後の定義で初期候補を再評価して誤失敗としない。 |
| TC-D4-008 | 同互換性認定済10基準＋7別解以上を正規配置順で通常コマンドから構築、BはUIで同じ構築。 | 完成配置キー・角度・在庫が認定fixtureと一致。QA直接注入不可。E6はコマンド、E7はUI。 |
| TC-D4-011 | D4-012のST01/02/03/04/06各100runの同一物理指紋rawを照合。 | 全500runの対応する自由part有効使用true、固定物だけでは認定しない。新規runを要求しない場合は厳密な証跡参照。 |
| TC-D4-015 | Iは基準/同一作用列・経路・未使用部品追加の固定合成証跡を比較。PはST04〜10の認定基準に空き在庫の合法1部品を追加し、同経路・作用列で未接触の最初の候補を探索（RC8有限手順）。 | 別解認定false、追加部品の使用事象0、同じ正常clearと実際の経路/作用列不変。Pの適格候補がなければBLOCKED。未使用部品を利用した別解認定禁止。 |
| TC-D4-016 | QA隔離で正常認定候補の観測に非有限値、すり抜け証跡を各独立に注入し、正常認定対照も実行。 | 異常候補は認定不可、正常対照のみ資格成立。ゲームに注入APIを配布しない。異常を実際の物理で発生させたとは記録しない。 |
| TC-D4-017 | D4-012の全1000runの終端tickを取得。 | 全1..1200、1081..1200は追加レビュー記録あり（18秒は目標、合格閾値は20秒）。証跡欠落時PASS不可。 |
| TC-D4-019 | 各基準fixtureの各自由partを単独で±1grid上下左右、角度±15（許可範囲のみ）へ移す。他part不変。 | 独立列挙集合と生成集合一致、原配置・重複除外、全合法候補を分母へ。候補除外理由を記録し成功結果による選別禁止。 |
| TC-D4-020 | D4-019の候補集合で違法境界、他part重複、在庫違反の隔離データ、同じ正規キー重複を各入力。 | 各違法・重複を分母から除外、正規の合法候補はすべて1件ずつ。合法数0は合格不可。 |
| TC-D4-024 | 認定済みstage AとヒントL3、固定物位置を許可範囲で1grid変更したBをQA入力。 | compatibility不一致を検出、旧L3を新Bの認定ヒントとして表示/固定しない。再認定後だけ適用。 |
| TC-D4-025 | 04の初期基準を固定し、固定part/goal/障害物中心各軸±2、障害物幅高±1、在庫±1の許可境界と各直上を隔離評価。 | 境界内かつ16の他条件・幾何すべて成立のみ許可。境界外・ゼロ種追加・必須削除・ST01変更拒否。実際の調整回数は台帳管理。 |
| TC-D4-026 | 同じ初期位置xからx+2を受理した隔離例、そこからx+1を要求（他軸不変）。負方向も対称。 | 累積差分±3拒否、基準のリセットなし。最後の許可状態と台帳維持。 |
| TC-D4-027 | Tを+1、必須種変更、共通g変更（E6）、球初期位置変更、固定角変更、障害物追加を独立要求。 | 全拒否、LS02/06またはLS01で停止、承認なしに書込・探索続行しない。 |
| TC-D4-028 | ST04使用1999/2000、全体19999/20000、他予算十分の隔離台帳。次1run予約を比較。 | 両上限直前のみ1run予約可能、どちらか上限で拒否。最終許可runで達成した場合は品質ゲート判定可、未達HOLD。 |
| TC-D4-029 | ST03-Aの2配置を順序反転、IDのみ変更し候補集合へ入力。 | 正規キー同一、実験候補1件。生成試行は両方予算計上。IDや操作順で物理順を変更しない。 |
| TC-D5-001 | 専用キーなし、別ゲームキーsentinelあり、正常lock取得可能な隔離同一origin。 | ST01のみ解放、10stage初期、正規schema、初期音量.7 mute=false、他キー不変、OWNER。初期値を既存破損の上書きに流用しない。 |
| TC-D5-002 | 06正規default例を検証しstage欠落/余分/型異常を各1項目変異。 | 正規のみ受理、01..10各1件・schemaVersion1、epoch正規、revision安全整数。変異は復旧候補扱いで無断永続書込なし。 |
| TC-D5-003 | OWNER正規初期、ST01 SOL01-Aを確定、raw before/after取得。 | revision+1、epoch同一、draftに指定配置、その他stage/進捗/settings不変。書込1回＋読み戻し一致。 |
| TC-D5-004 | OWNERの合法draft（D2-038のR）で合法move→rotate→delete。 | 各操作で最新draft・revision+1・epoch同一、無関係データ不変。各保存raw再読込で一致。 |
| TC-D5-005 | 合法編集→Undo、認定bestの異なるdraft→確認済best読込→Undo。 | 各確定後のdraftが正規snapshotと一致、best/歴代不変、revision各+1、取消は書込0。 |
| TC-D5-007 | OWNERの確定draftからpointerdown→move複数→pointerup前→cancel。 | 全時点raw・revision不変、書込0、仮状態破棄。合法pointerup対照でのみ1書込。 |
| TC-D5-008 | OWNERで正規clear snapshot（ST01認定基準）を1回終端確定、raw before/afterとsetItem呼出数を観測。 | 同一JSONのprogress・stars・currentBest更新、revision+1、draftは確定設計、書込1回。失敗時もゲームclear自体は維持し未保存表示。 |
| TC-D5-009 | 正規clear実績を持つ状態でFAILED/ABORT/ERRORを各実行。 | progress、currentBest、previousBest、raw文字列・revision不変（別の編集操作なし）。正常failの軌跡更新は保存対象外。 |
| TC-D5-010 | OWNERで合法draftを保存しrun中tick10で再navigation。 | 最後の確定draft復元、初期球/時間/履歴、Undo/軌跡/動的状態は復元しない。旧runは再開しない。 |
| TC-D5-011 | volume=0,.7,1とmuted=false,trueの直積を独立保存して再読込。 | 6条件すべて完全一致、設定外データ不変。volume0とmuteを混同しない。 |
| TC-D5-018 | 正規保存でST03 draftのIDを重複にし、他9stageとST03 progress/bestは正常。 | 該当draftだけ復旧候補、正常な他9・同stage進捗/best不変。確認前raw不変、取消でも不変。 |
| TC-D5-019 | currentBestのusedParts1/placements2、互換IDは現行。他情報正常。 | currentBest適用拒否、歴代正常情報維持、未確認の修正書込なし。usedPartsを勝手に2へ直さない。 |
| TC-D5-020 | ST03 cleared=true、historicalBestStarsを欠落/範囲外/不正型へ個別変異。 | clear維持、stars=null候補、総星は既知分と不明表示、30星達成を作らない。永続復旧前raw維持。 |
| TC-D5-021 | 正常settingsのvolume=-.1/1.1/文字列/muted不正型を個別変異。 | 異常フィールドのみ既定値候補（volume=.7/muted=false）、他情報維持。復旧確定前raw不変。 |
| TC-D5-022 | localStorageアクセスgetter例外、getItem例外を独立注入。 | ゲームは一時プレイ可、保存不能表示、書込0、正常な旧データを削除しない。復帰後は権限とraw再照合。 |
| TC-D5-023 | 正常rawを持つOWNER、次編集でQuotaExceededErrorと一般setItem例外を各注入。 | メモリ変更保持、旧raw維持、revision加算成功扱いなし、未保存表示、無断削除/初期化なし。 |
| TC-D5-024 | 壊れた正規データ候補を読込、確認ダイアログを取消。 | 元raw完全一致、書込0、メモリ内復旧だけ可。保存済表示禁止。 |
| TC-D5-025 | 同一origin単一ページ、正規Web Locks/localStorage、OWNER取得後合法編集。 | ロック保有中のみ書込、raw再読込一致、正常保存表示。B/Dは実API（mock不可）。 |
| TC-D5-026 | 同一browser context/originでAをOWNERにしてBを起動。 | AのみOWNER、BはREAD_ONLY、Bの編集/クリアはメモリのみ、BからsetItem0。A保存は成功。 |
| TC-D5-027 | 同一context/originでA/Bの同時開始barrierを20回、前試行のページを閉じてlock解放を確認。 | 各試行で同時OWNER0、正常環境では一方のみOWNER、他方READ_ONLY、書込者一意。20件全証跡。 |
| TC-D5-028 | A OWNER、B READ_ONLYで合法編集/正常clear/全体初期化要求を独立実施。 | 前2はメモリのみ、永続初期化拒否。BのsetItem/removeItem/clear呼出0、Aのraw不変。 |
| TC-D5-029 | A正常保存でrevision+1、BはREAD_ONLY。 | Bに更新通知。自動マージ/上書き/未保存破棄なし。遅延通知は最新raw照合の補助のみ。 |
| TC-D5-030 | A OWNER中、隔離QAの他writerで同revision別rawを置換、次の保存要求を試す。 | storageイベントの有無にかかわらず書込直前照合で拒否・停止。外部rawを上書きしない。 |
| TC-D5-031 | A保存後lock解放、B再取得・最新raw読込。 | Bは最新epoch/revision/配置読込後のみOWNER、A旧世代無効、他の未保存変更があればD5-032の確認を経る。 |
| TC-D5-032 | B一時プレイで未保存変更を持ち、Aが新raw保存して解放。再取得取消/承認、確認中にraw変更した別条件。 | 取消はBのメモリ維持・書込0。承認後取得/最新raw再照合、確認対象が変化した場合再確認。無断マージなし。 |
| TC-D5-033 | ownerGeneration1の保存要求を待機させ、解放・generation2取得後に旧要求を実行。 | 旧世代拒否・setItem0・最新raw維持。新世代正当な要求は成功。 |
| TC-D5-034 | OWNERのRUNNINGでhidden→visible、別にDESIGNで仮drag中hidden。 | RUNNINGはPAUSED、復帰自動再開なし、仮編集取消、raw不変。ロック原則維持、権限不明時追加書込なし。 |
| TC-D5-035 | A pagehideで世代無効化・解放、B更新、A pageshow persisted=trueを実際に観測。 | Aは再取得・最新照合まで書込なし、旧世代拒否、自動実験再開なし。BFCacheが成立しない環境は別の通常reload結果と区別しBLOCKED。 |
| TC-D5-036 | Web Locks API欠落／request拒否を個別注入。 | 永続書込0、一時プレイと警告、localStorage擬似ロック/IndexedDBへ無断切替なし。通常5環境の機能不能は受入BLOCKED。 |
| TC-D5-038 | 旧geometryIdのdraftを現行合法な同配置で読込（変更は無関係な障害物位置）。 | 共通合法性検証後のみ復元、現行geometryIdへ正規化、勝手な座標変更なし。必要な確認・保存規則を守る。 |
| TC-D5-039 | 旧geometryIdのdraftと現行障害物を重ねた隔離fixture。 | 不合法配置を無条件復元しない、元raw保持、確認前に削除・移動しない。 |
| TC-D5-040 | 旧compatibility best1個、現行T=3で3個の正常clear。 | 現行best3個星3登録、旧1個との少数比較をしない、previousBest/歴代維持。 |
| TC-D5-041 | ST01/02/04/05 cleared=true、ST03のみ破損、他は未clear。 | 正常4件保持、最大clear5→ST06まで解放、ST03のclearを捏造しない。全10達成なし、確認前raw不変。 |
| TC-D5-042 | 合法draft・Undo・前回軌跡・歴代・currentBest/previousBestあり。配置リセット取消/確定を別々に。 | 取消不変、確定は当該draft空/Undo0/軌跡なし、進捗・best・他stage/settings維持。正常保存1回。 |
| TC-D5-043 | 専用keyと他ゲーム2キーを持つOWNERで全体初期化取消/確定、別にsetItem失敗。 | 取消は全raw不変。確定成功は専用keyのみ正規初期、他2キー完全一致、clear()0。失敗は初期化成功通知なし・元実績保護。 |
| TC-D6-001 | 新規起動SC01で開始、遊び方、設定をそれぞれ選択し戻る。 | タイトル表記、開始→SC02、遊び方ダイアログと基本操作、設定→SC09、戻る→SC01。不要な保存変更なし。 |
| TC-D6-002 | 正規初期、ST01〜03星3/3/1、全10clear（各星3）の保存fixture。 | 10件表示、各解放・星・合計が正規データと一致（0,7,30）。過去/現行評価が異なる場合に識別可能。 |
| TC-D6-003 | 初期状態でST02〜10をタップ・キーボード起動（採用時）し、ST01対照。 | ロック中は開始不可・解放条件表示、ST01はSC03へ。進捗不変。 |
| TC-D6-004 | SC03でD2-036〜040の通常UI操作、一覧、軌跡toggle、ヒント、開始を実行。 | 全必須操作が見つかり操作可能、在庫・選択・角度・保存表示がdomain snapshotと一致、合法変更のみ確定。 |
| TC-D6-006 | RUNNINGで手動pause、背景pause、各resume/abortを独立実行。 | pause中tick/物理/編集不変、明示resumeのみRUNNING、abort→DESIGN、進捗/best不変。背景復帰だけで再開しない。 |
| TC-D6-009 | 9/10clear、10/10で29星、10/10で30星の状態。 | 全達成の条件のみ表示、30星称号を29星で表示しない。通知重複なし。 |
| TC-D6-010 | SC09で音量0/.7/1とmute切替、初期化取消/確定。 | D5-011/043と同じ保存・UI結果、取消で状態不変、設定を閉じると元画面。未保存時は正しく表示。 |
| TC-D6-011 | SC10のL1/L2/L3、初回L3確認取消/承認、閉じる/再開。 | L1/L2に正しい文言、L3取消でghostなし、承認時のみ適格な参照、配置変更なし。回数制限・減点なし。 |
| TC-D6-012 | TITLE→設定/遊び方、DESIGN→設定/ヒント、PAUSED→設定、結果→再設計を独立実行。 | ダイアログ閉じると呼出元、PAUSED維持、結果の再設計は合法draftを維持、意図しない書込・実験開始なし。 |
| TC-D6-013 | viewport320×568、通常文字倍率でSC01〜10の全操作領域を計測、SC03の折り返し確認。 | ページ横overflowなし、主要操作44×44 CSSpx以上、必要なスクロールで全操作到達可、盤面4:3。実機は実寸記録。 |
| TC-D6-014 | 768×1024、1280×720、568×320でSC03/04/05。 | 盤面/操作パネル欠落なし、正しい4:3変換、短い横向きでも全操作に到達、仮状態や物理状態を勝手に変えない。 |
| TC-D6-015 | ST01で坂道仮+30°、gx11,gy9に対応するCanvas CSS座標を独立計算しtap、B/D各環境。 | 指定グリッド・角度で1回確定、残在庫0・Undo1。Dは実機入力の証跡。 |
| TC-D6-016 | D6-015と同一条件をmouse clickで実施。 | 配置キー・在庫・履歴・保存結果がタッチと一致。 |
| TC-D6-017 | D2-037の合法/無効移動を実pointerでドラッグ、確定前後の状態を記録。 | 合法pointerupのみ1回確定、無効終端は元配置・Undo・raw維持。仮dragでは書込0。 |
| TC-D6-021 | ST03 SOL03-Aの2partを盤面/HTML一覧から交互に選択、空白tap。 | 毎回対象1個のみselected、両表示同期、空白は選択解除（新規モードでない場合）、配置変更なし。 |
| TC-D6-022 | drag途中pointercancel／lostpointercapture、合法pointerup直後lostpointercaptureを独立発火。 | 前2は仮編集破棄・確定0、後1は確定済み1件維持、二重Undo/保存なし。 |
| TC-D6-023 | 第1指drag中に第2指pointerdown/move/upを追加。 | 第2指から編集コマンド0、確定最大1回、意図しない新規配置・回転・削除なし。中断時は仮編集取消。 |
| TC-D6-024 | DESIGN仮drag中とRUNNING中に実際の向き変更、単純resizeも対照。 | 回転時仮編集取消・実験PAUSED、座標・確定配置不変、明示再開。単純resizeでは座標変換だけ。実機で記録。 |
| TC-D6-025 | 盤面外scroll、盤面内単指drag、設定入力フォーカス中とgame領域中のキー操作。 | ページ全体scroll/zoom禁止なし、盤面操作のみ捕捉、設定入力にgame shortcut干渉なし。Shouldキー未採用理由を記録。 |
| TC-D6-027 | 素材台帳の2名とCH01〜06をレビュー、実機表示で2名の人物識別。 | 独自制作/権利・同一人物対応記録、ルークとギア博士を人間が区別。自動ファイル数だけで人間判定PASSにしない。 |
| TC-D6-028 | CH01〜06の各表示イベントを順に発火、6画像を読み込み、Hでは名前/表情ラベルと見た目を比較。 | 各assetロード成功・状態対応、Hは6表情を区別可能。同一人物性・衣装一貫はD6-031。演出完了待ちなし。 |
| TC-D6-029 | 通常FAILED、CLEARED各1、ERROR対照。 | FAILED CH02、CLEARED CH03/06、ERRORは中立説明。旧run通知で表情を誤変更しない。 |
| TC-D6-030 | 説明ダイアログとヒント開閉。 | CH04/CH05対応、閉じた後通常状態へ。ヒントで配置変更なし。 |
| TC-D6-032 | 各必須キャラクター画像のロード失敗を隔離browserで個別注入。 | 読込失敗時代替テキスト/画像、操作・実験・終端継続。素材存在要件の通常版試験は別に必須。 |
| TC-D6-033 | 同じ認定攻略を装飾有効/無効で2実験、同じ物理指紋・操作。 | 離散結果・星・必須一致、同環境数値誤差≤1e-6、演出が物理状態を変更しない。 |
| TC-D6-036 | 有効新規配置、仮回転、確定回転、角度上限変更なし、無効配置、cancelを個別イベント入力。 | 配置確定SE01、実際の角度変更SE02のみ、無効・no-op・cancel発音0。80ms制限を検証。 |
| TC-D6-037 | 隔離audio eventでJ/m=.149,.150,.151、他条件正常。適格連続イベントをt=0,99,100,200msで発火。 | 閾値未満0、以上は要求。最小100ms間隔（0/100/200のみ）、音声イベントに物理副作用なし。 |
| TC-D6-038 | D2-015正常作動、D2-016不適格、D2-023非選択のイベントを個別入力。 | 実際の正常作動だけSE04要求、同tick重複/非選択/不作動0。最小100ms。 |
| TC-D6-040 | FAILED、CLEARED初星3、歴代星1→3、同等clear、終端重複のイベント列。 | 各終端SE06/07一度、SE08は新規3/2/0回、重複終端で追加0。ERROR/abortは正常失敗音にしない。 |
| TC-D6-041 | 起動後ユーザー操作前、最初の許可操作、背景復帰後の再開操作を独立観測。 | 操作前無断発音なし、操作後AudioContext開始/再開を試行、通常利用可能環境で発音。拒否時無音継続と警告、実機で聴感確認。 |
| TC-D6-042 | 音量0/.7/1、SE07と予約SE08再生中にmute=true、解除。 | master gain設定反映、mute中新規/予約音なし、実行済み音も停止、解除後旧予約音を再生しない、D5保存一致。 |
| TC-D6-043 | run A再生中pause/abort/画面離脱、run B開始後にAのイベントを遅延投入。 | Aの残音・予約停止、旧イベント発音0、Bの正規新音のみ。物理/結果への副作用なし。 |
| TC-D6-046 | 保存成功・未保存・結果不明・一時プレイの4状態、前回軌跡あり編集後・toggle・run中を比較。 | 状態ごとに文字で識別、旧軌跡は予測表示でない、toggleのみで削除しない、run中非表示。Hは表示の理解を確認。 |
| TC-D6-047 | 320pxの必須button hitbox、Tab/フォーカス、固定/自由/選択/拒否の表示、HTML一覧から操作。 | 主要44×44目標、色以外の文字/icon、代替操作、フォーカス表示。D実機で同内容確認。WCAG完全準拠とは称さない。 |
| TC-D7-006 | tick境界でabort/pause受付後にstep要求、別fixtureで既にCLEARED確定後abort/pause/旧終端を要求。 | 受付済みabort/pauseでは余分なstepなし、既確定結果取消なし、終端・progress・軌跡各最大1更新。 |
| TC-D7-008 | raw旧A、予定B、未保存C。setItem後読込例外→再照合B/A/他値/再例外を各実行、さらにB確認前にC編集。 | BはBまで保存成功、Aは未保存、他値は競合停止、再例外は不明継続。Cがある場合B確認後も未保存。追加書込は所有権再照合後のみ。 |
| TC-D7-009 | 互換Aの正常bestを持ちB→Cへ連続変更、Bでclearなし。 | Aの有効previousBestと歴代実績保持、currentBestなし、旧配置は現行合法性確認後のみ呼出し。空currentでpreviousを消さない。 |
| TC-D7-010 | 隔離audioで優先音1件と通常音を同時に5件以上要求、mute切替・pause。 | 同時実音≤4、成功/失敗/星優先、不要音の停止、mute中予約も破棄。採用方式は同じ優先度内で決定的。 |
| TC-D7-016 | 承認済み配布候補を静的HTTPの/daily-mini-games/games/0010_karakuri-workshop/相当で配信、直接URL→開始→全必須素材読込→認定攻略1件。 | 相対URLとassetが正常、HTTP失敗0、ルート前提の絶対参照なし。実際のPages公開ではない。 |
| TC-D7-017 | 正式候補を隔離ブラウザで起動、認定基準10件を通常操作で実験、request一覧を収集。 | 配布元への必要静的ファイル要求のみ、外部API/CDN/個人情報送信0、ログイン/課金不要。QA専用試験通信を本番要求と混同しない。 |
| TC-D7-018 | E0で固定した依存lock・ESM閉包・権利台帳とE8 runtime/QAの実資産一覧を比較。 | version/hash/利用条件一致、未承認依存0、本番とQAの同一エンジン。実体未取得ならBLOCKED。 |
| TC-D7-019 | 配布候補のファイル全件・本番import graph・URL・UI/consoleで到達可能な機能をレビュー。 | 本番からQA import/デバッグ操作/攻略注入なし、配布allowlist外0。public repo内のQAファイル自体が秘密とは主張しない。 |
| TC-D7-021 | 隔離fixtureの固定base/handoff/保護hash/許可パスの正常対照、各1箇所不一致。 | 正規条件のみ通過、SHA/保護不一致STOP、範囲外は停止、書込前後の差分記録。実GitHub操作なし。 |
| TC-D7-022 | 固定テストの削除、skip/todo、期待値変更、runner filter、合否集計変更を1件ずつ隔離注入。 | 各改変を固定基準とraw結果から検出、ゲートPASS不可、無断復元で報告省略なし。 |
| TC-D7-024 | E0〜E8個別4/5、全体29/30、同一重大根本原因1/2の各境界、他条件成立。 | 全て直前なら1予約可能、いずれか上限は拒否。開始済み中断は消費、最後の許可是正で達成ならゲート可。E0では独立台帳fixture。 |
| TC-D7-025 | 正常最新CP、欠落CP、途中中断消費不明、履歴欠落を隔離fixtureで再開。 | 正常のみ再開、消費不明は予約最大を一度計上、欠落はHOLD、0リセットなし。 |
| TC-D7-026 | 先行gate FAIL/NOT_RUN/BLOCKED、設定変更、再検証未完を各独立入力。 | 次工程不可、影響gate STALE、過去PASS保持・現候補合格に流用不可。正規全必須PASS対照でのみ進行可能。 |
| TC-D7-027 | Tested SHA=A、Evidence SHA=Bの差分を(承認済み非実行報告のみ)/(runtime)/(test runner)/(依存)に個別変異。 | 報告のみ＋同実行指紋なら証跡継承可。他は関連STALE/再検証、承認なし公開不可。 |
| TC-D8-001 | 隔離grant正常対照とimplementation=false、grantなし、approvalId欠落を各変異。 | 権限がない例ではE0/実装/環境操作を開始しない。正規対照も凍結済み契約・有効外部grantが前提。 |
| TC-D8-002 | E0は固定base/handoff一致対照と各SHA1文字変更、Phase4 caseは実際の登録後22ファイル読戻し（承認が前提）。 | 不一致STOP。Phase4は21内容hash、SHA256SUMS自身raw同一、固定commit・main不変。模擬テストで実登録成功を代用しない。 |
| TC-D8-003 | 正常repo/branchと、repo別・branch main/別ゲーム各入力。 | 指定外対象STOP、書込0。明示grantに含まれる専用branchだけ可。 |
| TC-D8-006 | 隔離作業側のテスト期待値と作業側hash一覧を整合するよう同時変更、固定hand-off側は不変。 | 固定基準と不一致を検出、STOP。作業側一覧だけで合格させない。 |
| TC-D8-007 | 固定テストskip、削除、期待値変更を各隔離注入。 | 全検出、gate停止、既存PASS無効化、無断で修復して報告省略なし。 |
| TC-D8-008 | policyVersion=2、未知operation、必須field欠落を各1変異。 | 全停止・安全側HOLD/STOP、承認や予算をdefaultで補わない。 |
| TC-D8-010 | 同一rootCause Aに重大是正2回、findingIdのみ変更し3回目を要求。別原因Bは他予算内対照。 | A拒否（LS04）、ID変更でも同じ計数、Bは他条件成立時のみ可。 |
| TC-D8-011 | D4-028の境界をE0独立Budget Managerで評価（実stage不要）。 | 1999/19999から1run可、2000又は20000で不可。開始前予約・同時枠消費を確認。 |
| TC-D8-016 | 最新CPを欠落、世代逆行、raw台帳と集計不一致に個別変異。 | HOLD、予算0戻しなし、古いCPで新データ上書きなし、書込/探索開始0。 |
| TC-D8-017 | 現工程必須case1件をFAIL/NOT_RUN/BLOCKED/STALEに変更、全PASS対照。 | どの異常でも次工程不可、全部の他gate条件が成立した対照のみ通過。未完了caseの除外禁止。 |
| TC-D8-018 | E2完了時にE7 UI caseを未来必須として残す対照、E2の必須caseをE7へ無断移動する変異。 | 正式割当の未来caseはNOT_RUNでE2自動gateに混入しない、変異は固定manifest不一致で停止、E8全自動要求を維持。 |
| TC-D8-019 | 承認済み共通物理（E5前）、stage構造（E6）、保存変更（E7）を個別差分として入力。 | 09/14の依存関係に従い関連ゲートSTALE、旧ログ保持。E5後物理変更は別承認なく実行しない。影響不明はHOLD。 |
| TC-D8-020 | D7-027と同じ4差分の独立fixture。 | 非実行承認済み差分以外は旧証跡を現候補PASSに利用しない。必要再検証を列挙。 |
| TC-D8-021 | raw caseA=PASS,caseB=FAILの固定manifest、集計を2PASSに改変。さらにcaseB欠落を比較。 | 両方PASS拒否、rawとcaseId照合によりFAIL/欠落を検出。完全一致対照のみ合格可能。 |
| TC-D8-022 | 別taskで固定SHA参照可、別contextのみ、同一contextのみの3方式を隔離入力。 | 実方式をそのまま記録、同一contextを独立第三者と称さない。対象SHA・範囲・レビュー記録・再レビューを要求。 |
| TC-D8-023 | E8自動全PASS・実機/人間NOT_RUNを与える。人間QA側はSites同一性不明/移植差分が実行ロジックに及ぶ例を比較。 | 最終HOLD、自動gateと人間gate分離。実際の差分が未確認なら受入不可、E8で将来のSites作成を要求しない。 |
| TC-D8-024 | E0〜E8自動gate全部PASS、PR/merge/publish grant全false、実機未実施の隔離fixture。 | 完了報告とQA資料作成のみ。公開・PR・merge要求は全拒否、最終受入HOLD。 |
| TC-D2-015 | Iは有効上面・角0°・候補接近.40/.50を直接供給。PはB中心(4.8,2.4)、球(4.8,2.77)、g=0、ω=0、初速(0,-.4)/(0,-.5)、各60tick、独立pre-solveで適格接触を確認。 | Iは境界値で作動1。Pは実測接近≥.40かつ04の全候補資格、正常作動1・v=(0,V)。厳密境界はIで確認、Pで資格なしはBLOCKED、資格あり不作動はFAIL。 |
| TC-D2-016 | IはRC6の側面・裏面・面距離・横幅外・法線角度の各独立証跡。Pは水平B中心(4.8,2.4)、g=0、球(3.99,2.4),v=(1,0)／(4.8,2.03),v=(0,1)、ω=0、各60tick。 | I全条件拒否、P実側面/裏面接触を観測し作動0。接触なしを合格にしない。 |
| TC-D3-023 | Uの3有効区間変位+.10,+.10,+.04に対し、Pは下記RAMP物理候補契約（+30°）。 | U正味.24達成。Pで同一上面・3完全有効区間・下り正味≥.24を独立観測しflag成立、それ以前は未達。適格候補なしBLOCKED。 |
| TC-D3-027 | U各caseの質量m・J=.10m・接近.20を固定。Pは水平P中心(4.8,2.4)、球(4.8,2.73)、初速(0,-.2/-.4/-1)、g=0、指定質量、ω=0、各60tick、独立rawでJup/mを計測。 | U全境界達成。P各質量で上面有効・接近≥.20・Jup/m≥.10が成立した最初の候補で達成、他条件との混同なし。Pで正確なJを入力したと主張しない。未観測BLOCKED。 |
| TC-D3-028 | U各caseの側面・接近.19・J/m=.099を固定。Pは下記PLATFORM-NEG物理候補契約。 | U3独立条件false。Pは指定失敗理由が独立観測で成立した場合のみ使用未達を検証、適格観測がない場合BLOCKED。合成入力でPをPASSにしない。 |
| TC-D7-002 | UはD2-025の量子化同順位の固定証跡を全順列で供給。PはRC7の同時有効候補familyを全順序の同一物理生成に使用、rawの量子化順位同値を独立確認。 | 同値時はtype/gridX/gridY/angle正規キー最小を1回選択。Pで同値候補を得られなければBLOCKED、IDや通知順を変えて結果を作らない。 |
| TC-D7-003 | 正常連続作動はD2-021の実物理再接触証跡、異常値注入はD1-024/028の隔離境界fixture。 | 連続作動の各tick最大1、cap後球速度≤12/60。異常入力ではclamp前ERROR、進捗/星更新なし。合成異常試験と物理実観測を区別。 |
| TC-D7-005 | 正規支持はD3-012の正常自然収容fixture。高速通過はFX08、球局所(0,.4)からv=(0,6)、g=0、30tick。貫通は隔離snapshotで球中心局所(0,.10)、床上面からの侵入.10mを独立計算。 | 正規支持のみ30完全安定区間でCLEAR、高速退出は安定条件不成立、異常貫通では正常攻略認定なし。侵入異常はQA注入であって実物理貫通の発生を主張しない。 |
| TC-D7-007 | D4-021の序盤/後半最低近傍条件、D4-015の未使用追加、D4-014の正当別解証跡を比較。 | 1partで合法近傍最大6の後半基準は不合格、正当多段は実測のL,S基準達成のみ認定、未使用追加は別解不可。Pは該当実験証跡、Rは独立作用列/経路比較。 |

### RC8 追加の具体化候補（既存ケース）
```json
{
  "ramp": {
    "applies": [
      "TC-D3-023-C002",
      "TC-D3-026-C002"
    ],
    "initialConditions": "R center (4.8,3.6) m, length1.68 thickness.16; angles +30 for D3-023; 0,+15,-15 for D3-026. gravity adopted, initial omega=0. t=(cos(theta),-sin(theta)); choose tangent d=t for theta>=0 else -t; n=(sin(theta),cos(theta)). ball center = center + offset*d + (.08+.20+.005)*n, initial velocity=s*d-.05*n. offset=-.5,-.3,0; s=2,3,4 m/s; lexicographic offset then speed; each at most 120 game ticks, fresh world. QA initial velocity only.",
    "qualification": "For each required angle select first candidate with raw valid upper contact maintained for >=3 complete game tick intervals and signed downslope displacement >=.24m (horizontal abs displacement). Exclude gap displacement. Candidate eligibility computed independently of tutorial flag.",
    "oracle": "At first eligible interval crossing, D3-023 true and D3-026 true for nonzero angle, false for angle0. Before eligibility false. No candidate => BLOCKED. Exact .24 boundary tested in U, not faked in P.",
    "maxRuns": 36
  },
  "platformNegative": {
    "applies": [
      "TC-D3-028-C004",
      "TC-D3-028-C005",
      "TC-D3-028-C006"
    ],
    "initialConditions": "P center(4.8,2.4),1.2×.16, ball r=.2,m=.2,omega0,g=0. C004: ball(3.97,2.4),v=(.4,0),60 ticks. C005: top x=4.8,y=2.73,v=(0,-.19),60 ticks. C006: target P at (4.8,2.4); fixed support P at (6,2.4) sharing boundary; ball x=5.4+delta,y=2.73, delta=-.02,-.01,0,.01,.02; v=(0,-s),s=.20,.25,.40,1, g=0. Each 60 ticks; delta then s ascending.",
    "qualification": "C004: actual side contact on target. C005: actual top contact, pre-solve approach below .20; C006: actual target upper contact, approach >=.20, target same-impact Jup/m <.10; support is fixed, not a free target. For C004/C005 other criteria are evaluated from raw; isolation of exact one-factor threshold is covered by U. No event/no qualification is BLOCKED, not PASS.",
    "oracle": "No effective target platform usage in eligible cases, overall required flag false when no other free target qualifies. Boundary input values .19/.099 fixed in U; P does not claim exact solver impulse .099.",
    "maxRuns": 22
  },
  "unusedPart": {
    "applies": [
      "TC-D4-015-C002"
    ],
    "initialConditions": "ST04..10 in ascending order; take frozen baseline. For each available type enumerate unoccupied placements by ASCII type, gx,gy,angle; legal via common validator, distinct keys. At most first 24 legal candidate layouts across stages; actual simulations counted under formal stage pool for current generation; no budget bypass.",
    "qualification": "First normal clear with added part having zero raw contact/activation/use, same remaining actual action sequence and obstacle classification as baseline.",
    "oracle": "Reject as distinct solution; no candidate qualifies -> BLOCKED. If the first independently qualifying candidate is incorrectly recognized, FAIL; do not choose another.",
    "maxRuns": 24
  }
}
```

実際の物理成立は未検証。候補列挙順/上限は事前固定し、最初の独立適格候補でFAILなら差替え不可。該当物理検証/正式ステージ枠および自動時間を消費し、予算不足はHOLD。12の未解決事項は凍結前判断。

## RC9 現行判定契約（5論点・7親24子、承認済み）

以下は該当論点についてRC8以前の候補・旧入力に優先する。既存ID/工程/予算を変更しない。全caseはNOT_RUN。

### TC-D2-015

Iは上面中央角0、その他作動条件成立、接近.400/.500を別々に供給し各1回・v=(0,V)。D2-017の.399/.400/.401境界も維持。PはRC8固定B中心(4.8,2.4)、球(4.8,2.77)、g=0、ω=0、初速(0,-.4)/(0,-.5)、各60tick。各runを評価し実測接近≥.4かつ04の全候補資格を独立rawで満たす最初の適格観測で1作動とv=(0,V)、同一tick多重作動なし。適格前の不作動はPASSではない。Pで適格観測が全く得られなければBLOCKED、適格観測の不作動はFAIL。厳密境界はI/Uで確認。

| caseId | 方式 | 入力 | 期待 |

|---|---|---|---|

| TC-D2-015-C001 | I | 角0°の有効上面接触合成、接近.400/.500m/s各1件 | 各1回作動・v=(0,V)、他候補なし。D2-017の.399/.400/.401は別caseで維持。 |

| TC-D2-015-C002 | P | B(4.8,2.4)、球(4.8,2.77)、g=0、ω=0、初速(0,-.4)/(0,-.5)、各60tick | 各run記録。実測≥.40かつ全作動資格が成立した観測で1回作動・v=(0,V)。全候補資格なしBLOCKED、適格不作動FAIL。 |

### TC-D3-027

Uは各質量m=.15/.20/.25/.30kg、上面法線条件成立、接近.20m/s、Jup=.015/.020/.025/.030N·s、各true。PはRC8の固定水平足場、球(4.8,2.73)、g=0、ω=0、初速(0,-.2/-.4/-1)の順、各60tick・質量ごと最大3run。独立rawで接近≥.20、同一衝突のJup/m≥.10、上面条件成立した最初の候補を評価。実測の力積を厳密入力したと扱わない。各質量の資格取得必須、資格なしBLOCKED、資格あり未達FAIL。

| caseId | 方式 | 入力 | 期待 |

|---|---|---|---|

| TC-D3-027-C001 | U | 足場上面、接近0.20m/s、質量0.15kg、上向き力積0.015Ns | 使用達成 |

| TC-D3-027-C002 | U | 足場上面、接近0.20m/s、質量0.2kg、上向き力積0.020Ns | 使用達成 |

| TC-D3-027-C003 | U | 足場上面、接近0.20m/s、質量0.25kg、上向き力積0.025Ns | 使用達成 |

| TC-D3-027-C004 | U | 足場上面、接近0.20m/s、質量0.3kg、上向き力積0.030Ns | 使用達成 |

| TC-D3-027-C005 | P | 質量0.15kg、P(4.8,2.4)、球(4.8,2.73)、g=0、ω=0、v=(0,-s)、s=.2,.4,1順、各60tick | 実上面・接近≥.20・同一衝突Jup/m≥.10を満たす最初の候補で使用true。無資格BLOCKED、資格あり未達FAIL。 |

| TC-D3-027-C006 | P | 質量0.20kg、P(4.8,2.4)、球(4.8,2.73)、g=0、ω=0、v=(0,-s)、s=.2,.4,1順、各60tick | 実上面・接近≥.20・同一衝突Jup/m≥.10を満たす最初の候補で使用true。無資格BLOCKED、資格あり未達FAIL。 |

| TC-D3-027-C007 | P | 質量0.25kg、P(4.8,2.4)、球(4.8,2.73)、g=0、ω=0、v=(0,-s)、s=.2,.4,1順、各60tick | 実上面・接近≥.20・同一衝突Jup/m≥.10を満たす最初の候補で使用true。無資格BLOCKED、資格あり未達FAIL。 |

| TC-D3-027-C008 | P | 質量0.30kg、P(4.8,2.4)、球(4.8,2.73)、g=0、ω=0、v=(0,-s)、s=.2,.4,1順、各60tick | 実上面・接近≥.20・同一衝突Jup/m≥.10を満たす最初の候補で使用true。無資格BLOCKED、資格あり未達FAIL。 |

### TC-D3-028

Uの3独立負例を維持。Pはrc8PhysicsProtocols.platformNegativeの最大22run（側面1、低接近1、低力積20）。C004は実側面接触、C005は実上面接近<.20、C006は実上面・接近≥.20・同一衝突Jup/m<.10。固定支持足場の力積を加算しない。最初の独立適格観測で未達を検証。適格なしBLOCKED、誤達成FAIL。Uでのみ一条件境界を厳密に分離。

| caseId | 方式 | 入力 | 期待 |

|---|---|---|---|

| TC-D3-028-C001 | U | 側面・他条件成立 | 未達 |

| TC-D3-028-C002 | U | 上面、接近0.19、J/m=.10 | 未達 |

| TC-D3-028-C003 | U | 上面、接近.20、J/m=.099 | 未達 |

| TC-D3-028-C004 | P | rc8PhysicsProtocols.platformNegative C004:球(3.97,2.4)、v=(.4,0)、g=0、60tick | 対象足場の実側面接触を独立観測して使用false。他閾値の厳密分離はU。観測なしBLOCKED。 |

| TC-D3-028-C005 | P | 同C005:球(4.8,2.73)、v=(0,-.19)、g=0、60tick | 実上面・接近<.20で使用false。他閾値の厳密分離はU。観測なしBLOCKED。 |

| TC-D3-028-C006 | P | 同C006:固定支持足場を併置、delta=-.02,-.01,0,.01,.02 × 速度.20,.25,.40,1、最大20run | 対象足場で実上面・接近≥.20・Jup/m<.10が成立した最初の候補で使用false。無資格BLOCKED。 |

### TC-D3-031

STAGE 06の自由配置シーソーの現runに限る。同じ有効上面接触episodeで、支点→接触点のベクトルrと球→板の正常力積ベクトルJから物理座標で符号s=sign(r_x*J_y-r_y*J_x)を独立計算（s=0は未達）。接線offset絶対値≥0.12m、球由来の正常法線力積の大きさ>1e-6 N·s、同一有効衝突直前/直後のs*(ω_after−ω_before)>1e-6rad/sを全て要求する。角度の基準は当該episodeの最初の適格荷重直前のθ0（物理CCW正、rad）。同じepisode中にs*(θ−θ0)≥5°（π/36 rad）で初めて有効使用成立。異なる荷重方向の変位を合算しない。episode終了後の変位は不算入、成立済みフラグはrun終了まで保持。既回転自体を禁止せず、接触による同方向の角速度変化がなければ未達。力積と角速度差は別条件。rawの時系列・球由来の前後値を分離できなければBLOCKED。これは操作的因果判定であり反実仮想の完全証明ではない。 Uは固定合成値、PはFX07左右の独立観測。

| caseId | 方式 | 入力 | 期待 |

|---|---|---|---|

| TC-D3-031-C001 | U | 固定合成正例3変種＋境界負例（rc9Protocols.seesaw） | 3正例true、offset/力積/角速度差/角変化/episode等の各負例false。run/part単位の状態を記録。 |

| TC-D3-031-C002 | P | FX07: pivot(4.8,3.6)m、水平板1.92×.16、球r=.20、採用質量/重力/減衰/摩擦、支点左右±.60m、球中心Y=4.4、初速・角速0、120tick、各新規world。両側で独立rawの適格荷重と同episodeの5°を要求。初期静止の正例と鏡像。 | 左右の独立適格観測各1回以上、同episode中に有効使用true。未観測BLOCKED、資格あり未達FAIL。 |

### TC-D3-032

STAGE 06の自由配置シーソーの現runに限る。同じ有効上面接触episodeで、支点→接触点のベクトルrと球→板の正常力積ベクトルJから物理座標で符号s=sign(r_x*J_y-r_y*J_x)を独立計算（s=0は未達）。接線offset絶対値≥0.12m、球由来の正常法線力積の大きさ>1e-6 N·s、同一有効衝突直前/直後のs*(ω_after−ω_before)>1e-6rad/sを全て要求する。角度の基準は当該episodeの最初の適格荷重直前のθ0（物理CCW正、rad）。同じepisode中にs*(θ−θ0)≥5°（π/36 rad）で初めて有効使用成立。異なる荷重方向の変位を合算しない。episode終了後の変位は不算入、成立済みフラグはrun終了まで保持。既回転自体を禁止せず、接触による同方向の角速度変化がなければ未達。力積と角速度差は別条件。rawの時系列・球由来の前後値を分離できなければBLOCKED。これは操作的因果判定であり反実仮想の完全証明ではない。 Iで負例を独立入力。Pは実現可能な固定タグ・中央・無接触回転を観測、旧run再供給はIとして分離。

| caseId | 方式 | 入力 | 期待 |

|---|---|---|---|

| TC-D3-032-C001 | I | rc9Protocols.seesawの全unitNegativeVariantsを各独立入力、正例対照も実行 | 全負例false、正例true。固定・旧run・中央・無接触・既回転無加速・逆向き・離脱後の不正達成なし。 |

| TC-D3-032-C002 | P | FX07と同じ寸法・採用設定、(a) QAでFIXED扱いの動的板に左右±.60m荷重、実接触と荷重・角変化を観測するがplayer使用はfalse、(b) 中央荷重 (4.8,4.4)・120tick、TC-D2-028の接触/偏差≤2°と未達、(c) 球(1.0,6.5)初速0、板の初期角0・初期角速+1rad/s、30tick、球接触なしで回転しても未達。旧runIDは(a)の実raw取得後にQAで前runタグへ置換し受信側に再供給するI検証として明記、実物理で旧runが自然発生したと主張しない。既回転/弱荷重の厳密な負例はC001合成証跡で独立確認。各試行で適格観測不可はBLOCKED。 | 物理負例各false、実rawと旧run再供給Iの証跡を区別。無資格BLOCKED、誤達成FAIL。 |

### TC-D4-015

RC8 unusedPart手順のST04..10昇順、対象stage/設定を固定した基準攻略（比較用に固定、E6全体凍結との循環を作らない）、在庫内未使用1部品追加をtype ASCII→gx→gy→angleで合法/重複除外。全stage合計最大24合法候補のrunを現世代の正式検証枠で事前予約、未実行と証明できる予約だけ解除。独立rawで同じ正常clear・作用列/障害物経路分類不変・追加part接触/作動/使用0を最初に満たした候補で認定false。適格なしBLOCKED。適格候補FAIL後に差替禁止。Iは同じ証跡に未使用部品だけ追加し認定false、実物理と別証跡。

| caseId | 方式 | 入力 | 期待 |

|---|---|---|---|

| TC-D4-015-C001 | I | 同一正常clear、同一作用列/経路、追加part接触/作動/使用0の固定合成証跡 | 別解認定false。 |

| TC-D4-015-C002 | P | rc8PhysicsProtocols.unusedPartをRC9採用。ST04..10の固定基準へ最大24合法候補を追加 | 最初の独立適格候補を別解認定しない。全候補無資格BLOCKED、資格あり誤認定FAIL。正式検証枠を消費。 |

### TC-D7-014

E8制御ブラウザとDV01〜05の各実機で別々に、同じ対象サーバー/配信経路・制御プロファイルを使用。下り10Mbps（10^7bit/s）、実効往復50msを設定し、cold/warm各5試行の前後に校正する。RTTは校正用の短い非キャッシュ要求5回（接続確立済み、同じ制御経路、端末の単調時計で要求開始から応答受信完了、応答処理時間を記録し既知分を除く実効往復時間。ルータの追加遅延設定値のみを実測としない）。帯域は同一経路の非圧縮・非キャッシュ2MiB転送を用い、実受信バイト×8/受信区間秒/10^6でMbpsを求める。開始・終了の両校正でRTT中央値45〜55ms、帯域9〜11Mbps（両端含む）を要求。応答時刻/バイト計測が信頼できない場合はBLOCKED。校正は起動計測から分離し、ゲームのcache条件を変更しない。校正用URL、機器、制御方式、設定値、5標本、バイト数/区間、前後結果を保存。既存許可範囲のQA用経路のみ。追加機器/パス/サービスを必要とすれば別承認までHOLD。cold5は各回対象ゲームのキャッシュ初期化、warm5は同じ版のキャッシュを利用、navigationStartからタイトル必須資産読込＋開始button有効＋handler準備まで。全5標本を保持し各環境中央値cold≤3s・warm≤1.5s。校正成立後の性能未達はFAIL。校正不能/不成立はBLOCKED、通常通信は参考記録のみ。

| caseId | 方式 | 入力 | 期待 |

|---|---|---|---|

| TC-D7-014-C001 | B | E8制御ブラウザ：rc9Protocols.networkで前後校正＋cold/warm各5 | 前後校正成立、cold中央値≤3s/warm≤1.5s。校正不能BLOCKED。 |

| TC-D7-014-C002 | D | DV01〜05各実機：rc9Protocols.networkで各前後校正＋cold/warm各5、通常通信参考別記録 | 各DVの前後校正成立、各cold中央値≤3s/warm≤1.5s。未校正BLOCKED、エミュレーション代用なし。 |

D2-017の3境界caseは変更なし。板の全合成variantは18.rc9Protocols.seesaw、通信校正は18.rc9Protocols.networkを参照。variantは既存子ケース内のassertであって新テストIDではない。


## v1.0 凍結状態（現行）
全296親/982子のRC9契約を固定した。全ケースNOT_RUN。独立した意味的十分性の保証は未実施で、明示的な残存リスクとしてユーザーが了承済み。テスト固定前の個別レビューと独立oracle照合を維持する。未定義入力・期待値や設計矛盾を発見した場合はLS-01 HOLDとし、勝手に補完しない。
