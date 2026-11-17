export const STORAGE_KEY = "daily-mini-games:0002:progress:v1";
export const SCHEMA_VERSION = 1;
export const FINAL_STAGE_ID = 6;

export function createDefaultProgress() {
  return {
    schemaVersion: SCHEMA_VERSION,
    highestUnlockedStage: 1,
    bestMoves: {},
  };
}

export function validateProgress(value) {
  if (!isPlainObject(value)) {
    return false;
  }

  const topLevelKeys = Object.keys(value).sort();
  if (topLevelKeys.join(",") !== "bestMoves,highestUnlockedStage,schemaVersion") {
    return false;
  }
  if (value.schemaVersion !== SCHEMA_VERSION) {
    return false;
  }
  if (!Number.isInteger(value.highestUnlockedStage)
    || value.highestUnlockedStage < 1
    || value.highestUnlockedStage > FINAL_STAGE_ID) {
    return false;
  }
  if (!isPlainObject(value.bestMoves)) {
    return false;
  }

  const bestMoveEntries = Object.entries(value.bestMoves);
  for (const [stageKey, moves] of bestMoveEntries) {
    if (!/^[1-6]$/.test(stageKey)
      || !Number.isSafeInteger(moves)
      || moves <= 0) {
      return false;
    }

    const stageId = Number(stageKey);
    if (stageId > value.highestUnlockedStage
      || (stageId === value.highestUnlockedStage && stageId < FINAL_STAGE_ID)) {
      return false;
    }
  }

  for (let stageId = 1; stageId < value.highestUnlockedStage; stageId += 1) {
    if (!Object.hasOwn(value.bestMoves, String(stageId))) {
      return false;
    }
  }

  return true;
}

export function cloneProgress(progress) {
  if (!validateProgress(progress)) {
    throw new TypeError("progress is invalid");
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    highestUnlockedStage: progress.highestUnlockedStage,
    bestMoves: { ...progress.bestMoves },
  };
}

export function loadProgress(storage) {
  try {
    const rawValue = storage.getItem(STORAGE_KEY);
    if (rawValue === null) {
      return { progress: createDefaultProgress(), storageAvailable: true, invalidData: false };
    }

    const parsed = JSON.parse(rawValue);
    if (!validateProgress(parsed)) {
      return { progress: createDefaultProgress(), storageAvailable: true, invalidData: true };
    }

    return { progress: cloneProgress(parsed), storageAvailable: true, invalidData: false };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { progress: createDefaultProgress(), storageAvailable: true, invalidData: true };
    }
    return { progress: createDefaultProgress(), storageAvailable: false, invalidData: false };
  }
}

export function loadProgressFromStorageOwner(storageOwner) {
  try {
    return loadProgress(storageOwner.localStorage);
  } catch {
    return { progress: createDefaultProgress(), storageAvailable: false, invalidData: false };
  }
}

export function saveProgress(storage, progress) {
  if (!validateProgress(progress)) {
    return false;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

export function saveProgressToStorageOwner(storageOwner, progress) {
  try {
    return saveProgress(storageOwner.localStorage, progress);
  } catch {
    return false;
  }
}

export function updateProgressAfterClear(progress, stageId, moves) {
  const nextProgress = cloneProgress(progress);
  if (!Number.isInteger(stageId)
    || stageId < 1
    || stageId > FINAL_STAGE_ID
    || stageId > nextProgress.highestUnlockedStage) {
    throw new RangeError("stageId must identify an unlocked stage");
  }
  if (!Number.isSafeInteger(moves) || moves <= 0) {
    throw new RangeError("moves must be a positive safe integer");
  }

  const previousBest = nextProgress.bestMoves[String(stageId)];
  const isNewBest = previousBest === undefined || moves < previousBest;
  if (isNewBest) {
    nextProgress.bestMoves[String(stageId)] = moves;
  }
  if (stageId < FINAL_STAGE_ID) {
    nextProgress.highestUnlockedStage = Math.max(
      nextProgress.highestUnlockedStage,
      stageId + 1,
    );
  }

  return { progress: nextProgress, isNewBest };
}

export function isStageUnlocked(progress, stageId) {
  return validateProgress(progress)
    && Number.isInteger(stageId)
    && stageId >= 1
    && stageId <= progress.highestUnlockedStage;
}

export function hasCompletedAllStages(progress) {
  return validateProgress(progress)
    && Object.hasOwn(progress.bestMoves, String(FINAL_STAGE_ID));
}

function isPlainObject(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
