import test from "node:test";
import assert from "node:assert/strict";

import {
  applyPanelMove,
  cloneBoard,
  createPlayState,
  isSolved,
  SCREEN,
  toggleCross,
  validateBoard,
} from "../game-logic.mjs";

const empty3 = () => Array.from({ length: 3 }, () => [0, 0, 0]);
const empty4 = () => Array.from({ length: 4 }, () => [0, 0, 0, 0]);

test("TC-004: 3x3中央は自身と上下左右の5マスだけを反転する", () => {
  assert.deepEqual(toggleCross(empty3(), 1, 1), [
    [0, 1, 0],
    [1, 1, 1],
    [0, 1, 0],
  ]);
});

test("TC-005: 3x3左上角は範囲内の3マスだけを反転する", () => {
  assert.deepEqual(toggleCross(empty3(), 0, 0), [
    [1, 1, 0],
    [1, 0, 0],
    [0, 0, 0],
  ]);
});

test("TC-006: 4x4上辺中央は自身・左右・下の4マスだけを反転する", () => {
  assert.deepEqual(toggleCross(empty4(), 0, 1), [
    [1, 1, 1, 0],
    [0, 1, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
});

test("TC-007: 斜め位置は反転しない", () => {
  const result = toggleCross(empty3(), 1, 1);
  assert.equal(result[0][0], 0);
  assert.equal(result[0][2], 0);
  assert.equal(result[2][0], 0);
  assert.equal(result[2][2], 0);
});

test("TC-008: 同じマスを2回操作すると盤面は戻り、手数は2増える", () => {
  const original = [
    [1, 0, 1],
    [0, 1, 0],
    [1, 0, 1],
  ];
  let state = createPlayState(1, original);
  state = applyPanelMove(state, 0, 0).state;
  state = applyPanelMove(state, 0, 0).state;
  assert.deepEqual(state.board, original);
  assert.equal(state.moveCount, 2);
});

test("TC-009: 反転処理は入力盤面と行配列を変更しない", () => {
  const original = [
    [0, 1, 0],
    [1, 1, 1],
    [0, 1, 0],
  ];
  const snapshot = structuredClone(original);
  const result = toggleCross(original, 1, 1);
  assert.deepEqual(original, snapshot);
  assert.notStrictEqual(result, original);
  result.forEach((row, index) => assert.notStrictEqual(row, original[index]));
  const copy = cloneBoard(original);
  copy.forEach((row, index) => assert.notStrictEqual(row, original[index]));
});

test("TC-010: 全消灯のときだけクリア判定がtrueになる", () => {
  assert.equal(isSolved(empty3()), true);
  assert.equal(isSolved([[1, 0], [0, 0]]), false);
  assert.equal(isSolved([[1, 1], [0, 0]]), false);
});

test("TC-011: 不正盤面と範囲外座標は例外で安全に拒否される", () => {
  const valid = empty3();
  const snapshot = structuredClone(valid);
  assert.equal(validateBoard([[0, 1], [1]]), false);
  assert.equal(validateBoard([[0, 2], [1, 0]]), false);
  assert.throws(() => toggleCross([[0, 1], [1]], 0, 0), TypeError);
  assert.throws(() => toggleCross(valid, -1, 0), RangeError);
  assert.throws(() => toggleCross(valid, 0, 3), RangeError);
  assert.deepEqual(valid, snapshot);
});

test("TC-016/017: 全消灯後は結果状態へ1回だけ遷移し追加入力を無視する", () => {
  const initial = [
    [0, 1, 0],
    [1, 1, 1],
    [0, 1, 0],
  ];
  const first = applyPanelMove(createPlayState(1, initial), 1, 1, 6);
  assert.equal(first.solved, true);
  assert.equal(first.state.screen, SCREEN.CLEARED);
  assert.equal(first.state.moveCount, 1);
  const second = applyPanelMove(first.state, 1, 1, 6);
  assert.equal(second.moved, false);
  assert.strictEqual(second.state, first.state);
  assert.equal(second.state.moveCount, 1);
});

test("TC-020: 最終ステージの全消灯はALL_CLEAREDへ遷移する", () => {
  const initial = [
    [0, 1, 0],
    [1, 1, 1],
    [0, 1, 0],
  ];
  const outcome = applyPanelMove(createPlayState(6, initial), 1, 1, 6);
  assert.equal(outcome.state.screen, SCREEN.ALL_CLEARED);
});
