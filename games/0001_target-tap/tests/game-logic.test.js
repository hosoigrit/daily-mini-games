import assert from "node:assert/strict";
import test from "node:test";

import {
  GAME_DURATION_MS,
  PHASE,
  STORAGE_KEY,
  TARGET_SIZE_PX,
  beginActivationKey,
  clampTargetPosition,
  createInitialState,
  finishRound,
  getTimerSnapshot,
  loadBestScore,
  loadBestScoreFromStorageOwner,
  parseBestScore,
  randomTargetPosition,
  releaseActivationKey,
  resizeTarget,
  saveBestScore,
  saveBestScoreToStorageOwner,
  scoreTarget,
  startRound,
  updateTimer,
} from "../game-logic.js";

const START_MS = 1_000_000;

function playingState(bestScore = 0) {
  return startRound(createInitialState(bestScore), START_MS, { x: 10, y: 20 });
}

test("TC-U01 initial state is READY with score 0 and stopped timer", () => {
  const state = createInitialState(7);
  assert.equal(state.phase, PHASE.READY);
  assert.equal(state.score, 0);
  assert.equal(state.bestScore, 7);
  assert.equal(state.deadlineAtMs, null);
  assert.equal(state.roundId, 0);
});

test("TC-U02 start creates a 30 second PLAYING round", () => {
  const state = playingState();
  assert.equal(state.phase, PHASE.PLAYING);
  assert.equal(state.score, 0);
  assert.equal(state.startedAtMs, START_MS);
  assert.equal(state.deadlineAtMs, START_MS + GAME_DURATION_MS);
  assert.equal(state.remainingSec, 30);
  assert.equal(state.roundId, 1);
});

test("TC-U03 repeated start while PLAYING does not create another round", () => {
  const state = playingState();
  assert.strictEqual(startRound(state, START_MS + 1), state);
});

test("TC-U04 replay from RESULT resets score and advances roundId", () => {
  const result = { ...playingState(8), phase: PHASE.RESULT, score: 5, roundId: 3 };
  const replay = startRound(result, START_MS + 50_000, { x: 3, y: 4 });
  assert.equal(replay.phase, PHASE.PLAYING);
  assert.equal(replay.score, 0);
  assert.equal(replay.bestScore, 8);
  assert.equal(replay.roundId, 4);
  assert.equal(replay.deadlineAtMs, START_MS + 80_000);
});

test("TC-U05 hit at 29,999ms adds exactly one point and relocates once", () => {
  const state = playingState();
  const outcome = scoreTarget(state, START_MS + 29_999, { x: 41, y: 52 });
  assert.equal(outcome.scored, true);
  assert.equal(outcome.expired, false);
  assert.equal(outcome.state.score, 1);
  assert.equal(outcome.state.targetX, 41);
  assert.equal(outcome.state.targetY, 52);
});

test("TC-U06 hit at exactly 30,000ms is rejected", () => {
  const state = playingState();
  const outcome = scoreTarget(state, START_MS + 30_000, { x: 41, y: 52 });
  assert.equal(outcome.scored, false);
  assert.equal(outcome.expired, true);
  assert.equal(outcome.state.score, 0);
});

test("TC-U07 inputs before start and after result do not score", () => {
  const ready = createInitialState();
  const result = { ...playingState(), phase: PHASE.RESULT };
  assert.equal(scoreTarget(ready, START_MS, { x: 1, y: 1 }).scored, false);
  assert.equal(scoreTarget(result, START_MS, { x: 1, y: 1 }).scored, false);
});

test("TC-U08 miss is represented by no scoreTarget call and state stays unchanged", () => {
  const state = playingState();
  assert.deepEqual(state, playingState());
});

test("TC-U09 timer shows 30 through 1 and expires at the boundary", () => {
  const deadline = START_MS + 30_000;
  assert.deepEqual(getTimerSnapshot(deadline, START_MS), {
    remainingMs: 30_000,
    remainingSec: 30,
    expired: false,
  });
  assert.equal(getTimerSnapshot(deadline, deadline - 1).remainingSec, 1);
  assert.deepEqual(getTimerSnapshot(deadline, deadline), {
    remainingMs: 0,
    remainingSec: 0,
    expired: true,
  });
});

test("TC-U10 delayed or background refresh evaluates the absolute deadline", () => {
  const state = playingState();
  const outcome = updateTimer(state, START_MS + 75_000);
  assert.equal(outcome.expired, true);
  assert.equal(outcome.state.remainingSec, 0);
  assert.equal(outcome.state.deadlineAtMs, state.deadlineAtMs);
});

test("TC-U11 round ends once and preserves final score", () => {
  const scored = { ...playingState(), score: 4 };
  const first = finishRound(scored, START_MS + 30_000);
  const second = finishRound(first.state, START_MS + 30_001);
  assert.equal(first.ended, true);
  assert.equal(first.state.phase, PHASE.RESULT);
  assert.equal(first.state.score, 4);
  assert.equal(second.ended, false);
  assert.strictEqual(second.state, first.state);
});

test("TC-U12 round cannot end before the deadline", () => {
  const state = playingState();
  const outcome = finishRound(state, START_MS + 29_999);
  assert.equal(outcome.ended, false);
  assert.strictEqual(outcome.state, state);
});

test("TC-U13 new high score updates memory, lower and tied scores do not", () => {
  const newBest = finishRound({ ...playingState(3), score: 5 }, START_MS + 30_000);
  assert.equal(newBest.newBest, true);
  assert.equal(newBest.state.bestScore, 5);

  const tied = finishRound({ ...playingState(5), score: 5 }, START_MS + 30_000);
  const lower = finishRound({ ...playingState(5), score: 2 }, START_MS + 30_000);
  assert.equal(tied.newBest, false);
  assert.equal(lower.newBest, false);
  assert.equal(tied.state.bestScore, 5);
  assert.equal(lower.state.bestScore, 5);
});

test("TC-U14 random position keeps the whole 64px target in bounds", () => {
  const values = [0, 0, 0.999999, 0.999999];
  const random = () => values.shift();
  assert.deepEqual(randomTargetPosition(320, 200, random), { x: 0, y: 0 });
  const edge = randomTargetPosition(320, 200, random);
  assert.ok(edge.x >= 0 && edge.x <= 320 - TARGET_SIZE_PX);
  assert.ok(edge.y >= 0 && edge.y <= 200 - TARGET_SIZE_PX);
});

test("TC-U15 random position permits the same position on consecutive hits", () => {
  const random = () => 0.5;
  assert.deepEqual(
    randomTargetPosition(320, 200, random),
    randomTargetPosition(320, 200, random),
  );
});

test("TC-U16 too-small playfield produces non-negative coordinates", () => {
  assert.deepEqual(randomTargetPosition(20, 30, () => 0.9), { x: 0, y: 0 });
});

test("TC-U17 resize clamps only out-of-bounds target coordinates", () => {
  const state = { ...playingState(), targetX: 400, targetY: 250 };
  const resized = resizeTarget(state, 320, 200);
  assert.equal(resized.targetX, 256);
  assert.equal(resized.targetY, 136);
  assert.equal(resized.score, state.score);
  assert.equal(resized.deadlineAtMs, state.deadlineAtMs);
  assert.equal(resized.roundId, state.roundId);
});

test("TC-U18 resize leaves an in-bounds position and state object unchanged", () => {
  const state = playingState();
  assert.strictEqual(resizeTarget(state, 320, 200), state);
});

test("TC-U19 clamp handles negative and non-finite coordinates", () => {
  assert.deepEqual(clampTargetPosition({ x: -5, y: Number.NaN }, 100, 100), {
    x: 0,
    y: 0,
  });
});

test("TC-U20 storage parser accepts only non-negative safe integer strings", () => {
  assert.equal(parseBestScore("0"), 0);
  assert.equal(parseBestScore("42"), 42);
  assert.equal(parseBestScore("-1"), 0);
  assert.equal(parseBestScore("1.5"), 0);
  assert.equal(parseBestScore("score"), 0);
  assert.equal(parseBestScore(null), 0);
  assert.equal(parseBestScore(String(Number.MAX_SAFE_INTEGER + 1)), 0);
});

test("TC-U21 storage load reads only the dedicated key", () => {
  const requested = [];
  const storage = {
    getItem(key) {
      requested.push(key);
      return "12";
    },
  };
  assert.deepEqual(loadBestScore(storage), { score: 12, available: true });
  assert.deepEqual(requested, [STORAGE_KEY]);
});

test("TC-U22 storage read failure falls back to zero", () => {
  const storage = { getItem() { throw new Error("denied"); } };
  assert.deepEqual(loadBestScore(storage), { score: 0, available: false });
});

test("TC-U23 storage save writes an integer string to the dedicated key", () => {
  const written = [];
  const storage = { setItem(key, value) { written.push([key, value]); } };
  assert.equal(saveBestScore(storage, 19), true);
  assert.deepEqual(written, [[STORAGE_KEY, "19"]]);
});

test("TC-U24 storage write failure is non-fatal", () => {
  const storage = { setItem() { throw new Error("denied"); } };
  assert.equal(saveBestScore(storage, 19), false);
  assert.equal(saveBestScore(storage, -1), false);
});

test("TC-U25 page reload creates READY state while restoring only best score", () => {
  const loaded = loadBestScore({ getItem: () => "15" });
  const reloaded = createInitialState(loaded.score);
  assert.equal(reloaded.phase, PHASE.READY);
  assert.equal(reloaded.score, 0);
  assert.equal(reloaded.deadlineAtMs, null);
  assert.equal(reloaded.bestScore, 15);
});

test("TC-U26 activation key accepts one keydown and rejects repeat", () => {
  const first = beginActivationKey(null, "Enter", false);
  const repeated = beginActivationKey(first.pressedKey, "Enter", true);
  assert.deepEqual(first, { pressedKey: "Enter", accepted: true });
  assert.deepEqual(repeated, { pressedKey: "Enter", accepted: false });
});

test("TC-U27 activation occurs once on matching key release", () => {
  const released = releaseActivationKey(" ", " ");
  const duplicate = releaseActivationKey(released.pressedKey, " ");
  assert.deepEqual(released, { pressedKey: null, activate: true });
  assert.deepEqual(duplicate, { pressedKey: null, activate: false });
});

test("TC-U28 unrelated keys never activate the target", () => {
  assert.deepEqual(beginActivationKey(null, "a", false), {
    pressedKey: null,
    accepted: false,
  });
  assert.deepEqual(releaseActivationKey(null, "a"), {
    pressedKey: null,
    activate: false,
  });
});

test("TC-U29 localStorage property SecurityError falls back to zero", () => {
  const storageOwner = {};
  Object.defineProperty(storageOwner, "localStorage", {
    get() {
      throw new DOMException("Access denied", "SecurityError");
    },
  });

  assert.deepEqual(loadBestScoreFromStorageOwner(storageOwner), {
    score: 0,
    available: false,
  });
});

test("TC-U30 localStorage property SecurityError makes save non-fatal", () => {
  const storageOwner = {};
  Object.defineProperty(storageOwner, "localStorage", {
    get() {
      throw new DOMException("Access denied", "SecurityError");
    },
  });

  assert.equal(saveBestScoreToStorageOwner(storageOwner, 12), false);
});
