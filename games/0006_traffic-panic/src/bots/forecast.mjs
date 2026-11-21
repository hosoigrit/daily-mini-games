import { DIRECTIONS, QUEUE_KEYS } from "../config.mjs";
import { passageDirections, requestSwitch, transitionSignal } from "../signal-fsm.mjs";

const VEHICLE_LOAD = 10_000;

export function forecastMaxLoad({ signal, queues, publicConfig }, targetTick, switchType = null) {
  const load = Object.fromEntries(DIRECTIONS.map((direction) => [
    direction, queues[QUEUE_KEYS[direction]] * VEHICLE_LOAD,
  ]));
  let peak = Math.max(...Object.values(load));
  const lastTick = Math.min(targetTick + 39, publicConfig.endTick - 1);
  if (targetTick > lastTick) return peak;

  if (switchType !== null) {
    const request = requestSwitch(signal, switchType, targetTick, publicConfig);
    if (!request.accepted) throw new RangeError(request.reason);
    signal = request.signal;
  }
  for (let tick = targetTick; tick <= lastTick; tick += 1) {
    signal = transitionSignal(signal, tick, publicConfig).signal;
    for (const direction of passageDirections(signal, tick, publicConfig)) {
      load[direction] = Math.max(0, load[direction] - VEHICLE_LOAD);
    }
    for (const { firstTick, interval, count, weights } of publicConfig.phases) {
      const delta = tick - firstTick;
      if (delta >= 0 && delta % interval === 0 && delta / interval < count) {
        for (const direction of DIRECTIONS) load[direction] += weights[direction];
      }
    }
    peak = Math.max(peak, ...Object.values(load));
  }
  return peak;
}
