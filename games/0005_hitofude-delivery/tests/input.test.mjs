import test from "node:test";
import assert from "node:assert/strict";
import { createGameState, moveTo } from "../src/game-core.js";
import { cellsAlongAxis, PointerInputAdapter } from "../src/input.js";
import { getStage } from "../src/stages.js";

test("IN-01: クリック／タップ相当の1セル入力を一度だけ渡す", () => {
  const received = [];
  const adapter = new PointerInputAdapter((cell) => received.push(cell));
  adapter.pointerDown(1, [0, 1]);
  adapter.pointerUp(1);
  assert.deepEqual(received, [[0, 1]]);
});

test("IN-02: ドラッグとセル列入力は同じ経路・回収状態", () => {
  const stage = getStage(1);
  const route = [[0, 1], [0, 2], [1, 2]];
  let tapped = createGameState(stage);
  for (const cell of route) tapped = moveTo(tapped, stage, cell).state;
  let dragged = createGameState(stage);
  const adapter = new PointerInputAdapter((cell) => { dragged = moveTo(dragged, stage, cell).state; });
  adapter.pointerDown(1, [0, 0]);
  for (const cell of route) adapter.pointerMove(1, cell);
  adapter.pointerUp(1);
  assert.deepEqual(dragged.route, tapped.route);
});

test("IN-03: 高速な直線横断を隣接セル列へ補間する", () => {
  assert.deepEqual(cellsAlongAxis([0, 0], [0, 3]), [[0, 1], [0, 2], [0, 3]]);
  assert.deepEqual(cellsAlongAxis([3, 2], [0, 2]), [[2, 2], [1, 2], [0, 2]]);
});

test("IN-04: 斜めドラッグを勝手な直交ルートへ変換しない", () => {
  assert.deepEqual(cellsAlongAxis([0, 0], [1, 1]), [[1, 1]]);
  const stage = getStage(1);
  let state = createGameState(stage);
  for (const cell of cellsAlongAxis([0, 0], [1, 1])) state = moveTo(state, stage, cell).state;
  assert.deepEqual(state.route, [[0, 0]]);
});

test("IN-05: pointerup／pointercancel後も確定済み経路を維持し再開可能", () => {
  const received = [];
  const adapter = new PointerInputAdapter((cell) => received.push(cell));
  adapter.pointerDown(1, [0, 0]);
  adapter.pointerMove(1, [0, 1]);
  adapter.pointerCancel(1);
  adapter.pointerDown(2, [0, 2]);
  adapter.pointerUp(2);
  assert.deepEqual(received, [[0, 0], [0, 1], [0, 2]]);
});

test("IN-06: 2本目ポインターと重複終了イベントを拒否", () => {
  const received = [];
  const adapter = new PointerInputAdapter((cell) => received.push(cell));
  assert.equal(adapter.pointerDown(1, [0, 0]), true);
  assert.equal(adapter.pointerDown(2, [0, 1]), false);
  assert.equal(adapter.pointerMove(2, [0, 2]), false);
  assert.equal(adapter.pointerUp(2), false);
  assert.equal(adapter.pointerUp(1), true);
  assert.equal(adapter.pointerUp(1), false);
  assert.deepEqual(received, [[0, 0]]);
});

