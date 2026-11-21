import { BASE_CONFIG, scoreOf, validateConfig } from "./config.mjs";
import { passageDirections, requestSwitch, transitionSignal } from "./signal-fsm.mjs";
import { validateSchedule } from "./spawn-schedule.mjs";
import { validateSnapshot } from "./state-validator.mjs";
import { processArrivals, processPassages } from "./traffic-model.mjs";

function cloneSnapshot(snapshot) {
  return { ...snapshot, signal: { ...snapshot.signal }, queues: { ...snapshot.queues } };
}

function reject(command, reason) {
  return { commandSequence: command?.commandSequence ?? null, type: command?.type ?? null, accepted: false, reason };
}

export function validateCommandBatch(commands, minimumSequenceExclusive = null) {
  if (!Array.isArray(commands)) return { valid: false, violations: ["COMMANDS_NOT_ARRAY"] };
  const violations = [];
  let previous = minimumSequenceExclusive;
  for (const command of commands) {
    const sequence = command?.commandSequence;
    if (!Number.isSafeInteger(sequence) || sequence <= 0) {
      violations.push("INVALID_COMMAND_SEQUENCE");
      continue;
    }
    if (previous !== null && sequence === previous) violations.push("DUPLICATE_COMMAND_SEQUENCE");
    if (previous !== null && sequence < previous) violations.push("OUT_OF_ORDER_COMMAND_SEQUENCE");
    previous = sequence;
  }
  return { valid: violations.length === 0, violations };
}

export function advanceTick({ snapshot, targetTick, commands = [], config = BASE_CONFIG, schedule }) {
  try {
    const configResult = validateConfig(config);
    if (!configResult.valid) return { ok: false, code: "INVALID_CONFIG", violations: configResult.violations };
    const scheduleResult = validateSchedule(schedule, config);
    if (!scheduleResult.valid) return { ok: false, code: "INVALID_SCHEDULE", violations: scheduleResult.violations };
    if (snapshot?.overflowVehicles === 1) return { ok: false, code: "TERMINAL_SNAPSHOT", terminal: "GRIDLOCK" };
    const beforeResult = validateSnapshot(snapshot, schedule, config);
    if (!beforeResult.valid) return { ok: false, code: "INVALID_SNAPSHOT", violations: beforeResult.violations };
    if (!Number.isInteger(targetTick) || targetTick !== snapshot.elapsedTick + 1) return { ok: false, code: "WRONG_TICK" };

    const candidate = cloneSnapshot(snapshot);
    const outcomes = [];
    const events = [];
    if (targetTick === config.endTick) {
      candidate.elapsedTick = targetTick;
      for (const command of commands) outcomes.push(reject(command, "TIME_UP_NOT_EXECUTED"));
      const terminal = { result: "CLEAR", failureDirection: null };
      const checked = validateSnapshot(candidate, schedule, config, terminal);
      if (!checked.valid) return { ok: false, code: "ENGINE_FAULT", stage: "POST_UPDATE", violations: checked.violations };
      return { ok: true, snapshot: candidate, events, commandOutcomes: outcomes, terminal, score: scoreOf(candidate, config) };
    }

    const commandBatchResult = validateCommandBatch(commands);
    if (!commandBatchResult.valid) {
      return { ok: false, code: "INVALID_COMMAND_BATCH", violations: commandBatchResult.violations };
    }

    let acceptedSwitch = false;
    for (const command of commands) {
      if (!command || (command.type !== "SWITCH_NS" && command.type !== "SWITCH_EW")) {
        outcomes.push(reject(command, "INVALID_COMMAND"));
        continue;
      }
      if (!Number.isInteger(command.targetTick)) {
        outcomes.push(reject(command, "INVALID_TARGET"));
        continue;
      }
      if (command.targetTick !== targetTick) {
        outcomes.push(reject(command, "WRONG_TICK"));
        continue;
      }
      if (acceptedSwitch) {
        outcomes.push(reject(command, "DUPLICATE"));
        continue;
      }
      const switchResult = requestSwitch(candidate.signal, command.type, targetTick, config);
      if (!switchResult.accepted) {
        outcomes.push(reject(command, switchResult.reason));
        continue;
      }
      candidate.signal = switchResult.signal;
      candidate.switchCount += 1;
      acceptedSwitch = true;
      outcomes.push({ commandSequence: command.commandSequence ?? null, type: command.type, accepted: true, reason: null });
      events.push({ type: "SWITCH_ACCEPTED", tick: targetTick, command: command.type });
    }

    const transition = transitionSignal(candidate.signal, targetTick, config);
    candidate.signal = transition.signal;
    if (transition.event) events.push(transition.event);

    const passage = processPassages(candidate, passageDirections(candidate.signal, targetTick, config), targetTick);
    candidate.queues = passage.queues;
    candidate.passedVehicles = passage.passedVehicles;
    events.push(...passage.events);

    const arrivals = processArrivals(candidate, schedule, targetTick, config);
    candidate.queues = arrivals.queues;
    candidate.spawnCursor = arrivals.spawnCursor;
    candidate.arrivalAttempts = arrivals.arrivalAttempts;
    candidate.overflowVehicles = arrivals.overflowVehicles;
    candidate.maxQueueLength = arrivals.maxQueueLength;
    candidate.elapsedTick = targetTick;
    events.push(...arrivals.events);

    const checked = validateSnapshot(candidate, schedule, config, arrivals.terminal);
    if (!checked.valid) return { ok: false, code: "ENGINE_FAULT", stage: "POST_UPDATE", violations: checked.violations };
    return {
      ok: true,
      snapshot: candidate,
      events,
      commandOutcomes: outcomes,
      terminal: arrivals.terminal,
      score: scoreOf(candidate, config),
    };
  } catch (error) {
    return { ok: false, code: "ENGINE_FAULT", stage: "EXCEPTION", fault: { name: error.name, message: error.message } };
  }
}
