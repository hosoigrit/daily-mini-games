import { BASE_CONFIG, QUEUE_KEYS } from "./config.mjs";
import { SIGNAL_PHASES, isGreen } from "./signal-fsm.mjs";
import { validateSchedule } from "./spawn-schedule.mjs";

export function validateSignal(signal, elapsedTick, config = BASE_CONFIG, terminal = null) {
  const violations = [];
  if (!signal || !SIGNAL_PHASES.includes(signal.phase)) return ["INVALID_SIGNAL_PHASE"];
  if (!Number.isInteger(signal.phaseStartTick) || signal.phaseStartTick < 0 || signal.phaseStartTick > elapsedTick) violations.push("INVALID_PHASE_START_TICK");
  if (isGreen(signal)) {
    if (signal.nextTransitionTick !== null) violations.push("GREEN_HAS_TRANSITION_TICK");
    if (signal.greenStartTick !== signal.phaseStartTick) violations.push("INVALID_GREEN_START_TICK");
  } else {
    if (signal.greenStartTick !== null) violations.push("NON_GREEN_HAS_GREEN_START");
    // CLEAR ends the final tick before the scheduled signal transition runs.
    const skippedAtClear = terminal?.result === "CLEAR"
      && elapsedTick === config.endTick && signal.nextTransitionTick === elapsedTick;
    if (!Number.isInteger(signal.nextTransitionTick)
      || (signal.nextTransitionTick <= elapsedTick && !skippedAtClear)) violations.push("INVALID_NEXT_TRANSITION_TICK");
    const expectedDuration = signal.phase.includes("YELLOW") ? config.yellowTicks : config.allRedTicks;
    if (signal.nextTransitionTick !== signal.phaseStartTick + expectedDuration) violations.push("INVALID_TRANSITION_DURATION");
  }
  return violations;
}

export function validateSnapshot(snapshot, schedule, config = BASE_CONFIG, terminal = null) {
  const violations = [];
  if (!snapshot || typeof snapshot !== "object") return { valid: false, violations: ["SNAPSHOT_NOT_OBJECT"] };
  if (!Number.isInteger(snapshot.elapsedTick) || snapshot.elapsedTick < 0 || snapshot.elapsedTick > config.endTick) violations.push("INVALID_ELAPSED_TICK");
  const scheduleResult = validateSchedule(schedule, config);
  if (!scheduleResult.valid) violations.push(...scheduleResult.violations);
  violations.push(...validateSignal(snapshot.signal, snapshot.elapsedTick, config, terminal));
  if (!snapshot.queues || Object.values(QUEUE_KEYS).some((key) => !Number.isInteger(snapshot.queues[key]) || snapshot.queues[key] < 0 || snapshot.queues[key] > config.maxQueuePerDirection)) {
    violations.push("INVALID_QUEUES");
  }
  for (const field of ["spawnCursor", "arrivalAttempts", "passedVehicles", "switchCount", "maxQueueLength"]) {
    if (!Number.isInteger(snapshot[field]) || snapshot[field] < 0) violations.push(`INVALID_${field.toUpperCase()}`);
  }
  if (snapshot.spawnCursor > schedule.length || snapshot.arrivalAttempts > schedule.length) violations.push("CURSOR_OUT_OF_RANGE");
  if (snapshot.spawnCursor !== snapshot.arrivalAttempts) violations.push("CURSOR_ATTEMPT_MISMATCH");
  if (snapshot.overflowVehicles !== 0 && snapshot.overflowVehicles !== 1) violations.push("INVALID_OVERFLOW_COUNT");
  const cursorIsUsable = scheduleResult.valid
    && Array.isArray(schedule)
    && Number.isInteger(snapshot.spawnCursor)
    && snapshot.spawnCursor >= 0
    && snapshot.spawnCursor <= schedule.length
    && Number.isInteger(snapshot.elapsedTick)
    && snapshot.elapsedTick >= 0;
  if (cursorIsUsable) {
    const processedFutureEvent = schedule
      .slice(0, snapshot.spawnCursor)
      .some((event) => event.spawnTick > snapshot.elapsedTick);
    if (processedFutureEvent) violations.push("PROCESSED_EVENT_AFTER_ELAPSED_TICK");

    const nextEvent = schedule[snapshot.spawnCursor];
    if (nextEvent) {
      const mayLeaveSameTickEvents = terminal?.result === "GRIDLOCK";
      const missedPastEvent = mayLeaveSameTickEvents
        ? nextEvent.spawnTick < snapshot.elapsedTick
        : nextEvent.spawnTick <= snapshot.elapsedTick;
      if (missedPastEvent) violations.push("UNPROCESSED_EVENT_AT_OR_BEFORE_ELAPSED_TICK");
    }
  }
  if (snapshot.queues) {
    const queueSum = Object.values(QUEUE_KEYS).reduce((sum, key) => sum + (snapshot.queues[key] ?? 0), 0);
    if (snapshot.arrivalAttempts !== snapshot.passedVehicles + queueSum + snapshot.overflowVehicles) violations.push("VEHICLE_CONSERVATION_BROKEN");
    const currentMax = Math.max(...Object.values(QUEUE_KEYS).map((key) => snapshot.queues[key] ?? 0));
    if (!Number.isInteger(snapshot.maxQueueLength) || snapshot.maxQueueLength < currentMax || snapshot.maxQueueLength > config.maxQueuePerDirection) violations.push("INVALID_MAX_QUEUE_LENGTH");
  }
  if (terminal?.result === "CLEAR" && snapshot.elapsedTick !== config.endTick) violations.push("CLEAR_AT_WRONG_TICK");
  if (terminal?.result === "GRIDLOCK" && (snapshot.elapsedTick >= config.endTick || snapshot.overflowVehicles !== 1)) violations.push("INVALID_GRIDLOCK_STATE");
  if (snapshot.overflowVehicles === 1 && terminal?.result !== "GRIDLOCK") violations.push("GRIDLOCK_TERMINAL_REQUIRED");
  return { valid: violations.length === 0, violations };
}

export function createInitialSnapshot() {
  return {
    elapsedTick: 0,
    signal: { phase: "EW_GREEN", phaseStartTick: 0, nextTransitionTick: null, greenStartTick: 0 },
    queues: { north: 0, south: 0, east: 0, west: 0 },
    spawnCursor: 0,
    arrivalAttempts: 0,
    passedVehicles: 0,
    overflowVehicles: 0,
    switchCount: 0,
    maxQueueLength: 0,
  };
}
