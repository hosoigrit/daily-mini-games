export function playbackDelay(speed, reducedMotion) {
  if (reducedMotion || speed === 'instant') return 0;
  return speed === 'fast' ? 230 : 720;
}

export function createPlayback({ schedule = setTimeout, cancel = clearTimeout } = {}) {
  let timer;
  let generation = 0;
  function stop() {
    generation++;
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  }

  function play(log, delay, frame, complete) {
    stop();
    const current = generation;
    let index = 0;
    function step() {
      if (current !== generation) return;
      if (index === log.length) { complete(); return; }
      frame(++index);
      if (current !== generation) return;
      timer = schedule(step, delay);
    }
    if (delay === 0) {
      frame(log.length);
      if (current === generation) complete();
    } else {
      timer = schedule(step, delay);
    }
  }
  return { play, stop };
}
