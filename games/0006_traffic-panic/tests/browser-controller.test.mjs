import assert from "node:assert/strict";
import test from "node:test";
import { EXPERIMENT_CONFIGS } from "../simulation/experiment-configs.mjs";
import { createSession, processBoundary } from "../src/session.mjs";
import { createBrowserController, PLAY_CONFIG, randomPlaySeed, shortcutFor } from "../ui/browser-controller.mjs";
import { describeResult } from "../ui/renderer.mjs";

function setup(options = {}) {
  let frame;
  let view;
  let now = 0;
  let hidden = false;
  const controller = createBrowserController({
    requestFrame: (callback) => { frame = callback; return 1; },
    cancelFrame: () => { frame = null; },
    onChange: (next) => { view = next; },
    isHidden: () => hidden,
    seedForPlay: () => "2001",
    ...options,
  });
  return {
    dispatch: controller.dispatch,
    advance(ms) { now += ms; frame?.(now); },
    hide(value) { hidden = value; controller.visibilityChanged(); },
    get view() { return view; },
    get snapshot() { return view.session.snapshot; },
    get status() { return view.status; },
  };
}

test("E3-UT-01/02 START, next tick and HARD-A timing", () => {
  const h = setup();
  assert.equal(h.status, "READY");
  assert.equal(h.view.session.config.balanceConfigId, "HARD-A");
  assert.deepEqual(h.view.session.config, PLAY_CONFIG);
  h.dispatch("START", "SWITCH_NS");
  assert.equal(h.status, "RUNNING");
  assert.equal(h.snapshot.elapsedTick, 0);
  assert.equal(h.snapshot.passedVehicles, 0);
  assert.equal(h.view.session.replayLog[0].commandOutcomes[1].reason, "DISCARDED_BY_START");
  h.advance(0);
  h.advance(99);
  assert.equal(h.snapshot.elapsedTick, 0);
  h.advance(1);
  assert.equal(h.snapshot.elapsedTick, 1);
  assert.equal(h.snapshot.signal.phase, "EW_GREEN");
});

test("E3-UT-03 identical tick inputs are reproducible at 30/60/120 FPS", () => {
  function run(fps) {
    const h = setup();
    h.dispatch("START");
    h.advance(0);
    while (h.status === "RUNNING") {
      const tick = h.snapshot.elapsedTick;
      if (tick === 22) h.dispatch("SWITCH_NS");
      if (tick === 80) h.dispatch("SWITCH_EW");
      h.advance(1000 / fps);
    }
    return h.view.session;
  }
  const reference = run(30);
  assert.equal(reference.snapshot.switchCount, 2);
  assert.deepEqual(run(60), reference);
  assert.deepEqual(run(120), reference);
});

test("E3-UT-04 500 ms consumes five ticks, 501 ms pauses without catch-up", () => {
  const h = setup();
  h.dispatch("START");
  h.advance(10);
  h.advance(500);
  assert.equal(h.snapshot.elapsedTick, 5);
  h.advance(501);
  assert.equal(h.status, "PAUSED");
  assert.equal(h.view.pauseReason, "gap");
  assert.equal(h.snapshot.elapsedTick, 5);
});

test("E3-UT-05/06 hiding takes priority and resume uses a fresh frame baseline", () => {
  const h = setup();
  h.dispatch("START");
  h.advance(0);
  h.advance(98);
  const before = h.snapshot;
  h.dispatch("SWITCH_NS");
  h.hide(true);
  assert.equal(h.view.pauseReason, "hidden");
  assert.deepEqual(h.snapshot, before);
  h.dispatch("RESUME");
  assert.equal(h.status, "PAUSED");
  h.hide(false);
  h.advance(5000);
  assert.equal(h.status, "PAUSED");
  h.dispatch("RESUME", "SWITCH_NS");
  assert.equal(h.view.session.replayLog.at(-1).commandOutcomes[1].reason, "DISCARDED_BY_RESUME");
  h.advance(9000);
  h.advance(99);
  assert.deepEqual(h.snapshot, before);
  h.advance(1);
  assert.equal(h.snapshot.elapsedTick, 1);
  assert.equal(h.snapshot.signal.phase, "EW_GREEN");
});

test("E3-UT-07 PAUSE wins with queued SWITCH and batched RESUME", () => {
  const h = setup();
  h.dispatch("START");
  h.dispatch("SWITCH_NS");
  h.dispatch("RESUME", "PAUSE");
  assert.equal(h.status, "PAUSED");
  const { commands, commandOutcomes } = h.view.session.replayLog.at(-1);
  assert.deepEqual(commands.map(({ commandSequence }) => commandSequence), [2, 3, 4]);
  assert.deepEqual(commandOutcomes.map(({ reason }) => reason), ["DISCARDED_BY_PAUSE", "DISCARDED_BY_PAUSE", null]);
  h.advance(1000);
  assert.equal(h.snapshot.switchCount, 0);
});

test("E3-UT-08/09 duplicate switches and transition inputs are never carried forward", () => {
  const h = setup();
  h.dispatch("START");
  h.advance(0);
  h.dispatch("SWITCH_EW", "SWITCH_NS");
  h.dispatch("SWITCH_NS");
  h.advance(100);
  assert.equal(h.snapshot.signal.phase, "EW_YELLOW");
  assert.equal(h.view.session.replayLog.at(-1).commands.length, 1);
  h.dispatch("SWITCH_EW");
  h.advance(500);
  h.advance(500);
  assert.equal(h.snapshot.signal.phase, "ALL_RED_TO_NS");
  h.dispatch("SWITCH_EW");
  h.advance(500);
  h.advance(100);
  assert.equal(h.snapshot.signal.phase, "NS_GREEN");
  assert.equal(h.snapshot.switchCount, 1);
});

test("E3-UT-10 CLEAR at tick 600 ignores the switch due at timeout", () => {
  const h = setup({ create: (args) => createSession({ ...args, schedule: [] }) });
  h.dispatch("START");
  h.advance(0);
  for (let i = 0; i < 119; i += 1) h.advance(500);
  h.advance(400);
  const before = h.snapshot;
  h.dispatch("SWITCH_NS");
  h.advance(100);
  assert.equal(h.view.session.result, "CLEAR");
  assert.deepEqual(h.snapshot, { ...before, elapsedTick: 600 });
  assert.deepEqual(h.view.events, []);
  assert.equal(h.view.session.replayLog.at(-1).commandOutcomes[0].reason, "TIME_UP_NOT_EXECUTED");
});

test("E3-UT-11/12 ninth northbound arrival ends the game immediately and freezes the outcome", () => {
  const schedule = Array.from({ length: 9 }, (_, i) => ({ eventId: i + 1, spawnTick: i + 1, direction: "N" }));
  const h = setup({ create: (args) => createSession({ ...args, schedule }) });
  h.dispatch("START");
  h.advance(0);
  h.advance(500);
  h.advance(300);
  assert.equal(h.status, "RUNNING");
  assert.equal(h.snapshot.queues.north, 8);
  h.advance(100);
  assert.equal(h.status, "FINISHED");
  assert.equal(h.view.session.result, "GRIDLOCK");
  assert.equal(h.snapshot.elapsedTick, 9);
  assert.equal(h.snapshot.queues.north, 8);
  assert.equal(h.snapshot.arrivalAttempts, 9);
  assert.equal(h.snapshot.overflowVehicles, 1);
  assert.match(describeResult(h.status, h.view.session)[1], /^北から9台目/);
  const terminal = h.view.session;
  h.dispatch("PAUSE", "SWITCH_NS", "RESUME");
  h.advance(2000);
  assert.deepEqual(h.view.session, terminal);
});

test("E3-UT-13 retry creates an independent session with a different seed and fresh sequence", () => {
  const seeds = ["2001", "2001", "9999"];
  const h = setup({ seedForPlay: () => seeds.shift() });
  h.dispatch("START");
  h.advance(0);
  h.advance(100);
  h.dispatch("PAUSE");
  h.dispatch("RETRY");
  assert.equal(h.status, "READY");
  assert.equal(h.snapshot.elapsedTick, 0);
  assert.equal(h.view.session.seedId, "9999");
  assert.equal(h.view.session.replayLog.length, 0);
  h.dispatch("START");
  assert.equal(h.view.session.replayLog[0].commands[0].commandSequence, 1);
  const samples = [0xffffffff, 7998];
  assert.equal(randomPlaySeed({ getRandomValues: (array) => { array[0] = samples.shift(); } }), "9999");
});

test("E3-UT-17 a session fault stops technical play with a distinct explanation and retry", () => {
  const seeds = ["2001", "2002"];
  const h = setup({
    seedForPlay: () => seeds.shift(),
    boundary: () => { throw new TypeError(); },
  });
  h.dispatch("START");
  assert.equal(h.status, "ERROR");
  assert.equal(h.view.fault.code, "SESSION_UPDATE_FAILED");
  assert.equal(describeResult(h.status, h.view.session)[0], "ゲームを続けられませんでした");
  h.dispatch("RETRY");
  assert.equal(h.status, "READY");
});

test("E3-UT-18 editable, modifier, repeat and native button events are left to the browser", () => {
  for (const key of ["1", "2", "p", "Enter"]) {
    assert.equal(shortcutFor({ key, target: { isContentEditable: true } }, "RUNNING"), null);
    assert.equal(shortcutFor({ key, target: { closest: (selector) => selector.includes("textarea") } }, "RUNNING"), null);
  }
  assert.equal(shortcutFor({ key: "P", repeat: true }, "RUNNING"), null);
  assert.equal(shortcutFor({ key: "2", ctrlKey: true }, "RUNNING"), null);
  assert.equal(shortcutFor({ key: "Enter", target: { closest: (selector) => selector.includes("button") } }, "PAUSED"), null);
  assert.equal(shortcutFor({ key: "1" }, "RUNNING"), "SWITCH_EW");
  assert.equal(shortcutFor({ key: "P" }, "PAUSED"), "RESUME");
  assert.equal(shortcutFor({ key: "Enter" }, "READY"), "START");
});

test("E5-A: browser-only HARD-A configuration matches the frozen experiment configuration", () => {
  assert.deepEqual(PLAY_CONFIG, EXPERIMENT_CONFIGS["HARD-A"]);
});

test("E3-L02: duplicate seeds stop after eight draws and a later retry can start", () => {
  let nextSeed = "2001";
  let samples = 0;
  const h = setup({ seedForPlay: () => { samples += 1; return nextSeed; } });
  h.dispatch("START");
  h.dispatch("PAUSE");
  h.dispatch("RETRY");
  assert.equal(samples, 9); // Initial session plus eight retry attempts.
  assert.equal(h.status, "ERROR");
  assert.equal(h.view.session, null);
  assert.equal(h.view.fault.code, "PLAY_SEED_UNAVAILABLE");
  nextSeed = "9999";
  h.dispatch("RETRY");
  assert.equal(h.status, "READY");
  assert.equal(h.view.session.seedId, "9999");
  h.dispatch("START");
  assert.equal(h.status, "RUNNING");
});

test("E3-L02: out-of-range entropy draws exhaust the same finite limit", () => {
  let samples = 0;
  const source = { getRandomValues(array) { samples += 1; array[0] = 0xffffffff; } };
  assert.equal(randomPlaySeed(source), null);
  assert.equal(samples, 8);
  const h = setup({ seedForPlay: () => randomPlaySeed(source) });
  assert.equal(h.status, "ERROR");
  assert.equal(h.view.fault.code, "PLAY_SEED_UNAVAILABLE");
});

test("E3-L01: the two rejection codes do not trap the browser controller", () => {
  let first = true;
  const h = setup({ boundary(session, commands) {
    if (!first) return processBoundary(session, commands);
    first = false;
    const refused = processBoundary(session, [{ type: "SWITCH_NS", targetTick: 1, commandSequence: commands[0].commandSequence }]);
    assert.equal(refused.code, "NOT_ALLOWED");
    assert.equal(refused.commandOutcomes[0].reason, "NOT_RUNNING");
    assert.deepEqual(refused.session.snapshot, session.snapshot);
    return refused;
  } });
  h.dispatch("START");
  assert.equal(h.status, "READY");
  assert.equal(h.view.fault, null);
  h.dispatch("START");
  assert.equal(h.status, "RUNNING");
});
