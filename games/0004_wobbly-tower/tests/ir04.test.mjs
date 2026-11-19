import test from "node:test";
import assert from "node:assert/strict";
import { LANDING } from "../src/rules.mjs";
import { getMovingRenderY, shouldDrawMovingBlock } from "../src/renderer.mjs";
import {
  PHASES,
  advanceAnimation,
  createGame,
  getFallProgress,
  getShakeOffset,
  pauseGame,
  requestDrop,
  resumeGame,
  startGame,
} from "../src/state.mjs";

function enterSettling(game, x, settlingSeconds = 0.05) {
  game.moving.x = x;
  assert.equal(requestDrop(game), true);
  advanceAnimation(game, 0.14 + settlingSeconds);
  assert.equal(game.phase, PHASES.SETTLING);
}

function finishSettling(game) {
  advanceAnimation(game, 1);
}

function prepareMissSettling() {
  const game = startGame(createGame());
  enterSettling(game, 0);
  finishSettling(game);
  const support = game.placed.at(-1);
  enterSettling(game, support.x + support.width);
  assert.equal(game.lastLanding, LANDING.MISS);
  return game;
}

test("IR04-01: SETTLING中の一時停止は揺れオフセットを保持する", () => {
  const game = startGame(createGame());
  enterSettling(game, game.placed.at(-1).x);
  const beforePause = getShakeOffset(game);
  assert.notEqual(beforePause, 0);
  pauseGame(game);
  assert.equal(game.pausedFrom, PHASES.SETTLING);
  assert.equal(getShakeOffset(game), beforePause);
});

test("IR04-02: PAUSED中の時間経過では演出時間・揺れ・MISS描画Yが変化しない", () => {
  const game = prepareMissSettling();
  const elapsed = game.animationElapsedSec;
  const y = getMovingRenderY(game);
  pauseGame(game);
  assert.equal(advanceAnimation(game, 5), false);
  assert.equal(game.animationElapsedSec, elapsed);
  assert.equal(getShakeOffset(game), 0);
  assert.equal(getMovingRenderY(game), y);
});

test("IR04-03: PAUSEDから再開すると保存した演出時間から続行する", () => {
  const game = startGame(createGame());
  enterSettling(game, game.placed.at(-1).x);
  const elapsed = game.animationElapsedSec;
  pauseGame(game);
  resumeGame(game);
  assert.equal(game.phase, PHASES.SETTLING);
  assert.equal(game.animationElapsedSec, elapsed);
  advanceAnimation(game, 0.01);
  assert.ok(Math.abs(game.animationElapsedSec - (elapsed + 0.01)) < 1e-12);
});

test("IR04-04: MISS演出中の一時停止でブロックYが着地位置から変わらない", () => {
  const game = prepareMissSettling();
  const beforePause = getMovingRenderY(game);
  assert.equal(beforePause, game.moving.targetY);
  pauseGame(game);
  assert.equal(getMovingRenderY(game), beforePause);
  resumeGame(game);
  assert.equal(getMovingRenderY(game), beforePause);
});

test("IR04-05: NORMAL/PERFECT成功後の一時停止で旧movingを再表示しない", () => {
  for (const x of [0, 90]) {
    const game = startGame(createGame());
    enterSettling(game, x);
    assert.notEqual(game.lastLanding, LANDING.MISS);
    assert.equal(shouldDrawMovingBlock(game), false);
    pauseGame(game);
    assert.equal(shouldDrawMovingBlock(game), false);
  }
});

test("IR04-06: reduced-motion有効時はSETTLING/PAUSEDとも揺れオフセット0", () => {
  const game = startGame(createGame());
  enterSettling(game, game.placed.at(-1).x);
  assert.equal(getShakeOffset(game, true), 0);
  pauseGame(game);
  assert.equal(getShakeOffset(game, true), 0);
});

test("IR04-07: FALLING中の一時停止・再開で進捗と描画Yを保持して続行する", () => {
  const game = startGame(createGame());
  requestDrop(game);
  advanceAnimation(game, 0.05);
  const progress = getFallProgress(game);
  const y = getMovingRenderY(game);
  pauseGame(game);
  assert.equal(getFallProgress(game), progress);
  assert.equal(getMovingRenderY(game), y);
  assert.equal(advanceAnimation(game, 5), false);
  assert.equal(getMovingRenderY(game), y);
  resumeGame(game);
  advanceAnimation(game, 0.01);
  assert.ok(getMovingRenderY(game) > y);
});
