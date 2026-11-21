import { BASE_CONFIG } from "../src/config.mjs";

// Browser snapshot of the frozen HARD-A profile. The Node suite checks every field.
const [early, middle, late] = BASE_CONFIG.phases;
export const PLAY_CONFIG = Object.freeze({
  ...BASE_CONFIG,
  balanceConfigId: "HARD-A",
  phases: Object.freeze([
    early,
    middle,
    Object.freeze({ ...late, firstTick: 407, interval: 7, count: 28 }),
  ]),
});
