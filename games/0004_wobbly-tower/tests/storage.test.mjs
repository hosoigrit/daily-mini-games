import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_BEST,
  STORAGE_KEY,
  getBrowserStorage,
  loadBest,
  saveBest,
  updateBest,
} from "../src/storage.mjs";

function memoryStorage(initial = null) {
  let value = initial;
  return {
    getItem(key) {
      assert.equal(key, STORAGE_KEY);
      return value;
    },
    setItem(key, next) {
      assert.equal(key, STORAGE_KEY);
      value = next;
    },
    value: () => value,
  };
}

test("TC-037: 更新した最高到達階数・最高スコアを保存して再読込できる", () => {
  const storage = memoryStorage();
  const best = updateBest(EMPTY_BEST, { floor: 7, score: 980 });
  assert.equal(saveBest(storage, best), true);
  assert.deepEqual(loadBest(storage), { bestFloor: 7, bestScore: 980 });
});
test("TC-038: 低い結果で自己ベストが下がらない", () => {
  assert.deepEqual(
    updateBest({ bestFloor: 8, bestScore: 1200 }, { floor: 5, score: 700 }),
    { bestFloor: 8, bestScore: 1200 },
  );
});
test("自己ベストは階数とスコアを別々に更新する", () => {
  assert.deepEqual(
    updateBest({ bestFloor: 8, bestScore: 900 }, { floor: 7, score: 1100 }),
    { bestFloor: 8, bestScore: 1100 },
  );
});
test("TC-039: 不正JSON・負数・範囲外・文字列は安全な初期値になる", () => {
  const invalidValues = [
    "{",
    JSON.stringify({ bestFloor: -1, bestScore: 0 }),
    JSON.stringify({ bestFloor: 11, bestScore: 0 }),
    JSON.stringify({ bestFloor: 1, bestScore: 1851 }),
    JSON.stringify({ bestFloor: "1", bestScore: "100" }),
  ];
  for (const value of invalidValues) assert.deepEqual(loadBest(memoryStorage(value)), EMPTY_BEST);
});
test("TC-040: 保存領域の読込失敗を吸収する", () => {
  assert.deepEqual(loadBest({ getItem() { throw new Error("denied"); } }), EMPTY_BEST);
});
test("TC-040: 保存領域の書込失敗を吸収する", () => {
  assert.equal(saveBest({ setItem() { throw new Error("full"); } }, EMPTY_BEST), false);
});
test("localStorageプロパティ取得自体の例外を吸収する", () => {
  const browserWindow = {};
  Object.defineProperty(browserWindow, "localStorage", { get() { throw new Error("denied"); } });
  assert.equal(getBrowserStorage(browserWindow), null);
});
