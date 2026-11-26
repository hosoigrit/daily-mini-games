import {MAX_TICKS_PER_FRAME, PAUSE_GAP_MS, TICK_SECONDS} from '../data/physics-config.js';
import {advancePhysicsTick, getPhysicsSnapshot} from './adapter.js';

const tickMilliseconds = TICK_SECONDS * 1000;

export function createSimulationController(runtime) {
  let phase = 'READY';
  let lastFrame = null;
  let remainder = 0;
  const resetFrame = () => { lastFrame = null; remainder = 0; };

  function pause() {
    if (phase === 'RUNNING') {
      phase = 'PAUSED';
      resetFrame();
    }
  }

  function advanceFrame(timestamp, {hidden = false, rotated = false} = {}) {
    if (phase !== 'RUNNING') return 0;
    if (!Number.isFinite(timestamp) || hidden || rotated) {
      pause();
      return 0;
    }
    if (lastFrame === null) {
      lastFrame = timestamp;
      return 0;
    }
    const elapsed = timestamp - lastFrame;
    if (elapsed < 0 || elapsed >= PAUSE_GAP_MS) {
      pause();
      return 0;
    }
    lastFrame = timestamp;
    const accumulated = remainder + elapsed;
    const ticksDue = Math.floor((accumulated + 1e-9) / tickMilliseconds);
    remainder = Math.max(0, accumulated - ticksDue * tickMilliseconds);
    let elapsedTicks = 0;
    while (elapsedTicks < Math.min(ticksDue, MAX_TICKS_PER_FRAME)) {
      if (!advancePhysicsTick(runtime)) {
        phase = 'ERROR';
        break;
      }
      elapsedTicks++;
    }
    return elapsedTicks;
  }

  return {
    get phase() { return phase; },
    start() { if (phase === 'READY') phase = 'RUNNING'; },
    pause,
    resume() { if (phase === 'PAUSED') { resetFrame(); phase = 'RUNNING'; } },
    abort() { resetFrame(); phase = 'ABORTED'; },
    advanceFrame,
    snapshot: () => getPhysicsSnapshot(runtime),
  };
}
