export const STATES = Object.freeze({
  TITLE: "TITLE",
  COUNTDOWN: "COUNTDOWN",
  PLAYING: "PLAYING",
  PAUSED: "PAUSED",
  CLEARED: "CLEARED",
  GAME_OVER: "GAME_OVER",
});

export const CONFIG = Object.freeze({
  width: 360,
  height: 480,
  stepsPerSecond: 60,
  stepSeconds: 1 / 60,
  countdownSteps: 180,
  survivalSteps: 1800,
  safeStartSteps: 60,
  invincibleSteps: 48,
  playerSpeed: 190,
  playerRadius: 11,
  meteorRadius: 14,
  meteorVisualRadius: 17,
  meteorSpawnOffset: 22,
  meteorCleanupMargin: 44,
  minimumArrivalSeconds: 1.2,
  arrivalComparisonEpsilon: 1e-9,
  spawnAttempts: 10,
  maxFrameDeltaSeconds: 0.25,
});

export const DIFFICULTIES = Object.freeze({
  EASY: Object.freeze({ name: "EASY", startStep: 0, intervalSteps: 84, speed: 100, maxMeteors: 3 }),
  NORMAL: Object.freeze({ name: "NORMAL", startStep: 600, intervalSteps: 66, speed: 120, maxMeteors: 4 }),
  HARD: Object.freeze({ name: "HARD", startStep: 1200, intervalSteps: 54, speed: 140, maxMeteors: 5 }),
});

const EDGES = Object.freeze(["top", "bottom", "left", "right"]);

export function createGame() {
  return {
    state: STATES.TITLE,
    pausedFrom: null,
    countdownStepsRemaining: CONFIG.countdownSteps,
    elapsedSteps: 0,
    nextSpawnStep: CONFIG.safeStartSteps,
    nextMeteorId: 1,
    difficulty: DIFFICULTIES.EASY.name,
    stars: 0,
    player: createPlayer(),
    meteors: [],
  };
}

function createPlayer() {
  return {
    x: CONFIG.width / 2,
    y: CONFIG.height / 2,
    hitRadius: CONFIG.playerRadius,
    speed: CONFIG.playerSpeed,
    lives: 3,
    invincibleSteps: 0,
    heading: 0,
  };
}

export function startGame(game) {
  const fresh = createGame();
  fresh.state = STATES.COUNTDOWN;
  Object.assign(game, fresh);
  return game;
}

export function stepCountdown(game) {
  if (game.state !== STATES.COUNTDOWN) return game;

  game.countdownStepsRemaining = Math.max(0, game.countdownStepsRemaining - 1);
  if (game.countdownStepsRemaining === 0) {
    game.state = STATES.PLAYING;
  }
  return game;
}

export function getCountdownDisplay(game) {
  if (game.state !== STATES.COUNTDOWN) return 0;
  return Math.max(1, Math.ceil(game.countdownStepsRemaining / CONFIG.stepsPerSecond));
}

export function normalizeDirection(input = { x: 0, y: 0 }) {
  const x = Number.isFinite(input.x) ? input.x : 0;
  const y = Number.isFinite(input.y) ? input.y : 0;
  const length = Math.hypot(x, y);
  if (length === 0) return { x: 0, y: 0 };
  if (length <= 1) return { x, y };
  return { x: x / length, y: y / length };
}

export function getDifficulty(elapsedSteps) {
  if (elapsedSteps >= DIFFICULTIES.HARD.startStep) return DIFFICULTIES.HARD;
  if (elapsedSteps >= DIFFICULTIES.NORMAL.startStep) return DIFFICULTIES.NORMAL;
  return DIFFICULTIES.EASY;
}

export function movePlayer(player, input) {
  const direction = normalizeDirection(input);
  const distance = player.speed * CONFIG.stepSeconds;

  player.x = clamp(
    player.x + direction.x * distance,
    player.hitRadius,
    CONFIG.width - player.hitRadius,
  );
  player.y = clamp(
    player.y + direction.y * distance,
    player.hitRadius,
    CONFIG.height - player.hitRadius,
  );

  if (direction.x !== 0 || direction.y !== 0) {
    // The renderer's ship points upward at angle zero.
    player.heading = Math.atan2(direction.y, direction.x) + Math.PI / 2;
  }
  return direction;
}

export function createMeteorCandidate(edge, positionRatio, player, speed, id = 0, spawnedAtStep = 0) {
  const ratio = clamp(Number.isFinite(positionRatio) ? positionRatio : 0.5, 0, 1);
  const offset = CONFIG.meteorSpawnOffset;
  let x;
  let y;

  switch (edge) {
    case "top":
      x = ratio * CONFIG.width;
      y = -offset;
      break;
    case "bottom":
      x = ratio * CONFIG.width;
      y = CONFIG.height + offset;
      break;
    case "left":
      x = -offset;
      y = ratio * CONFIG.height;
      break;
    case "right":
      x = CONFIG.width + offset;
      y = ratio * CONFIG.height;
      break;
    default:
      throw new TypeError(`Unknown meteor edge: ${edge}`);
  }

  const dx = player.x - x;
  const dy = player.y - y;
  const distance = Math.hypot(dx, dy);
  const safeDistance = distance || 1;

  return {
    id,
    edge,
    x,
    y,
    vx: (dx / safeDistance) * speed,
    vy: (dy / safeDistance) * speed,
    hitRadius: CONFIG.meteorRadius,
    visualRadius: CONFIG.meteorVisualRadius,
    spawnedAtStep,
  };
}

export function estimateArrivalSeconds(candidate, player, speed = Math.hypot(candidate.vx, candidate.vy)) {
  if (!(speed > 0)) return Number.POSITIVE_INFINITY;
  const centerDistance = Math.hypot(player.x - candidate.x, player.y - candidate.y);
  const contactDistance = player.hitRadius + candidate.hitRadius;
  return Math.max(0, centerDistance - contactDistance) / speed;
}

export function isSpawnCandidateSafe(candidate, player, speed) {
  const arrival = estimateArrivalSeconds(candidate, player, speed);
  // Values mathematically equal to 1.2 seconds remain on the accepted side.
  return arrival + CONFIG.arrivalComparisonEpsilon >= CONFIG.minimumArrivalSeconds;
}

export function attemptSpawn(game, rng = Math.random, difficulty = getDifficulty(game.elapsedSteps)) {
  if (game.meteors.length >= difficulty.maxMeteors) return false;

  for (let attempt = 0; attempt < CONFIG.spawnAttempts; attempt += 1) {
    const edgeIndex = Math.min(EDGES.length - 1, Math.floor(clampRandom(rng()) * EDGES.length));
    const positionRatio = clampRandom(rng());
    const candidate = createMeteorCandidate(
      EDGES[edgeIndex],
      positionRatio,
      game.player,
      difficulty.speed,
      game.nextMeteorId,
      game.elapsedSteps,
    );

    if (!isSpawnCandidateSafe(candidate, game.player, difficulty.speed)) continue;

    game.meteors.push(candidate);
    game.nextMeteorId += 1;
    return true;
  }

  return false;
}

export function circlesOverlap(first, second) {
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  const radius = first.hitRadius + second.hitRadius;
  return dx * dx + dy * dy <= radius * radius;
}

export function stepGame(game, input = { x: 0, y: 0 }, rng = Math.random) {
  if (game.state !== STATES.PLAYING) return game;

  const invincibleAtStepStart = game.player.invincibleSteps > 0;
  movePlayer(game.player, input);
  moveMeteors(game.meteors);

  const difficulty = getDifficulty(game.elapsedSteps);
  game.difficulty = difficulty.name;
  if (game.elapsedSteps >= game.nextSpawnStep) {
    attemptSpawn(game, rng, difficulty);
    // Schedule from the current simulation step so skipped spawns never form a backlog.
    game.nextSpawnStep = game.elapsedSteps + difficulty.intervalSteps;
  }

  let damagedThisStep = false;
  if (!invincibleAtStepStart) {
    const collisionIndex = game.meteors.findIndex((meteor) => circlesOverlap(game.player, meteor));
    if (collisionIndex >= 0) {
      game.meteors.splice(collisionIndex, 1);
      game.player.lives -= 1;
      damagedThisStep = true;
      if (game.player.lives > 0) {
        // These 48 protected updates begin after the update that caused damage.
        game.player.invincibleSteps = CONFIG.invincibleSteps;
      }
    }
  }

  if (game.player.lives <= 0) {
    game.state = STATES.GAME_OVER;
    game.stars = 0;
    return game;
  }

  if (invincibleAtStepStart && !damagedThisStep) {
    game.player.invincibleSteps = Math.max(0, game.player.invincibleSteps - 1);
  }

  game.elapsedSteps += 1;
  // Keep the HUD-facing difficulty synchronized with the completed simulation step.
  // Spawn timing and speed above intentionally use the difficulty at step start.
  game.difficulty = getDifficulty(game.elapsedSteps).name;
  if (game.elapsedSteps >= CONFIG.survivalSteps) {
    game.elapsedSteps = CONFIG.survivalSteps;
    game.state = STATES.CLEARED;
    game.stars = starsForLives(game.player.lives);
  }

  return game;
}

export function pauseGame(game) {
  if (game.state !== STATES.COUNTDOWN && game.state !== STATES.PLAYING) return false;
  game.pausedFrom = game.state;
  game.state = STATES.PAUSED;
  return true;
}

export function resumeGame(game) {
  if (game.state !== STATES.PAUSED || !game.pausedFrom) return false;
  game.state = game.pausedFrom;
  game.pausedFrom = null;
  return true;
}

export function starsForLives(lives) {
  if (lives >= 3) return 3;
  if (lives === 2) return 2;
  if (lives === 1) return 1;
  return 0;
}

export function getElapsedSeconds(game) {
  return game.elapsedSteps / CONFIG.stepsPerSecond;
}

export function getRemainingSeconds(game) {
  return Math.max(0, (CONFIG.survivalSteps - game.elapsedSteps) / CONFIG.stepsPerSecond);
}

function moveMeteors(meteors) {
  for (const meteor of meteors) {
    meteor.x += meteor.vx * CONFIG.stepSeconds;
    meteor.y += meteor.vy * CONFIG.stepSeconds;
  }

  const margin = CONFIG.meteorCleanupMargin;
  for (let index = meteors.length - 1; index >= 0; index -= 1) {
    const meteor = meteors[index];
    if (
      meteor.x < -margin ||
      meteor.x > CONFIG.width + margin ||
      meteor.y < -margin ||
      meteor.y > CONFIG.height + margin
    ) {
      meteors.splice(index, 1);
    }
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function clampRandom(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1 - Number.EPSILON, Math.max(0, value));
}
