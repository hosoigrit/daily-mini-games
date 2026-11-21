import assert from "node:assert/strict";
import test from "node:test";
import { BASE_CONFIG } from "../src/config.mjs";
import { advanceTick } from "../src/game-engine.mjs";
import { createSession, processBoundary } from "../src/session.mjs";
import { validateSnapshot } from "../src/state-validator.mjs";

for (const [phase, switchTick] of [["EW_YELLOW", 590], ["ALL_RED_TO_NS", 585]]) {
  test(`tick600 CLEAR skips a due ${phase} transition`, () => {
    const { session: ready } = createSession({ seedId: "0001", schedule: [] });
    const { session: running } = processBoundary(ready, [{ type: "START", commandSequence: 1 }]);
    let snapshot = running.snapshot;
    for (let tick = 1; tick < 600; tick += 1) {
      const commands = tick === switchTick
        ? [{ type: "SWITCH_NS", targetTick: tick, commandSequence: 2 }]
        : [];
      const next = advanceTick({ snapshot, targetTick: tick, schedule: [], commands });
      assert.equal(next.ok, true, JSON.stringify(next));
      snapshot = next.snapshot;
    }
    assert.equal(snapshot.signal.phase, phase);
    assert.equal(snapshot.signal.nextTransitionTick, 600);
    const result = processBoundary({ ...running, snapshot }, [
      { type: "SWITCH_EW", targetTick: 600, commandSequence: 3 },
    ]);
    assert.equal(result.ok, true, JSON.stringify(result.session.fault));
    assert.equal(result.session.status, "FINISHED");
    assert.equal(result.session.result, "CLEAR");
    assert.deepEqual(result.session.snapshot, { ...snapshot, elapsedTick: 600 });
    assert.deepEqual(result.events, []);
    assert.equal(result.commandOutcomes[0].reason, "TIME_UP_NOT_EXECUTED");
    assert.equal(validateSnapshot(result.session.snapshot, []).valid, false);
    const overdue = {
      ...result.session.snapshot,
      signal: {
        ...snapshot.signal,
        phaseStartTick: snapshot.signal.phaseStartTick - 1,
        nextTransitionTick: 599,
      },
    };
    assert.ok(validateSnapshot(overdue, [], BASE_CONFIG, result.terminal)
      .violations.includes("INVALID_NEXT_TRANSITION_TICK"));
  });
}
