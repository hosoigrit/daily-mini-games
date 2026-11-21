const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
};

export const DIRECTIONS = freeze(["N", "S", "E", "W"]);
export const QUEUE_KEYS = freeze({ N: "north", S: "south", E: "east", W: "west" });
export const FAILURE_DIRECTIONS = freeze({ N: "NORTH", S: "SOUTH", E: "EAST", W: "WEST" });

export const BASE_CONFIG = freeze({
  ruleVersion: "TP6-v06",
  balanceConfigId: "BASE",
  generatorVersion: "TP6-GEN-v1",
  engineVersion: "TP6-ENGINE-v1",
  eventSchemaVersion: "TP6-EVENT-v1",
  tickDurationMs: 100,
  endTick: 600,
  yellowTicks: 10,
  allRedTicks: 5,
  passInterval: 12,
  maxQueuePerDirection: 8,
  scorePerVehicle: 10,
  phases: [
    { id: "EARLY", firstTick: 13, interval: 13, count: 15, weights: { N: 2500, S: 2500, E: 2500, W: 2500 } },
    { id: "MIDDLE", firstTick: 210, interval: 10, count: 19, weights: { N: 1500, S: 1500, E: 3500, W: 3500 } },
    { id: "LATE", firstTick: 408, interval: 8, count: 24, weights: { N: 3500, S: 3500, E: 1500, W: 1500 } },
  ],
});

const positiveIntegerFields = [
  "tickDurationMs", "endTick", "yellowTicks", "allRedTicks", "passInterval",
  "maxQueuePerDirection", "scorePerVehicle",
];

export function validateConfig(config) {
  const violations = [];
  if (!config || typeof config !== "object") return { valid: false, violations: ["CONFIG_NOT_OBJECT"] };
  for (const field of ["ruleVersion", "balanceConfigId", "generatorVersion", "engineVersion", "eventSchemaVersion"]) {
    if (typeof config[field] !== "string" || config[field].length === 0) violations.push(`INVALID_${field.toUpperCase()}`);
  }
  for (const field of positiveIntegerFields) {
    if (!Number.isInteger(config[field]) || config[field] <= 0) violations.push(`INVALID_${field.toUpperCase()}`);
  }
  if (config.endTick !== 600) violations.push("END_TICK_MUST_BE_600");
  if (config.maxQueuePerDirection !== 8) violations.push("QUEUE_LIMIT_MUST_BE_8");
  if (!Array.isArray(config.phases) || config.phases.length !== 3) {
    violations.push("INVALID_PHASES");
  } else {
    const expectedIds = ["EARLY", "MIDDLE", "LATE"];
    config.phases.forEach((phase, index) => {
      if (!phase || phase.id !== expectedIds[index]) violations.push(`INVALID_PHASE_ID_${index}`);
      for (const field of ["firstTick", "interval", "count"]) {
        if (!Number.isInteger(phase?.[field]) || phase[field] <= 0) violations.push(`INVALID_PHASE_${index}_${field.toUpperCase()}`);
      }
      const weights = phase?.weights;
      if (!weights || DIRECTIONS.some((direction) => !Number.isInteger(weights[direction]) || weights[direction] < 0)) {
        violations.push(`INVALID_PHASE_${index}_WEIGHTS`);
      } else if (DIRECTIONS.reduce((sum, direction) => sum + weights[direction], 0) !== 10000) {
        violations.push(`INVALID_PHASE_${index}_WEIGHT_TOTAL`);
      }
      if (Number.isInteger(phase?.firstTick) && Number.isInteger(phase?.interval) && Number.isInteger(phase?.count)) {
        const lastTick = phase.firstTick + phase.interval * (phase.count - 1);
        if (lastTick >= config.endTick) violations.push(`PHASE_${index}_SPAWN_OUT_OF_RANGE`);
      }
    });
  }
  return { valid: violations.length === 0, violations };
}

export function cloneConfig(config = BASE_CONFIG) {
  return structuredClone(config);
}

export function scoreOf(snapshot, config = BASE_CONFIG) {
  return snapshot.passedVehicles * config.scorePerVehicle;
}
