import test from "node:test";
import assert from "node:assert/strict";
import { elapsedSecondsBetween, overlayKeyFor } from "../src/main.mjs";
import { PHASES, advanceMoving, createGame, pauseGame, resumeGame, startGame } from "../src/state.mjs";

function positionAfterFrames(fps, totalSeconds, setup = () => {}) {
  const game = startGame(createGame());
  setup(game);
  let previousTimestamp = 0;
  const frameCount = Math.round(fps * totalSeconds);
  for (let frame = 1; frame <= frameCount; frame += 1) {
    const currentTimestamp = frame * (1000 / fps);
    advanceMoving(game, elapsedSecondsBetween(previousTimestamp, currentTimestamp));
    previousTimestamp = currentTimestamp;
  }
  return game.moving.x;
}

test("IR-01: 同一オーバーレイ状態ではフレーム進行後も更新キーが変わらない", () => {
  const best = { bestFloor: 0, bestScore: 0 };
  const game = createGame();
  const titleKey = overlayKeyFor(game, best);
  game.movementElapsedSec = 999;
  assert.equal(overlayKeyFor(game, best), titleKey);

  startGame(game);
  const movingKey = overlayKeyFor(game, best);
  advanceMoving(game, 0.5);
  assert.equal(overlayKeyFor(game, best), movingKey);
  assert.equal(movingKey, "HIDDEN");
});

test("IR-01: TITLE・PAUSED・RESULTの状態遷移でだけオーバーレイキーが変わる", () => {
  const best = { bestFloor: 3, bestScore: 450 };
  const game = createGame();
  const titleKey = overlayKeyFor(game, best);
  startGame(game);
  const movingKey = overlayKeyFor(game, best);
  pauseGame(game);
  const pausedKey = overlayKeyFor(game, best);
  resumeGame(game);
  assert.equal(overlayKeyFor(game, best), movingKey);
  game.phase = PHASES.CLEAR;
  game.floor = 10;
  game.score = 1850;
  const clearKey = overlayKeyFor(game, { bestFloor: 10, bestScore: 1850 });
  assert.equal(new Set([titleKey, movingKey, pausedKey, clearKey]).size, 4);
});

test("IR-02: 60/30/10/5FPS相当で1秒後の移動位置が一致する", () => {
  const positions = [60, 30, 10, 5].map((fps) => positionAfterFrames(fps, 1));
  for (const position of positions) assert.ok(Math.abs(position - 90) < 1e-9);
});

test("IR-02: 低FPSで複数反射しても経過時間を切り捨てない", () => {
  const positions = [60, 30, 10, 5].map((fps) => positionAfterFrames(fps, 9));
  for (const position of positions) assert.ok(Math.abs(position - 90) < 1e-8);
});

test("IR-02: 負値・非数の時刻差は進行時間にしない", () => {
  assert.equal(elapsedSecondsBetween(1000, 900), 0);
  assert.equal(elapsedSecondsBetween(Number.NaN, 1000), 0);
});
