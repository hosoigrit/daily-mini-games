import { DIRECTIONS, coordKey, getRemainingParcels, isInBounds, sameCoord } from "./game-core.js";

const DEFAULT_NODE_LIMIT = 250_000;
const DEFAULT_TIME_LIMIT_MS = 80;

function cellIndex(stage, [row, col]) {
  return BigInt((row * stage.size) + col);
}

export function solveHint(stage, state, options = {}) {
  const nodeLimit = options.nodeLimit ?? DEFAULT_NODE_LIMIT;
  const timeLimitMs = options.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS;
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const endpoint = state.route[state.route.length - 1];
  const walls = new Set(stage.walls.map(coordKey));
  const remaining = new Set(getRemainingParcels(stage, state.route).map(coordKey));
  const visited = new Set(state.route.map(coordKey));
  let visitedMask = 0n;
  for (const cell of state.route) visitedMask |= 1n << cellIndex(stage, cell);
  let nodes = 0;
  let limited = false;

  function overLimit() {
    if (nodes >= nodeLimit) return true;
    return now() - startedAt >= timeLimitMs;
  }

  function search(cell, firstStep, currentMask) {
    if (overLimit()) {
      limited = true;
      return null;
    }
    nodes += 1;

    for (const [dr, dc] of DIRECTIONS) {
      const next = [cell[0] + dr, cell[1] + dc];
      const key = coordKey(next);
      if (!isInBounds(stage, next) || walls.has(key) || visited.has(key)) continue;
      if (sameCoord(next, stage.goal) && remaining.size > 0) continue;

      const step = firstStep ?? next;
      if (sameCoord(next, stage.goal)) return step;

      const hadParcel = remaining.delete(key);
      visited.add(key);
      const result = search(next, step, currentMask | (1n << cellIndex(stage, next)));
      visited.delete(key);
      if (hadParcel) remaining.add(key);
      if (result) return result;
      if (limited) return null;
    }
    return null;
  }

  const nextCell = search(endpoint, null, visitedMask);
  const elapsedMs = now() - startedAt;
  if (nextCell) return { status: "FOUND", nextCell: [...nextCell], nodes, elapsedMs };
  if (limited) return { status: "UNAVAILABLE", nextCell: null, nodes, elapsedMs };
  return { status: "NO_SOLUTION", nextCell: null, nodes, elapsedMs };
}

export function directionLabel(from, to) {
  const dr = to[0] - from[0];
  const dc = to[1] - from[1];
  if (dr === -1 && dc === 0) return "上";
  if (dr === 1 && dc === 0) return "下";
  if (dr === 0 && dc === 1) return "右";
  if (dr === 0 && dc === -1) return "左";
  return "";
}

export const HINT_LIMITS = Object.freeze({
  nodeLimit: DEFAULT_NODE_LIMIT,
  timeLimitMs: DEFAULT_TIME_LIMIT_MS,
});

