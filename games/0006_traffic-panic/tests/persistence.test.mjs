import assert from "node:assert/strict";
import test from "node:test";
import { createRecords, STORAGE_KEY } from "../ui/persistence.mjs";

test("E3-UT-14 storage getter and setItem failures preserve playable in-memory records", () => {
  const blocked = createRecords(() => { throw new Error(); });
  assert.match(blocked.read().warning, /読み込めません/);
  assert.deepEqual(blocked.record("GRIDLOCK", 50), {
    bestClear: null, bestAttempt: 50, warning: "最高記録を保存できませんでした。",
  });
  const full = createRecords(() => ({ getItem: () => null, setItem() { throw new Error(); } }));
  assert.equal(full.record("CLEAR", 300).bestClear, 300);
  assert.match(full.read().warning, /保存できません/);
});

test("E3-UT-15 corrupt, incompatible and inconsistent records fall back to empty scores", () => {
  for (const raw of ["{", "null", '{"version":2,"bestClear":10,"bestAttempt":10}',
    '{"version":1,"bestClear":-1,"bestAttempt":10}', '{"version":1,"bestClear":20,"bestAttempt":10}']) {
    const records = createRecords(() => ({ getItem: () => raw, setItem() {} }));
    assert.equal(records.read().bestClear, null);
    assert.equal(records.read().bestAttempt, null);
    assert.match(records.read().warning, /読み込めません/);
    assert.equal(records.record("CLEAR", 20).warning, null);
  }
});

test("E3-UT-16 best clear and attempt are independently saved and restored with a versioned key", () => {
  const data = new Map();
  const storage = () => ({ getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) });
  const records = createRecords(storage);
  assert.equal(STORAGE_KEY, "daily-mini-games.0006.records.v1.HARD-A");
  records.record("GRIDLOCK", 480);
  records.record("CLEAR", 410);
  records.record("ERROR", 1000);
  records.record("CLEAR", null);
  records.record("CLEAR", 400);
  records.record("GRIDLOCK", 510);
  assert.deepEqual(createRecords(storage).read(), { bestClear: 410, bestAttempt: 510, warning: null });
  assert.equal(JSON.parse(data.get(STORAGE_KEY)).version, 1);
});
