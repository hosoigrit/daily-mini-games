export function starsForResult(status, placedCount, star3Target) {
  if (status !== 'CLEARED') return 0;
  if (placedCount <= star3Target) return 3;
  return placedCount === star3Target + 1 ? 2 : 1;
}

export function captureRunDesign(placements) {
  return placements.map(({id, type, gridX, gridY, angleDeg}) =>
    Object.freeze({id, type, gridX, gridY, angleDeg}));
}

export function initialProgress() {
  return {stages: {}, achievements: {allCleared: false, allStars: false}};
}

export function unlockedStages(progress, count = 10) {
  return Array.from({length: count}, (_, i) => String(i + 1).padStart(2, '0')).filter((id, i) =>
    i === 0 || progress.stages[String(i).padStart(2, '0')]?.cleared);
}

export function commitScore(progress, {stageId, status, compatibility, placements, star3Target}) {
  const stars = starsForResult(status, placements.length, star3Target);
  if (!stars) return {progress, stars, achievements: []};
  const old = progress.stages[stageId];
  const newVersion = old?.best?.compatibility !== compatibility;
  const sameVersionBest = newVersion ? null : old.best;
  const best = !sameVersionBest || placements.length < sameVersionBest.placedCount
    ? {placedCount: placements.length, stars, compatibility, placements: captureRunDesign(placements)}
    : sameVersionBest;
  const updated = {
    cleared: true, historicalStars: Math.max(old?.historicalStars ?? 0, stars), best,
    previousBest: (newVersion ? old?.best : null) ?? old?.previousBest ?? null,
  };
  const stages = {...progress.stages, [stageId]: updated};
  const complete = Object.values(stages).filter(entry => entry.cleared).length === 10;
  const maximum = Object.values(stages).reduce((sum, entry) => sum + entry.historicalStars, 0) === 30;
  const achievements = [];
  if (complete && !progress.achievements.allCleared) achievements.push('ALL_CLEARED');
  if (maximum && !progress.achievements.allStars) achievements.push('ALL_STARS');
  return {stars, achievements, progress: {stages, achievements: {
    allCleared: progress.achievements.allCleared || complete,
    allStars: progress.achievements.allStars || maximum,
  }}};
}
