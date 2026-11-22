import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as config from "../src/config.js";
import { SCENARIOS, getScenario, validateCatalog } from "../src/scenario-catalog.js";

const bytes = readFileSync(new URL("./fixtures/06_scenario_matrix_v0.4.json", import.meta.url));
const approved = JSON.parse(bytes);

test("approved JSON bytes, rule settings and 30 catalog days match", () => {
  assert.equal(createHash("sha256").update(bytes).digest("hex"),
    "338e2d5b28dbb975192ad56eb37846b3b04508a3fc4a03dea730e1cb1e469488");
  assert.equal(config.RULES_VERSION, approved.rulesVersion);
  assert.deepEqual({
    initialCash: config.INITIAL_CASH,
    unitCost: config.UNIT_COST,
    maxBake: config.MAX_BAKE,
    prices: config.PRICES,
    defaultPrice: config.DEFAULT_PRICE,
    dayCount: config.DAY_COUNT,
    forecastMinDelta: config.DEMAND_DELTA_MIN,
    forecastMaxDelta: config.DEMAND_DELTA_MAX,
    demandCap: config.DEMAND_CAP,
    weatherPricePenalties: config.PRICE_PENALTIES,
    starRateNumerator: config.STAR_RATE,
    starRateDenominator: 100,
  }, approved.settings);
  assert.deepEqual(SCENARIOS, approved.scenarios);
  assert.equal(SCENARIOS.flatMap((week) => week.days).length, 30);
  validateCatalog(SCENARIOS);
});

test("catalog lookup is strict and all scenario data is immutable", () => {
  assert.equal(getScenario("W99"), undefined);
  assert.equal(getScenario(["W01"]), undefined);
  assert.ok(Object.isFrozen(SCENARIOS));
  for (const week of SCENARIOS) {
    assert.equal(getScenario(week.id), week);
    for (const entry of [week, week.starThresholds, week.days, ...week.days]) {
      assert.ok(Object.isFrozen(entry));
    }
  }
});

const corruptions = {
  "missing week": (weeks) => weeks.pop(),
  "missing ID": (weeks) => delete weeks[0].id,
  "invalid ID": (weeks) => { weeks[0].id = "W99"; },
  "duplicate ID": (weeks) => { weeks[1] = structuredClone(weeks[0]); },
  "missing name": (weeks) => { weeks[0].name = ""; },
  "missing day": (weeks) => weeks[0].days.pop(),
  "duplicate day": (weeks) => { weeks[0].days[1].dayNo = 1; },
  "invalid weather": (weeks) => { weeks[0].days[0].weather = "constructor"; },
  "fractional demand": (weeks) => { weeks[0].days[0].baseDemand = 3.5; },
  "excess demand": (weeks) => { weeks[0].days[0].baseDemand = 13; },
  "invalid delta": (weeks) => { weeks[0].days[0].demandDelta = -3; },
  "missing delta": (weeks) => delete weeks[0].days[0].demandDelta,
  "wrong verified maximum with consistent thresholds": (weeks) => {
    weeks[0].verifiedMaxProfit = 70;
    weeks[0].starThresholds = { star1: 41, star2: 53, star3: 63 };
  },
  "invalid threshold": (weeks) => { weeks[0].starThresholds.star2 = 44; },
};
for (const [name, corrupt] of Object.entries(corruptions)) {
  test(`catalog rejects ${name}`, () => {
    const weeks = structuredClone(approved.scenarios);
    corrupt(weeks);
    assert.throws(() => validateCatalog(weeks), TypeError);
  });
}
