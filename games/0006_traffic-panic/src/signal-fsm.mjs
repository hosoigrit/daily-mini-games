export const SIGNAL_PHASES = Object.freeze([
  "EW_GREEN", "EW_YELLOW", "ALL_RED_TO_NS",
  "NS_GREEN", "NS_YELLOW", "ALL_RED_TO_EW",
]);

export function createInitialSignal() {
  return { phase: "EW_GREEN", phaseStartTick: 0, nextTransitionTick: null, greenStartTick: 0 };
}

export function isGreen(signal) {
  return signal.phase === "EW_GREEN" || signal.phase === "NS_GREEN";
}

export function requestSwitch(signal, type, tick, config) {
  if (type !== "SWITCH_NS" && type !== "SWITCH_EW") return { accepted: false, reason: "INVALID_COMMAND" };
  if (!isGreen(signal)) return { accepted: false, reason: "TRANSITION_LOCKED" };
  if ((type === "SWITCH_NS" && signal.phase === "NS_GREEN") || (type === "SWITCH_EW" && signal.phase === "EW_GREEN")) {
    return { accepted: false, reason: "ALREADY_ACTIVE" };
  }
  const phase = signal.phase === "EW_GREEN" ? "EW_YELLOW" : "NS_YELLOW";
  return {
    accepted: true,
    signal: { phase, phaseStartTick: tick, nextTransitionTick: tick + config.yellowTicks, greenStartTick: null },
  };
}

export function transitionSignal(signal, tick, config) {
  if (signal.nextTransitionTick !== tick) return { signal: { ...signal }, event: null };
  const transitions = {
    EW_YELLOW: ["ALL_RED_TO_NS", config.allRedTicks, false],
    ALL_RED_TO_NS: ["NS_GREEN", null, true],
    NS_YELLOW: ["ALL_RED_TO_EW", config.allRedTicks, false],
    ALL_RED_TO_EW: ["EW_GREEN", null, true],
  };
  const next = transitions[signal.phase];
  if (!next) throw new Error("INVALID_SIGNAL_TRANSITION");
  const [phase, duration, green] = next;
  const updated = {
    phase,
    phaseStartTick: tick,
    nextTransitionTick: duration === null ? null : tick + duration,
    greenStartTick: green ? tick : null,
  };
  return { signal: updated, event: { type: "SIGNAL_CHANGED", tick, phase } };
}

export function passageDirections(signal, tick, config) {
  if (!isGreen(signal)) return [];
  const delta = tick - signal.greenStartTick;
  if (delta < config.passInterval || delta % config.passInterval !== 0) return [];
  return signal.phase === "NS_GREEN" ? ["N", "S"] : ["E", "W"];
}
