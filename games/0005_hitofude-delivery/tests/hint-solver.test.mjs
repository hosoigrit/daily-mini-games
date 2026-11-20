import test from "node:test";
import assert from "node:assert/strict";
import { applyHintResult, createGameState, isAdjacent, moveTo, sameCoord } from "../src/game-core.js";
import { solveHint } from "../src/hint-solver.js";
import { getStage } from "../src/stages.js";

test("HT-01: 解答のある経路で合法な次の1マスをFOUND", () => {
  const stage = getStage(1);
  const state = createGameState(stage);
  const result = solveHint(stage, state);
  assert.equal(result.status, "FOUND");
  assert.equal(isAdjacent(stage.start, result.nextCell), true);
});

test("HT-02: 模範経路と異なる解答可能経路からもヒント", () => {
  const stage = { id: 99, size: 3, start: [0, 0], goal: [2, 2], parcels: [[1, 1]], walls: [] };
  let state = createGameState(stage);
  state = moveTo(state, stage, [1, 0]).state;
  const result = solveHint(stage, state);
  assert.equal(result.status, "FOUND");
  assert.equal(isAdjacent([1, 0], result.nextCell), true);
  assert.equal(independentCompletionExists(stage, [...state.route, result.nextCell]), true);
});

test("HT-03: 前進解なしはNO_SOLUTIONで無消費", () => {
  const stage = { id: 98, size: 3, start: [0, 0], goal: [2, 2], parcels: [[0, 2]], walls: [[1, 2]] };
  const state = { ...createGameState(stage), route: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 2]], inputRevision: 4 };
  const result = solveHint(stage, state);
  assert.equal(result.status, "NO_SOLUTION");
  const applied = applyHintResult(state, result, 4);
  assert.equal(applied.state.hintCount, 0);
});

test("HT-04: 極小探索上限はUNAVAILABLEで無消費", () => {
  const stage = getStage(6);
  const state = createGameState(stage);
  const result = solveHint(stage, state, { nodeLimit: 0, timeLimitMs: 1000 });
  assert.equal(result.status, "UNAVAILABLE");
  assert.equal(applyHintResult(state, result, 0).state.hintCount, 0);
});

test("HT-05: 成功ヒント2回後の3回目は消費しない", () => {
  let state = createGameState(getStage(1));
  state = applyHintResult(state, { status: "FOUND", nextCell: [0, 1] }, state.inputRevision).state;
  state = applyHintResult(state, { status: "FOUND", nextCell: [0, 1] }, state.inputRevision).state;
  const third = applyHintResult(state, { status: "FOUND", nextCell: [0, 1] }, state.inputRevision);
  assert.equal(third.outcome, "hint-limit");
  assert.equal(third.state.hintCount, 2);
});

test("HT-06: 同一ヒント結果の二重適用をrevisionで拒否", () => {
  const initial = createGameState(getStage(1));
  const first = applyHintResult(initial, { status: "FOUND", nextCell: [0, 1] }, 0).state;
  const duplicate = applyHintResult(first, { status: "FOUND", nextCell: [0, 1] }, 0);
  assert.equal(duplicate.outcome, "stale-hint");
  assert.equal(duplicate.state.hintCount, 1);
});

test("HT-07: 計算中に経路が変わった古い結果を拒否", () => {
  const stage = getStage(1);
  const initial = createGameState(stage);
  const oldResult = solveHint(stage, initial);
  const moved = moveTo(initial, stage, [0, 1]).state;
  const applied = applyHintResult(moved, oldResult, initial.inputRevision);
  assert.equal(applied.outcome, "stale-hint");
  assert.equal(applied.state.hintCount, 0);
});

test("HT-08: ヒントは隣接セルだけ返し経路を自動更新しない", () => {
  const stage = getStage(3);
  const state = createGameState(stage);
  const before = structuredClone(state.route);
  const result = solveHint(stage, state);
  assert.equal(result.status, "FOUND");
  assert.equal(isAdjacent(state.route.at(-1), result.nextCell), true);
  assert.deepEqual(state.route, before);
});

function independentCompletionExists(stage, route) {
  const visited = new Set(route.map((cell) => cell.join(",")));
  const parcels = new Set(stage.parcels.map((cell) => cell.join(",")));
  const walls = new Set(stage.walls.map((cell) => cell.join(",")));
  function visit(cell) {
    const collected = [...parcels].every((key) => visited.has(key));
    if (sameCoord(cell, stage.goal)) return collected;
    for (const [dr, dc] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const next = [cell[0] + dr, cell[1] + dc];
      const key = next.join(",");
      if (next[0] < 0 || next[1] < 0 || next[0] >= stage.size || next[1] >= stage.size || walls.has(key) || visited.has(key)) continue;
      if (sameCoord(next, stage.goal) && !collected) continue;
      visited.add(key);
      if (visit(next)) return true;
      visited.delete(key);
    }
    return false;
  }
  return visit(route.at(-1));
}

