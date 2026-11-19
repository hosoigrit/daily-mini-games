import test from "node:test";
import assert from "node:assert/strict";
import {
  PHASES,
  advanceAnimation,
  advanceMoving,
  createGame,
  getShakeOffset,
  pauseGame,
  requestDrop,
  resumeGame,
  startGame,
} from "../src/state.mjs";

function landAt(game, x) {
  game.moving.x = x;
  assert.equal(requestDrop(game), true);
  advanceAnimation(game, 1);
}

function perfect(game) {
  landAt(game, game.placed.at(-1).x);
}

test("開始時は土台を階数に含めず1階目を生成する", () => {
  const game = startGame(createGame());
  assert.equal(game.floor, 0);
  assert.equal(game.placed.length, 1);
  assert.equal(game.phase, PHASES.MOVING);
  assert.equal(game.moving.width, 180);
});
test("TC-019: NORMAL後の次ブロック幅は直前の最上段幅と一致する", () => {
  const game = startGame(createGame());
  landAt(game, 0);
  assert.equal(game.floor, 1);
  assert.equal(game.placed.at(-1).width, 90);
  assert.equal(game.moving.width, 90);
});
test("TC-020/021: 着地成功で階数・得点・PERFECT数を一度更新する", () => {
  const game = startGame(createGame());
  perfect(game);
  assert.equal(game.floor, 1);
  assert.equal(game.score, 150);
  assert.equal(game.totalPerfect, 1);
});
test("TC-025/027: 10個目成功でCLEARになり11個目を生成しない", () => {
  const game = startGame(createGame());
  for (let count = 0; count < 10; count += 1) perfect(game);
  assert.equal(game.phase, PHASES.CLEAR);
  assert.equal(game.floor, 10);
  assert.equal(game.score, 1850);
  assert.equal(game.moving, null);
});
test("TC-026: 9階時点のMISSは階数と得点を維持する", () => {
  const game = startGame(createGame());
  landAt(game, 0);
  for (let count = 1; count < 9; count += 1) perfect(game);
  const beforeScore = game.score;
  const support = game.placed.at(-1);
  landAt(game, support.x + support.width);
  assert.equal(game.phase, PHASES.GAME_OVER);
  assert.equal(game.floor, 9);
  assert.equal(game.score, beforeScore);
});
test("TC-028: 再挑戦でプレイ中の記録を初期化する", () => {
  const game = startGame(createGame());
  perfect(game);
  startGame(game);
  assert.equal(game.floor, 0);
  assert.equal(game.score, 0);
  assert.equal(game.perfectStreak, 0);
  assert.equal(game.totalPerfect, 0);
  assert.equal(game.maxPerfectStreak, 0);
});
test("TC-029: MOVING中の着地入力は一度だけFALLINGへ移す", () => {
  const game = startGame(createGame());
  assert.equal(requestDrop(game), true);
  assert.equal(game.phase, PHASES.FALLING);
  assert.equal(requestDrop(game), false);
});
test("TC-030: FALLING/SETTLING中の連打で加点・階数を増やさない", () => {
  const game = startGame(createGame());
  game.moving.x = game.placed.at(-1).x;
  requestDrop(game);
  for (let count = 0; count < 20; count += 1) assert.equal(requestDrop(game), false);
  advanceAnimation(game, 0.15);
  assert.equal(game.phase, PHASES.SETTLING);
  const snapshot = [game.floor, game.score];
  for (let count = 0; count < 20; count += 1) assert.equal(requestDrop(game), false);
  assert.deepEqual([game.floor, game.score], snapshot);
});
test("TC-031/032: キーリピートや重複イベント相当の二重要求を状態で拒否する", () => {
  const game = startGame(createGame());
  const results = [requestDrop(game), requestDrop(game), requestDrop(game)];
  assert.deepEqual(results, [true, false, false]);
});
test("TC-033/034: 非表示相当のPAUSED中は5秒経っても位置が進まない", () => {
  const game = startGame(createGame());
  advanceMoving(game, 0.5);
  const x = game.moving.x;
  assert.equal(pauseGame(game), true);
  assert.equal(advanceMoving(game, 5), false);
  assert.equal(game.moving.x, x);
  assert.equal(resumeGame(game), true);
  assert.equal(game.phase, PHASES.MOVING);
});
test("TC-035: FALLING中断は演出時間を保ち、再開後に続行する", () => {
  const game = startGame(createGame());
  requestDrop(game);
  advanceAnimation(game, 0.05);
  const elapsed = game.animationElapsedSec;
  assert.equal(pauseGame(game), true);
  assert.equal(advanceAnimation(game, 5), false);
  assert.equal(game.animationElapsedSec, elapsed);
  resumeGame(game);
  advanceAnimation(game, 1);
  assert.equal(game.phase, PHASES.MOVING);
  assert.equal(game.floor, 1);
});
test("TC-035: SETTLING中断も演出時間を保つ", () => {
  const game = startGame(createGame());
  requestDrop(game);
  advanceAnimation(game, 0.15);
  assert.equal(game.phase, PHASES.SETTLING);
  const elapsed = game.animationElapsedSec;
  pauseGame(game);
  advanceAnimation(game, 5);
  assert.equal(game.animationElapsedSec, elapsed);
  resumeGame(game);
  advanceAnimation(game, 1);
  assert.equal(game.phase, PHASES.MOVING);
});
test("TC-036: CLEAR/GAME_OVERからstartGameで直接新規プレイできる", () => {
  const game = startGame(createGame());
  for (let count = 0; count < 10; count += 1) perfect(game);
  assert.equal(game.phase, PHASES.CLEAR);
  startGame(game);
  assert.equal(game.phase, PHASES.MOVING);
  assert.equal(game.floor, 0);
  assert.equal(game.score, 0);
});
test("TC-044: 揺れはモデル座標と幅を変更しない", () => {
  const game = startGame(createGame());
  game.moving.x = game.placed.at(-1).x;
  requestDrop(game);
  advanceAnimation(game, 0.15);
  const before = structuredClone(game.placed);
  const offset = getShakeOffset(game, false);
  assert.notEqual(offset, 0);
  assert.deepEqual(game.placed, before);
  assert.equal(getShakeOffset(game, true), 0);
});
