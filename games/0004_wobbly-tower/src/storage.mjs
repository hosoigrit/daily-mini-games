export const STORAGE_KEY = "dailyMiniGames.game0004.best.v1";
export const EMPTY_BEST = Object.freeze({ bestFloor: 0, bestScore: 0 });

export function loadBest(storage) {
  if (!storage) return { ...EMPTY_BEST };
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY));
    if (!isValidBest(parsed)) return { ...EMPTY_BEST };
    return { bestFloor: parsed.bestFloor, bestScore: parsed.bestScore };
  } catch {
    return { ...EMPTY_BEST };
  }
}

export function updateBest(previous, result) {
  const safePrevious = isValidBest(previous) ? previous : EMPTY_BEST;
  const floor = validInteger(result?.floor, 0, 10) ? result.floor : 0;
  const score = validInteger(result?.score, 0, 1850) ? result.score : 0;
  return {
    bestFloor: Math.max(safePrevious.bestFloor, floor),
    bestScore: Math.max(safePrevious.bestScore, score),
  };
}

export function saveBest(storage, best) {
  if (!storage || !isValidBest(best)) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(best));
    return true;
  } catch {
    return false;
  }
}

export function getBrowserStorage(browserWindow) {
  try {
    return browserWindow.localStorage;
  } catch {
    return null;
  }
}

function isValidBest(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    validInteger(value.bestFloor, 0, 10) &&
    validInteger(value.bestScore, 0, 1850)
  );
}

function validInteger(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}
