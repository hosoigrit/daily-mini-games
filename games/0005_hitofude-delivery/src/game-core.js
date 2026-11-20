export const DIRECTIONS = Object.freeze([
  Object.freeze([-1, 0]),
  Object.freeze([0, 1]),
  Object.freeze([1, 0]),
  Object.freeze([0, -1]),
]);

export function coordKey([row, col]) {
  return `${row},${col}`;
}

export function sameCoord(a, b) {
  return Boolean(a && b && a[0] === b[0] && a[1] === b[1]);
}

export function isInBounds(stage, [row, col]) {
  return Number.isInteger(row) && Number.isInteger(col)
    && row >= 0 && row < stage.size && col >= 0 && col < stage.size;
}

export function isAdjacent(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
}

export function getCollectedParcelKeys(stage, route) {
  const parcelKeys = new Set(stage.parcels.map(coordKey));
  return new Set(route.map(coordKey).filter((key) => parcelKeys.has(key)));
}

export function getRemainingParcels(stage, route) {
  const collected = getCollectedParcelKeys(stage, route);
  return stage.parcels.filter((parcel) => !collected.has(coordKey(parcel)));
}

export function calculateScore({ undoCount = 0, resetCount = 0, hintCount = 0 }) {
  return Math.max(100, 1000 - (50 * undoCount) - (100 * resetCount) - (100 * hintCount));
}

export function evaluateScore(score, counts = {}) {
  const stars = score >= 900 ? 3 : score >= 700 ? 2 : 1;
  const perfect = score === 1000
    && (counts.undoCount ?? 0) === 0
    && (counts.resetCount ?? 0) === 0
    && (counts.hintCount ?? 0) === 0;
  return {
    stars,
    perfect,
    label: perfect ? "PERFECT" : stars === 3 ? "EXCELLENT" : stars === 2 ? "GOOD" : "CLEAR",
  };
}

export function createGameState(stage) {
  if (!stage) throw new TypeError("stage is required");
  return {
    stageId: stage.id,
    route: [[...stage.start]],
    undoCount: 0,
    resetCount: 0,
    hintCount: 0,
    status: "playing",
    message: "start",
    inputRevision: 0,
  };
}

export function currentCell(state) {
  return state.route[state.route.length - 1];
}

export function getLegalForwardMoves(state, stage) {
  if (state.status !== "playing") return [];
  const endpoint = currentCell(state);
  const walls = new Set(stage.walls.map(coordKey));
  const visited = new Set(state.route.map(coordKey));
  const hasRemainingParcels = getRemainingParcels(stage, state.route).length > 0;
  return DIRECTIONS
    .map(([dr, dc]) => [endpoint[0] + dr, endpoint[1] + dc])
    .filter((candidate) => {
      const key = coordKey(candidate);
      if (!isInBounds(stage, candidate) || walls.has(key) || visited.has(key)) return false;
      return !(hasRemainingParcels && sameCoord(candidate, stage.goal));
    });
}

export function isDeadEnd(state, stage) {
  return state.status === "playing" && getLegalForwardMoves(state, stage).length === 0;
}

function unchanged(state, outcome, message = outcome) {
  return { state: { ...state, message }, outcome, changed: false };
}

function inactive(state) {
  return { state, outcome: "inactive", changed: false };
}

export function undoMove(state) {
  if (state.status !== "playing") return inactive(state);
  if (state.route.length <= 1) return unchanged(state, "empty-undo");
  return {
    state: {
      ...state,
      route: state.route.slice(0, -1),
      undoCount: state.undoCount + 1,
      message: "undo",
      inputRevision: state.inputRevision + 1,
    },
    outcome: "undo",
    changed: true,
  };
}

export function resetRoute(state, stage) {
  if (state.status !== "playing") return inactive(state);
  if (state.route.length <= 1) return unchanged(state, "empty-reset");
  return {
    state: {
      ...state,
      route: [[...stage.start]],
      resetCount: state.resetCount + 1,
      message: "reset",
      inputRevision: state.inputRevision + 1,
    },
    outcome: "reset",
    changed: true,
  };
}

export function moveTo(state, stage, target) {
  if (state.status !== "playing") return inactive(state);
  if (!Array.isArray(target) || target.length !== 2 || !isInBounds(stage, target)) {
    return unchanged(state, "out-of-bounds");
  }

  const endpoint = currentCell(state);
  if (sameCoord(endpoint, target)) return unchanged(state, "same-cell");

  const previous = state.route[state.route.length - 2];
  if (previous && sameCoord(previous, target)) return undoMove(state);

  if (!isAdjacent(endpoint, target)) return unchanged(state, "not-adjacent");

  const targetKey = coordKey(target);
  const walls = new Set(stage.walls.map(coordKey));
  if (walls.has(targetKey)) return unchanged(state, "wall");
  if (state.route.some((cell) => coordKey(cell) === targetKey)) return unchanged(state, "visited");

  if (sameCoord(target, stage.goal) && getRemainingParcels(stage, state.route).length > 0) {
    return unchanged(state, "early-goal");
  }

  const route = [...state.route, [...target]];
  const cleared = sameCoord(target, stage.goal);
  const nextState = {
    ...state,
    route,
    status: cleared ? "cleared" : "playing",
    message: cleared ? "cleared" : "moved",
    inputRevision: state.inputRevision + 1,
  };
  const deadEnd = !cleared && isDeadEnd(nextState, stage);
  if (deadEnd) nextState.message = "dead-end";
  return {
    state: nextState,
    outcome: cleared ? "cleared" : deadEnd ? "dead-end" : "moved",
    changed: true,
  };
}

export function applyHintResult(state, result, expectedRevision) {
  if (state.status !== "playing") return inactive(state);
  if (state.hintCount >= 2) return unchanged(state, "hint-limit");
  if (state.inputRevision !== expectedRevision) return unchanged(state, "stale-hint");
  if (!result || result.status !== "FOUND") {
    return unchanged(state, result?.status === "NO_SOLUTION" ? "no-solution" : "hint-unavailable");
  }
  return {
    state: {
      ...state,
      hintCount: state.hintCount + 1,
      message: "hint-found",
      inputRevision: state.inputRevision + 1,
    },
    outcome: "hint-found",
    changed: true,
  };
}

export function summarizeState(state, stage) {
  const collected = getCollectedParcelKeys(stage, state.route).size;
  const score = calculateScore(state);
  return {
    collected,
    remaining: stage.parcels.length - collected,
    score,
    hintsRemaining: Math.max(0, 2 - state.hintCount),
    ...evaluateScore(score, state),
  };
}

