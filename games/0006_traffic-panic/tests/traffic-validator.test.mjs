import test from "node:test";
import assert from "node:assert/strict";
import { BASE_CONFIG, scoreOf } from "../src/config.mjs";
import { advanceTick } from "../src/game-engine.mjs";
import { createInitialSnapshot, validateSnapshot } from "../src/state-validator.mjs";

function artificialSchedule(finalTick = 108, direction = "E") {
  return [
    ...Array.from({ length: 8 }, (_, index) => ({ eventId: index + 1, spawnTick: index + 1, direction })),
    { eventId: 9, spawnTick: finalTick, direction },
  ];
}

function localSnapshot(phase) {
  return {
    ...createInitialSnapshot(),
    elapsedTick: 107,
    signal: { phase, phaseStartTick: 96, nextTransitionTick: null, greenStartTick: 96 },
    queues: { north: 0, south: 0, east: 8, west: 0 },
    spawnCursor: 8,
    arrivalAttempts: 8,
    maxQueueLength: 8,
  };
}

test("OR-015/CASE-A: passage before same-tick arrival prevents overflow", () => {
  const schedule = artificialSchedule();
  const result = advanceTick({ snapshot: localSnapshot("EW_GREEN"), targetTick: 108, config: BASE_CONFIG, schedule });
  assert.equal(result.ok, true);
  assert.equal(result.terminal, null);
  assert.deepEqual(result.events.map(({ type }) => type), ["VEHICLE_PASSED", "VEHICLE_ARRIVED"]);
  assert.deepEqual(result.snapshot.queues, { north: 0, south: 0, east: 8, west: 0 });
  assert.equal(result.snapshot.passedVehicles, 1);
  assert.equal(result.snapshot.arrivalAttempts, 9);
  assert.equal(result.snapshot.spawnCursor, 9);
  assert.equal(result.snapshot.overflowVehicles, 0);
  assert.equal(scoreOf(result.snapshot), 10);
});

test("OR-014/CASE-B: ninth vehicle immediately gridlocks without queue 9", () => {
  const schedule = artificialSchedule();
  const result = advanceTick({ snapshot: localSnapshot("NS_GREEN"), targetTick: 108, config: BASE_CONFIG, schedule });
  assert.equal(result.ok, true);
  assert.deepEqual(result.terminal, { result: "GRIDLOCK", failureDirection: "EAST" });
  assert.equal(result.snapshot.queues.east, 8);
  assert.equal(result.snapshot.overflowVehicles, 1);
  assert.equal(result.snapshot.arrivalAttempts, 9);
  assert.equal(result.snapshot.spawnCursor, 9);
  assert.equal(result.snapshot.passedVehicles, 0);
});

test("ST-008: ninth arrival at tick599 ends before tick600", () => {
  const schedule = artificialSchedule(599);
  const snapshot = { ...localSnapshot("NS_GREEN"), elapsedTick: 598, signal: { phase: "NS_GREEN", phaseStartTick: 587, nextTransitionTick: null, greenStartTick: 587 } };
  const result = advanceTick({ snapshot, targetTick: 599, config: BASE_CONFIG, schedule });
  assert.equal(result.terminal.result, "GRIDLOCK");
  assert.equal(result.snapshot.elapsedTick, 599);
});

test("multiple arrivals use event order and stop immediately after overflow", () => {
  const schedule = [
    ...Array.from({ length: 8 }, (_, index) => ({ eventId: index + 1, spawnTick: index + 1, direction: "N" })),
    { eventId: 9, spawnTick: 20, direction: "N" },
    { eventId: 10, spawnTick: 20, direction: "S" },
  ];
  const snapshot = {
    ...createInitialSnapshot(), elapsedTick: 19,
    queues: { north: 8, south: 0, east: 0, west: 0 }, spawnCursor: 8, arrivalAttempts: 8, maxQueueLength: 8,
  };
  const result = advanceTick({ snapshot, targetTick: 20, config: BASE_CONFIG, schedule });
  assert.equal(result.snapshot.spawnCursor, 9);
  assert.equal(result.snapshot.queues.south, 0);
  assert.equal(result.events.at(-1).eventId, 9);
});

test("ERR-T02/03 and INV-01/04/05/06/10 reject malformed snapshots", () => {
  const cases = [
    (snapshot) => { snapshot.queues.north = -1; },
    (snapshot) => { snapshot.queues.west = 9; },
    (snapshot) => { snapshot.signal.phase = "PURPLE"; },
    (snapshot) => { snapshot.arrivalAttempts = 1; },
    (snapshot) => { snapshot.spawnCursor = 1; },
    (snapshot) => { snapshot.overflowVehicles = 2; },
    (snapshot) => { snapshot.maxQueueLength = 9; },
  ];
  for (const mutate of cases) {
    const snapshot = createInitialSnapshot();
    mutate(snapshot);
    assert.equal(validateSnapshot(snapshot, [], BASE_CONFIG).valid, false);
  }
});

test("E1-H01: an elapsed tick cannot leave an earlier scheduled arrival unprocessed", () => {
  const schedule = [{ eventId: 1, spawnTick: 1, direction: "N" }];
  const snapshot = { ...createInitialSnapshot(), elapsedTick: 2 };
  const original = structuredClone(snapshot);
  const validation = validateSnapshot(snapshot, schedule, BASE_CONFIG);
  assert.equal(validation.valid, false);
  assert.ok(validation.violations.includes("UNPROCESSED_EVENT_AT_OR_BEFORE_ELAPSED_TICK"));
  const result = advanceTick({ snapshot, targetTick: 3, config: BASE_CONFIG, schedule });
  assert.equal(result.ok, false);
  assert.equal(result.code, "INVALID_SNAPSHOT");
  assert.equal("snapshot" in result, false);
  assert.deepEqual(snapshot, original);
});

test("E1-H01/M03: a future scheduled arrival cannot be marked processed", () => {
  const schedule = [{ eventId: 1, spawnTick: 5, direction: "N" }];
  const snapshot = {
    ...createInitialSnapshot(),
    elapsedTick: 4,
    queues: { north: 1, south: 0, east: 0, west: 0 },
    spawnCursor: 1,
    arrivalAttempts: 1,
    maxQueueLength: 1,
  };
  const validation = validateSnapshot(snapshot, schedule, BASE_CONFIG);
  assert.equal(validation.valid, false);
  assert.ok(validation.violations.includes("PROCESSED_EVENT_AFTER_ELAPSED_TICK"));
});

test("E1-M03: malformed Schedule returns violations instead of throwing", () => {
  const validation = validateSnapshot(createInitialSnapshot(), [null], BASE_CONFIG);
  assert.equal(validation.valid, false);
  assert.ok(validation.violations.length > 0);
});

test("E1-H01: GRIDLOCK may leave only later events from the same terminal tick", () => {
  const schedule = [
    ...Array.from({ length: 8 }, (_, index) => ({ eventId: index + 1, spawnTick: index + 1, direction: "N" })),
    { eventId: 9, spawnTick: 20, direction: "N" },
    { eventId: 10, spawnTick: 20, direction: "S" },
  ];
  const terminalSnapshot = {
    ...createInitialSnapshot(),
    elapsedTick: 20,
    queues: { north: 8, south: 0, east: 0, west: 0 },
    spawnCursor: 9,
    arrivalAttempts: 9,
    overflowVehicles: 1,
    maxQueueLength: 8,
  };
  assert.equal(validateSnapshot(terminalSnapshot, schedule, BASE_CONFIG, { result: "GRIDLOCK", failureDirection: "NORTH" }).valid, true);
});

test("E1-H02: GRIDLOCK terminal snapshot cannot be validated as running or advanced", () => {
  const schedule = Array.from({ length: 9 }, (_, index) => ({ eventId: index + 1, spawnTick: index + 1, direction: "N" }));
  const snapshot = {
    ...createInitialSnapshot(),
    elapsedTick: 9,
    queues: { north: 8, south: 0, east: 0, west: 0 },
    spawnCursor: 9,
    arrivalAttempts: 9,
    overflowVehicles: 1,
    maxQueueLength: 8,
  };
  const original = structuredClone(snapshot);
  const runningValidation = validateSnapshot(snapshot, schedule, BASE_CONFIG);
  assert.equal(runningValidation.valid, false);
  assert.ok(runningValidation.violations.includes("GRIDLOCK_TERMINAL_REQUIRED"));
  assert.equal(validateSnapshot(snapshot, schedule, BASE_CONFIG, { result: "GRIDLOCK", failureDirection: "NORTH" }).valid, true);
  const result = advanceTick({ snapshot, targetTick: 10, config: BASE_CONFIG, schedule });
  assert.equal(result.ok, false);
  assert.equal(result.code, "TERMINAL_SNAPSHOT");
  assert.equal("snapshot" in result, false);
  assert.deepEqual(snapshot, original);
});

test("INV-08: CLEAR and GRIDLOCK terminal contracts are enforced", () => {
  assert.equal(validateSnapshot(createInitialSnapshot(), [], BASE_CONFIG, { result: "CLEAR" }).valid, false);
  assert.equal(validateSnapshot(createInitialSnapshot(), [], BASE_CONFIG, { result: "GRIDLOCK" }).valid, false);
});

test("engine exception becomes ENGINE_FAULT without a partial snapshot", () => {
  const snapshot = createInitialSnapshot();
  Object.defineProperty(snapshot, "signal", { get() { throw new Error("injected getter fault"); } });
  const result = advanceTick({ snapshot, targetTick: 1, config: BASE_CONFIG, schedule: [] });
  assert.equal(result.ok, false);
  assert.equal(result.code, "ENGINE_FAULT");
  assert.equal(result.stage, "EXCEPTION");
  assert.equal("snapshot" in result, false);
});

test("ERR-T04: post-update invariant failure is atomic", () => {
  let directionReads = 0;
  const unstableEvent = { eventId: 1, spawnTick: 1 };
  Object.defineProperty(unstableEvent, "direction", {
    enumerable: true,
    get() {
      directionReads += 1;
      return directionReads === 3 ? "X" : "N";
    },
  });
  const snapshot = createInitialSnapshot();
  const original = structuredClone(snapshot);
  const result = advanceTick({ snapshot, targetTick: 1, config: BASE_CONFIG, schedule: [unstableEvent] });
  assert.equal(result.ok, false);
  assert.equal(result.code, "ENGINE_FAULT");
  assert.equal(result.stage, "POST_UPDATE");
  assert.ok(result.violations.includes("VEHICLE_CONSERVATION_BROKEN"));
  assert.equal("snapshot" in result, false);
  assert.deepEqual(snapshot, original);
});
