import { CONFIG, LANDING, judgeLanding, positionAt, scoreLanding } from "./rules.mjs";

export const PHASES = Object.freeze({
  TITLE: "TITLE",
  MOVING: "MOVING",
  FALLING: "FALLING",
  JUDGING: "JUDGING",
  SETTLING: "SETTLING",
  PAUSED: "PAUSED",
  CLEAR: "CLEAR",
  GAME_OVER: "GAME_OVER",
});

export function createGame() {
  return {
    phase: PHASES.TITLE,
    pausedFrom: null,
    floor: 0,
    score: 0,
    perfectStreak: 0,
    totalPerfect: 0,
    maxPerfectStreak: 0,
    placed: [createBase()],
    moving: null,
    movementElapsedSec: 0,
    animationElapsedSec: 0,
    pendingLanding: null,
    lastLanding: null,
  };
}

export function startGame(game) {
  game.phase = PHASES.MOVING;
  game.pausedFrom = null;
  game.floor = 0;
  game.score = 0;
  game.perfectStreak = 0;
  game.totalPerfect = 0;
  game.maxPerfectStreak = 0;
  game.placed = [createBase()];
  game.moving = null;
  game.movementElapsedSec = 0;
  game.animationElapsedSec = 0;
  game.pendingLanding = null;
  game.lastLanding = null;
  spawnMovingBlock(game);
  return game;
}

export function advanceMoving(game, deltaSeconds) {
  if (game.phase !== PHASES.MOVING || !game.moving) return false;
  game.movementElapsedSec += Math.max(0, finiteDelta(deltaSeconds));
  game.moving.x = positionAt({
    width: game.moving.width,
    elapsedSeconds: game.movementElapsedSec,
    floor: game.floor + 1,
  });
  return true;
}

export function requestDrop(game) {
  if (game.phase !== PHASES.MOVING || !game.moving) return false;
  const support = game.placed.at(-1);
  game.pendingLanding = judgeLanding(support, game.moving);
  game.phase = PHASES.FALLING;
  game.animationElapsedSec = 0;
  return true;
}

export function advanceAnimation(game, deltaSeconds) {
  if (game.phase !== PHASES.FALLING && game.phase !== PHASES.SETTLING) return false;
  let remaining = Math.max(0, finiteDelta(deltaSeconds));

  if (game.phase === PHASES.FALLING) {
    const needed = CONFIG.fallDurationSeconds - game.animationElapsedSec;
    const consumed = Math.min(remaining, needed);
    game.animationElapsedSec += consumed;
    remaining -= consumed;
    if (game.animationElapsedSec + Number.EPSILON >= CONFIG.fallDurationSeconds) {
      game.phase = PHASES.JUDGING;
      applyPendingLanding(game);
      game.phase = PHASES.SETTLING;
      game.animationElapsedSec = 0;
    }
  }

  if (game.phase === PHASES.SETTLING && remaining >= 0) {
    game.animationElapsedSec += remaining;
    if (game.animationElapsedSec + Number.EPSILON >= CONFIG.settleDurationSeconds) {
      finishSettling(game);
    }
  }
  return true;
}

export function pauseGame(game) {
  if (![PHASES.MOVING, PHASES.FALLING, PHASES.JUDGING, PHASES.SETTLING].includes(game.phase)) {
    return false;
  }
  game.pausedFrom = game.phase;
  game.phase = PHASES.PAUSED;
  return true;
}

export function resumeGame(game) {
  if (game.phase !== PHASES.PAUSED || !game.pausedFrom) return false;
  game.phase = game.pausedFrom;
  game.pausedFrom = null;
  return true;
}

export function getFallProgress(game) {
  const isFalling = game.phase === PHASES.FALLING ||
    (game.phase === PHASES.PAUSED && game.pausedFrom === PHASES.FALLING);
  if (!isFalling) return game.phase === PHASES.MOVING ? 0 : 1;
  return Math.min(1, game.animationElapsedSec / CONFIG.fallDurationSeconds);
}

export function getShakeOffset(game, reducedMotion = false) {
  const animationPhase = game.phase === PHASES.PAUSED ? game.pausedFrom : game.phase;
  if (reducedMotion || animationPhase !== PHASES.SETTLING || game.lastLanding === LANDING.MISS) return 0;
  const progress = Math.min(1, game.animationElapsedSec / CONFIG.settleDurationSeconds);
  return Math.sin(progress * Math.PI * 8) * (1 - progress) * 4;
}

function applyPendingLanding(game) {
  const result = game.pendingLanding;
  if (!result) throw new Error("No pending landing to apply");
  game.lastLanding = result.kind;

  if (result.kind === LANDING.MISS) {
    game.perfectStreak = 0;
    return;
  }

  const scored = scoreLanding(game.perfectStreak, result.kind);
  game.score += scored.scoreDelta;
  game.perfectStreak = scored.nextStreak;
  if (result.kind === LANDING.PERFECT) {
    game.totalPerfect += 1;
    game.maxPerfectStreak = Math.max(game.maxPerfectStreak, game.perfectStreak);
  }
  game.placed.push(result.block);
  game.floor += 1;
}

function finishSettling(game) {
  game.animationElapsedSec = 0;
  game.pendingLanding = null;
  if (game.lastLanding === LANDING.MISS) {
    game.moving = null;
    game.phase = PHASES.GAME_OVER;
    return;
  }
  if (game.floor >= CONFIG.maximumFloor) {
    game.moving = null;
    game.phase = PHASES.CLEAR;
    return;
  }
  game.phase = PHASES.MOVING;
  spawnMovingBlock(game);
}

function spawnMovingBlock(game) {
  const support = game.placed.at(-1);
  game.movementElapsedSec = 0;
  game.moving = {
    x: positionAt({ width: support.width, elapsedSeconds: 0, floor: game.floor + 1 }),
    y: Math.max(24, support.y - CONFIG.blockHeight - 72),
    targetY: support.y - CONFIG.blockHeight,
    width: support.width,
    height: CONFIG.blockHeight,
  };
}

function createBase() {
  return {
    x: CONFIG.baseX,
    y: CONFIG.baseY,
    width: CONFIG.initialWidth,
    height: CONFIG.blockHeight,
    isBase: true,
  };
}

function finiteDelta(value) {
  return Number.isFinite(value) ? value : 0;
}
