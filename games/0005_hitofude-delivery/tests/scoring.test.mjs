import test from "node:test";
import assert from "node:assert/strict";
import { applyHintResult, calculateScore, createGameState, evaluateScore, moveTo, resetRoute, undoMove } from "../src/game-core.js";
import { getStage } from "../src/stages.js";

const stage = getStage(1);

test("SC-01: 新規挑戦は1000点・全カウンター0", () => {
  const state = createGameState(stage);
  assert.equal(calculateScore(state), 1000);
  assert.deepEqual([state.undoCount, state.resetCount, state.hintCount], [0, 0, 0]);
});

test("SC-02: 有効な戻るだけ50点減点", () => {
  const initial = createGameState(stage);
  assert.equal(calculateScore(undoMove(initial).state), 1000);
  const moved = moveTo(initial, stage, [0, 1]).state;
  assert.equal(calculateScore(undoMove(moved).state), 950);
});

test("SC-03: 有効なリセットだけ100点減点し過去減点を維持", () => {
  let state = moveTo(createGameState(stage), stage, [0, 1]).state;
  state = undoMove(state).state;
  state = moveTo(state, stage, [1, 0]).state;
  state = resetRoute(state, stage).state;
  assert.equal(calculateScore(state), 850);
  assert.equal(calculateScore(resetRoute(state, stage).state), 850);
});

test("SC-04: 成功ヒントだけ100点減点", () => {
  const initial = createGameState(stage);
  const failed = applyHintResult(initial, { status: "UNAVAILABLE" }, 0).state;
  assert.equal(calculateScore(failed), 1000);
  const success = applyHintResult(failed, { status: "FOUND", nextCell: [0, 1] }, 0).state;
  assert.equal(calculateScore(success), 900);
});

test("SC-05: 戻る2・リセット1・ヒント1は700点・星2・GOOD", () => {
  const counts = { undoCount: 2, resetCount: 1, hintCount: 1 };
  const score = calculateScore(counts);
  assert.equal(score, 700);
  assert.deepEqual(evaluateScore(score, counts), { stars: 2, perfect: false, label: "GOOD" });
});

test("SC-06: 多数の減点でも下限100点", () => {
  assert.equal(calculateScore({ undoCount: 500, resetCount: 500, hintCount: 2 }), 100);
});

test("SC-07: 評価境界とPERFECT条件", () => {
  assert.deepEqual(evaluateScore(1000, { undoCount: 0, resetCount: 0, hintCount: 0 }), { stars: 3, perfect: true, label: "PERFECT" });
  assert.equal(evaluateScore(1000, { undoCount: 1 }).label, "EXCELLENT");
  assert.deepEqual([900, 850, 700, 650, 100].map((score) => evaluateScore(score).label), ["EXCELLENT", "GOOD", "GOOD", "CLEAR", "CLEAR"]);
  assert.deepEqual([900, 850, 700, 650, 100].map((score) => evaluateScore(score).stars), [3, 2, 2, 1, 1]);
});

