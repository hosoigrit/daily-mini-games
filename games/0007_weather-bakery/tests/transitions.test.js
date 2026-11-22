import test from "node:test";
import assert from "node:assert/strict";
import { createGameState, dispatch } from "../src/game-core.js";

const act = (state, type, payload) => dispatch(state, { type, ...payload });

function start(scenarioId) {
  return act(act(createGameState(), "SELECT_WEEK", { scenarioId }), "START");
}

function open(state, price, bakeCount) {
  const priced = act(state, "SET_PRICE", { price });
  const planned = act(priced, "SET_BAKE_COUNT", { bakeCount });
  const result = act(planned, "OPEN_SHOP");
  assert.equal(result.phase, "DAY_RESULT");
  assert.equal(result.dailyResult.price, price);
  assert.equal(result.dailyResult.baked, bakeCount);
  return result;
}

test("ST-01/02/03/04: default title, explicit start, invalid IDs and active week lock", () => {
  const title = createGameState();
  assert.deepEqual(title, {
    phase: "TITLE", selectedScenarioId: "W01", activeScenarioId: null, dayIndex: 0,
    cash: 30, selectedPrice: 4, bakeCount: 0, dailyResult: null, history: [], abortPending: false,
  });
  for (const scenarioId of ["W99", "", null, undefined, ["W01"], "constructor"]) {
    assert.equal(act(title, "SELECT_WEEK", { scenarioId }), title);
    const invalid = { ...title, selectedScenarioId: scenarioId };
    assert.equal(act(invalid, "START"), invalid);
  }
  for (const scenarioId of ["W01", "W02", "W03", "W04", "W05", "W06"]) {
    const selected = act(title, "SELECT_WEEK", { scenarioId });
    assert.deepEqual(selected, { ...title, selectedScenarioId: scenarioId });
    const plan = act(selected, "START", { scenarioId: "W01" });
    assert.deepEqual(plan, { ...selected, phase: "PLAN", activeScenarioId: scenarioId });
    assert.equal(act(plan, "SELECT_WEEK", { scenarioId: "W02" }), plan);
    assert.equal(act(plan, "START"), plan);
  }
});

test("ST-05/06: consecutive OPEN_SHOP calls apply only the first trade", () => {
  const plan = start("W01");
  const result = open(plan, 4, 6);
  for (let index = 0; index < 10; index++) assert.equal(act(result, "OPEN_SHOP"), result);
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0], result.dailyResult);
  assert.equal(result.cash, 42);
  assert.equal(plan.cash, 30);
  assert.deepEqual(plan.history, []);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.history) && Object.isFrozen(result.dailyResult));
});

test("ST-07/08/09: fifth-day boundary, restart and choosing another week", () => {
  let plan = start("W05");
  for (let index = 0; index < 4; index++) {
    const result = open(plan, 3, 3);
    assert.equal(act(result, "SHOW_FINAL"), result);
    plan = act(result, "NEXT_DAY");
    assert.equal(plan.phase, "PLAN");
    assert.equal(plan.dayIndex, index + 1);
    assert.equal(plan.selectedPrice, 4);
    assert.equal(plan.bakeCount, 0);
    assert.equal(plan.dailyResult, null);
    assert.equal(plan.cash, result.cash);
    assert.equal(plan.history, result.history);
    assert.equal(act(plan, "NEXT_DAY"), plan);
  }
  const fifth = open(plan, 3, 3);
  assert.equal(act(fifth, "NEXT_DAY"), fifth);
  const final = act(fifth, "SHOW_FINAL");
  assert.equal(final.phase, "FINAL");
  assert.equal(final.dayIndex, 4);
  assert.equal(final.history.length, 5);
  assert.equal(act(final, "SHOW_FINAL"), final);
  assert.equal(act(final, "OPEN_SHOP"), final);
  assert.deepEqual(act(final, "RETRY_SAME_WEEK"), start("W05"));
  const title = act(final, "CHOOSE_WEEK");
  assert.deepEqual(title, createGameState());
  assert.deepEqual(act(act(title, "SELECT_WEEK", { scenarioId: "W02" }), "START"), start("W02"));
});

for (const [expectedCash, path] of [
  [0, [[5, 12], [3, 1], [5, 11]]],
  [1, [[5, 12], [5, 0], [5, 10]]],
]) {
  test(`ST-11: legal W02 path to cash ${expectedCash} permits only zero bake and can finish`, () => {
    let plan = start("W02");
    for (const [price, quantity] of path) plan = act(open(plan, price, quantity), "NEXT_DAY");
    assert.equal(plan.cash, expectedCash);
    assert.equal(act(plan, "SET_BAKE_COUNT", { bakeCount: 1 }), plan);
    const fourth = open(plan, 4, 0);
    assert.equal(fourth.dailyResult.profit, 0);
    assert.equal(fourth.cash, expectedCash);
    const fifth = open(act(fourth, "NEXT_DAY"), 4, 0);
    assert.equal(act(fifth, "SHOW_FINAL").phase, "FINAL");
  });
}

test("ST-12: reject invalid input and invalid trade state without changing history or cash", () => {
  const plan = start("W01");
  for (const price of [undefined, null, "4", 2, 6, 3.5, NaN, Infinity]) {
    assert.equal(act(plan, "SET_PRICE", { price }), plan);
  }
  for (const bakeCount of [undefined, null, "4", -1, 13, 3.5, NaN, Infinity]) {
    assert.equal(act(plan, "SET_BAKE_COUNT", { bakeCount }), plan);
  }
  const poorPlan = act(open(start("W05"), 5, 12), "NEXT_DAY");
  assert.equal(poorPlan.cash, 6);
  assert.equal(act(poorPlan, "SET_BAKE_COUNT", { bakeCount: 4 }), poorPlan);
  assert.equal(open(poorPlan, 4, 3).dailyResult.cost, 6);
  for (const changes of [
    { activeScenarioId: "W99" }, { activeScenarioId: "W02" }, { dayIndex: 5 }, { dayIndex: "0" },
    { cash: NaN }, { cash: 31 }, { selectedPrice: "4" }, { bakeCount: 2.5 }, { history: [{}] },
  ]) {
    const invalid = { ...plan, ...changes };
    assert.equal(act(invalid, "OPEN_SHOP"), invalid);
  }
  const invalidFunds = { ...poorPlan, bakeCount: 4 };
  assert.equal(act(invalidFunds, "OPEN_SHOP"), invalidFunds);
});

for (const phase of ["PLAN", "DAY_RESULT"]) {
  test(`ST-13/14/15/16: abort request, cancellation and reset from ${phase}`, () => {
    const first = open(start("W05"), 3, 3);
    const next = act(first, "NEXT_DAY");
    const state = phase === "PLAN"
      ? act(act(next, "SET_PRICE", { price: 5 }), "SET_BAKE_COUNT", { bakeCount: 2 })
      : open(next, 5, 2);
    const pending = act(state, "REQUEST_ABORT");
    assert.deepEqual(pending, { ...state, abortPending: true });
    assert.equal(pending.history, state.history);
    for (const action of [
      "REQUEST_ABORT", "OPEN_SHOP", "NEXT_DAY", "SHOW_FINAL", "SELECT_WEEK",
      "SET_PRICE", "SET_BAKE_COUNT", "START", "RETRY_SAME_WEEK", "CHOOSE_WEEK",
    ]) {
      assert.equal(act(pending, action, { scenarioId: "W02", price: 3, bakeCount: 0 }), pending);
    }
    assert.deepEqual(act(pending, "CANCEL_ABORT"), state);
    const title = act(pending, "CONFIRM_ABORT");
    assert.deepEqual(title, createGameState());
    assert.deepEqual(act(act(title, "SELECT_WEEK", { scenarioId: "W02" }), "START"), start("W02"));
  });
}

test("actions from the wrong phase and unsolicited abort responses are ignored", () => {
  const title = createGameState();
  const plan = start("W01");
  const result = open(plan, 4, 0);
  for (const state of [title, plan, result]) {
    for (const action of ["CANCEL_ABORT", "CONFIRM_ABORT", "RETRY_SAME_WEEK", "CHOOSE_WEEK", "UNKNOWN"]) {
      assert.equal(act(state, action), state);
    }
    assert.equal(dispatch(state, null), state);
  }
  for (const action of ["REQUEST_ABORT", "OPEN_SHOP", "NEXT_DAY", "SHOW_FINAL", "SET_PRICE", "SET_BAKE_COUNT"]) {
    assert.equal(act(title, action, { price: 3, bakeCount: 1 }), title);
  }
  for (const action of ["SELECT_WEEK", "SET_PRICE", "SET_BAKE_COUNT", "START"]) {
    assert.equal(act(result, action, { scenarioId: "W02", price: 3, bakeCount: 1 }), result);
  }
});
