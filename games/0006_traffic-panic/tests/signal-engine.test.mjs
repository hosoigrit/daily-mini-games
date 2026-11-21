import test from "node:test";
import assert from "node:assert/strict";
import { BASE_CONFIG } from "../src/config.mjs";
import { advanceTick } from "../src/game-engine.mjs";
import { createInitialSnapshot } from "../src/state-validator.mjs";

const emptySchedule = [];

function snapshotAt(elapsedTick, signal) {
  return { ...createInitialSnapshot(), elapsedTick, signal };
}

test("OR-009: initial EW green first passage opportunity is tick12", () => {
  const schedule = [{ eventId: 1, spawnTick: 1, direction: "E" }, { eventId: 2, spawnTick: 2, direction: "W" }];
  let snapshot = createInitialSnapshot();
  for (let tick = 1; tick <= 11; tick += 1) {
    const result = advanceTick({ snapshot, targetTick: tick, config: BASE_CONFIG, schedule });
    assert.equal(result.ok, true);
    snapshot = result.snapshot;
  }
  assert.equal(snapshot.passedVehicles, 0);
  assert.deepEqual(snapshot.queues, { north: 0, south: 0, east: 1, west: 1 });
  const at12 = advanceTick({ snapshot, targetTick: 12, config: BASE_CONFIG, schedule });
  assert.equal(at12.snapshot.passedVehicles, 2);
  assert.deepEqual(at12.events.map((event) => event.direction), ["E", "W"]);
});

test("OR-010..013/ST-001..004: switch and automatic FSM ticks are exact", () => {
  let snapshot = snapshotAt(99, { phase: "EW_GREEN", phaseStartTick: 0, nextTransitionTick: null, greenStartTick: 0 });
  let result = advanceTick({
    snapshot,
    targetTick: 100,
    commands: [{ type: "SWITCH_NS", targetTick: 100, commandSequence: 1 }],
    config: BASE_CONFIG,
    schedule: emptySchedule,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.snapshot.signal, { phase: "EW_YELLOW", phaseStartTick: 100, nextTransitionTick: 110, greenStartTick: null });
  snapshot = result.snapshot;
  for (let tick = 101; tick <= 109; tick += 1) snapshot = advanceTick({ snapshot, targetTick: tick, config: BASE_CONFIG, schedule: emptySchedule }).snapshot;
  result = advanceTick({ snapshot, targetTick: 110, commands: [{ type: "SWITCH_NS", targetTick: 110, commandSequence: 2 }], config: BASE_CONFIG, schedule: emptySchedule });
  assert.equal(result.commandOutcomes[0].reason, "TRANSITION_LOCKED");
  assert.deepEqual(result.snapshot.signal, { phase: "ALL_RED_TO_NS", phaseStartTick: 110, nextTransitionTick: 115, greenStartTick: null });
  snapshot = result.snapshot;
  for (let tick = 111; tick <= 114; tick += 1) snapshot = advanceTick({ snapshot, targetTick: tick, config: BASE_CONFIG, schedule: emptySchedule }).snapshot;
  result = advanceTick({ snapshot, targetTick: 115, commands: [{ type: "SWITCH_EW", targetTick: 115, commandSequence: 3 }], config: BASE_CONFIG, schedule: emptySchedule });
  assert.equal(result.commandOutcomes[0].reason, "TRANSITION_LOCKED");
  assert.deepEqual(result.snapshot.signal, { phase: "NS_GREEN", phaseStartTick: 115, nextTransitionTick: null, greenStartTick: 115 });
  result = advanceTick({ snapshot: result.snapshot, targetTick: 116, commands: [{ type: "SWITCH_EW", targetTick: 116, commandSequence: 4 }], config: BASE_CONFIG, schedule: emptySchedule });
  assert.equal(result.commandOutcomes[0].accepted, true);
  assert.equal(result.snapshot.signal.phase, "NS_YELLOW");
});

test("OR-013: NS first passage opportunity is tick127", () => {
  const schedule = [{ eventId: 1, spawnTick: 1, direction: "N" }, { eventId: 2, spawnTick: 2, direction: "S" }];
  let snapshot = {
    ...createInitialSnapshot(),
    elapsedTick: 115,
    signal: { phase: "NS_GREEN", phaseStartTick: 115, nextTransitionTick: null, greenStartTick: 115 },
    queues: { north: 1, south: 1, east: 0, west: 0 },
    arrivalAttempts: 2,
    spawnCursor: 2,
    maxQueueLength: 1,
  };
  for (let tick = 116; tick <= 126; tick += 1) snapshot = advanceTick({ snapshot, targetTick: tick, config: BASE_CONFIG, schedule }).snapshot;
  assert.equal(snapshot.passedVehicles, 0);
  const result = advanceTick({ snapshot, targetTick: 127, config: BASE_CONFIG, schedule });
  assert.equal(result.snapshot.passedVehicles, 2);
  assert.deepEqual(result.events.map((event) => event.direction), ["N", "S"]);
});

test("INV-03/ST-005: yellow state passes no vehicle and stores no switch reservation", () => {
  const schedule = [{ eventId: 1, spawnTick: 1, direction: "E" }];
  const snapshot = {
    ...createInitialSnapshot(),
    elapsedTick: 100,
    signal: { phase: "EW_YELLOW", phaseStartTick: 100, nextTransitionTick: 110, greenStartTick: null },
    queues: { north: 0, south: 0, east: 1, west: 0 },
    arrivalAttempts: 1,
    spawnCursor: 1,
    maxQueueLength: 1,
    switchCount: 1,
  };
  const result = advanceTick({
    snapshot,
    targetTick: 101,
    commands: [{ type: "SWITCH_NS", targetTick: 101, commandSequence: 2 }],
    config: BASE_CONFIG,
    schedule,
  });
  assert.equal(result.commandOutcomes[0].reason, "TRANSITION_LOCKED");
  assert.equal(result.snapshot.passedVehicles, 0);
  assert.equal(result.snapshot.queues.east, 1);
  assert.equal(result.snapshot.switchCount, 1);
});

test("ST-006/007: invalid command does not suppress valid command, then duplicates reject", () => {
  const result = advanceTick({
    snapshot: createInitialSnapshot(),
    targetTick: 1,
    commands: [
      { type: "NOPE", targetTick: 1, commandSequence: 1 },
      { type: "SWITCH_NS", targetTick: 1, commandSequence: 2 },
      { type: "SWITCH_EW", targetTick: 1, commandSequence: 3 },
    ],
    config: BASE_CONFIG,
    schedule: emptySchedule,
  });
  assert.deepEqual(result.commandOutcomes.map(({ accepted, reason }) => [accepted, reason]), [
    [false, "INVALID_COMMAND"], [true, null], [false, "DUPLICATE"],
  ]);
});

test("ALREADY_ACTIVE, INVALID_TARGET and WRONG_TICK are explicit", () => {
  const result = advanceTick({
    snapshot: createInitialSnapshot(), targetTick: 1, config: BASE_CONFIG, schedule: emptySchedule,
    commands: [
      { type: "SWITCH_NS", commandSequence: 1 },
      { type: "SWITCH_NS", targetTick: 2, commandSequence: 2 },
      { type: "SWITCH_EW", targetTick: 1, commandSequence: 3 },
    ],
  });
  assert.deepEqual(result.commandOutcomes.map(({ reason }) => reason), ["INVALID_TARGET", "WRONG_TICK", "ALREADY_ACTIVE"]);
});

test("OR-016/ST-009/CASE-C: tick600 clears before switch, passage and arrival", () => {
  const schedule = [{ eventId: 1, spawnTick: 598, direction: "E" }];
  const snapshot = {
    ...createInitialSnapshot(), elapsedTick: 599,
    signal: { phase: "EW_GREEN", phaseStartTick: 588, nextTransitionTick: null, greenStartTick: 588 },
    queues: { north: 0, south: 0, east: 1, west: 0 }, arrivalAttempts: 1, spawnCursor: 1, maxQueueLength: 1,
  };
  const original = structuredClone(snapshot);
  const result = advanceTick({ snapshot, targetTick: 600, commands: [{ type: "SWITCH_NS", targetTick: 600, commandSequence: 1 }], config: BASE_CONFIG, schedule });
  assert.equal(result.terminal.result, "CLEAR");
  assert.equal(result.commandOutcomes[0].reason, "TIME_UP_NOT_EXECUTED");
  assert.equal(result.snapshot.passedVehicles, 0);
  assert.deepEqual(result.snapshot.queues, original.queues);
  assert.equal(result.snapshot.switchCount, 0);
  assert.deepEqual(snapshot, original);
});

test("NFR-009: invalid input returns no partial snapshot and leaves input unchanged", () => {
  const snapshot = createInitialSnapshot();
  snapshot.queues.north = 9;
  const original = structuredClone(snapshot);
  const result = advanceTick({ snapshot, targetTick: 1, config: BASE_CONFIG, schedule: emptySchedule });
  assert.equal(result.ok, false);
  assert.equal(result.code, "INVALID_SNAPSHOT");
  assert.equal("snapshot" in result, false);
  assert.deepEqual(snapshot, original);
});
