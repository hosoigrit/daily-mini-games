import test from "node:test";
import assert from "node:assert/strict";
import { LANDING } from "../src/rules.mjs";
import { shouldDrawMovingBlock } from "../src/renderer.mjs";
import {
  PHASES,
  advanceAnimation,
  createGame,
  pauseGame,
  requestDrop,
  startGame,
} from "../src/state.mjs";

function reachSettling(game, x) {
  game.moving.x = x;
  requestDrop(game);
  advanceAnimation(game, 0.15);
  assert.equal(game.phase, PHASES.SETTLING);
}

test("IR-03: NORMALのSETTLINGでは旧movingを描画せず切除部分を復活させない", () => {
  const game = startGame(createGame());
  reachSettling(game, 0);
  assert.equal(game.lastLanding, LANDING.NORMAL);
  assert.equal(game.placed.at(-1).width, 90);
  assert.equal(game.moving.width, 180);
  assert.equal(shouldDrawMovingBlock(game), false);
});

test("IR-03: PERFECTのSETTLINGでも配置済みブロックだけを描画する", () => {
  const game = startGame(createGame());
  reachSettling(game, game.placed.at(-1).x);
  assert.equal(game.lastLanding, LANDING.PERFECT);
  assert.equal(game.placed.at(-1).width, 180);
  assert.equal(shouldDrawMovingBlock(game), false);
});

test("IR-03: MISSのSETTLINGではMISS演出用movingを維持する", () => {
  const game = startGame(createGame());
  reachSettling(game, 0);
  advanceAnimation(game, 1);
  const support = game.placed.at(-1);
  reachSettling(game, support.x + support.width);
  assert.equal(game.lastLanding, LANDING.MISS);
  assert.equal(shouldDrawMovingBlock(game), true);
});

test("IR-03: 成功SETTLINGを一時停止しても旧movingを再表示しない", () => {
  const game = startGame(createGame());
  reachSettling(game, 0);
  pauseGame(game);
  assert.equal(game.phase, PHASES.PAUSED);
  assert.equal(game.pausedFrom, PHASES.SETTLING);
  assert.equal(shouldDrawMovingBlock(game), false);
});
