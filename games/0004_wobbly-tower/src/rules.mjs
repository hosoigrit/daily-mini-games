export const CONFIG = Object.freeze({
  width: 360,
  height: 560,
  initialWidth: 180,
  blockHeight: 26,
  baseX: 90,
  baseY: 520,
  maximumFloor: 10,
  baseSpeed: 90,
  speedIncrement: 10,
  maximumSpeed: 180,
  fallDurationSeconds: 0.14,
  settleDurationSeconds: 0.25,
});

export const LANDING = Object.freeze({
  MISS: "MISS",
  NORMAL: "NORMAL",
  PERFECT: "PERFECT",
});

export function speedForFloor(floor) {
  if (!Number.isInteger(floor) || floor < 1 || floor > CONFIG.maximumFloor) {
    throw new RangeError("floor must be an integer from 1 to 10");
  }
  return CONFIG.baseSpeed + CONFIG.speedIncrement * (floor - 1);
}

export function positionAt({ width, elapsedSeconds, floor }) {
  const travel = CONFIG.width - width;
  if (!(travel > 0)) return 0;
  const distance = speedForFloor(floor) * Math.max(0, elapsedSeconds);
  const phase = floor % 2 === 0 ? travel + distance : distance;
  const wrapped = modulo(phase, travel * 2);
  return travel - Math.abs(wrapped - travel);
}

export function overlapWidth(first, second) {
  const left = Math.max(first.x, second.x);
  const right = Math.min(first.x + first.width, second.x + second.width);
  return Math.max(0, right - left);
}

export function perfectTolerance(supportWidth) {
  return Math.min(8, supportWidth / 4);
}

export function judgeLanding(support, moving) {
  const overlap = overlapWidth(support, moving);
  if (overlap === 0) {
    return { kind: LANDING.MISS, block: null, overlap: 0 };
  }

  if (Math.abs(moving.x - support.x) <= perfectTolerance(support.width)) {
    return {
      kind: LANDING.PERFECT,
      overlap,
      block: {
        x: support.x,
        y: support.y - CONFIG.blockHeight,
        width: support.width,
        height: CONFIG.blockHeight,
      },
    };
  }

  return {
    kind: LANDING.NORMAL,
    overlap,
    block: {
      x: Math.max(support.x, moving.x),
      y: support.y - CONFIG.blockHeight,
      width: overlap,
      height: CONFIG.blockHeight,
    },
  };
}

export function scoreLanding(currentStreak, kind) {
  if (kind === LANDING.MISS) {
    return { scoreDelta: 0, nextStreak: 0 };
  }
  if (kind === LANDING.NORMAL) {
    return { scoreDelta: 100, nextStreak: 0 };
  }
  if (kind !== LANDING.PERFECT) {
    throw new TypeError(`Unknown landing kind: ${kind}`);
  }

  const nextStreak = currentStreak + 1;
  const comboBonus = Math.min(10 * (nextStreak - 1), 50);
  return { scoreDelta: 150 + comboBonus, nextStreak };
}

function modulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}
