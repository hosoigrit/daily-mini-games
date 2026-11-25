> Game #0010 / 詳細設計 v1.0 FROZEN / Phase 3 CLOSED（設計のみ） / 2026-11-25 JST
> 正式凍結承認: DESIGN-FREEZE-GAME-0010-20261125-01（設計承認記録の識別子であり実行grantではない）。現行状態は12/13のv1.0節、15/18の凍結メタデータを参照。RC9の設計・判定契約をそのまま固定する。以下の過去版のHOLD・未承認・候補等の状態記述は履歴であり、v1.0の承認状態に優先しない。ただし個別の未定義oracle・観測不能・予算不足等の停止条件は有効。Phase 4以降未許可、全実行権限なし。

# 保存・データ設計
単一キー daily-mini-games.game-0010.save、排他名 daily-mini-games.game-0010.save-lock、localStorage＋Web Locks。最大65536 UTF16コード単位。10stageレコード、progress/draft/currentBest/previousBest/settings。選択・Undo・軌跡・物理状態・ヒントは非永続。全体初期化も専用キーだけ、clear()禁止。
下記スキーマはD5の構造を厳密化した候補。saveEpochは2026-11-25に採用方針承認済み。既存のschemaVersion=1公開実績はないが、採否の承認が必要。JSON Schemaだけで合法配置/参照/整合/有限値を保証できないため追加検証必須。構造上限の保守的見積り（最大長ID/全390配置、最長文字列を組合せた、実配置としては不合法な上界例）は 47502コード単位。正規defaultの構造検証は実施済み、ブラウザの保存・全最大合法配置・実測シリアライズは未実施。
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "gameId",
    "schemaVersion",
    "revision",
    "saveEpoch",
    "stages",
    "settings"
  ],
  "properties": {
    "gameId": {
      "const": "game-0010"
    },
    "schemaVersion": {
      "const": 1
    },
    "revision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "saveEpoch": {
      "type": "string",
      "pattern": "^[0-9a-f]{32}$"
    },
    "stages": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "01",
        "02",
        "03",
        "04",
        "05",
        "06",
        "07",
        "08",
        "09",
        "10"
      ],
      "properties": {
        "01": {
          "$ref": "#/$defs/stage"
        },
        "02": {
          "$ref": "#/$defs/stage"
        },
        "03": {
          "$ref": "#/$defs/stage"
        },
        "04": {
          "$ref": "#/$defs/stage"
        },
        "05": {
          "$ref": "#/$defs/stage"
        },
        "06": {
          "$ref": "#/$defs/stage"
        },
        "07": {
          "$ref": "#/$defs/stage"
        },
        "08": {
          "$ref": "#/$defs/stage"
        },
        "09": {
          "$ref": "#/$defs/stage"
        },
        "10": {
          "$ref": "#/$defs/stage"
        }
      }
    },
    "settings": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "muted",
        "volume"
      ],
      "properties": {
        "muted": {
          "type": "boolean"
        },
        "volume": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        }
      }
    }
  },
  "$defs": {
    "placement": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "type",
        "gridX",
        "gridY",
        "angleDeg"
      ],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^[A-Za-z0-9_-]{1,32}$"
        },
        "type": {
          "enum": [
            "ramp",
            "platform",
            "spring",
            "seesaw"
          ]
        },
        "gridX": {
          "type": "integer",
          "minimum": 0,
          "maximum": 40
        },
        "gridY": {
          "type": "integer",
          "minimum": 0,
          "maximum": 30
        },
        "angleDeg": {
          "type": "integer",
          "enum": [
            -60,
            -45,
            -30,
            -15,
            0,
            15,
            30,
            45,
            60
          ]
        }
      },
      "allOf": [
        {
          "if": {
            "properties": {
              "type": {
                "const": "spring"
              }
            }
          },
          "then": {
            "properties": {
              "angleDeg": {
                "enum": [
                  -45,
                  -30,
                  -15,
                  0,
                  15,
                  30,
                  45
                ]
              }
            }
          }
        },
        {
          "if": {
            "properties": {
              "type": {
                "enum": [
                  "platform",
                  "seesaw"
                ]
              }
            }
          },
          "then": {
            "properties": {
              "angleDeg": {
                "const": 0
              }
            }
          }
        }
      ]
    },
    "stage": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "progress",
        "draft",
        "currentBest",
        "previousBest"
      ],
      "properties": {
        "progress": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "cleared",
            "historicalBestStars"
          ],
          "properties": {
            "cleared": {
              "type": "boolean"
            },
            "historicalBestStars": {
              "anyOf": [
                {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 3
                },
                {
                  "type": "null"
                }
              ]
            }
          },
          "allOf": [
            {
              "if": {
                "properties": {
                  "cleared": {
                    "const": false
                  }
                }
              },
              "then": {
                "properties": {
                  "historicalBestStars": {
                    "const": 0
                  }
                }
              },
              "else": {
                "properties": {
                  "historicalBestStars": {
                    "enum": [
                      1,
                      2,
                      3,
                      null
                    ]
                  }
                }
              }
            }
          ]
        },
        "draft": {
          "anyOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "geometryId",
                "placements"
              ],
              "properties": {
                "geometryId": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128,
                  "pattern": "^[A-Za-z0-9._:-]+$"
                },
                "placements": {
                  "type": "array",
                  "maxItems": 13,
                  "items": {
                    "$ref": "#/$defs/placement"
                  }
                }
              }
            },
            {
              "type": "null"
            }
          ]
        },
        "currentBest": {
          "anyOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "compatibilityId",
                "physicsRulesVersion",
                "usedParts",
                "stars",
                "placements"
              ],
              "properties": {
                "compatibilityId": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128,
                  "pattern": "^[A-Za-z0-9._:-]+$"
                },
                "physicsRulesVersion": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128,
                  "pattern": "^[A-Za-z0-9._:-]+$"
                },
                "usedParts": {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 13
                },
                "stars": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 3
                },
                "placements": {
                  "type": "array",
                  "maxItems": 13,
                  "items": {
                    "$ref": "#/$defs/placement"
                  }
                }
              }
            },
            {
              "type": "null"
            }
          ]
        },
        "previousBest": {
          "anyOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "compatibilityId",
                "physicsRulesVersion",
                "usedParts",
                "stars",
                "placements"
              ],
              "properties": {
                "compatibilityId": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128,
                  "pattern": "^[A-Za-z0-9._:-]+$"
                },
                "physicsRulesVersion": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128,
                  "pattern": "^[A-Za-z0-9._:-]+$"
                },
                "usedParts": {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 13
                },
                "stars": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 3
                },
                "placements": {
                  "type": "array",
                  "maxItems": 13,
                  "items": {
                    "$ref": "#/$defs/placement"
                  }
                }
              }
            },
            {
              "type": "null"
            }
          ]
        }
      }
    }
  }
}
```
意味制約：id一意、型別角度、現在配置はD2共通validator。usedParts=placements.length、星=現行Tの式、currentBestは現行geometry/物理/判定/星目標に対応したeffective compatibility（正規データのhash）と一致。previousBestは旧版の構造整合だけ、現在の合法性は呼出時。旧目標値がなければ旧星を再計算せず歴代証跡として区別。cleared=falseならstars=0、cleared=trueは1〜3または復旧時null。矛盾は復旧確認で、架空実績を生成しない。解放=max既存正常clear+1、最大10、全達成は全10実績、null星は不明として表示。互換変更でcurrentBest→previousBest、旧記録しかなければ維持、合法draftは再検証して移行、旧bestを読込だけで昇格不可。
排他：INITIALIZING→OWNER/READ_ONLY/DEGRADED/RECOVERY_REQUIRED、REACQUIRING/RELEASING。exclusive ifAvailable、steal禁止、ロックcallbackのpromiseを保持、実行世代を発行、解放前無効化。OWNERのみ書込、他タブメモリプレイ。再取得時最新データ、未保存破棄の明示確認、取消で一時プレイ維持。hidden原則ロック保持、pagehide解放、BFCache復元は再取得・照合。API非対応は安全停止・5環境のMust保存が成立しなければHOLD、無断IndexedDBなし。
保存：操作確定ごと（有効配置/移動/回転/削除/Undo/reset/ベスト/クリア/音声設定）に最新メモリsnapshotを作成。仮操作/失敗/中止/軌跡/ヒントは書込なし。状態と所有世代確認、容量・正規化検証、旧raw照合→setItemまでawaitなし、revision+1、readback。rawが異なる場合停止。読戻し失敗は保存結果不明、再照合で新raw一致なら該当snapshotだけ成功、旧一致なら未保存、別rawなら競合停止、読込不可なら不明継続。メモリ編集世代と保存確認世代を別管理。B保存後C編集ならB確認でCを保存済みにしない。所有世代不一致の遅延処理は拒否。
復旧：構文不正/未知version/異常revisionは原文維持、メモリ内でのみ復旧候補、永続破壊は影響を示し明示確認、ロックとraw再照合後に実施。部分正常値を保護。全体初期化は確認後正規データ置換、正常revisionは単調増加、revision不明/上限なら新saveEpoch案（承認待ち）。成功確認前に実績消去完了表示不可。ブラウザ側削除・別オリジン・端末故障は保護対象外、Sites/Pagesは別保存領域。バックアップ・同期・import/exportは対象外。

## RC3 保存意味制約の補足案（saveEpoch採否は未承認）
- saveEpoch採用案：初回は暗号学的乱数16バイトを32桁小文字hexにする。通常書込・正常revisionの全体初期化では同一epochを保持しrevision+1。revisionが不明/上限なら通常書込禁止、明示的復旧または全体初期化を承認し、ロックと元raw再照合後、新epoch/revision0で一括置換。読み戻し成功まで完了扱いしない。乱数利用不可ならBLOCKED。epochはユーザー追跡用ではなく外部送信なし。
- geometryIdは座標系、部品寸法/許可角、予約領域、固定物、球初期位置/半径、ゴール保護、在庫、配置validatorの規則版を含む。compatibilityIdはgeometryIdに加えステージの必須使用、星目標、終端/時間/安定規則とphysicsRulesVersionを含む。physicsRulesVersionはengine配布SHA、採用PP、全物理数値、spring/seesawアルゴリズム版を含む。表示文言/素材は除外。UTF-8のキー辞書順・配列は意味順を保持・数値は有限、JSON compact、-0は0に正規化し、SHA-256を小文字64hexとする。正規化ルール版もハッシュ入力に含める。
- 現行ベストのusedParts、配置数、星、互換性、合法性を一括確認。cleared=falseなのに有効ベストあり、歴代星が現行星未満、未知フィールドや不正ID等は復旧候補を提示し確認までは永続書込なし。旧版の星は旧閾値が不明なら再計算せず過去の記録としてのみ保持。clearの根拠を勝手に捏造しない。
- 重複JSONキーを拒否するかは未確定（通常JSON.parseは後勝ち）。採用候補は保存validatorで重複キーを検出して元raw維持・復旧確認。新規依存を追加しない。

## RC4 最終レビュー案（方式はRC5で承認済み）
採用推奨：saveEpoch必須・重複キー拒否・互換性SHA-256。初回公開前のschemaVersion1の仕様補強とする。初回は16byte暗号学的乱数を小文字32hex。通常保存/正常revisionの全体初期化は同epochで+1。epoch欠落/不正又はrevision欠落/不正/上限の場合、通常書込禁止。復旧/全初期化の明示確認・所有世代・元raw照合の後、新epoch/revision0に一括置換。乱数利用不可は復旧BLOCKED。読戻し成功前は完了通知しない。所有世代・メモリ編集世代・saveEpochは別物。
重複JSONキーはJSONデコードされたキー単位で同一オブジェクト内に検出する（\uエスケープも同一扱い）。単純な正規表現/JSON.parse後の確認は禁止。新規依存を追加しない。構文・重複検出失敗時は元raw保護、永続復旧前に確認する。
互換ID生成の候補：正規JSON UTF8、オブジェクトキーをASCII辞書順（対象キーはASCII固定）、配列は意味順。順序に意味のない固定物・定義は種類/数値座標/角度/正規ID順に整列。数値は有限のECMAScript JSON.stringify表現、-0→0、文字列は正規JSON escape、追加フィールドは契約で列挙。domain separator: `game-0010/geometry/v1`・`game-0010/physics/v1`・`game-0010/compatibility/v1`をそれぞれ入力の先頭キーとして含める。SHA-256の小文字64hex。geometryはstageIdと合法性定義、physicsはengine配布SHA/PP/物理数値/作動アルゴリズム版、compatibilityはstageId/geometryId/physicsRulesVersion/必須使用・終端・星の規則。素材・表示文言・QA・操作IDは対象外。現行生成IDは64hex、旧記録は既存128 ASCII上限内の構造を許容しても現行一致の証明には使わない。現在の互換性IDを比較し、古い合法draftのみ明示した規則で再検証・復元。旧bestは呼出時の合法性確認、正常再クリアでのみ昇格。各アルゴリズム版と正規化対象の最終JSONキー一覧・既知hashベクトルは凍結前承認対象。
復旧時の進捗: cleared=falseならstars=0、trueなら1〜3またはnull。currentBest/previousBestが存在することだけでclearを作らない。整合に矛盾がある場合は正常値の候補を提示し、復旧確認前に元rawを変えない。旧版記録のusedParts=配置数と一意ID/型/許可角を確認、現行合法性は呼出時のみ。未対応schemaVersionは自動移行不可。

### RC4 互換性IDの固定入力契約案
正規JSONのトップレベルキーは次の候補に限定する。各値の単位・形状は04、08の承認済み定義を用いる。ハッシュはUTF-8のバイト列に対し、外側の空白/改行なし。domainを先頭に強制するのではなく、他キーと同じASCII辞書順にする（RC3/RC4前段の「先頭キー」記述はこの補足で上書き）。
| 識別子 | トップレベルキー候補 |
|---|---|
| geometryId | domain, stageId, world, grid, ballRadius, ballInitial, partShapes, fixedParts, obstacles, goalProtection, inventory, sweepEnvelope, validatorRulesVersion |
| physicsRulesVersion | domain, engineSha, profile, gravity, ball, materials, speedLimits, solver, collisionRulesVersion, spring, seesaw, physicsRulesVersionTag |
| compatibilityId | domain, stageId, geometryId, physicsRulesVersion, requiredUsage, goalRule, boundaryRule, timeLimit, terminalPriority, star3Target, evaluationRulesVersion |
上記の全nested key・単位・配列順序をE0で独断追加しない。正式凍結前にデータ構造を完全列挙すること。以下はキー順・domain分離・hash関数の独立テスト用の縮約サンプルであり、実際のステージIDではない。全整数/ASCII入力でPython標準SHA-256を使って期待値を計算した。正式canonicalizerのテストはTC-D5-037で、整数以外のES表現やUnicodeの追加確認も必要。
- 入力: `{"ballRadiusMm":200,"domain":"game-0010/geometry/v1","stageId":"01"}`
  - SHA-256: `cb7a214a6389f6c4b577e302f5df5a7d4e7a4e8d8785c402da3ee0e2c3d9add7`
- 入力: `{"domain":"game-0010/physics/v1","engineSha":"0000000000000000000000000000000000000000000000000000000000000000","gravityMilli":9800,"profile":"PP-01"}`
  - SHA-256: `b3953799661936fd1a20493936e7c5f9d284e63828771d7fa38b63119df6cb2b`
- 入力: `{"domain":"game-0010/compatibility/v1","geometryId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","physicsRulesVersion":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","stageId":"01","star3Target":1}`
  - SHA-256: `b571d1263eae608b64819ccd631a8ba7871145b68405763d1ec3d5d19ab5489c`

## RC5 保存契約補足（採用方式は承認済み、下記の厳密なキー契約は凍結候補）
- 構造判定と意味判定を分離。rawがnullなら初期生成、空文字は破損。文字列長はUTF-16 code unit、65536以下。JSON字句を読み取り、同一object内のデコード済みkeyをSet相当で照合（エスケープ後同名も拒否、別objectの同名は許可）。重複・構文異常・非有限・未知root/versionは通常保存を禁止し、原rawを保持。通常JSON.parseの後勝ちや正規表現だけの判定は不可。
- epochは32桁小文字hex、暗号学的乱数16byte。初回に発行。通常保存・正常revisionの全初期化は同epochで+1。epoch/revision異常・上限でのみ明示確認後の新epoch/revision0。新epochは旧epochと異なる値を確認。正常版復旧でも元raw照合、所有世代確認が必須。未対応新版は破損部分復旧で書き換えない（専用全体初期化の明示確認を除く）。同じepoch/revisionでもraw差分で競合検知。
- 保存結果不明：試行のoldRaw/newRaw/編集世代/所有世代を保持。再読込newRaw一致は当該世代まで成功、現在の編集世代が先なら未保存表示。oldRaw一致は未保存、他値は競合、読込例外は不明維持。再照合前の書込不可。権限喪失で旧処理無効。全初期化はreadback前にメモリの実績を消さない。非協調writerを完全排除する保証なし。
- 互換IDは各下記payloadをUTF-8のコンパクト正規JSONにしてSHA-256小文字64hex。objectは全階層ASCIIキー辞書順、arrayは指定順、数値は有限ECMAScript JSON.stringify表現（-0→0）、Unicode文字列はJSON escape。未知/欠落キーはエラー、nullは明示された場合のみ。表示文言、UI素材、操作ID、QA結果、タイムスタンプを対象外。各規則版は承認済み意味規則の変更時に変更し、ファイル差分検証で版更新漏れを拒否。バージョンタグは初回 `v1`、単なるリファクタでは変更不要。
### nested payload 契約案（単位 m, kg, s, rad/s、角度は度。整数tick）
| ID | キー | 値の型・順序 |
|---|---|---|
| geometryId | domain,stageId | 固定domain、2桁ID |
| geometryId | world | {widthM,heightM} |
| geometryId | grid | {logicalWidth,logicalHeight,logicalStep,unitsPerM,origin,angleConvention,snapRule}、origin=top-left、angleConvention=clockwise、snapRule=floor-half-up |
| geometryId | ballRadius,ballInitial | radiusM数値、{xM,yM} |
| geometryId | partShapes | {type,widthM,heightM,allowedAnglesDeg,anchor}の配列、type ASCII順、角昇順、anchor=center（板は支点） |
| geometryId | fixedParts | {type,xM,yM,angleDeg}配列、type,x,y,angle順 |
| geometryId | obstacles | {xM,yM,widthM,heightM}配列、x,y,w,h順 |
| geometryId | goalProtection | {originXM,originYM,minXM,maxXM,minYM,maxYM}、境界はlocal |
| geometryId | inventory | {ramp,platform,spring,seesaw}整数 |
| geometryId | sweepEnvelope | {anglesDeg,expandM}角昇順 |
| geometryId | validatorRulesVersion | 文字列（D2規則・誤差含む） |
| physicsRulesVersion | domain,engineSha,profile | 固定domain、runtime配布SHA64hex、PP-01/02/03 |
| physicsRulesVersion | gravity,ball | {x,y}、{radiusM,massKg,linearDamping,angularDamping,bullet,rotationEnabled} |
| physicsRulesVersion | materials | {ball,ramp,platform,spring,seesaw,obstacle,goal}、各 {friction,restitution} |
| physicsRulesVersion | speedLimits | {ballLinearCap,ballAngularCap,abnormalBallLinear,abnormalBallAngular,abnormalBoardLinear,abnormalBoardAngular} |
| physicsRulesVersion | solver | {gameHz,substeps,velocityIterations,positionIterations,allowSleep} |
| physicsRulesVersion | collisionRulesVersion | 文字列（tick順・CCD・誤差含む） |
| physicsRulesVersion | spring | {launchSpeed,approachMin,normalAngleMax,faceDistanceMax,endGapMax,blockDotMax,releaseGapMin,releaseTicks,algorithmVersion} |
| physicsRulesVersion | seesaw | {limitDeg,massRatio,angularDamping,motorEnabled,algorithmVersion} |
| physicsRulesVersion | physicsRulesVersionTag | 文字列 |
| compatibilityId | domain,stageId,geometryId,physicsRulesVersion | 固定domain、ID、生成済64hex 2件 |
| compatibilityId | requiredUsage | {type,ruleVersion}、typeはnone/ramp/rotated-ramp/platform/spring/seesaw |
| compatibilityId | goalRule | {innerMinX,innerMaxX,innerMinY,innerMaxY,speedMax,stableTicks,comparisonEpsilonM,ruleVersion} |
| compatibilityId | boundaryRule | {mode,ruleVersion}、mode=edge-lines |
| compatibilityId | timeLimit,terminalPriority | {maxTicks,gameHz}、[ERROR,CLEAR,REQUIRED_MISSING,OUT_OF_BOUNDS,TIMEOUT,CONTINUE]順 |
| compatibilityId | star3Target,evaluationRulesVersion | 整数、文字列 |
数値は04/07の固定値またはE5までの許可済み選定値。異常角速度など未承認の数値は未設定のまま凍結不可。各規則版がカバーする詳細定義（たとえばゴールFixture寸法、バネ面・力積閾値、板有効使用規則）が変更されれば対応規則版変更必須。実際の配布SHAはE0取得前に捏造しない。縮約hashベクトル3件はhash/キー順の検証であって上記full payloadの完全性を証明しない。
- 現行生成IDは64hex。旧記録の128 ASCII上限は構造読込用に維持し、現在の合法性は再検証。geometryId変更後の合法draftは移行できるが、非互換bestはcurrentに昇格不可。保存schema単独ではid一意、角度、合法性、usedParts=length、星と現行目標、progress整合を保証しない。


## RC6 現行保存契約（FD-12）
RC5 nested payload表の全キー・単位・順序を採用方針に反映。各IDのdomainはRC4表の固定文字列、ASCII辞書順・ECMAScript JSON.stringifyの有限数表現（-0は0）・UTF-8、SHA-256小文字64hex、未知/欠落キーは拒否。トップ/ネストキーはRC5表を正とし、ballRadiusは数値m。規則版は初回v1。物理の全閾値（FD-01〜04を含む）や幾何/ゴールfixture/接触観測/必須使用の規範を変更する場合は、対応する規則版の変更を承認と共に必須とする。数値候補の選定によるID変化はE0〜E5で固定・記録し、実際の配布SHAはE0で取得した値を使う。ID生成処理はゲーム保存の個人識別とは無関係、外部通信なし。
saveEpoch/重複キー/意味制約はRC5承認済み。最大容量テストは構造ストレスと合法データの復元を分ける。構造的な上限13×3×10件のデータが現行在庫に合法であるとはみなさない。正式な全payloadの独立期待値は縮約ベクトル3件とは別であり、生成前に入力と期待値を確定する必要がある。RC6では全payloadの固定期待値が未作成であり、FIN-02の残りとして扱う。技術実証と期待値の作成を混同しない。


## RC6 全キー固定テストベクトル（追補・直前の未作成記述を更新）
次の3つはRC5 nested表の全キーを含む固定QA入力。ST01初期定義と初期物理設定を例にし、engineShaはQA専用の全0（実際の配布ハッシュではない）。canonical文字列はPython標準のJSON文字列escapeと10進数表記による独立計算（この固定入力の数値は整数または絶対値1e-6以上の短い有限小数）で作成し、SHA-256はhashlib。実行時のcanonicalizer自身から期待値を生成していない。正式版のruntime hashを示すものではない。実際のECMAScript正規化・変異試験はE7で実証。
### geometryId
```json
{
  "domain": "game-0010/geometry/v1",
  "stageId": "01",
  "world": {
    "widthM": 9.6,
    "heightM": 7.2
  },
  "grid": {
    "logicalWidth": 960,
    "logicalHeight": 720,
    "logicalStep": 24,
    "unitsPerM": 100,
    "origin": "top-left",
    "angleConvention": "clockwise",
    "snapRule": "floor-half-up"
  },
  "ballRadius": 0.2,
  "ballInitial": {
    "xM": 0.72,
    "yM": 6.84
  },
  "partShapes": [
    {
      "type": "platform",
      "widthM": 1.2,
      "heightM": 0.16,
      "allowedAnglesDeg": [
        0
      ],
      "anchor": "center"
    },
    {
      "type": "ramp",
      "widthM": 1.68,
      "heightM": 0.16,
      "allowedAnglesDeg": [
        -60,
        -45,
        -30,
        -15,
        0,
        15,
        30,
        45,
        60
      ],
      "anchor": "center"
    },
    {
      "type": "seesaw",
      "widthM": 1.92,
      "heightM": 0.16,
      "allowedAnglesDeg": [
        0
      ],
      "anchor": "center"
    },
    {
      "type": "spring",
      "widthM": 0.72,
      "heightM": 0.24,
      "allowedAnglesDeg": [
        -45,
        -30,
        -15,
        0,
        15,
        30,
        45
      ],
      "anchor": "center"
    }
  ],
  "fixedParts": [
    {
      "type": "ramp",
      "xM": 1.2,
      "yM": 6.24,
      "angleDeg": 15
    }
  ],
  "obstacles": [],
  "goalProtection": {
    "originXM": 4.56,
    "originYM": 2.88,
    "minXM": -0.76,
    "maxXM": 0.76,
    "minYM": -0.16,
    "maxYM": 0.8
  },
  "inventory": {
    "ramp": 1,
    "platform": 0,
    "spring": 0,
    "seesaw": 0
  },
  "sweepEnvelope": {
    "anglesDeg": [
      -32,
      -30,
      -25,
      -20,
      -15,
      -10,
      -5,
      0,
      5,
      10,
      15,
      20,
      25,
      30,
      32
    ],
    "expandM": 0.065
  },
  "validatorRulesVersion": "v1"
}
```
正規文字列（末尾改行なし）:
```json
{"ballInitial":{"xM":0.72,"yM":6.84},"ballRadius":0.2,"domain":"game-0010/geometry/v1","fixedParts":[{"angleDeg":15,"type":"ramp","xM":1.2,"yM":6.24}],"goalProtection":{"maxXM":0.76,"maxYM":0.8,"minXM":-0.76,"minYM":-0.16,"originXM":4.56,"originYM":2.88},"grid":{"angleConvention":"clockwise","logicalHeight":720,"logicalStep":24,"logicalWidth":960,"origin":"top-left","snapRule":"floor-half-up","unitsPerM":100},"inventory":{"platform":0,"ramp":1,"seesaw":0,"spring":0},"obstacles":[],"partShapes":[{"allowedAnglesDeg":[0],"anchor":"center","heightM":0.16,"type":"platform","widthM":1.2},{"allowedAnglesDeg":[-60,-45,-30,-15,0,15,30,45,60],"anchor":"center","heightM":0.16,"type":"ramp","widthM":1.68},{"allowedAnglesDeg":[0],"anchor":"center","heightM":0.16,"type":"seesaw","widthM":1.92},{"allowedAnglesDeg":[-45,-30,-15,0,15,30,45],"anchor":"center","heightM":0.24,"type":"spring","widthM":0.72}],"stageId":"01","sweepEnvelope":{"anglesDeg":[-32,-30,-25,-20,-15,-10,-5,0,5,10,15,20,25,30,32],"expandM":0.065},"validatorRulesVersion":"v1","world":{"heightM":7.2,"widthM":9.6}}
```
期待SHA-256: `c43f9098db281443248095daf4836acfaddf6750c896df3859e61e1ad5013f36`

### physicsRulesVersion
```json
{
  "domain": "game-0010/physics/v1",
  "engineSha": "0000000000000000000000000000000000000000000000000000000000000000",
  "profile": "PP-01",
  "gravity": {
    "x": 0,
    "y": -9.8
  },
  "ball": {
    "radiusM": 0.2,
    "massKg": 0.2,
    "linearDamping": 0.04,
    "angularDamping": 0.05,
    "bullet": true,
    "rotationEnabled": true
  },
  "materials": {
    "ball": {
      "friction": 0.35,
      "restitution": 0.05
    },
    "ramp": {
      "friction": 0.3,
      "restitution": 0.05
    },
    "platform": {
      "friction": 0.5,
      "restitution": 0.05
    },
    "spring": {
      "friction": 0.3,
      "restitution": 0
    },
    "seesaw": {
      "friction": 0.4,
      "restitution": 0.05
    },
    "obstacle": {
      "friction": 0.45,
      "restitution": 0.05
    },
    "goal": {
      "friction": 0.7,
      "restitution": 0
    }
  },
  "speedLimits": {
    "ballLinearCap": 12,
    "ballAngularCap": 60,
    "abnormalBallLinear": 30,
    "abnormalBallAngular": 150,
    "abnormalBoardLinear": 30,
    "abnormalBoardAngular": 150
  },
  "solver": {
    "gameHz": 60,
    "substeps": 1,
    "velocityIterations": 8,
    "positionIterations": 3,
    "allowSleep": false
  },
  "collisionRulesVersion": "v1",
  "spring": {
    "launchSpeed": 9.5,
    "approachMin": 0.4,
    "normalAngleMax": 30,
    "faceDistanceMax": 0.025,
    "endGapMax": 0.25,
    "blockDotMax": -0.5,
    "releaseGapMin": 0.04,
    "releaseTicks": 2,
    "algorithmVersion": "v1"
  },
  "seesaw": {
    "limitDeg": 30,
    "massRatio": 1.5,
    "angularDamping": 1.2,
    "motorEnabled": false,
    "algorithmVersion": "v1"
  },
  "physicsRulesVersionTag": "v1"
}
```
正規文字列（末尾改行なし）:
```json
{"ball":{"angularDamping":0.05,"bullet":true,"linearDamping":0.04,"massKg":0.2,"radiusM":0.2,"rotationEnabled":true},"collisionRulesVersion":"v1","domain":"game-0010/physics/v1","engineSha":"0000000000000000000000000000000000000000000000000000000000000000","gravity":{"x":0,"y":-9.8},"materials":{"ball":{"friction":0.35,"restitution":0.05},"goal":{"friction":0.7,"restitution":0},"obstacle":{"friction":0.45,"restitution":0.05},"platform":{"friction":0.5,"restitution":0.05},"ramp":{"friction":0.3,"restitution":0.05},"seesaw":{"friction":0.4,"restitution":0.05},"spring":{"friction":0.3,"restitution":0}},"physicsRulesVersionTag":"v1","profile":"PP-01","seesaw":{"algorithmVersion":"v1","angularDamping":1.2,"limitDeg":30,"massRatio":1.5,"motorEnabled":false},"solver":{"allowSleep":false,"gameHz":60,"positionIterations":3,"substeps":1,"velocityIterations":8},"speedLimits":{"abnormalBallAngular":150,"abnormalBallLinear":30,"abnormalBoardAngular":150,"abnormalBoardLinear":30,"ballAngularCap":60,"ballLinearCap":12},"spring":{"algorithmVersion":"v1","approachMin":0.4,"blockDotMax":-0.5,"endGapMax":0.25,"faceDistanceMax":0.025,"launchSpeed":9.5,"normalAngleMax":30,"releaseGapMin":0.04,"releaseTicks":2}}
```
期待SHA-256: `d695cd86ad37f671c74c97c00232fff095499c314b644d29b03c89cf4b014aa4`

### compatibilityId
```json
{
  "domain": "game-0010/compatibility/v1",
  "stageId": "01",
  "geometryId": "c43f9098db281443248095daf4836acfaddf6750c896df3859e61e1ad5013f36",
  "physicsRulesVersion": "d695cd86ad37f671c74c97c00232fff095499c314b644d29b03c89cf4b014aa4",
  "requiredUsage": {
    "type": "ramp",
    "ruleVersion": "v1"
  },
  "goalRule": {
    "innerMinX": -0.61,
    "innerMaxX": 0.61,
    "innerMinY": -0.01,
    "innerMaxY": 0.72,
    "speedMax": 0.15,
    "stableTicks": 30,
    "comparisonEpsilonM": 1e-06,
    "ruleVersion": "v1"
  },
  "boundaryRule": {
    "mode": "edge-lines",
    "ruleVersion": "v1"
  },
  "timeLimit": {
    "maxTicks": 1200,
    "gameHz": 60
  },
  "terminalPriority": [
    "ERROR",
    "CLEAR",
    "REQUIRED_MISSING",
    "OUT_OF_BOUNDS",
    "TIMEOUT",
    "CONTINUE"
  ],
  "star3Target": 1,
  "evaluationRulesVersion": "v1"
}
```
正規文字列（末尾改行なし）:
```json
{"boundaryRule":{"mode":"edge-lines","ruleVersion":"v1"},"domain":"game-0010/compatibility/v1","evaluationRulesVersion":"v1","geometryId":"c43f9098db281443248095daf4836acfaddf6750c896df3859e61e1ad5013f36","goalRule":{"comparisonEpsilonM":0.000001,"innerMaxX":0.61,"innerMaxY":0.72,"innerMinX":-0.61,"innerMinY":-0.01,"ruleVersion":"v1","speedMax":0.15,"stableTicks":30},"physicsRulesVersion":"d695cd86ad37f671c74c97c00232fff095499c314b644d29b03c89cf4b014aa4","requiredUsage":{"ruleVersion":"v1","type":"ramp"},"stageId":"01","star3Target":1,"terminalPriority":["ERROR","CLEAR","REQUIRED_MISSING","OUT_OF_BOUNDS","TIMEOUT","CONTINUE"],"timeLimit":{"gameHz":60,"maxTicks":1200}}
```
期待SHA-256: `5defe4ecf08cfb649b105c96b1d837e5d59d96e8c5ab15ea3828fbd221291052`
