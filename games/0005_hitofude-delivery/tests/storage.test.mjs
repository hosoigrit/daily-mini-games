import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultProgress, createProgressStore, recordClear, sanitizeProgress } from "../src/storage.js";

test("SV-01: 保存なし初回はステージ1だけ解放", () => {
  const storage = memoryStorage();
  const store = createProgressStore(storage);
  assert.deepEqual(store.load(), createDefaultProgress());
});

test("SV-02: ステージN初クリアでN+1解放し後戻りしない", () => {
  let progress = createDefaultProgress();
  progress = recordClear(progress, 1, 800).progress;
  assert.equal(progress.unlockedStage, 2);
  progress = recordClear(progress, 1, 700).progress;
  assert.equal(progress.unlockedStage, 2);
});

test("SV-03: 低い再クリア得点で自己ベストを上書きしない", () => {
  let progress = recordClear(createDefaultProgress(), 1, 950).progress;
  const result = recordClear(progress, 1, 700);
  assert.equal(result.progress.bestScores[1], 950);
  assert.equal(result.bestUpdated, false);
});

test("SV-04: 保存後の再読込で解放・ベストだけ復元", () => {
  const storage = memoryStorage();
  const first = createProgressStore(storage);
  const progress = recordClear(first.load(), 1, 900).progress;
  first.save(progress);
  const second = createProgressStore(storage);
  const restored = second.load();
  assert.equal(restored.unlockedStage, 2);
  assert.equal(restored.bestScores[1], 900);
  assert.equal("route" in restored, false);
});

test("SV-05: 破損値・localStorage例外でも安全なメモリ状態で継続", () => {
  assert.deepEqual(sanitizeProgress({ version: 999, unlockedStage: 6 }), createDefaultProgress());
  const throwing = {
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("denied"); },
  };
  const store = createProgressStore(throwing);
  assert.deepEqual(store.load(), createDefaultProgress());
  assert.equal(store.snapshot().persistent, false);
  assert.match(store.snapshot().warning, /保存できません/);
});

test("IR-0005-01A: localStorageプロパティ取得例外でもストアを作成してメモリ進行できる", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() { throw new DOMException("Denied", "SecurityError"); },
  });
  try {
    const store = createProgressStore();
    const initial = store.load();
    const cleared = recordClear(initial, 1, 900).progress;
    store.save(cleared);
    assert.equal(store.snapshot().progress.unlockedStage, 2);
    assert.equal(store.snapshot().progress.bestScores[1], 900);
    assert.equal(store.snapshot().persistent, false);
    assert.match(store.snapshot().warning, /保存できません/);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});

test("IR-0005-01B: undefined／nullの保存先を保存不能として扱う", () => {
  for (const unavailable of [undefined, null]) {
    const store = createProgressStore(unavailable);
    assert.deepEqual(store.load(), createDefaultProgress());
    store.save(recordClear(store.snapshot().progress, 1, 800).progress);
    assert.equal(store.snapshot().progress.unlockedStage, 2);
    assert.equal(store.snapshot().persistent, false);
    assert.match(store.snapshot().warning, /保存できません/);
  }
});

test("IR-0005-01C: 読み取りだけ失敗しても起動できる", () => {
  const storage = {
    getItem() { throw new Error("read denied"); },
    setItem() {},
  };
  const store = createProgressStore(storage);
  assert.deepEqual(store.load(), createDefaultProgress());
  assert.equal(store.snapshot().persistent, false);
});

test("IR-0005-01D/03: 書き込みだけ失敗してもセッション進捗と警告を保持する", () => {
  const storage = {
    getItem() { return null; },
    setItem() { throw new Error("write denied"); },
  };
  const store = createProgressStore(storage);
  const cleared = recordClear(store.load(), 1, 950).progress;
  store.save(cleared);
  assert.equal(store.snapshot().progress.unlockedStage, 2);
  assert.equal(store.snapshot().progress.bestScores[1], 950);
  assert.equal(store.snapshot().persistent, false);
  assert.match(store.snapshot().warning, /保存できません/);
});

test("IR-0005-01E: 正常Storageは専用キーと既存v1データを維持する", () => {
  const calls = [];
  const saved = JSON.stringify({
    version: 1,
    unlockedStage: 2,
    bestScores: { 1: 900, 2: null, 3: null, 4: null, 5: null, 6: null },
  });
  const storage = {
    getItem(key) { calls.push(["get", key]); return saved; },
    setItem(key, value) { calls.push(["set", key, value]); },
  };
  const store = createProgressStore(storage);
  assert.equal(store.load().bestScores[1], 900);
  store.save(store.snapshot().progress);
  assert.equal(store.snapshot().persistent, true);
  assert.deepEqual(calls.map((call) => call.slice(0, 2)), [
    ["get", "daily-mini-games.0005.progress.v1"],
    ["set", "daily-mini-games.0005.progress.v1"],
  ]);
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); },
  };
}

