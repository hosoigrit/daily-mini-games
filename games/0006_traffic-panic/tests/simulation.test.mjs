import assert from "node:assert/strict";
import test from "node:test";
import { BOTS } from "../src/bots/index.mjs";
import { BASE_CONFIG, validateConfig } from "../src/config.mjs";
import { createSession, getObservation, processBoundary } from "../src/session.mjs";
import { generateSchedule } from "../src/spawn-schedule.mjs";
import { validateSnapshot } from "../src/state-validator.mjs";
import { summarizeCell } from "../simulation/aggregate.mjs";
import { EXPERIMENT_CONFIGS } from "../simulation/experiment-configs.mjs";
import { runSimulation } from "../simulation/run-simulation.mjs";

const botForTest = (decide) => ({ id: "TEST", version: "1", decide });

test("E2-R01 BASE seed0001 and BOT-01 match the E1 oracle without retaining a trace", () => {
  const result = runSimulation({ seedId: "0001" });
  assert.equal(result.result, "GRIDLOCK");
  assert.equal(result.failureDirection, "NORTH");
  assert.equal(result.endTick, 350);
  assert.equal(result.score, 130);
  assert.equal(result.survivalMs, 35_000);
  assert.equal(result.snapshot.passedVehicles, 13);
  assert.equal(result.snapshot.arrivalAttempts, 30);
  assert.equal(result.snapshot.spawnCursor, 30);
  assert.equal(result.snapshot.overflowVehicles, 1);
  assert.equal(result.snapshot.switchCount, 0);
  assert.equal(result.snapshot.maxQueueLength, 8);
  assert.deepEqual(result.snapshot.queues, { north: 8, south: 8, east: 0, west: 0 });
  assert.equal(Object.hasOwn(result, "trace"), false);
});

for (const [botId, configId] of [["BOT-02", "BASE"], ["BOT-05", "HARD-B"]]) {
  test(`E2-R02/R06/R07 ${botId} ${configId} matches Session and replays exactly`, () => {
    const config = EXPERIMENT_CONFIGS[configId];
    const bot = BOTS[botId];
    const seedId = "0001";
    const options = { seedId, config, bot, captureTrace: true };
    const result = runSimulation(options);
    assert.deepEqual(runSimulation(options), result);
    assert.ok(["CLEAR", "GRIDLOCK"].includes(result.result), JSON.stringify(result.fault));
    const { session: ready } = createSession({ seedId, config });
    let session = processBoundary(ready, [{ type: "START", commandSequence: 1 }]).session;
    let sequence = 1;
    for (const entry of result.trace) {
      const tick = session.snapshot.elapsedTick + 1;
      const type = bot.decide(getObservation(session).observation, tick);
      const commands = type === null ? [] : [{ type, targetTick: tick, commandSequence: ++sequence }];
      assert.deepEqual(commands, entry.commands);
      const step = processBoundary(session, commands);
      assert.equal(step.ok, true);
      assert.deepEqual(step.session.snapshot, entry.snapshot);
      assert.deepEqual(step.events, entry.events);
      assert.deepEqual(step.commandOutcomes, entry.commandOutcomes);
      for (const outcome of step.commandOutcomes) {
        const expected = tick === 600 ? "TIME_UP_NOT_EXECUTED" : null;
        assert.equal(outcome.reason, expected);
        assert.equal(outcome.accepted, expected === null);
      }
      session = step.session;
      assert.equal(validateSnapshot(session.snapshot, session.schedule, config, step.terminal).valid, true);
    }
    assert.ok(sequence > 1);
    assert.equal(session.status, "FINISHED");
    assert.equal(session.result, result.result);
    assert.equal(session.failureDirection, result.failureDirection);
    assert.equal(session.snapshot.elapsedTick, result.endTick);
    assert.equal(getObservation(session).observation.score, result.score);
  });
}

test("E2-R03 the ninth N arrival terminates immediately and N remains at eight", () => {
  const schedule = Array.from({ length: 10 }, (_, index) => ({
    eventId: index + 1, spawnTick: index + 1, direction: "N",
  }));
  const result = runSimulation({ seedId: "0001", schedule, captureTrace: true });
  assert.equal(result.result, "GRIDLOCK");
  assert.equal(result.endTick, 9);
  assert.equal(result.failureDirection, "NORTH");
  assert.equal(result.snapshot.queues.north, 8);
  assert.equal(result.snapshot.spawnCursor, 9);
  assert.equal(result.snapshot.overflowVehicles, 1);
});

test("E2-R04 passage at tick12 frees one space before an E arrival", () => {
  const schedule = Array.from({ length: 9 }, (_, index) => ({
    eventId: index + 1, spawnTick: index === 8 ? 12 : index + 1, direction: "E",
  }));
  const result = runSimulation({ seedId: "0001", schedule, captureTrace: true });
  const tick12 = result.trace[11];
  assert.deepEqual(tick12.events.map(({ type }) => type), ["VEHICLE_PASSED", "VEHICLE_ARRIVED"]);
  assert.equal(tick12.snapshot.queues.east, 8);
  assert.equal(tick12.snapshot.overflowVehicles, 0);
  assert.equal(result.result, "CLEAR");
});

test("E2-R05 CLEAR skips tick600 commands, passage, arrival and due signal transition", () => {
  const schedule = [{ eventId: 1, spawnTick: 598, direction: "E" }];
  for (const [switchTick, phase] of [[null, "EW_GREEN"], [590, "EW_YELLOW"]]) {
    const bot = botForTest((_observation, tick) => tick === switchTick || tick === 600 ? "SWITCH_NS" : null);
    const result = runSimulation({ seedId: "0001", bot, schedule, captureTrace: true });
    assert.equal(result.result, "CLEAR");
    assert.equal(result.endTick, 600);
    const [before, last] = result.trace.slice(-2);
    assert.equal(last.snapshot.signal.phase, phase);
    assert.equal(last.snapshot.queues.east, 1);
    assert.deepEqual(last.snapshot, { ...before.snapshot, elapsedTick: 600 });
    assert.deepEqual(last.events, []);
    assert.equal(last.commandOutcomes[0].reason, "TIME_UP_NOT_EXECUTED");
  }
});

test("E2-R08 BOT receives only E1 Observation and target tick, with no shared game state", () => {
  const received = [];
  const bot = botForTest((...args) => {
    const [obs, tick] = args;
    if (tick === 1) {
      received.push(structuredClone(args));
      obs.queues.north = 8;
      obs.signal.phase = "NS_GREEN";
      obs.publicConfig.phases[0].weights.N = 0;
    }
    return null;
  });
  const result = runSimulation({ seedId: "0001", bot });
  const { session } = createSession({ seedId: "0001" });
  const startingView = getObservation(processBoundary(session, [{ type: "START", commandSequence: 1 }]).session).observation;
  assert.deepEqual(received, [[startingView, 1]]);
  assert.equal(Object.hasOwn(received[0][0], "seedId"), false);
  assert.equal(Object.hasOwn(received[0][0], "schedule"), false);
  assert.deepEqual(result.snapshot, runSimulation({ seedId: "0001" }).snapshot);
});

test("E2-B20 BOT exception and invalid decision are no-ops with distinct diagnostics", () => {
  const bot = botForTest((_obs, tick) => {
    if (tick === 1) throw new Error("test-only failure");
    return tick === 2 ? "PAUSE" : null;
  });
  const result = runSimulation({ seedId: "0001", bot, captureTrace: true });
  assert.deepEqual(result.diagnostics, [
    { tick: 1, code: "BOT_EXCEPTION" }, { tick: 2, code: "INVALID_BOT_DECISION" },
  ]);
  assert.deepEqual(result.trace.slice(0, 2).map(({ commands }) => commands), [[], []]);
  assert.equal(result.result, "GRIDLOCK");
  assert.equal(result.fault, null);
  assert.deepEqual(result.snapshot, runSimulation({ seedId: "0001" }).snapshot);
});

test("E2-R09 balance variants preserve fixed rules and use the specified last arrivals", () => {
  for (const [id, first, last, count, allRedTicks] of [
    ["BASE", 408, 592, 58, 5], ["HARD-A", 407, 596, 62, 5],
    ["HARD-B", 408, 592, 58, 10], ["EASY-A", 409, 598, 56, 5],
  ]) {
    const config = EXPERIMENT_CONFIGS[id];
    assert.equal(config.balanceConfigId, id);
    assert.equal(validateConfig(config).valid, true);
    for (const field of ["endTick", "yellowTicks", "passInterval", "maxQueuePerDirection", "scorePerVehicle", "generatorVersion"]) {
      assert.equal(config[field], BASE_CONFIG[field]);
    }
    const { schedule } = generateSchedule("0001", config);
    assert.equal(schedule.length, count);
    assert.equal(schedule[34].spawnTick, first);
    assert.equal(schedule.at(-1).spawnTick, last);
    assert.equal(config.allRedTicks, allRedTicks);
  }
});

test("E2-R10 aggregation accounts for every seed and rejects duplicate or unplanned rows", () => {
  const expected = ["0001", "0002", "0003", "0004", "0005"];
  const rows = [
    { seedId: "0001", result: "CLEAR" }, { seedId: "0002", result: "GRIDLOCK" },
    { seedId: "0003", result: "ERROR" }, { seedId: "0004", result: "BLOCKED" },
  ];
  assert.deepEqual(summarizeCell(expected, rows), {
    expected: 5, counts: { CLEAR: 1, GRIDLOCK: 1, ERROR: 1, BLOCKED: 1, NOT_RUN: 1 }, missingSeeds: ["0005"],
  });
  assert.throws(() => summarizeCell(expected, [...rows, rows[0]]), /UNKNOWN_OR_DUPLICATE_RESULT_SEED/);
  assert.throws(() => summarizeCell(expected, [{ seedId: "0006", result: "CLEAR" }]), /UNKNOWN_OR_DUPLICATE_RESULT_SEED/);
});

test("E2-R11 holdout guard refuses endpoints before reading configuration or invoking a BOT", () => {
  for (const seedId of ["0801", "1000"]) {
    assert.deepEqual(runSimulation({
      seedId,
      get config() { return new Proxy({}, { get: () => assert.fail("config read") }); },
      bot: botForTest(() => assert.fail("BOT called")),
    }), { seedId, result: "BLOCKED", code: "HOLDOUT_NOT_AUTHORIZED" });
  }
});
