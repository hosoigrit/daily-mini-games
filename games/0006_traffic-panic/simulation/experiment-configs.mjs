import { BASE_CONFIG } from "../src/config.mjs";

function withLatePhase(balanceConfigId, firstTick, interval, count) {
  const [early, middle, late] = BASE_CONFIG.phases;
  return Object.freeze({
    ...BASE_CONFIG,
    balanceConfigId,
    phases: Object.freeze([early, middle, Object.freeze({ ...late, firstTick, interval, count })]),
  });
}

export const EXPERIMENT_CONFIGS = Object.freeze({
  BASE: BASE_CONFIG,
  "HARD-A": withLatePhase("HARD-A", 407, 7, 28),
  "HARD-B": Object.freeze({ ...BASE_CONFIG, balanceConfigId: "HARD-B", allRedTicks: 10 }),
  "EASY-A": withLatePhase("EASY-A", 409, 9, 22),
});
