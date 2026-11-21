import { BASE_CONFIG, DIRECTIONS, validateConfig } from "./config.mjs";
import { phaseSeed, xorshift32 } from "./prng.mjs";

const THRESHOLDS = Object.freeze({
  EARLY: Object.freeze([0x40000000, 0x80000000, 0xc0000000]),
  MIDDLE: Object.freeze([0x26666667, 0x4ccccccd, 0xa6666667]),
  LATE: Object.freeze([0x5999999a, 0xb3333334, 0xd999999a]),
});

function thresholdsFromWeights(weights) {
  let cumulative = 0n;
  return ["N", "S", "E"].map((direction) => {
    cumulative += BigInt(weights[direction]);
    return Number((cumulative * 0x100000000n + 9999n) / 10000n);
  });
}

export function directionFromUint32(value, phaseOrWeights) {
  const boundaries = typeof phaseOrWeights === "string"
    ? THRESHOLDS[phaseOrWeights]
    : thresholdsFromWeights(phaseOrWeights);
  if (!boundaries) throw new RangeError("UNKNOWN_PHASE");
  const unsigned = value >>> 0;
  if (unsigned < boundaries[0]) return "N";
  if (unsigned < boundaries[1]) return "S";
  if (unsigned < boundaries[2]) return "E";
  return "W";
}

export function validateSeedId(seedId) {
  return typeof seedId === "string" && /^\d{4}$/.test(seedId);
}

export function validateSchedule(schedule, config = BASE_CONFIG) {
  const violations = [];
  if (!Array.isArray(schedule)) return { valid: false, violations: ["SCHEDULE_NOT_ARRAY"] };
  let previousTick = 0;
  schedule.forEach((event, index) => {
    const expectedId = index + 1;
    if (!event || event.eventId !== expectedId) violations.push(`INVALID_EVENT_ID_${expectedId}`);
    if (!Number.isInteger(event?.spawnTick) || event.spawnTick < 1 || event.spawnTick >= config.endTick) {
      violations.push(`INVALID_SPAWN_TICK_${expectedId}`);
    } else if (event.spawnTick < previousTick) {
      violations.push(`SPAWN_TICK_REVERSED_${expectedId}`);
    }
    if (!DIRECTIONS.includes(event?.direction)) violations.push(`INVALID_DIRECTION_${expectedId}`);
    if (Number.isInteger(event?.spawnTick)) previousTick = event.spawnTick;
  });
  return { valid: violations.length === 0, violations };
}

export function generateSchedule(seedId, config = BASE_CONFIG, generatorVersion = config.generatorVersion) {
  const configResult = validateConfig(config);
  if (!configResult.valid) return { ok: false, code: "INVALID_CONFIG", violations: configResult.violations };
  if (!validateSeedId(seedId)) return { ok: false, code: "INVALID_SEED" };
  if (generatorVersion !== config.generatorVersion) return { ok: false, code: "GENERATOR_VERSION_MISMATCH" };

  const schedule = [];
  for (const phase of config.phases) {
    let state = phaseSeed(config.ruleVersion, seedId, phase.id);
    for (let index = 0; index < phase.count; index += 1) {
      state = xorshift32(state);
      schedule.push(Object.freeze({
        eventId: schedule.length + 1,
        spawnTick: phase.firstTick + phase.interval * index,
        direction: directionFromUint32(state, phase.weights),
      }));
    }
  }
  const scheduleResult = validateSchedule(schedule, config);
  if (!scheduleResult.valid) return { ok: false, code: "INVALID_SCHEDULE", violations: scheduleResult.violations };
  return { ok: true, schedule: Object.freeze(schedule) };
}
