import test from "node:test";
import assert from "node:assert/strict";
import { createBestStorage } from "../src/storage.js";
import { createGameState, dispatch, totalProfit } from "../src/game-core.js";

const key = (week, version = "rules-v3") => `daily-mini-games:0007:best-profit:${version}:${week}`;

function fixture(entries = []) {
  const data = new Map(entries);
  const writes = [];
  const backend = {
    getItem: (name) => data.get(name) ?? null,
    setItem(name, value) {
      writes.push([name, value]);
      data.set(name, value);
    },
  };
  return { data, writes, backend, store: createBestStorage(() => backend) };
}

test("first negative result is saved, improvements write once, lower and tied results do not write", () => {
  const { store, writes } = fixture();
  assert.deepEqual(store.readBest("W01"), { status: "unregistered" });
  assert.deepEqual(store.saveBest("W01", -3), { status: "saved", best: { status: "found", value: -3 } });
  assert.deepEqual(store.saveBest("W01", 10), { status: "saved", best: { status: "found", value: 10 } });
  for (const profit of [9, 10]) {
    assert.deepEqual(store.saveBest("W01", profit), { status: "unchanged", best: { status: "found", value: 10 } });
  }
  assert.deepEqual(writes, [[key("W01"), "-3"], [key("W01"), "10"]]);
});

test("all six rules-v3 records are independent and a rules-v2 value is ignored", () => {
  const oldKey = key("W01", "rules-v2");
  const { store, writes, data } = fixture([[oldKey, "60"]]);
  const weeks = ["W01", "W02", "W03", "W04", "W05", "W06"];
  for (const [index, week] of weeks.entries()) {
    assert.deepEqual(store.readBest(week), { status: "unregistered" });
    assert.equal(store.saveBest(week, index).status, "saved");
  }
  for (const [index, week] of weeks.entries()) assert.equal(store.readBest(week).value, index);
  assert.deepEqual(writes.map(([name]) => name), weeks.map((week) => key(week)));
  assert.equal(data.get(oldKey), "60");
});

test("noncanonical, invalid and out-of-range values are corrupt and can be repaired", () => {
  for (const raw of ["80", "-31", "", " ", "NaN", "Infinity", "1.5", "+1", "01", "-0", "1e1", " 1", 4]) {
    const { store, data } = fixture([[key("W03"), raw]]);
    assert.deepEqual(store.readBest("W03"), { status: "corrupt" }, String(raw));
    assert.equal(store.saveBest("W03", 1).status, "saved");
    assert.equal(data.get(key("W03")), "1");
  }
});

test("canonical lower and upper boundaries are allowed, unsupported writes are rejected", () => {
  const { store, writes } = fixture([[key("W03"), "-30"], [key("W02"), "69"]]);
  assert.deepEqual(store.readBest("W03"), { status: "found", value: -30 });
  assert.deepEqual(store.readBest("W02"), { status: "found", value: 69 });
  for (const score of [-31, 70, NaN, Infinity, 1.5, "5"]) {
    assert.throws(() => store.saveBest("W02", score), RangeError);
  }
  assert.throws(() => store.readBest("W99"), RangeError);
  assert.throws(() => store.saveBest("W99", 0), RangeError);
  assert.deepEqual(writes, []);
});

test("failed reads protect the affected week for the entire session", () => {
  const { backend, data, store, writes } = fixture([[key("W01"), "4"]]);
  const read = backend.getItem;
  backend.getItem = (name) => {
    if (name === key("W01")) throw new Error("read denied");
    return read(name);
  };
  assert.deepEqual(store.readBest("W01"), { status: "read-error" });
  backend.getItem = read;
  assert.deepEqual(store.saveBest("W01", 10), { status: "read-error", best: { status: "read-error" } });
  assert.equal(data.get(key("W01")), "4");
  assert.equal(store.saveBest("W02", 10).status, "saved");
  assert.equal(writes.length, 1);
});

test("storage access itself can throw and never attempts to overwrite", () => {
  let attempts = 0;
  const store = createBestStorage(() => {
    attempts++;
    throw new Error("storage unavailable");
  });
  assert.deepEqual(store.saveBest("W05", 0), { status: "read-error", best: { status: "read-error" } });
  assert.deepEqual(store.readBest("W05"), { status: "read-error" });
  assert.equal(attempts, 1);
});

test("write failures preserve a valid best or expose the prior unregistered or corrupt state", () => {
  for (const [entries, best] of [
    [[[key("W01"), "4"]], { status: "found", value: 4 }],
    [[], { status: "unregistered" }],
    [[[key("W01"), "broken"]], { status: "corrupt" }],
  ]) {
    const { backend, data, store } = fixture(entries);
    backend.setItem = () => { throw new Error("quota exceeded"); };
    assert.deepEqual(store.saveBest("W01", 10), { status: "write-error", best });
    assert.deepEqual([...data], entries);
  }
});

test("cumulative game profit is provided by the core", () => {
  let state = createGameState();
  assert.equal(totalProfit(state), 0);
  state = dispatch(state, { type: "START" });
  state = dispatch(state, { type: "SET_BAKE_COUNT", bakeCount: 6 });
  state = dispatch(state, { type: "OPEN_SHOP" });
  assert.equal(totalProfit(state), 12);
});
