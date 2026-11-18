import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  STATES,
  createGame,
  resumeGame,
  startGame,
  stepGame,
} from "../src/core.js";
import {
  RECORD_KEYS,
  calculateUpdatedRecords,
  consumeFixedSteps,
  getBrowserStorage,
  loadRecords,
  pauseForLifecycle,
  prepareLifecycleRestore,
  writeRecords,
} from "../src/main.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

function lifecycleFixture(state) {
  const game = createGame();
  startGame(game);
  game.state = state;
  game.pausedFrom = null;
  let lastFrameTime = 1234;
  let accumulator = 0.2;
  let clearCount = 0;
  let syncCount = 0;
  const input = { clear() { clearCount += 1; } };
  const resetFrameClock = () => {
    lastFrameTime = null;
    accumulator = 0;
  };
  const syncUi = () => { syncCount += 1; };
  return {
    game,
    input,
    resetFrameClock,
    syncUi,
    counters: () => ({ clearCount, syncCount, lastFrameTime, accumulator }),
  };
}

test("IT-001/018: page exposes semantic Japanese UI, HUD, Canvas, controls, and module entry", async () => {
  const html = await readFile(join(root, "index.html"), "utf8");
  assert.match(html, /lang="ja"/);
  assert.match(html, /id="game-canvas"/);
  assert.match(html, /id="time-value"/);
  assert.match(html, /id="lives-value"/);
  assert.match(html, /id="joystick"/);
  assert.match(html, /aria-label="仮想ジョイスティック"/);
  assert.match(html, /type="module" src="\.\/src\/main\.js"/);
});

test("IT-006/013: responsive CSS limits touch-action to joystick and preserves 3:4 canvas", async () => {
  const css = await readFile(join(root, "styles.css"), "utf8");
  assert.match(css, /\.game-shell[\s\S]*aspect-ratio:\s*3\s*\/\s*4/);
  assert.match(css, /\.control-zone[\s\S]*height:\s*112px/);
  assert.match(css, /\.joystick[\s\S]*width:\s*96px[\s\S]*touch-action:\s*none/);
  assert.doesNotMatch(css, /body\s*\{[^}]*touch-action:\s*none/);
  assert.match(css, /@media \(max-height: 610px\)/);
});

test("IT-014: records update, persist, and reload without allowing a loss to erase stars", () => {
  const storage = memoryStorage();
  const cleared = createGame();
  cleared.state = STATES.CLEARED;
  cleared.elapsedSteps = 1800;
  cleared.stars = 2;
  let records = calculateUpdatedRecords({ stars: 0, survivalMs: 0 }, cleared);
  assert.deepEqual(records, { stars: 2, survivalMs: 30000 });
  assert.equal(writeRecords(storage, records), true);
  assert.deepEqual(loadRecords(storage), records);

  const failed = createGame();
  failed.state = STATES.GAME_OVER;
  failed.elapsedSteps = 600;
  failed.stars = 0;
  records = calculateUpdatedRecords(records, failed);
  assert.deepEqual(records, { stars: 2, survivalMs: 30000 });
});

test("IT-015: corrupt or unavailable storage falls back and never stops play", () => {
  const corrupt = memoryStorage({
    [RECORD_KEYS.stars]: "99",
    [RECORD_KEYS.survivalMs]: "not-a-number",
  });
  assert.deepEqual(loadRecords(corrupt), { stars: 0, survivalMs: 0 });

  const unavailable = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  assert.deepEqual(loadRecords(unavailable), { stars: 0, survivalMs: 0 });
  assert.equal(writeRecords(unavailable, { stars: 3, survivalMs: 30000 }), false);
  assert.equal(getBrowserStorage({ get localStorage() { throw new Error("blocked"); } }), null);
});

test("NFR-04: fixed-step accumulator clamps an extreme frame gap to 0.25 seconds", () => {
  let updates = 0;
  const result = consumeFixedSteps(0, 5, () => { updates += 1; });
  assert.equal(result.steps, 15);
  assert.equal(updates, 15);
  assert.ok(result.accumulator < 1e-12);
});

test("RV-002: pagehide pauses PLAYING, clears input, and resets the frame clock", () => {
  const fixture = lifecycleFixture(STATES.PLAYING);
  fixture.game.elapsedSteps = 321;
  assert.equal(
    pauseForLifecycle(fixture.game, fixture.input, fixture.resetFrameClock, fixture.syncUi),
    true,
  );
  assert.equal(fixture.game.state, STATES.PAUSED);
  assert.equal(fixture.game.pausedFrom, STATES.PLAYING);
  assert.equal(fixture.game.elapsedSteps, 321);
  assert.deepEqual(fixture.counters(), {
    clearCount: 1,
    syncCount: 1,
    lastFrameTime: null,
    accumulator: 0,
  });
});

test("RV-002: pagehide pauses COUNTDOWN without changing its remaining steps", () => {
  const fixture = lifecycleFixture(STATES.COUNTDOWN);
  fixture.game.countdownStepsRemaining = 73;
  assert.equal(
    pauseForLifecycle(fixture.game, fixture.input, fixture.resetFrameClock, fixture.syncUi),
    true,
  );
  assert.equal(fixture.game.state, STATES.PAUSED);
  assert.equal(fixture.game.pausedFrom, STATES.COUNTDOWN);
  assert.equal(fixture.game.countdownStepsRemaining, 73);
});

test("RV-002: sequential visibilitychange/pagehide and duplicate PAUSED events are idempotent", () => {
  const fixture = lifecycleFixture(STATES.PLAYING);
  assert.equal(
    pauseForLifecycle(fixture.game, fixture.input, fixture.resetFrameClock, fixture.syncUi),
    true,
  );
  assert.equal(
    pauseForLifecycle(fixture.game, fixture.input, fixture.resetFrameClock, fixture.syncUi),
    false,
  );
  assert.equal(fixture.game.state, STATES.PAUSED);
  assert.equal(fixture.game.pausedFrom, STATES.PLAYING);
  assert.equal(fixture.counters().clearCount, 2);
  assert.equal(fixture.counters().syncCount, 1);
});

test("RV-002: pageshow keeps PAUSED until explicit resume and excludes downtime", () => {
  const fixture = lifecycleFixture(STATES.PLAYING);
  fixture.game.elapsedSteps = 480;
  pauseForLifecycle(fixture.game, fixture.input, fixture.resetFrameClock, fixture.syncUi);

  assert.equal(
    prepareLifecycleRestore(fixture.game, fixture.input, fixture.resetFrameClock, fixture.syncUi),
    STATES.PAUSED,
  );
  stepGame(fixture.game, { x: 1, y: 0 });
  assert.equal(fixture.game.elapsedSteps, 480);
  assert.equal(resumeGame(fixture.game), true);

  let updates = 0;
  const firstFrame = consumeFixedSteps(0, 0, () => {
    updates += 1;
    stepGame(fixture.game, { x: 1, y: 0 });
  });
  assert.equal(firstFrame.steps, 0);
  assert.equal(updates, 0);
  assert.equal(fixture.game.elapsedSteps, 480);

  consumeFixedSteps(firstFrame.accumulator, 1 / 60, () => {
    updates += 1;
    stepGame(fixture.game, { x: 1, y: 0 });
  });
  assert.equal(updates, 1);
  assert.equal(fixture.game.elapsedSteps, 481);
});

test("RV-002: lifecycle events do not pause TITLE, CLEARED, or GAME_OVER", () => {
  for (const state of [STATES.TITLE, STATES.CLEARED, STATES.GAME_OVER]) {
    const fixture = lifecycleFixture(state);
    assert.equal(
      pauseForLifecycle(fixture.game, fixture.input, fixture.resetFrameClock, fixture.syncUi),
      false,
    );
    assert.equal(fixture.game.state, state);
    assert.equal(fixture.game.pausedFrom, null);
    assert.equal(fixture.counters().clearCount, 1);
    assert.equal(fixture.counters().syncCount, 0);
  }
});

test("NFR-01/08: implementation contains no remote asset or network URL", async () => {
  const files = [
    "index.html",
    "styles.css",
    "src/core.js",
    "src/input.js",
    "src/renderer.js",
    "src/main.js",
  ];
  for (const file of files) {
    const content = await readFile(join(root, file), "utf8");
    assert.doesNotMatch(content, /https?:\/\//, file);
    assert.doesNotMatch(content, /\bfetch\s*\(/, file);
    assert.doesNotMatch(content, /XMLHttpRequest|WebSocket/, file);
  }
});
