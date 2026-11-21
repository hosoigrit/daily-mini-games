import { forecastMaxLoad } from "./forecast.mjs";

function opposite({ signal }) {
  if (signal.phase === "EW_GREEN") return "SWITCH_NS";
  if (signal.phase === "NS_GREEN") return "SWITCH_EW";
  return null;
}

const periodic = (interval) => (observation, tick) =>
  tick % interval === 0 ? opposite(observation) : null;

function queuePressure({ queues }, switchType) {
  const ns = Math.max(queues.north, queues.south);
  const ew = Math.max(queues.east, queues.west);
  return switchType === "SWITCH_NS" ? { red: ns, green: ew } : { red: ew, green: ns };
}

function pressureSwitch(observation, tick) {
  const choice = opposite(observation);
  if (choice === null) return null;
  const { red, green } = queuePressure(observation, choice);
  const greenAge = tick - observation.signal.greenStartTick;
  return red >= 7 || (red >= 5 && red - green >= 2 && greenAge >= 24) ? choice : null;
}

export function shouldSwitchForForecast(holdPeak, switchPeak) {
  return holdPeak - switchPeak >= 5_000;
}

function forecastSwitch(observation, tick) {
  if (tick % 5 !== 0) return null;
  const choice = opposite(observation);
  if (choice === null) return null;
  if (queuePressure(observation, choice).red >= 7) return choice;
  if (tick - observation.signal.greenStartTick < 12) return null;
  const holdPeak = forecastMaxLoad(observation, tick);
  const switchPeak = forecastMaxLoad(observation, tick, choice);
  return shouldSwitchForForecast(holdPeak, switchPeak) ? choice : null;
}

export const BOTS = Object.freeze(Object.fromEntries([
  ["BOT-01", () => null],
  ["BOT-02", periodic(50)],
  ["BOT-03", periodic(70)],
  ["BOT-04", pressureSwitch],
  ["BOT-05", forecastSwitch],
].map(([id, decide]) => [id, Object.freeze({ id, version: `TP6-${id}-v1`, decide })])));
