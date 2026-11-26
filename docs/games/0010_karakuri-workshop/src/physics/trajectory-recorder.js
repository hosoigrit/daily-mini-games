const copyPosition = ({x, y}) => ({x, y});
const resultLabel = new Map([['CLEARED', 'CLEARED'], ['FAILED', 'FAILED']]);

export function createTrajectoryRecorder(runId, initialPosition) {
  const points = [{tick: 0, position: copyPosition(initialPosition)}];
  function sample(tick, position) {
    if (tick <= points.at(-1).tick || tick % 6 !== 0) return;
    points.push({tick, position: copyPosition(position)});
  }
  function finish(tick, position, status) {
    const result = resultLabel.get(status);
    if (!result) return null;
    const sorted = points.map(entry => ({tick: entry.tick, position: copyPosition(entry.position)}));
    if (sorted.at(-1).tick !== tick) sorted.push({tick, position: copyPosition(position)});
    return {runId, result, elapsedSeconds: tick / 60, points: sorted};
  }
  return {sample, finish};
}

export function visibleTrajectory(previous, phase, enabled) {
  return enabled && phase !== 'RUNNING' && phase !== 'PAUSED' ? previous : null;
}
