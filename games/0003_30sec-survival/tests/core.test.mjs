import test from "node:test";
import assert from "node:assert/strict";
import {
  CONFIG,
  DIFFICULTIES,
  STATES,
  attemptSpawn,
  circlesOverlap,
  createGame,
  createMeteorCandidate,
  estimateArrivalSeconds,
  getCountdownDisplay,
  getDifficulty,
  isSpawnCandidateSafe,
  movePlayer,
  normalizeDirection,
  pauseGame,
  resumeGame,
  starsForLives,
  startGame,
  stepCountdown,
  stepGame,
} from "../src/core.js";
import { consumeFixedSteps } from "../src/main.js";

function makePlayingGame() {
  const game = createGame();
  startGame(game);
  game.state = STATES.PLAYING;
  game.countdownStepsRemaining = 0;
  return game;
}

function stationaryMeteor(x, y, id = 1) {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    hitRadius: CONFIG.meteorRadius,
    visualRadius: CONFIG.meteorVisualRadius,
    spawnedAtStep: 0,
  };
}

function sequenceRng(values, fallback = 0.5) {
  let index = 0;
  return () => values[index++] ?? fallback;
}

function lcg(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

test("UT-001: start enters COUNTDOWN with a fully reset game", () => {
  const game = createGame();
  game.player.lives = 1;
  game.meteors.push(stationaryMeteor(20, 20));
  startGame(game);
  assert.equal(game.state, STATES.COUNTDOWN);
  assert.equal(game.player.lives, 3);
  assert.deepEqual([game.player.x, game.player.y], [180, 240]);
  assert.equal(game.meteors.length, 0);
  assert.equal(getCountdownDisplay(game), 3);
});

test("UT-002/003: countdown lasts exactly 180 steps and does not advance survival", () => {
  const game = createGame();
  startGame(game);
  for (let step = 0; step < 179; step += 1) stepCountdown(game);
  assert.equal(game.state, STATES.COUNTDOWN);
  assert.equal(game.elapsedSteps, 0);
  assert.equal(game.meteors.length, 0);
  assert.equal(getCountdownDisplay(game), 1);
  stepCountdown(game);
  assert.equal(game.state, STATES.PLAYING);
  assert.equal(game.elapsedSteps, 0);
});

test("UT-004: all eight directions and stop produce the expected movement direction", () => {
  const directions = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  for (const [x, y] of directions) {
    const player = { ...makePlayingGame().player };
    const before = { x: player.x, y: player.y };
    movePlayer(player, { x, y });
    assert.equal(Math.sign(player.x - before.x), Math.sign(x));
    assert.equal(Math.sign(player.y - before.y), Math.sign(y));
  }
  assert.deepEqual(normalizeDirection({ x: 0, y: 0 }), { x: 0, y: 0 });
});

test("UT-005: diagonal movement is normalized to the same distance as one axis", () => {
  const horizontal = { ...makePlayingGame().player };
  const diagonal = { ...makePlayingGame().player };
  movePlayer(horizontal, { x: 1, y: 0 });
  movePlayer(diagonal, { x: 1, y: 1 });
  const horizontalDistance = Math.hypot(horizontal.x - 180, horizontal.y - 240);
  const diagonalDistance = Math.hypot(diagonal.x - 180, diagonal.y - 240);
  assert.ok(Math.abs(horizontalDistance - diagonalDistance) < 1e-10);
});

test("UT-006: the player hit circle remains inside all four field edges", () => {
  const player = { ...makePlayingGame().player };
  for (let index = 0; index < 1000; index += 1) movePlayer(player, { x: -1, y: -1 });
  assert.deepEqual([player.x, player.y], [11, 11]);
  for (let index = 0; index < 1000; index += 1) movePlayer(player, { x: 1, y: 1 });
  assert.deepEqual([player.x, player.y], [349, 469]);
});

test("UT-007: deterministic random values spawn from all four outside edges", () => {
  const edgeValues = [0, 0.26, 0.51, 0.76];
  const expectedEdges = ["top", "bottom", "left", "right"];
  edgeValues.forEach((edgeValue, index) => {
    const game = makePlayingGame();
    assert.equal(attemptSpawn(game, sequenceRng([edgeValue, 0.5]), DIFFICULTIES.EASY), true);
    const meteor = game.meteors[0];
    assert.equal(meteor.edge, expectedEdges[index]);
    assert.ok(
      meteor.x < 0 || meteor.x > CONFIG.width || meteor.y < 0 || meteor.y > CONFIG.height,
    );
    const cross =
      (game.player.x - meteor.x) * meteor.vy - (game.player.y - meteor.y) * meteor.vx;
    assert.ok(Math.abs(cross) < 1e-8);
  });
});

test("UT-008: a spawned meteor keeps its velocity after the player moves", () => {
  const game = makePlayingGame();
  attemptSpawn(game, sequenceRng([0, 0.5]), DIFFICULTIES.EASY);
  const velocity = [game.meteors[0].vx, game.meteors[0].vy];
  movePlayer(game.player, { x: 1, y: 1 });
  stepGame(game, { x: 1, y: 0 }, () => 0.5);
  assert.deepEqual([game.meteors[0].vx, game.meteors[0].vy], velocity);
});

test("UT-009/010: 1.199 seconds is rejected and exactly 1.200 is accepted", () => {
  const player = makePlayingGame().player;
  const speed = 100;
  const candidateAt = (seconds) => ({
    ...stationaryMeteor(player.x + player.hitRadius + CONFIG.meteorRadius + speed * seconds, player.y),
    vx: -speed,
  });
  const early = candidateAt(1.199);
  const boundary = candidateAt(1.2);
  assert.ok(Math.abs(estimateArrivalSeconds(early, player, speed) - 1.199) < 1e-12);
  assert.equal(isSpawnCandidateSafe(early, player, speed), false);
  assert.ok(Math.abs(estimateArrivalSeconds(boundary, player, speed) - 1.2) < 1e-12);
  assert.equal(isSpawnCandidateSafe(boundary, player, speed), true);
});

test("UT-011: ten unsafe candidates stop without spawning or hanging", () => {
  const game = makePlayingGame();
  game.player.x = 11;
  game.player.y = 11;
  let calls = 0;
  const rng = () => {
    calls += 1;
    return 0;
  };
  assert.equal(attemptSpawn(game, rng, DIFFICULTIES.HARD), false);
  assert.equal(calls, CONFIG.spawnAttempts * 2);
  assert.equal(game.meteors.length, 0);
});

test("UT-012: stage meteor caps are never exceeded", () => {
  for (const difficulty of Object.values(DIFFICULTIES)) {
    const game = makePlayingGame();
    game.meteors = Array.from({ length: difficulty.maxMeteors }, (_, id) => stationaryMeteor(100, 100, id));
    assert.equal(attemptSpawn(game, () => 0.5, difficulty), false);
    assert.equal(game.meteors.length, difficulty.maxMeteors);
  }
});

test("UT-013: no meteor spawns during the first 60 completed play steps", () => {
  const game = makePlayingGame();
  for (let step = 0; step < 60; step += 1) stepGame(game, { x: 0, y: 0 }, () => 0.5);
  assert.equal(game.elapsedSteps, 60);
  assert.equal(game.meteors.length, 0);
  stepGame(game, { x: 0, y: 0 }, () => 0.5);
  assert.equal(game.meteors.length, 1);
});

test("UT-014: difficulty changes exactly at steps 600 and 1200 without spawn backlog", () => {
  assert.equal(getDifficulty(599).name, "EASY");
  assert.equal(getDifficulty(600).name, "NORMAL");
  assert.equal(getDifficulty(1199).name, "NORMAL");
  assert.equal(getDifficulty(1200).name, "HARD");

  const game = makePlayingGame();
  game.elapsedSteps = 1200;
  game.nextSpawnStep = 60;
  stepGame(game, { x: 0, y: 0 }, sequenceRng([0, 0.5]));
  assert.equal(game.meteors.length, 1);
  assert.equal(game.nextSpawnStep, 1254);
});

test("UT-015/016: circles touching at radius sum collide, a greater distance does not", () => {
  const game = makePlayingGame();
  const touching = stationaryMeteor(game.player.x + 25, game.player.y);
  const separated = stationaryMeteor(game.player.x + 25.001, game.player.y);
  assert.equal(circlesOverlap(game.player, touching), true);
  assert.equal(circlesOverlap(game.player, separated), false);
  game.nextSpawnStep = Number.POSITIVE_INFINITY;
  game.meteors = [touching];
  stepGame(game);
  assert.equal(game.player.lives, 2);
  assert.equal(game.meteors.length, 0);
});

test("UT-017: simultaneous contacts reduce at most one life", () => {
  const game = makePlayingGame();
  game.nextSpawnStep = Number.POSITIVE_INFINITY;
  game.meteors = [
    stationaryMeteor(game.player.x, game.player.y, 1),
    stationaryMeteor(game.player.x, game.player.y, 2),
  ];
  stepGame(game);
  assert.equal(game.player.lives, 2);
  assert.equal(game.meteors.length, 1);
});

test("UT-018/019: 48 updates after damage are protected and the following update is vulnerable", () => {
  const game = makePlayingGame();
  game.nextSpawnStep = Number.POSITIVE_INFINITY;
  game.meteors = [stationaryMeteor(game.player.x, game.player.y, 1)];
  stepGame(game);
  assert.equal(game.player.lives, 2);
  assert.equal(game.player.invincibleSteps, 48);

  game.meteors = [stationaryMeteor(game.player.x, game.player.y, 2)];
  for (let protectedStep = 0; protectedStep < 48; protectedStep += 1) {
    stepGame(game);
    assert.equal(game.player.lives, 2);
  }
  assert.equal(game.player.invincibleSteps, 0);
  stepGame(game);
  assert.equal(game.player.lives, 1);
});

test("UT-020: a final valid hit ends the game and stops further updates", () => {
  const game = makePlayingGame();
  game.player.lives = 1;
  game.nextSpawnStep = Number.POSITIVE_INFINITY;
  game.meteors = [stationaryMeteor(game.player.x, game.player.y)];
  stepGame(game);
  assert.equal(game.state, STATES.GAME_OVER);
  assert.equal(game.player.lives, 0);
  const elapsed = game.elapsedSteps;
  stepGame(game, { x: 1, y: 0 });
  assert.equal(game.elapsedSteps, elapsed);
});

test("UT-021: 1800 survival steps clear and no 1801st update runs", () => {
  const game = makePlayingGame();
  game.nextSpawnStep = Number.POSITIVE_INFINITY;
  for (let step = 0; step < CONFIG.survivalSteps; step += 1) stepGame(game);
  assert.equal(game.state, STATES.CLEARED);
  assert.equal(game.elapsedSteps, 1800);
  stepGame(game);
  assert.equal(game.elapsedSteps, 1800);
});

test("UT-022: life zero wins the final-step race against 30-second clear", () => {
  const game = makePlayingGame();
  game.elapsedSteps = 1799;
  game.player.lives = 1;
  game.nextSpawnStep = Number.POSITIVE_INFINITY;
  game.meteors = [stationaryMeteor(game.player.x, game.player.y)];
  stepGame(game);
  assert.equal(game.state, STATES.GAME_OVER);
  assert.equal(game.stars, 0);
  assert.equal(game.elapsedSteps, 1799);
});

test("UT-023: remaining lives map one-to-one to one through three stars", () => {
  assert.equal(starsForLives(3), 3);
  assert.equal(starsForLives(2), 2);
  assert.equal(starsForLives(1), 1);
  assert.equal(starsForLives(0), 0);
});

test("UT-024: retry resets play state completely", () => {
  const game = makePlayingGame();
  game.elapsedSteps = 900;
  game.player.lives = 1;
  game.player.invincibleSteps = 12;
  game.player.x = 42;
  game.meteors.push(stationaryMeteor(100, 100));
  game.difficulty = "NORMAL";
  game.state = STATES.GAME_OVER;
  startGame(game);
  assert.equal(game.state, STATES.COUNTDOWN);
  assert.equal(game.elapsedSteps, 0);
  assert.equal(game.player.lives, 3);
  assert.equal(game.player.invincibleSteps, 0);
  assert.deepEqual([game.player.x, game.player.y], [180, 240]);
  assert.equal(game.meteors.length, 0);
  assert.equal(game.difficulty, "EASY");
});

test("UT-025/RV-003: 30/60/120Hz preserve unclamped player and meteor distances", () => {
  const simulationSeconds = 1;
  const tolerance = 1e-9;
  const initialPlayer = { x: 180, y: 240 };
  const initialMeteor = { x: 60, y: 350 };

  function simulate(frameRate) {
    const game = makePlayingGame();
    game.nextSpawnStep = Number.POSITIVE_INFINITY;
    game.meteors = [{
      ...stationaryMeteor(initialMeteor.x, initialMeteor.y),
      vx: 60,
      vy: -80,
    }];
    let accumulator = 0;
    for (let frame = 0; frame < frameRate * simulationSeconds; frame += 1) {
      const result = consumeFixedSteps(accumulator, 1 / frameRate, () => stepGame(game, { x: 0.2, y: 0 }));
      accumulator = result.accumulator;
    }
    return game;
  }

  const results = [30, 60, 120].map(simulate);
  const expectedPlayerDistance = CONFIG.playerSpeed * 0.2 * simulationSeconds;
  const expectedMeteorDistance = 100 * simulationSeconds;

  for (const game of results) {
    assert.equal(game.elapsedSteps, CONFIG.stepsPerSecond * simulationSeconds);
    assert.ok(game.player.x < CONFIG.width - game.player.hitRadius, "player must not reach a boundary");
    assert.ok(Math.abs(game.player.x - (initialPlayer.x + expectedPlayerDistance)) <= tolerance);
    assert.ok(Math.abs(game.player.y - initialPlayer.y) <= tolerance);
    assert.ok(
      Math.abs(
        Math.hypot(
          game.meteors[0].x - initialMeteor.x,
          game.meteors[0].y - initialMeteor.y,
        ) - expectedMeteorDistance,
      ) <= tolerance,
    );
  }

  for (const game of results.slice(1)) {
    assert.ok(Math.abs(game.player.x - results[0].player.x) <= tolerance);
    assert.ok(Math.abs(game.meteors[0].x - results[0].meteors[0].x) <= tolerance);
    assert.ok(Math.abs(game.meteors[0].y - results[0].meteors[0].y) <= tolerance);
  }
});

test("UT-026: paused state freezes time, movement, spawning, and collision", () => {
  const game = makePlayingGame();
  game.meteors = [stationaryMeteor(game.player.x, game.player.y)];
  assert.equal(pauseGame(game), true);
  const snapshot = structuredClone(game);
  for (let step = 0; step < 100; step += 1) stepGame(game, { x: 1, y: 0 });
  assert.deepEqual(game, snapshot);
  assert.equal(resumeGame(game), true);
  assert.equal(game.state, STATES.PLAYING);
});

test("UT-027: result states ignore play updates and generation", () => {
  for (const state of [STATES.CLEARED, STATES.GAME_OVER]) {
    const game = makePlayingGame();
    game.state = state;
    const snapshot = structuredClone(game);
    stepGame(game, { x: 1, y: 1 }, () => 0.5);
    assert.deepEqual(game, snapshot);
  }
});

test("UT-028: a meteor beyond the cleanup margin is removed", () => {
  const game = makePlayingGame();
  game.nextSpawnStep = Number.POSITIVE_INFINITY;
  game.meteors = [{ ...stationaryMeteor(-45, 200), vx: -60 }];
  stepGame(game);
  assert.equal(game.meteors.length, 0);
});

test("AT-19: each difficulty accepts 120 deterministic safe samples with valid caps and timing", () => {
  const summaries = [];
  for (const [index, difficulty] of Object.values(DIFFICULTIES).entries()) {
    const game = makePlayingGame();
    game.elapsedSteps = difficulty.startStep;
    const rng = lcg(0x30_00_00 + index);
    let accepted = 0;
    for (let sample = 0; sample < 120; sample += 1) {
      game.player.x = CONFIG.width / 2;
      game.player.y = CONFIG.height / 2;
      game.meteors.length = 0;
      assert.equal(attemptSpawn(game, rng, difficulty), true);
      assert.ok(game.meteors.length <= difficulty.maxMeteors);
      const meteor = game.meteors[0];
      assert.ok(estimateArrivalSeconds(meteor, game.player, difficulty.speed) + 1e-9 >= 1.2);
      assert.ok(Math.abs(Math.hypot(meteor.vx, meteor.vy) - difficulty.speed) < 1e-9);
      accepted += 1;
    }
    summaries.push([difficulty.name, accepted]);
  }
  assert.deepEqual(summaries, [["EASY", 120], ["NORMAL", 120], ["HARD", 120]]);
});

test("AT-19/RV-004: each stage enforces the cap, then resumes after one meteor leaves", () => {
  for (const difficulty of Object.values(DIFFICULTIES)) {
    const game = makePlayingGame();
    game.elapsedSteps = Math.max(CONFIG.safeStartSteps, difficulty.startStep);
    game.nextSpawnStep = game.elapsedSteps;
    game.nextMeteorId = 100;
    game.meteors = [
      ...Array.from(
        { length: difficulty.maxMeteors - 1 },
        (_, index) => stationaryMeteor(40 + index * 20, 80, index + 1),
      ),
      { ...stationaryMeteor(-45, 200, 99), vx: -60 },
    ];

    stepGame(game, { x: 0, y: 0 }, sequenceRng([0.26, 1], 0.5));
    assert.equal(game.meteors.length, difficulty.maxMeteors);
    assert.equal(game.meteors.some((meteor) => meteor.id === 99), false);
    assert.equal(game.meteors.some((meteor) => meteor.id === 100), true);
    assert.equal(attemptSpawn(game, () => 0.5, difficulty), false);
    assert.equal(game.meteors.length, difficulty.maxMeteors);
  }
});

test("AT-19/RV-004: repeated deterministic spawns never exceed center or edge caps", () => {
  const positions = [
    { name: "center", x: CONFIG.width / 2, y: CONFIG.height / 2 },
    { name: "edge", x: CONFIG.playerRadius, y: CONFIG.playerRadius },
  ];

  function fillSnapshot(difficulty, position, seed) {
    const game = makePlayingGame();
    game.elapsedSteps = difficulty.startStep;
    game.player.x = position.x;
    game.player.y = position.y;
    const rng = lcg(seed);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      attemptSpawn(game, rng, difficulty);
      assert.ok(game.meteors.length <= difficulty.maxMeteors);
    }
    assert.equal(game.meteors.length, difficulty.maxMeteors, `${difficulty.name}/${position.name}`);
    return game.meteors.map(({ edge, x, y, vx, vy }) => [edge, x, y, vx, vy]);
  }

  for (const [difficultyIndex, difficulty] of Object.values(DIFFICULTIES).entries()) {
    for (const [positionIndex, position] of positions.entries()) {
      const seed = 0x300300 + difficultyIndex * 16 + positionIndex;
      assert.deepEqual(
        fillSnapshot(difficulty, position, seed),
        fillSnapshot(difficulty, position, seed),
      );
    }
  }
});

test("AT-19/RV-004: difficulty transitions raise caps from three to four to five", () => {
  const game = makePlayingGame();
  game.elapsedSteps = 599;
  game.nextSpawnStep = Number.POSITIVE_INFINITY;
  game.meteors = Array.from({ length: 3 }, (_, index) => stationaryMeteor(40 + index * 30, 80, index + 1));

  assert.equal(attemptSpawn(game, () => 0.5, DIFFICULTIES.EASY), false);
  stepGame(game);
  assert.equal(game.elapsedSteps, 600);
  assert.equal(game.difficulty, "NORMAL");
  assert.equal(attemptSpawn(game, sequenceRng([0.26, 1]), DIFFICULTIES.NORMAL), true);
  assert.equal(game.meteors.length, 4);
  assert.equal(attemptSpawn(game, () => 0.5, DIFFICULTIES.NORMAL), false);

  game.elapsedSteps = 1199;
  stepGame(game);
  assert.equal(game.elapsedSteps, 1200);
  assert.equal(game.difficulty, "HARD");
  assert.equal(attemptSpawn(game, sequenceRng([0.26, 1]), DIFFICULTIES.HARD), true);
  assert.equal(game.meteors.length, 5);
  assert.equal(attemptSpawn(game, () => 0.5, DIFFICULTIES.HARD), false);
});

test("RV-005: completed-step difficulty display changes without altering spawn stage values", () => {
  const normalBoundary = makePlayingGame();
  normalBoundary.elapsedSteps = 599;
  normalBoundary.nextSpawnStep = 599;
  stepGame(normalBoundary, { x: 0, y: 0 }, sequenceRng([0, 0.5]));
  assert.equal(normalBoundary.elapsedSteps, 600);
  assert.equal(normalBoundary.difficulty, "NORMAL");
  assert.equal(Math.hypot(normalBoundary.meteors[0].vx, normalBoundary.meteors[0].vy), 100);
  assert.equal(normalBoundary.nextSpawnStep, 599 + DIFFICULTIES.EASY.intervalSteps);

  const hardBoundary = makePlayingGame();
  hardBoundary.elapsedSteps = 1199;
  hardBoundary.nextSpawnStep = 1199;
  stepGame(hardBoundary, { x: 0, y: 0 }, sequenceRng([0, 0.5]));
  assert.equal(hardBoundary.elapsedSteps, 1200);
  assert.equal(hardBoundary.difficulty, "HARD");
  assert.ok(Math.abs(Math.hypot(hardBoundary.meteors[0].vx, hardBoundary.meteors[0].vy) - 120) < 1e-9);
  assert.equal(hardBoundary.nextSpawnStep, 1199 + DIFFICULTIES.NORMAL.intervalSteps);
});

test("AT-19: identical seed reproduces edge, position, and velocity", () => {
  function sample(seed) {
    const game = makePlayingGame();
    const rng = lcg(seed);
    return Array.from({ length: 12 }, () => {
      game.meteors.length = 0;
      attemptSpawn(game, rng, DIFFICULTIES.HARD);
      const meteor = game.meteors[0];
      return [meteor.edge, meteor.x, meteor.y, meteor.vx, meteor.vy];
    });
  }
  assert.deepEqual(sample(123456), sample(123456));
});

test("meteor candidate helper preserves the spawn-time player snapshot in velocity", () => {
  const player = makePlayingGame().player;
  const meteor = createMeteorCandidate("left", 0.25, player, 120);
  const velocity = [meteor.vx, meteor.vy];
  player.x = 349;
  player.y = 469;
  assert.deepEqual([meteor.vx, meteor.vy], velocity);
});
