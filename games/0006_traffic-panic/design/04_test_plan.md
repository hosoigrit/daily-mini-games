# Game #0006『交差点パニック』テスト計画書・固定オラクル

- 版: **v1.0-rc3**（設計段階・未実行）
- 文書ID: TP6-TEST
- 参照仕様: [01_requirements.md](01_requirements.md) / [02_basic_design.md](02_basic_design.md) / [03_detailed_design.md](03_detailed_design.md)
- **本書に記載するPASS期待値は事前計算した設計オラクルであり、ゲーム実装のテスト結果ではない。**

## 1. テスト原則
1. ゲームエンジンと同じテスト対象をUIから独立に検証する（別実装の都合のよいコピーを使わない）。
2. Golden Vector（固定値）、Invariant（常に成り立つ条件）、Metamorphic（同入力再実行・FPS独立性）を併用する。
3. 期待値はテスト対象コードから生成しない。Codexが期待値を実装の結果に合わせて変更することを禁止する。
4. Artificial Scheduleと、PRNGで生成された本番予定を区別する。前提条件の不備による偽陽性を排除する。
5. 性能・勝率・面白さは、正しさのテストと別の合格ゲートで判断する。

## 2. 規範オラクル（Golden Vector）
| ID | 入力 | 期待値 |
|---|---|---|
| OR-001 | FNV-1a(`hello`) | `0x4F9F2CAB` |
| OR-002 | xorshift32初期値1、初回 | 270369 = `0x00042021` |
| OR-003 | `TP6-v06|0001|EARLY`ハッシュ | `0xF219EBB0` |
| OR-004 | `TP6-v06|0001|MIDDLE`ハッシュ | `0xFD1DB64C` |
| OR-005 | `TP6-v06|0001|LATE`ハッシュ | `0x0F6F2025` |
| OR-006 | BASE全予定件数 | 58台（15/19/24） |
| OR-007 | seed0001先頭イベント | event1, tick13, N |
| OR-008 | seed0001第2イベント | event2, tick26, E |
| OR-009 | 初期EW_GREEN、greenStart=0 | 最初の通過機会はtick12 |
| OR-010 | 直前tick99でSWITCH_NSをtarget100 | tick100 EW_YELLOW |
| OR-011 | 黄開始tick100 | tick110 ALL_RED_TO_NS |
| OR-012 | 全赤開始tick110 | tick115 NS_GREEN |
| OR-013 | NS_GREEN開始tick115 | 最初の通過機会tick127 |
| OR-014 | 待機8へ1台到着 | 待機8維持、超過1、即GRIDLOCK |
| OR-015 | 待機8、同tickに通過＋到着 | 8維持、超過0、RUNNING |
| OR-016 | RUNNINGの直前tick599 | tick600 CLEAR・同tick新規処理なし |
| OR-017 | BASE seed0001、東西青の無操作 | tick350北GRIDLOCK、通過13台、130点 |
| OR-018 | 同版・同seed・同バッチログ | 全確定tick・全ドメインイベント一致 |
| OR-019 | PAUSEDでtick更新要求 | NOT_RUNNING、Snapshot不変 |
| OR-020 | FINISHEDでtick更新要求 | NOT_RUNNING、Snapshot・結果不変 |

### 2.1 seed0001先頭10台（方向は固定期待値）
| eventId | tick | direction |
|---:|---:|---|
| 1 | 13 | N |
| 2 | 26 | E |
| 3 | 39 | N |
| 4 | 52 | N |
| 5 | 65 | S |
| 6 | 78 | W |
| 7 | 91 | E |
| 8 | 104 | S |
| 9 | 117 | W |
| 10 | 130 | S |

### 2.2 seed0001無操作の最終期待状態
終了tick350、北方向9台目によるGRIDLOCK、`arrivalAttempts=30`,`spawnCursor=30`,`passedVehicles=13`,`overflowVehicles=1`、queues=(N8,S8,E0,W0)、`switchCount=0`、score=130、`maxQueueLength=8`。保存則`30=13+16+1`。

### 2.3 方向割当の境界
MIDDLE: `0x26666666→N`、`0x26666667→S`、`0x4CCCCCCC→S`、`0x4CCCCCCD→E`、`0xA6666666→E`、`0xA6666667→W`。

## 3. 人工予定によるシナリオ
人工予定は`eventId`連番、tick整数1..599、direction合法、tick・IDソート済みであること。テスト用Snapshotは**状態の局所契約が正しいこと**（隊列、過去到着・通過・カーソル、信号開始と時刻）を事前検査する。初期tick0からの完全な履歴再現は必要としないが、局所的不変条件と既処理イベントの件数は満たす。

### CASE-A 通過と到着の同tick
- tick107確定、EW_GREEN、greenStartTick96、queues=(N0,S0,E8,W0)。
- passedVehicles=0, arrivalAttempts=8, spawnCursor=8, overflowVehicles=0, maxQueueLength=8。
- 先行8件が処理済みで、9件目の予定がtick108のE。
- 期待: tick108でEから1台通過後にEへ1台到着。E=8、passed=1、arrivalAttempts=9、spawnCursor=9、overflow=0、RUNNING、score10、保存則9=1+8+0。

### CASE-B 赤側の9台目で即終了
- tick107確定、NS_GREEN、Eが8台。その他待機0、passed=0、arrivalAttempts=8、spawnCursor=8。
- 次の到着はtick108のE1台。青が南北なので東の通過なし。
- 期待: tick108でE=8維持、arrivalAttempts=9、spawnCursor=9、overflow=1、passed=0、result=GRIDLOCK、failureDirection=EAST、保存則9=0+8+1。

### CASE-C 599/600の優先順位
- tick599まで正常に生存したSnapshotでEに1台待機（たとえばtick598に到着、スケジュールは構造的に妥当）。
- tick600にE方向の通過機会が理論上あっても、tick600は即CLEAR、通過・操作・到着をしない。`passedVehicles`、queues、switchCountはtick599のまま。
- BASEの通常予定にtick600発生はない。**不正なtick600予定を正常データとして入力しない**。

## 4. 状態・コマンド境界テスト
| ID | 入力 | 期待値 |
|---|---|---|
| ST-001 | EW_GREENからtick100切替 | EW_YELLOW（同tick通過なし） |
| ST-002 | tick110に切替指示＋黄期限 | `TRANSITION_LOCKED`、ALL_REDへ |
| ST-003 | tick115に切替指示＋全赤期限 | `TRANSITION_LOCKED`、NS_GREENへ |
| ST-004 | tick116の逆方向指示 | 有効（基本Engineには最短青制約なし） |
| ST-005 | 黄・全赤中のUI操作 | 拒否し予約・復帰後の繰越しなし |
| ST-006 | 同一tickに不正指示→有効指示 | 後続有効指示を受理 |
| ST-007 | 同一tickに有効指示2件 | 1件目受理、2件目DUPLICATE |
| ST-008 | tick599に9台目 | GRIDLOCK、tick600へ到達しない |
| ST-009 | tick600へのSWITCH | CLEARが先、操作未実行 |
| ST-010 | 同バッチPAUSE＋SWITCH | PAUSE優先、tick進行なし、SWITCH破棄 |
| ST-011 | 同バッチPAUSE＋RESUME | PAUSE優先、RESUME破棄 |
| ST-012 | PAUSEDからRESUME＋SWITCH同バッチ | RESUMEのみ、SWITCH破棄。別バッチで受付 |
| ST-013 | START＋SWITCH同バッチ | STARTのみ。tick0で切替なし |
| ST-014 | 完了後の通常操作 | 無効、FINISHED状態不変 |

## 5. BOTオラクル
| ID | 入力条件 | 期待 |
|---|---|---|
| BOT-T01 | BOT-01、任意の観測 | 操作なし |
| BOT-T02 | BOT-02、tick50でEW_GREEN | SWITCH_NS |
| BOT-T03 | BOT-03、tick70でNS_GREEN | SWITCH_EW |
| BOT-T04 | 固定周期判断時が全赤 | 操作なし・予約なし |
| BOT-T05 | BOT-04、赤最大7（青任意）、切替中でない | 即切替 |
| BOT-T06 | BOT-04、赤最大5、青最大3、青継続23tick | 維持 |
| BOT-T07 | BOT-04、上記で24tick | 切替 |
| BOT-T08 | BOT-05、tick104で赤最大7 | 判断周期外なので操作なし |
| BOT-T09 | BOT-05、tick105で赤最大7 | 切替指示 |
| BOT-T10 | BOT-05、赤最大6、青継続11tick、予測改善あり | 維持 |
| BOT-T11 | BOT-05、予測差が4999単位 | 維持 |
| BOT-T12 | BOT-05、予測差が5000単位、他条件許可 | 切替 |
| BOT-T13 | BOT-05、予測差0 | 維持 |
| BOT-T14 | BOT-05、同一Observationで異なる非公開seed | 判断完全一致 |
| BOT-T15 | BOT-05、公開発生予定tickと方向確率を変更 | 予測負荷は設定どおり変化 |

補足: BOT-T11〜13は、予測関数の固定入力または公開設定から構成した計算ケースで検証する。閾値に対する単体テストと、40tick予測を通した結合テストの両方が必要。BOT-05の「発生予定時刻」は公開Config由来であり、非公開の乱数方向は使用しない。

## 6. 異常系・不変条件テスト
| ID | 条件 | 期待 |
|---|---|---|
| ERR-T01 | Configのtick長/方向確率不正 | セッション開始拒否 |
| ERR-T02 | Snapshotの待機数が負数/9 | INVALID_SNAPSHOT、正式状態不変 |
| ERR-T03 | SignalStateに存在しない状態 | INVALID_SNAPSHOT |
| ERR-T04 | 更新途中で不変条件破綻 | ENGINE_FAULT、更新全体をコミットしない |
| ERR-T05 | ScheduleのID重複・時刻逆転 | 開始/検証時拒否 |
| ERR-T06 | localStorage失敗 | 記録エラーのみ、ゲーム継続 |
| ERR-T07 | BOTの例外 | 操作なし＋診断、Engineは正常 |
| ERR-T08 | 非表示・実時間デルタ>500ms | 自動PAUSE、勝手に進行しない |
| ERR-T09 | 再現ログのバージョン不一致 | 明示的互換性確認なしに再生拒否 |
| ERR-T10 | 描画FPS変更・表示アニメ遅延 | 同じtick/操作列なら結果一致 |

追加で、各正常tick後にINV-01〜12を検査する。ミューテーションテストでは9台目判定を10台目に変更した場合、発生を通過より優先した場合、黄中に通過した場合、PAUSED中にtickを進めた場合が確実に検出されることを確認する。

## 7. 要件・設計・テストの対応表
| 要件 | 責務 | テスト |
|---|---|---|
| FR-001 | Engine / Controller | OR-016, ST-008/009 |
| FR-002 | Signal FSM | OR-010〜013, ST-001〜004 |
| FR-003 | Command Adapter / Signal FSM | ST-005〜007, ST-010〜013 |
| FR-004 | Traffic Model | CASE-A/B, ERR-T02 |
| FR-005 | Spawn Generator | OR-003〜008, ERR-T05 |
| FR-006 | Traffic Model | OR-009/013/015, CASE-A |
| FR-007 | Engine / Traffic Model | OR-014/017, CASE-B, ST-008 |
| FR-008 | Engine derived score | OR-017, CASE-A |
| FR-009 | Config / Spawn Generator | OR-006, phase-boundary checks 200/400 |
| FR-010 | Controller | OR-019, ST-010〜012 |
| FR-011 | Session | OR-020, ST-014 |
| FR-012 | Replay / PRNG | OR-001〜008/018, ERR-T09 |
| FR-013 | Renderer | E2E signal/queue/clock/score display |
| FR-014 | Controller | E2E touch/mouse/keyboard, ST-005 |
| FR-015 | Renderer | E2E CLEAR/GRIDLOCK and failure direction |
| FR-016 | Persistence | best-clear / best-attempt, ERR-T06 |
| FR-017 | Controller | ERR-T08 and visibility tests |
| FR-018 | Persistence | ERR-T06 |
| FR-019 | Engine / Renderer | ERR-T10 |
| FR-020 | Domain events / Replay | OR-018, ST-010〜014 |
| NFR-001〜005 | Core separation / adapters | pure-API contract, simulation smoke, ERR-T10 |
| NFR-006〜007 | Logging / Versioning | privacy inspection, config version metadata, ERR-T09 |
| NFR-008〜009 | PRNG / atomic update | OR-001〜008, ERR-T04 |
| NFR-010〜012 | BOT observation / Input replay / Artificial schedule | BOT-T14, ST-010〜013, CASE-A/B/C |

※E2E / 実機項目にはブラウザ自動テストと人間の実機確認が必要。単体・論理テストだけで公開許可しない。

## 8. バランス検証（エンジン正しさを合格した後に実行）
- 設定: BASE(終盤8tick、切替15tick、58台)、HARD-A(7tick、15tick、62台)、HARD-B(8tick、20tick、58台)、EASY-A(9tick、15tick、56台)。
- seed: 0001〜0500調整、0501〜0800検証、0801〜1000最終。最終200seedは設定/BOT凍結後に一度評価。
- BOT: BOT-01〜05。BOT-06は必要に応じて限定先読みで失敗原因を調査するが、不可能性の数学的証明とは区別。
- 指標: クリア率、平均/中央値スコア、20秒未満失敗率、生存時間、最大待機数、切替回数、同seed対応あり差、95%信頼区間。
- 暫定目標（検証300seed）: BOT-05クリア65〜85%、最良固定周期との差+10pt以上、無操作クリア10%以下、BOT-05早期失敗5%以下。
- 暫定目標（最終200seed）: BOT-05クリア60%以上、固定周期との差+5pt以上、早期失敗5%以下。小さな差で区間が0を跨ぐ場合はINCONCLUSIVE。
- 統計結果のみで面白さを認定しない。人間の初見・習熟プレイを別評価する。

## 9. 品質ゲートと判定状態
| ゲート | 完了条件 | v1.0-rc3時点 |
|---|---|---|
| Gate A 設計 | 重大矛盾なし、4文書整合、固定オラクル確認、人間が採否明示 | **HOLD：正式承認待ち** |
| Gate B 実装開始 | Gate A承認、Codex実装範囲/禁止操作/報告条件を別途許可 | 未許可 |
| Gate C 品質 | 必須テストPASS、不変条件違反0、再現性PASS、バランス報告、独立レビュー | 未実施 |
| Gate D 公開 | PC/Android/iPad/iPhone Safari実機確認、人間プレイ、最終承認 | 未実施 |

**判定:** PASS / FAIL / INCONCLUSIVE / BLOCKED / NOT RUN を区別。設計にある「期待PASS」は未実施テストをPASSした意味ではない。
