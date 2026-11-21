import assert from "node:assert/strict";
import test from "node:test";
import { BOTS, shouldSwitchForForecast } from "../src/bots/index.mjs";
import { forecastMaxLoad } from "../src/bots/forecast.mjs";
import { createSession, getObservation, processBoundary } from "../src/session.mjs";
import { EXPERIMENT_CONFIGS } from "../simulation/experiment-configs.mjs";

function running(seedId, schedule = null, config = EXPERIMENT_CONFIGS.BASE) {
  const { session } = createSession({ seedId, schedule, config });
  return processBoundary(session, [{ type: "START", commandSequence: 1 }]).session;
}

const base = getObservation(running("0001")).observation;
function view(tick, {
  phase = "EW_GREEN", greenStartTick = 0, queues = {}, publicConfig = base.publicConfig,
} = {}) {
  const green = phase.endsWith("_GREEN");
  return {
    ...base, elapsedTick: tick - 1, publicConfig,
    signal: green
      ? { phase, phaseStartTick: greenStartTick, greenStartTick, nextTransitionTick: null }
      : { phase, phaseStartTick: tick - 1, greenStartTick: null,
        nextTransitionTick: tick - 1 + (phase.endsWith("_YELLOW") ? publicConfig.yellowTicks : publicConfig.allRedTicks) },
    queues: { ...base.queues, ...queues },
  };
}

const cases = [
  ["E2-B01", "BOT-01", 105, { queues: { north: 8 } }, null],
  ["E2-B02", "BOT-02", 50, {}, "SWITCH_NS"],
  ["E2-B03", "BOT-02", 100, { phase: "NS_GREEN", greenStartTick: 65 }, "SWITCH_EW"],
  ["E2-B04", "BOT-02", 100, { phase: "EW_YELLOW" }, null],
  ["E2-B05", "BOT-03", 70, { phase: "NS_GREEN", greenStartTick: 30 }, "SWITCH_EW"],
  ["E2-B06", "BOT-03", 71, { phase: "NS_GREEN", greenStartTick: 30 }, null],
  ["E2-B07", "BOT-04", 100, { phase: "NS_GREEN", greenStartTick: 99, queues: { west: 7, south: 8 } }, "SWITCH_EW"],
  ["E2-B08", "BOT-04", 100, { phase: "NS_GREEN", greenStartTick: 77, queues: { west: 5, south: 3 } }, null],
  ["E2-B09", "BOT-04", 100, { phase: "NS_GREEN", greenStartTick: 76, queues: { west: 5, south: 3 } }, "SWITCH_EW"],
  ["E2-B10", "BOT-04", 100, { phase: "NS_GREEN", greenStartTick: 70, queues: { west: 4 } }, null],
  ["E2-B11", "BOT-05", 104, { queues: { north: 7 } }, null],
  ["E2-B12", "BOT-05", 105, { queues: { south: 7 } }, "SWITCH_NS"],
  ["E2-B13", "BOT-05", 105, { phase: "NS_GREEN", greenStartTick: 94, queues: { east: 6 } }, null],
  ["E2-B17 yellow", "BOT-05", 105, { phase: "NS_YELLOW", queues: { east: 8 } }, null],
  ["E2-B17 all-red", "BOT-05", 105, { phase: "ALL_RED_TO_EW", queues: { east: 8 } }, null],
];
for (const [id, bot, tick, options, expected] of cases) {
  test(id, () => assert.equal(BOTS[bot].decide(view(tick, options), tick), expected));
}

test("E2-B04 skips the missed decision without queuing it", () => {
  const { decide } = BOTS["BOT-02"];
  assert.equal(decide(view(100, { phase: "ALL_RED_TO_NS" }), 100), null);
  assert.equal(decide(view(101, { phase: "NS_GREEN", greenStartTick: 100 }), 101), null);
  assert.equal(decide(view(150, { phase: "NS_GREEN", greenStartTick: 100 }), 150), "SWITCH_EW");
});

function withLateArrival(config, firstTick, northWeight) {
  const [early, middle, late] = config.phases;
  return {
    ...config, phases: [early, middle, {
      ...late, firstTick, count: 1, weights: { N: northWeight, S: 0, E: 10_000 - northWeight, W: 0 },
    }],
  };
}

for (const [id, weight, expected] of [
  ["E2-B14", 4999, null], ["E2-B15", 5000, "SWITCH_NS"], ["E2-B16", 0, null],
]) {
  test(`${id} threshold and 40-tick forecast agree with fixed peaks`, () => {
    // SWITCH goes green at 415 and first serves N at 427, before the only arrival.
    const observation = view(400, {
      queues: { north: 3 }, publicConfig: withLateArrival(base.publicConfig, 428, weight),
    });
    assert.equal(shouldSwitchForForecast(30_000 + weight, 30_000), expected !== null);
    assert.equal(forecastMaxLoad(observation, 400), 30_000 + weight);
    assert.equal(forecastMaxLoad(observation, 400, "SWITCH_NS"), 30_000);
    assert.equal(BOTS["BOT-05"].decide(observation, 400), expected);
  });
}

test("E2 BOT-05 forecast uses inclusive horizon, phase weights and tick599 cutoff", () => {
  const peak = (tick, options) => forecastMaxLoad(view(tick, options), tick);
  for (const [tick, expected] of [[161, 7500], [200, 4500], [400, 14_000]]) {
    assert.equal(peak(tick, { queues: { north: 0, east: 0 } }), expected);
  }
  for (const [firstTick, expected] of [[439, 35_000], [440, 30_000]]) {
    assert.equal(peak(400, {
      queues: { north: 3 }, publicConfig: withLateArrival(base.publicConfig, firstTick, 5000),
    }), expected);
  }
  const hardA = getObservation(running("0001", null, EXPERIMENT_CONFIGS["HARD-A"])).observation.publicConfig;
  assert.equal(peak(595, { publicConfig: hardA }), 3500);
  assert.equal(peak(595, { publicConfig: base.publicConfig }), 0);
  assert.equal(peak(600, { queues: { north: 3 } }), 30_000);
});

test("E2 BOT-05 forecasts HARD-B all-red duration, including same-tick passage before arrival", () => {
  const hardB = getObservation(running("0001", null, EXPERIMENT_CONFIGS["HARD-B"])).observation.publicConfig;
  function switchPeak(publicConfig, arrivalTick) {
    return forecastMaxLoad(view(400, {
      queues: { north: 3 }, publicConfig: withLateArrival(publicConfig, arrivalTick, 5000),
    }), 400, "SWITCH_NS");
  }
  assert.equal(switchPeak(base.publicConfig, 428), 30_000);
  assert.equal(switchPeak(hardB, 428), 35_000);
  assert.equal(switchPeak(hardB, 432), 30_000);
});

test("E2 BOT-05 keeps forecasting after the load passes nine vehicles", () => {
  assert.equal(forecastMaxLoad(view(400, { queues: { north: 8 } }), 400), 94_000);
});

test("E2-B18/B19 different private seeds and future directions leave decisions unchanged", () => {
  const first = running("0001");
  const otherSeed = running("0002");
  assert.notDeepEqual(first.schedule, otherSeed.schedule);
  assert.deepEqual(getObservation(first), getObservation(otherSeed));

  const futureObservations = ["N", "W"].map((direction) => {
    let session = running("0001", [{ eventId: 1, spawnTick: 26, direction }]);
    for (let tick = 1; tick < 15; tick += 1) session = processBoundary(session).session;
    return getObservation(session).observation;
  });
  assert.deepEqual(futureObservations[0], futureObservations[1]);
  for (const { decide } of Object.values(BOTS)) {
    assert.equal(decide(getObservation(first).observation, 1), decide(getObservation(otherSeed).observation, 1));
    assert.equal(decide(futureObservations[0], 15), decide(futureObservations[1], 15));
  }
});
