import test from "node:test";
import assert from "node:assert/strict";
import { BASE_CONFIG, cloneConfig } from "../src/config.mjs";
import { fnv1a32, phaseSeed, xorshift32 } from "../src/prng.mjs";
import { directionFromUint32, generateSchedule, validateSchedule } from "../src/spawn-schedule.mjs";

test("OR-001: FNV-1a hello golden vector", () => {
  assert.equal(fnv1a32("hello"), 0x4f9f2cab);
});

test("OR-002: xorshift32 seed 1 first output", () => {
  assert.equal(xorshift32(1), 270369);
});

test("OR-003..005: independent phase hashes are fixed", () => {
  assert.equal(phaseSeed("TP6-v06", "0001", "EARLY"), 0xf219ebb0);
  assert.equal(phaseSeed("TP6-v06", "0001", "MIDDLE"), 0xfd1db64c);
  assert.equal(phaseSeed("TP6-v06", "0001", "LATE"), 0x0f6f2025);
});

test("detailed-design xorshift phase vectors are fixed", () => {
  const expected = {
    EARLY: [0x229e0ce7, 0x835131a6, 0x09d1c194],
    MIDDLE: [0x31566766, 0x4ae1eedb, 0x906c1d86],
    LATE: [0x86154790, 0xf20d4c83, 0x283d28ed],
  };
  for (const [phase, values] of Object.entries(expected)) {
    let state = phaseSeed("TP6-v06", "0001", phase);
    for (const value of values) {
      state = xorshift32(state);
      assert.equal(state, value);
    }
  }
});

test("OR-006..008: BASE schedule has 58 events and fixed first two", () => {
  const result = generateSchedule("0001", BASE_CONFIG);
  assert.equal(result.ok, true);
  assert.equal(result.schedule.length, 58);
  assert.deepEqual(result.schedule[0], { eventId: 1, spawnTick: 13, direction: "N" });
  assert.deepEqual(result.schedule[1], { eventId: 2, spawnTick: 26, direction: "E" });
  assert.deepEqual(
    result.schedule.slice(0, 10).map(({ direction }) => direction),
    ["N", "E", "N", "N", "S", "W", "E", "S", "W", "S"],
  );
});

test("FR-009: BASE schedule phase counts and boundaries are exact", () => {
  const { schedule } = generateSchedule("0001", BASE_CONFIG);
  assert.deepEqual(
    [
      schedule.filter(({ spawnTick }) => spawnTick < 200).length,
      schedule.filter(({ spawnTick }) => spawnTick >= 200 && spawnTick < 400).length,
      schedule.filter(({ spawnTick }) => spawnTick >= 400).length,
    ],
    [15, 19, 24],
  );
  assert.deepEqual([schedule[14].spawnTick, schedule[15].spawnTick, schedule[33].spawnTick, schedule[34].spawnTick, schedule[57].spawnTick], [195, 210, 390, 408, 592]);
});

test("direction assignment uses normative integer boundaries", () => {
  assert.equal(directionFromUint32(0x26666666, "MIDDLE"), "N");
  assert.equal(directionFromUint32(0x26666667, "MIDDLE"), "S");
  assert.equal(directionFromUint32(0x4ccccccc, "MIDDLE"), "S");
  assert.equal(directionFromUint32(0x4ccccccd, "MIDDLE"), "E");
  assert.equal(directionFromUint32(0xa6666666, "MIDDLE"), "E");
  assert.equal(directionFromUint32(0xa6666667, "MIDDLE"), "W");
});

test("direction assignment derives the same thresholds from Config weights", () => {
  const middleWeights = BASE_CONFIG.phases[1].weights;
  assert.equal(directionFromUint32(0x26666666, middleWeights), "N");
  assert.equal(directionFromUint32(0x26666667, middleWeights), "S");
  assert.equal(directionFromUint32(0xa6666667, middleWeights), "W");
});

test("ERR-T01/05: invalid seed, config, duplicate ID and reversed tick are rejected", () => {
  assert.equal(generateSchedule("1", BASE_CONFIG).code, "INVALID_SEED");
  const invalidConfig = cloneConfig();
  invalidConfig.tickDurationMs = 0;
  assert.equal(generateSchedule("0001", invalidConfig).code, "INVALID_CONFIG");
  const invalidSchedule = [
    { eventId: 1, spawnTick: 20, direction: "N" },
    { eventId: 1, spawnTick: 10, direction: "E" },
  ];
  const checked = validateSchedule(invalidSchedule, BASE_CONFIG);
  assert.equal(checked.valid, false);
  assert.ok(checked.violations.some((value) => value.startsWith("INVALID_EVENT_ID")));
  assert.ok(checked.violations.some((value) => value.startsWith("SPAWN_TICK_REVERSED")));
});

test("FR-005: schedule generation is deterministic and frozen", () => {
  const first = generateSchedule("0421", BASE_CONFIG);
  const second = generateSchedule("0421", BASE_CONFIG);
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first.schedule), true);
  assert.equal(Object.isFrozen(first.schedule[0]), true);
});

test("E1-M03: multiple seeds reproduce identical schedules independently", () => {
  for (let value = 1; value <= 20; value += 1) {
    const seedId = String(value).padStart(4, "0");
    const first = generateSchedule(seedId, BASE_CONFIG);
    const second = generateSchedule(seedId, BASE_CONFIG);
    assert.equal(first.ok, true);
    assert.deepEqual(first, second);
    assert.equal(first.schedule.length, 58);
    assert.equal(validateSchedule(first.schedule, BASE_CONFIG).valid, true);
  }
});
