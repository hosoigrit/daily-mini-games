import test from "node:test";
import assert from "node:assert/strict";

import {
  createDefaultProgress,
  hasCompletedAllStages,
  isStageUnlocked,
  loadProgress,
  loadProgressFromStorageOwner,
  saveProgress,
  STORAGE_KEY,
  updateProgressAfterClear,
  validateProgress,
} from "../progress-store.mjs";

class MemoryStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function clearSequentially(progress, throughStage) {
  let current = progress;
  for (let stageId = 1; stageId <= throughStage; stageId += 1) {
    current = updateProgressAfterClear(current, stageId, stageId).progress;
  }
  return current;
}

test("TC-018/019/024: 解放は順番に進み、ロック中ステージは更新対象にできない", () => {
  const initial = createDefaultProgress();
  assert.equal(isStageUnlocked(initial, 1), true);
  assert.equal(isStageUnlocked(initial, 2), false);
  assert.throws(() => updateProgressAfterClear(initial, 2, 2), RangeError);

  const afterS1 = updateProgressAfterClear(initial, 1, 1).progress;
  assert.equal(afterS1.highestUnlockedStage, 2);
  assert.equal(isStageUnlocked(afterS1, 2), true);
  assert.equal(isStageUnlocked(afterS1, 3), false);

  const replay = updateProgressAfterClear(afterS1, 1, 3).progress;
  assert.equal(replay.highestUnlockedStage, 2);
});

test("TC-020: S01からS06まで順番にクリアすると全制覇になる", () => {
  const completed = clearSequentially(createDefaultProgress(), 6);
  assert.equal(completed.highestUnlockedStage, 6);
  assert.equal(hasCompletedAllStages(completed), true);
  for (let stageId = 1; stageId <= 6; stageId += 1) {
    assert.equal(isStageUnlocked(completed, stageId), true);
  }
});

test("TC-025: S01クリア後の解放状況とベストを保存・復元できる", () => {
  const storage = new MemoryStorage();
  const afterS1 = updateProgressAfterClear(createDefaultProgress(), 1, 1).progress;
  assert.equal(saveProgress(storage, afterS1), true);
  const loaded = loadProgress(storage);
  assert.deepEqual(loaded.progress, afterS1);
  assert.equal(loaded.storageAvailable, true);
  assert.equal(loaded.invalidData, false);
});

test("TC-026/027: より少ない手数だけが自己ベストを更新する", () => {
  const recorded = updateProgressAfterClear(createDefaultProgress(), 1, 3).progress;
  const improved = updateProgressAfterClear(recorded, 1, 2);
  assert.equal(improved.isNewBest, true);
  assert.equal(improved.progress.bestMoves["1"], 2);

  const tied = updateProgressAfterClear(improved.progress, 1, 2);
  assert.equal(tied.isNewBest, false);
  assert.equal(tied.progress.bestMoves["1"], 2);

  const worse = updateProgressAfterClear(tied.progress, 1, 4);
  assert.equal(worse.isNewBest, false);
  assert.equal(worse.progress.bestMoves["1"], 2);
});

test("TC-028: localStorageの読込・書込例外を捕捉しメモリ進行を継続できる", () => {
  const throwingRead = {
    getItem() {
      throw new DOMException("blocked", "SecurityError");
    },
  };
  const loaded = loadProgress(throwingRead);
  assert.deepEqual(loaded.progress, createDefaultProgress());
  assert.equal(loaded.storageAvailable, false);

  const throwingWrite = {
    setItem() {
      throw new DOMException("quota", "QuotaExceededError");
    },
  };
  const memoryProgress = updateProgressAfterClear(loaded.progress, 1, 1).progress;
  assert.equal(saveProgress(throwingWrite, memoryProgress), false);
  assert.equal(memoryProgress.highestUnlockedStage, 2);

  const owner = {};
  Object.defineProperty(owner, "localStorage", {
    get() {
      throw new DOMException("blocked", "SecurityError");
    },
  });
  assert.equal(loadProgressFromStorageOwner(owner).storageAvailable, false);
});

test("TC-029: 破損JSON・未知版・範囲外・不整合値は安全な初期値へ戻る", async (t) => {
  const invalidValues = [
    "{broken",
    JSON.stringify({ schemaVersion: 2, highestUnlockedStage: 1, bestMoves: {} }),
    JSON.stringify({ schemaVersion: 1, highestUnlockedStage: 0, bestMoves: {} }),
    JSON.stringify({ schemaVersion: 1, highestUnlockedStage: 7, bestMoves: {} }),
    JSON.stringify({ schemaVersion: 1, highestUnlockedStage: 2, bestMoves: { 1: 0 } }),
    JSON.stringify({ schemaVersion: 1, highestUnlockedStage: 3, bestMoves: { 1: 1 } }),
    JSON.stringify({ schemaVersion: 1, highestUnlockedStage: 2, bestMoves: { 1: 1, 2: 2 } }),
  ];

  for (const [index, value] of invalidValues.entries()) {
    await t.test(`不正値 ${index + 1}`, () => {
      const storage = new MemoryStorage({ [STORAGE_KEY]: value });
      const loaded = loadProgress(storage);
      assert.deepEqual(loaded.progress, createDefaultProgress());
      assert.equal(loaded.invalidData, true);
    });
  }
});

test("TC-030: Game 0001の保存キーを読み書きせず0002専用キーだけを更新する", () => {
  const game0001Key = "daily-mini-games:0001:best-score:v1";
  const storage = new MemoryStorage({ [game0001Key]: "42" });
  const progress = updateProgressAfterClear(createDefaultProgress(), 1, 1).progress;
  assert.equal(saveProgress(storage, progress), true);
  assert.equal(storage.getItem(game0001Key), "42");
  assert.notEqual(storage.getItem(STORAGE_KEY), null);
  assert.equal(storage.values.size, 2);
});

test("TC-031: 0002の保存値だけを消すとS01のみ解放の初期状態へ戻る", () => {
  const storage = new MemoryStorage();
  const progress = updateProgressAfterClear(createDefaultProgress(), 1, 1).progress;
  saveProgress(storage, progress);
  storage.removeItem(STORAGE_KEY);
  const loaded = loadProgress(storage);
  assert.deepEqual(loaded.progress, createDefaultProgress());
  assert.equal(loaded.invalidData, false);
});

test("保存データの形式検証はトップレベル・型・進行整合性を確認する", () => {
  assert.equal(validateProgress(createDefaultProgress()), true);
  assert.equal(validateProgress(null), false);
  assert.equal(validateProgress({ schemaVersion: 1, highestUnlockedStage: 1, bestMoves: {}, extra: true }), false);
});
