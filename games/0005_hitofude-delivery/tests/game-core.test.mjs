import test from "node:test";
import assert from "node:assert/strict";
import { getStage } from "../src/stages.js";
import {
  calculateScore,
  createGameState,
  getCollectedParcelKeys,
  getLegalForwardMoves,
  isDeadEnd,
  moveTo,
  resetRoute,
  undoMove,
} from "../src/game-core.js";

const stage1 = getStage(1);

test("GC-01: 新規開始は開始マス・未回収・全カウンター0・playing", () => {
  const state = createGameState(stage1);
  assert.deepEqual(state.route, [[0, 0]]);
  assert.equal(getCollectedParcelKeys(stage1, state.route).size, 0);
  assert.deepEqual([state.undoCount, state.resetCount, state.hintCount, state.status], [0, 0, 0, "playing"]);
});

test("GC-02: 上下左右の空き隣接セルへ進める", () => {
  const result = moveTo(createGameState(stage1), stage1, [0, 1]);
  assert.equal(result.outcome, "moved");
  assert.deepEqual(result.state.route, [[0, 0], [0, 1]]);
});

test("GC-03: 斜めと2マス先は状態を変えない", () => {
  const initial = createGameState(stage1);
  for (const target of [[1, 1], [0, 2]]) {
    const result = moveTo(initial, stage1, target);
    assert.equal(result.changed, false);
    assert.deepEqual(result.state.route, initial.route);
    assert.equal(calculateScore(result.state), 1000);
  }
});

test("GC-04: 盤外と壁セルは状態を変えない", () => {
  const stage2 = getStage(2);
  let state = moveTo(createGameState(stage2), stage2, [0, 1]).state;
  assert.equal(moveTo(state, stage2, [-1, 1]).changed, false);
  assert.equal(moveTo(state, stage2, [1, 1]).outcome, "wall");
});

test("GC-05: 直前以外の訪問済みセルへ再訪問できない", () => {
  let state = createGameState(stage1);
  for (const cell of [[0, 1], [1, 1], [1, 0]]) state = moveTo(state, stage1, cell).state;
  const result = moveTo(state, stage1, [0, 0]);
  assert.equal(result.outcome, "visited");
  assert.deepEqual(result.state.route, state.route);
});

test("GC-06: 直前セル指定と戻るボタンは同じ1マス戻る処理", () => {
  const moved = moveTo(createGameState(stage1), stage1, [0, 1]).state;
  const byCell = moveTo(moved, stage1, [0, 0]).state;
  const byButton = undoMove(moved).state;
  assert.deepEqual(byCell.route, byButton.route);
  assert.equal(byCell.undoCount, 1);
  assert.equal(byButton.undoCount, 1);
});

test("GC-07: 荷物マスを経路から除くと回収数が減る", () => {
  let state = createGameState(stage1);
  for (const cell of [[0, 1], [0, 2], [1, 2]]) state = moveTo(state, stage1, cell).state;
  assert.equal(getCollectedParcelKeys(stage1, state.route).size, 1);
  state = undoMove(state).state;
  assert.equal(getCollectedParcelKeys(stage1, state.route).size, 0);
});

test("GC-08: 有効リセットだけ回数を増やし開始マスへ戻す", () => {
  const initial = createGameState(stage1);
  assert.equal(resetRoute(initial, stage1).state.resetCount, 0);
  const moved = moveTo(initial, stage1, [0, 1]).state;
  const reset = resetRoute(moved, stage1).state;
  assert.deepEqual(reset.route, [[0, 0]]);
  assert.equal(reset.resetCount, 1);
});

test("GC-09: 荷物未回収のゴール進入を拒否する", () => {
  let state = createGameState(stage1);
  for (const cell of [[1, 0], [2, 0], [3, 0], [3, 1], [3, 2]]) state = moveTo(state, stage1, cell).state;
  const result = moveTo(state, stage1, [3, 3]);
  assert.equal(result.outcome, "early-goal");
  assert.equal(result.state.status, "playing");
});

test("GC-10: 全荷物回収後のゴールで一度だけクリアする", () => {
  let state = createGameState(stage1);
  for (const cell of stage1.exampleRoute.slice(1)) state = moveTo(state, stage1, cell).state;
  assert.equal(state.status, "cleared");
  const snapshot = structuredClone(state);
  const extra = moveTo(state, stage1, [3, 2]);
  assert.equal(extra.outcome, "inactive");
  assert.deepEqual(extra.state, snapshot);
});

test("IR-0005-02A: ステージ3の最短再現ルートで直ちに行き止まりを判定する", () => {
  const stage3 = getStage(3);
  let state = createGameState(stage3);
  for (const cell of [[1, 0], [1, 1]]) state = moveTo(state, stage3, cell).state;
  const before = structuredClone(state);
  const result = moveTo(state, stage3, [0, 1]);
  assert.equal(result.outcome, "dead-end");
  assert.equal(result.state.message, "dead-end");
  assert.equal(isDeadEnd(result.state, stage3), true);
  assert.deepEqual([result.state.undoCount, result.state.resetCount, result.state.hintCount], [0, 0, 0]);
  assert.equal(result.state.route.length, before.route.length + 1);
});

test("IR-0005-02B: 合法な前進がある通常経路を行き止まりと誤判定しない", () => {
  const result = moveTo(createGameState(stage1), stage1, [0, 1]);
  assert.equal(result.outcome, "moved");
  assert.equal(isDeadEnd(result.state, stage1), false);
  assert.ok(getLegalForwardMoves(result.state, stage1).length > 0);
});

test("IR-0005-02C: 未回収荷物を残したゴールだけが空いていても前進候補に数えない", () => {
  const stage = {
    id: 97,
    size: 3,
    start: [0, 0],
    goal: [0, 2],
    parcels: [[2, 2]],
    walls: [[1, 1], [1, 2]],
  };
  const result = moveTo(createGameState(stage), stage, [0, 1]);
  assert.equal(result.outcome, "dead-end");
  assert.deepEqual(getLegalForwardMoves(result.state, stage), []);
});

test("IR-0005-02D: 行き止まりから戻る・リセットすると行き止まり案内を解除する", () => {
  const stage3 = getStage(3);
  let state = createGameState(stage3);
  for (const cell of [[1, 0], [1, 1], [0, 1]]) state = moveTo(state, stage3, cell).state;
  assert.equal(state.message, "dead-end");
  const undone = undoMove(state).state;
  assert.equal(undone.message, "undo");
  assert.equal(isDeadEnd(undone, stage3), false);
  const reset = resetRoute(state, stage3).state;
  assert.equal(reset.message, "reset");
  assert.equal(isDeadEnd(reset, stage3), false);
});

