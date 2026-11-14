export const PHASE = Object.freeze({
  READY: "ready",
  PLAYING: "playing",
  RESULT: "result",
});

export const GAME_DURATION_MS = 30_000;
export const TARGET_SIZE_PX = 64;
export const STORAGE_KEY = "daily-mini-games:0001:best-score:v1";

export function parseBestScore(rawValue) {
  if (typeof rawValue !== "string" || !/^\d+$/.test(rawValue)) {
    return 0;
  }

  const value = Number(rawValue);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function loadBestScore(storage, key = STORAGE_KEY) {
  try {
    return { score: parseBestScore(storage.getItem(key)), available: true };
  } catch {
    return { score: 0, available: false };
  }
}

export function loadBestScoreFromStorageOwner(storageOwner, key = STORAGE_KEY) {
  try {
    return loadBestScore(storageOwner.localStorage, key);
  } catch {
    return { score: 0, available: false };
  }
}

export function saveBestScore(storage, score, key = STORAGE_KEY) {
  if (!Number.isSafeInteger(score) || score < 0) {
    return false;
  }

  try {
    storage.setItem(key, String(score));
    return true;
  } catch {
    return false;
  }
}

export function saveBestScoreToStorageOwner(storageOwner, score, key = STORAGE_KEY) {
  try {
    return saveBestScore(storageOwner.localStorage, score, key);
  } catch {
    return false;
  }
}

export function createInitialState(bestScore = 0) {
  return {
    phase: PHASE.READY,
    score: 0,
    bestScore: Number.isSafeInteger(bestScore) && bestScore >= 0 ? bestScore : 0,
    startedAtMs: null,
    deadlineAtMs: null,
    remainingSec: 30,
    targetX: 0,
    targetY: 0,
    roundId: 0,
  };
}

export function randomTargetPosition(width, height, random = Math.random) {
  const maxX = Math.max(0, finiteOrZero(width) - TARGET_SIZE_PX);
  const maxY = Math.max(0, finiteOrZero(height) - TARGET_SIZE_PX);
  const randomX = clampRandom(random());
  const randomY = clampRandom(random());

  return {
    x: randomX * maxX,
    y: randomY * maxY,
  };
}

export function clampTargetPosition(position, width, height) {
  const maxX = Math.max(0, finiteOrZero(width) - TARGET_SIZE_PX);
  const maxY = Math.max(0, finiteOrZero(height) - TARGET_SIZE_PX);

  return {
    x: clamp(finiteOrZero(position?.x), 0, maxX),
    y: clamp(finiteOrZero(position?.y), 0, maxY),
  };
}

export function startRound(state, nowMs, position = { x: 0, y: 0 }) {
  if (state.phase === PHASE.PLAYING || !Number.isFinite(nowMs)) {
    return state;
  }

  return {
    ...state,
    phase: PHASE.PLAYING,
    score: 0,
    startedAtMs: nowMs,
    deadlineAtMs: nowMs + GAME_DURATION_MS,
    remainingSec: 30,
    targetX: finiteOrZero(position.x),
    targetY: finiteOrZero(position.y),
    roundId: state.roundId + 1,
  };
}

export function getTimerSnapshot(deadlineAtMs, nowMs) {
  if (!Number.isFinite(deadlineAtMs) || !Number.isFinite(nowMs)) {
    return { remainingMs: 0, remainingSec: 0, expired: true };
  }

  const remainingMs = Math.max(0, deadlineAtMs - nowMs);
  return {
    remainingMs,
    remainingSec: remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0,
    expired: remainingMs === 0,
  };
}

export function scoreTarget(state, nowMs, nextPosition) {
  if (state.phase !== PHASE.PLAYING) {
    return { state, scored: false, expired: false };
  }

  const timer = getTimerSnapshot(state.deadlineAtMs, nowMs);
  if (timer.expired) {
    return { state: { ...state, remainingSec: 0 }, scored: false, expired: true };
  }

  return {
    state: {
      ...state,
      score: state.score + 1,
      remainingSec: timer.remainingSec,
      targetX: finiteOrZero(nextPosition?.x),
      targetY: finiteOrZero(nextPosition?.y),
    },
    scored: true,
    expired: false,
  };
}

export function updateTimer(state, nowMs) {
  if (state.phase !== PHASE.PLAYING) {
    return { state, expired: false };
  }

  const timer = getTimerSnapshot(state.deadlineAtMs, nowMs);
  return {
    state: { ...state, remainingSec: timer.remainingSec },
    expired: timer.expired,
  };
}

export function finishRound(state, nowMs) {
  if (state.phase !== PHASE.PLAYING) {
    return { state, ended: false, newBest: false };
  }

  if (!getTimerSnapshot(state.deadlineAtMs, nowMs).expired) {
    return { state, ended: false, newBest: false };
  }

  const newBest = state.score > state.bestScore;
  return {
    state: {
      ...state,
      phase: PHASE.RESULT,
      bestScore: newBest ? state.score : state.bestScore,
      remainingSec: 0,
    },
    ended: true,
    newBest,
  };
}

export function resizeTarget(state, width, height) {
  if (state.phase !== PHASE.PLAYING) {
    return state;
  }

  const position = clampTargetPosition(
    { x: state.targetX, y: state.targetY },
    width,
    height,
  );

  if (position.x === state.targetX && position.y === state.targetY) {
    return state;
  }

  return { ...state, targetX: position.x, targetY: position.y };
}

export function beginActivationKey(currentKey, key, repeat = false) {
  if (!isActivationKey(key) || repeat || currentKey !== null) {
    return { pressedKey: currentKey, accepted: false };
  }

  return { pressedKey: key, accepted: true };
}

export function releaseActivationKey(currentKey, key) {
  if (!isActivationKey(key) || currentKey !== key) {
    return { pressedKey: currentKey, activate: false };
  }

  return { pressedKey: null, activate: true };
}

function isActivationKey(key) {
  return key === "Enter" || key === " " || key === "Space" || key === "Spacebar";
}

function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampRandom(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1 - Number.EPSILON, Math.max(0, value));
}
