import { BASE_CONFIG, scoreOf, validateConfig } from "./config.mjs";
import { advanceTick, validateCommandBatch } from "./game-engine.mjs";
import { generateSchedule, validateSchedule, validateSeedId } from "./spawn-schedule.mjs";
import { createInitialSnapshot, validateSnapshot } from "./state-validator.mjs";

const CONTROL_TYPES = new Set(["START", "PAUSE", "RESUME", "RETRY"]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function cloneSession(session) {
  const cloned = structuredClone(session);
  deepFreeze(cloned.schedule);
  deepFreeze(cloned.config);
  return cloned;
}

function outcome(command, accepted, reason = null) {
  return { commandSequence: command?.commandSequence ?? null, type: command?.type ?? null, accepted, reason };
}

function lastValidCommandSequence(session) {
  let last = null;
  for (const boundary of session.replayLog ?? []) {
    if (boundary.commandOutcomes?.some(({ reason }) => reason === "INVALID_COMMAND_BATCH")) continue;
    for (const command of boundary.commands ?? []) {
      if (Number.isSafeInteger(command?.commandSequence)) last = command.commandSequence;
    }
  }
  return last;
}

export function createSession({ config = BASE_CONFIG, seedId, schedule = null, sessionId = `${seedId}:1`, retryOrdinal = 1 }) {
  const configResult = validateConfig(config);
  if (!configResult.valid) return { ok: false, code: "INVALID_CONFIG", violations: configResult.violations };
  if (!validateSeedId(seedId)) return { ok: false, code: "INVALID_SEED" };
  const scheduleResult = schedule === null ? generateSchedule(seedId, config) : { ok: true, schedule };
  if (!scheduleResult.ok) return scheduleResult;
  const checkedSchedule = validateSchedule(scheduleResult.schedule, config);
  if (!checkedSchedule.valid) return { ok: false, code: "INVALID_SCHEDULE", violations: checkedSchedule.violations };
  const snapshot = createInitialSnapshot();
  const checkedSnapshot = validateSnapshot(snapshot, scheduleResult.schedule, config);
  if (!checkedSnapshot.valid) return { ok: false, code: "INVALID_SNAPSHOT", violations: checkedSnapshot.violations };
  return {
    ok: true,
    session: {
      status: "READY",
      snapshot,
      result: null,
      failureDirection: null,
      fault: null,
      sessionId,
      seedId,
      retryOrdinal,
      schedule: deepFreeze(structuredClone(scheduleResult.schedule)),
      config: deepFreeze(structuredClone(config)),
      boundaryId: 0,
      replayLog: [],
    },
  };
}

function recordBoundary(session, beforeTick, commands, commandOutcomes, events) {
  session.replayLog.push({
    boundaryId: session.boundaryId,
    beforeTick,
    commands: structuredClone(commands),
    commandOutcomes: structuredClone(commandOutcomes),
    events: structuredClone(events),
  });
}

function rejectBoundary(session, beforeTick, list, code) {
  const commandOutcomes = list.map((command) => outcome(command, false, "NOT_RUNNING"));
  const events = [];
  recordBoundary(session, beforeTick, list, commandOutcomes, events);
  return { ok: false, code, session, commandOutcomes, events };
}

export function processBoundary(original, commands = []) {
  if (!original || typeof original !== "object") return { ok: false, code: "INVALID_SESSION" };
  const session = cloneSession(original);
  const beforeTick = original.snapshot?.elapsedTick;
  session.boundaryId += 1;
  const list = Array.isArray(commands) ? commands : [];
  const outcomes = [];
  const events = [];

  const commandBatchResult = validateCommandBatch(commands, lastValidCommandSequence(original));
  if (!commandBatchResult.valid) {
    for (const command of list) outcomes.push(outcome(command, false, "INVALID_COMMAND_BATCH"));
    recordBoundary(session, beforeTick, list, outcomes, events);
    return {
      ok: false,
      code: "INVALID_COMMAND_BATCH",
      violations: commandBatchResult.violations,
      session,
      commandOutcomes: outcomes,
      events,
    };
  }

  if (session.status === "FINISHED" || session.status === "ERROR") {
    const retry = list.find((command) => command?.type === "RETRY");
    if (retry) {
      const created = createSession({
        config: session.config,
        seedId: session.seedId,
        sessionId: `${session.seedId}:${session.retryOrdinal + 1}`,
        retryOrdinal: session.retryOrdinal + 1,
      });
      if (!created.ok) return created;
      return { ok: true, session: created.session, commandOutcomes: list.map((command) => outcome(command, command === retry, command === retry ? null : "DISCARDED_BY_RETRY")), events: [{ type: "RETRIED" }] };
    }
    return rejectBoundary(session, beforeTick, list, "NOT_ALLOWED");
  }

  const pause = list.find((command) => command?.type === "PAUSE");
  if (pause && (session.status === "RUNNING" || session.status === "PAUSED")) {
    session.status = "PAUSED";
    for (const command of list) outcomes.push(outcome(command, command === pause, command === pause ? null : "DISCARDED_BY_PAUSE"));
    events.push({ type: "SESSION_PAUSED" });
    recordBoundary(session, beforeTick, list, outcomes, events);
    return { ok: true, session, commandOutcomes: outcomes, events };
  }

  if (session.status === "PAUSED") {
    const resume = list.find((command) => command?.type === "RESUME");
    if (!resume) return rejectBoundary(session, beforeTick, list, "NOT_RUNNING");
    session.status = "RUNNING";
    for (const command of list) outcomes.push(outcome(command, command === resume, command === resume ? null : "DISCARDED_BY_RESUME"));
    events.push({ type: "SESSION_RESUMED" });
    recordBoundary(session, beforeTick, list, outcomes, events);
    return { ok: true, session, commandOutcomes: outcomes, events };
  }

  if (session.status === "READY") {
    const start = list.find((command) => command?.type === "START");
    if (!start) return rejectBoundary(session, beforeTick, list, "NOT_ALLOWED");
    session.status = "RUNNING";
    for (const command of list) outcomes.push(outcome(command, command === start, command === start ? null : "DISCARDED_BY_START"));
    events.push({ type: "SESSION_STARTED" });
    recordBoundary(session, beforeTick, list, outcomes, events);
    return { ok: true, session, commandOutcomes: outcomes, events };
  }

  const switchCommands = [];
  for (const command of list) {
    if (command?.type === "SWITCH_NS" || command?.type === "SWITCH_EW" || !CONTROL_TYPES.has(command?.type)) {
      switchCommands.push(command);
    } else {
      outcomes.push(outcome(command, false, "INVALID_CONTROL"));
    }
  }
  const engineResult = advanceTick({
    snapshot: session.snapshot,
    targetTick: session.snapshot.elapsedTick + 1,
    commands: switchCommands,
    config: session.config,
    schedule: session.schedule,
  });
  if (!engineResult.ok) {
    session.status = "ERROR";
    session.fault = { code: engineResult.code, stage: engineResult.stage ?? null, violations: engineResult.violations ?? [] };
    recordBoundary(session, beforeTick, list, outcomes, events);
    return { ok: false, code: engineResult.code, session, commandOutcomes: outcomes, events };
  }
  session.snapshot = engineResult.snapshot;
  outcomes.push(...engineResult.commandOutcomes);
  events.push(...engineResult.events);
  if (engineResult.terminal) {
    session.status = "FINISHED";
    session.result = engineResult.terminal.result;
    session.failureDirection = engineResult.terminal.failureDirection;
  }
  recordBoundary(session, beforeTick, list, outcomes, events);
  return { ok: true, session, commandOutcomes: outcomes, events, terminal: engineResult.terminal, score: engineResult.score };
}

export function getObservation(session) {
  if (!session || !["READY", "RUNNING", "PAUSED", "FINISHED"].includes(session.status)) return { ok: false, code: "INVALID_SESSION" };
  return {
    ok: true,
    observation: {
      status: session.status,
      elapsedTick: session.snapshot.elapsedTick,
      signal: structuredClone(session.snapshot.signal),
      queues: structuredClone(session.snapshot.queues),
      score: scoreOf(session.snapshot, session.config),
      passedVehicles: session.snapshot.passedVehicles,
      result: session.result,
      failureDirection: session.failureDirection,
      publicConfig: {
        ruleVersion: session.config.ruleVersion,
        balanceConfigId: session.config.balanceConfigId,
        tickDurationMs: session.config.tickDurationMs,
        endTick: session.config.endTick,
        yellowTicks: session.config.yellowTicks,
        allRedTicks: session.config.allRedTicks,
        passInterval: session.config.passInterval,
        phases: session.config.phases.map(({ id, firstTick, interval, count, weights }) => ({ id, firstTick, interval, count, weights: { ...weights } })),
      },
    },
  };
}

export function replayBatches({ config = BASE_CONFIG, seedId, batches, versions }) {
  const required = {
    ruleVersion: config.ruleVersion,
    generatorVersion: config.generatorVersion,
    engineVersion: config.engineVersion,
    eventSchemaVersion: config.eventSchemaVersion,
  };
  if (!versions || Object.entries(required).some(([key, value]) => versions[key] !== value)) return { ok: false, code: "VERSION_MISMATCH" };
  if (!Array.isArray(batches)) return { ok: false, code: "INVALID_REPLAY_BATCHES" };
  const created = createSession({ config, seedId });
  if (!created.ok) return created;
  let session = created.session;
  const trace = [];
  for (const commands of batches) {
    const result = processBoundary(session, commands);
    session = result.session;
    trace.push({ ok: result.ok, snapshot: structuredClone(session.snapshot), events: structuredClone(result.events), outcomes: structuredClone(result.commandOutcomes) });
    if (!result.ok) return { ok: false, code: result.code, violations: result.violations ?? [], session, trace };
    if (session.status === "FINISHED" || session.status === "ERROR") break;
  }
  return { ok: true, session, trace };
}
