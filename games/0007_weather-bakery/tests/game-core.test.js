import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  calculateTrade, createGameState, dispatch, forecastDemand, rankForProfit,
} from "../src/game-core.js";
import { getScenario } from "../src/scenario-catalog.js";

const { scenarios, settings } = JSON.parse(
  readFileSync(new URL("./fixtures/06_scenario_matrix_v0.4.json", import.meta.url)),
);
const { prices, weatherPricePenalties } = settings;
const clamp = (n) => n < 0 ? 0 : n > 12 ? 12 : n;

function expectedDemand(day, price, delta) {
  return clamp(day.baseDemand + delta - weatherPricePenalties[day.weather][price]);
}

for (const week of scenarios) {
  for (const day of week.days) {
    const actualDay = getScenario(week.id).days[day.dayNo - 1];
    for (const price of prices) {
      const name = `${week.id}/day${day.dayNo}/price${price}`;
      const demand = expectedDemand(day, price, day.demandDelta);
      test(`forecast ${name}`, () => {
        const forecast = forecastDemand(actualDay, price);
        assert.deepEqual(forecast, {
          low: expectedDemand(day, price, -2), high: expectedDemand(day, price, 2),
        });
        const actual = calculateTrade(week.id, actualDay, price, 0, 30).demand;
        assert.ok(forecast.low <= actual && actual <= forecast.high);
        assert.deepEqual(forecastDemand({ ...actualDay, demandDelta: undefined }, price), forecast);
      });
      for (let baked = 0; baked <= 12; baked++) {
        test(`trade ${name}/bake${baked}`, () => {
          const sold = baked <= demand ? baked : demand;
          const revenue = price * sold;
          const cost = 2 * baked;
          const result = calculateTrade(week.id, actualDay, price, baked, 30);
          assert.deepEqual(result, {
            scenarioId: week.id, dayNo: day.dayNo, weather: day.weather, price, baked,
            demand, sold, leftovers: baked - sold, revenue, cost,
            profit: revenue - cost, cashAfter: 30 - cost + revenue,
          });
        });
      }
    }
  }
}

test("clamp limits, exact funds and invalid trade arguments", () => {
  const day = { dayNo: 1, weather: "はれ", baseDemand: 12, demandDelta: 2 };
  assert.deepEqual(forecastDemand(day, 3), { low: 10, high: 12 });
  assert.equal(calculateTrade("W01", day, 3, 12, 24).demand, 12);
  assert.throws(() => calculateTrade("W01", day, 3, 12, 23), RangeError);
  assert.throws(() => calculateTrade("W01", day, 3, 1, Number.MAX_SAFE_INTEGER), RangeError);
  assert.throws(() => calculateTrade("W99", day, 3, 0, 30), RangeError);
  assert.throws(() => calculateTrade("W01", { ...day, demandDelta: 3 }, 3, 0, 30), RangeError);
  assert.throws(() => forecastDemand(null, 4), RangeError);
  assert.throws(() => forecastDemand(day, "4"), RangeError);
  assert.throws(() => rankForProfit("W99", 0), RangeError);
  assert.throws(() => rankForProfit("W01", NaN), RangeError);
});

const maxima = [60, 69, 79, 66, 67, 60];
const approvedPaths = [
  [[4, 6], [3, 3], [5, 5], [4, 3], [5, 8]],
  [[4, 6], [5, 5], [3, 3], [5, 6], [5, 7]],
  [[4, 6], [5, 8], [5, 5], [5, 8], [3, 4]],
  [[4, 6], [5, 6], [3, 3], [4, 6], [5, 7]],
  [[3, 3], [4, 5], [5, 6], [5, 6], [5, 6]],
  [[5, 6], [4, 3], [3, 3], [5, 5], [5, 6]],
];

// Each layer stores one witness path for each reachable cash balance.
function optimalPath(week) {
  let balances = new Map([[30, []]]);
  for (const day of week.days) {
    const next = new Map();
    for (const [cash, path] of balances) {
      for (const price of prices) {
        const demand = expectedDemand(day, price, day.demandDelta);
        for (let count = 0; count <= 12 && count * 2 <= cash; count++) {
          const balance = cash - 2 * count + price * Math.min(count, demand);
          next.set(balance, [...path, [price, count]]);
        }
      }
    }
    balances = next;
  }
  const finalCash = Math.max(...balances.keys());
  return { finalCash, path: balances.get(finalCash) };
}

function play(id, path) {
  let state = createGameState();
  const act = (type, payload) => {
    const next = dispatch(state, { type, ...payload });
    assert.notEqual(next, state, type);
    state = next;
  };
  act("SELECT_WEEK", { scenarioId: id });
  act("START");
  for (const [index, [price, bakeCount]] of path.entries()) {
    act("SET_PRICE", { price });
    act("SET_BAKE_COUNT", { bakeCount });
    act("OPEN_SHOP");
    assert.equal(state.history.length, index + 1);
    assert.equal(state.dailyResult.scenarioId, id);
    assert.equal(state.dailyResult.dayNo, index + 1);
    assert.equal(state.dailyResult.sold + state.dailyResult.leftovers, bakeCount);
    assert.ok(state.cash >= 0);
    assert.equal(state.history.reduce((sum, result) => sum + result.profit, 0), state.cash - 30);
    act(index === 4 ? "SHOW_FINAL" : "NEXT_DAY");
  }
  assert.equal(state.phase, "FINAL");
  return state;
}

for (const [index, week] of scenarios.entries()) {
  const id = week.id;
  test(`${id} independent DP, legal paths and deterministic replay`, () => {
    const { finalCash, path } = optimalPath(week);
    assert.equal(finalCash - 30, maxima[index]);
    assert.equal(getScenario(id).verifiedMaxProfit, finalCash - 30);
    assert.equal(play(id, path).cash, finalCash);
    const referenceRun = play(id, approvedPaths[index]);
    assert.equal(referenceRun.cash, finalCash);
    assert.deepEqual(referenceRun, play(id, approvedPaths[index]));
    assert.equal(rankForProfit(id, referenceRun.cash - 30), 3);
    if (id === "W01") {
      assert.deepEqual(referenceRun.history.map(({ profit }) => profit), [12, 3, 15, 6, 24]);
      assert.deepEqual(referenceRun.history[0], {
        scenarioId: id, dayNo: 1, weather: "くもり", price: 4, baked: 6,
        demand: 6, sold: 6, leftovers: 0, revenue: 24, cost: 12, profit: 12, cashAfter: 42,
      });
    }
    if (id === "W02") {
      const { demand, profit } = referenceRun.history[2];
      assert.deepEqual({ demand, profit }, { demand: 3, profit: 3 });
    }
  });

  test(`${id} each price is optimal on at least one day`, () => {
    const bestPrices = new Set();
    for (const day of week.days) {
      const profits = prices.map((price) => expectedDemand(day, price, day.demandDelta) * (price - 2));
      for (const [i, price] of prices.entries()) {
        if (profits[i] === Math.max(...profits)) bestPrices.add(price);
      }
    }
    assert.deepEqual(bestPrices, new Set(prices));
  });

  const thresholds = Object.values(week.starThresholds);
  for (const [rank, threshold] of thresholds.entries()) {
    test(`${id} star boundary ${threshold - 1}`, () => {
      assert.equal(rankForProfit(id, threshold - 1), rank);
    });
    test(`${id} star boundary ${threshold}`, () => {
      assert.equal(rankForProfit(id, threshold), rank + 1);
    });
  }
}
