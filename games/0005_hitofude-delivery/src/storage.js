export const STORAGE_KEY = "daily-mini-games.0005.progress.v1";
export const SCHEMA_VERSION = 1;

export function createDefaultProgress() {
  return {
    version: SCHEMA_VERSION,
    unlockedStage: 1,
    bestScores: { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null },
  };
}

function validScore(value) {
  return value === null || (Number.isInteger(value) && value >= 100 && value <= 1000);
}

export function sanitizeProgress(value) {
  if (!value || typeof value !== "object" || value.version !== SCHEMA_VERSION) {
    return createDefaultProgress();
  }
  const bestScores = {};
  for (let stageId = 1; stageId <= 6; stageId += 1) {
    const score = value.bestScores?.[stageId];
    bestScores[stageId] = validScore(score) ? score : null;
  }
  let clearedPrefix = 0;
  for (let stageId = 1; stageId <= 6 && bestScores[stageId] !== null; stageId += 1) {
    clearedPrefix = stageId;
  }
  return {
    version: SCHEMA_VERSION,
    unlockedStage: Math.min(6, clearedPrefix + 1),
    bestScores,
  };
}

export function recordClear(progress, stageId, score) {
  const safe = sanitizeProgress(progress);
  if (!Number.isInteger(stageId) || stageId < 1 || stageId > 6 || !validScore(score) || score === null) {
    return { progress: safe, bestUpdated: false, unlockedUpdated: false };
  }
  const previous = safe.bestScores[stageId];
  const bestUpdated = previous === null || score > previous;
  const bestScores = { ...safe.bestScores, [stageId]: bestUpdated ? score : previous };
  const updated = sanitizeProgress({ ...safe, bestScores });
  return {
    progress: updated,
    bestUpdated,
    unlockedUpdated: updated.unlockedStage > safe.unlockedStage,
  };
}

export function getTotalBest(progress) {
  return Object.values(sanitizeProgress(progress).bestScores)
    .reduce((total, score) => total + (score ?? 0), 0);
}

export function createProgressStore(storage, key = STORAGE_KEY) {
  let progress = createDefaultProgress();
  let persistent = true;
  let warning = "";

  function fail() {
    persistent = false;
    warning = "記録を保存できません。プレイは続けられます";
  }

  let storageArea = storage;
  if (arguments.length === 0) {
    try {
      storageArea = globalThis.localStorage;
    } catch {
      storageArea = null;
      fail();
    }
  }
  if (storageArea === undefined || storageArea === null) fail();

  function load() {
    if (!storageArea) {
      progress = createDefaultProgress();
      fail();
      return progress;
    }
    try {
      const raw = storageArea.getItem(key);
      progress = raw ? sanitizeProgress(JSON.parse(raw)) : createDefaultProgress();
    } catch {
      progress = createDefaultProgress();
      fail();
    }
    return progress;
  }

  function save(nextProgress) {
    progress = sanitizeProgress(nextProgress);
    if (!storageArea) {
      fail();
      return progress;
    }
    try {
      storageArea.setItem(key, JSON.stringify(progress));
    } catch {
      fail();
    }
    return progress;
  }

  function snapshot() {
    return {
      progress: sanitizeProgress(progress),
      persistent,
      warning,
    };
  }

  return { load, save, snapshot };
}

