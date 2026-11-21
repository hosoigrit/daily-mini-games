import test from "node:test";
import assert from "node:assert/strict";
import { BASE_CONFIG } from "../src/config.mjs";
import { createSession, getObservation, processBoundary, replayBatches } from "../src/session.mjs";
import { validateSnapshot } from "../src/state-validator.mjs";

function makeReady(seedId = "0001") {
  const created = createSession({ seedId, config: BASE_CONFIG });
  assert.equal(created.ok, true);
  return created.session;
}

function start(session, extra = []) {
  return processBoundary(session, [{ type: "START", commandSequence: 1 }, ...extra]);
}

test("ST-013: START initializes only and discards same-batch switch", () => {
  const result = start(makeReady(), [{ type: "SWITCH_NS", targetTick: 1, commandSequence: 2 }]);
  assert.equal(result.session.status, "RUNNING");
  assert.equal(result.session.snapshot.elapsedTick, 0);
  assert.equal(result.session.snapshot.switchCount, 0);
  assert.equal(result.commandOutcomes[1].reason, "DISCARDED_BY_START");
});

test("ST-010/011: PAUSE wins over switch and RESUME and preserves snapshot", () => {
  const running = start(makeReady()).session;
  const original = structuredClone(running.snapshot);
  const result = processBoundary(running, [
    { type: "RESUME", commandSequence: 2 },
    { type: "SWITCH_NS", targetTick: 1, commandSequence: 3 },
    { type: "PAUSE", commandSequence: 4 },
  ]);
  assert.equal(result.session.status, "PAUSED");
  assert.deepEqual(result.session.snapshot, original);
  assert.deepEqual(result.commandOutcomes.map(({ reason }) => reason), ["DISCARDED_BY_PAUSE", "DISCARDED_BY_PAUSE", null]);
});

function assertRejectedBoundary(prior, result, code, commands) {
  assert.equal(result.ok, false);
  assert.equal(result.code, code);
  const { boundaryId, replayLog, ...gameState } = result.session;
  const { boundaryId: priorId, replayLog: priorLog, ...priorState } = prior;
  assert.deepEqual(gameState, priorState);
  assert.equal(boundaryId, priorId + 1);
  assert.deepEqual(replayLog.slice(0, -1), priorLog);
  assert.deepEqual(replayLog.at(-1), {
    boundaryId, beforeTick: prior.snapshot.elapsedTick, commands,
    commandOutcomes: commands.map(({ type, commandSequence }) => ({
      type, commandSequence, accepted: false, reason: "NOT_RUNNING",
    })),
    events: [],
  });
  assert.deepEqual(result.commandOutcomes, replayLog.at(-1).commandOutcomes);
  assert.deepEqual(result.events, []);
}

test("OR-019: PAUSED tick request is NOT_RUNNING and snapshot is unchanged", () => {
  const running = start(makeReady()).session;
  const paused = processBoundary(running, [{ type: "PAUSE", commandSequence: 2 }]).session;
  const original = structuredClone(paused);
  const result = processBoundary(paused, []);
  assertRejectedBoundary(original, result, "NOT_RUNNING", []);
  assert.deepEqual(paused, original);
});

test("E3-UT-19/20 PAUSED rejection consumes its sequence and replays the same audit", () => {
  const commands = [{ type: "SWITCH_NS", targetTick: 1, commandSequence: 3 }];
  const startBatch = [{ type: "START", commandSequence: 1 }];
  const pauseBatch = [{ type: "PAUSE", commandSequence: 2 }];
  const ready = makeReady("2001");
  const paused = processBoundary(processBoundary(ready, startBatch).session, pauseBatch).session;
  const refused = processBoundary(paused, commands);
  assertRejectedBoundary(paused, refused, "NOT_RUNNING", commands);
  for (const commandSequence of [3, 2]) {
    const rejected = processBoundary(refused.session, [{ type: "RESUME", commandSequence }]);
    assert.equal(rejected.code, "INVALID_COMMAND_BATCH");
    assert.deepEqual(rejected.session.snapshot, paused.snapshot);
    assert.equal(rejected.session.status, "PAUSED");
    const resumed = processBoundary(rejected.session, [{ type: "RESUME", commandSequence: 4 }]);
    assert.equal(resumed.session.status, "RUNNING");
    assert.deepEqual(resumed.session.snapshot, paused.snapshot);
  }
  const replay = replayBatches({ seedId: ready.seedId, versions: BASE_CONFIG, batches: [startBatch, pauseBatch, commands] });
  assert.equal(replay.code, refused.code);
  assert.deepEqual(replay.session, refused.session);
  assert.deepEqual(replay.trace.at(-1).outcomes, refused.commandOutcomes);
});

test("E3-UT-19 READY and ERROR refusals change only audit metadata", () => {
  const ready = makeReady("2001");
  const commands = [{ type: "SWITCH_NS", targetTick: 1, commandSequence: 3 }];
  assertRejectedBoundary(ready, processBoundary(ready, commands), "NOT_ALLOWED", commands);
  const running = start(ready).session;
  const invalid = { ...running, snapshot: { ...running.snapshot, spawnCursor: 1000 } };
  const fault = processBoundary(invalid).session;
  assert.equal(fault.status, "ERROR");
  assertRejectedBoundary(fault, processBoundary(fault, commands), "NOT_ALLOWED", commands);
});

test("ST-012: RESUME accepts alone and discards same-batch switch", () => {
  let session = start(makeReady()).session;
  session = processBoundary(session, [{ type: "PAUSE", commandSequence: 2 }]).session;
  const result = processBoundary(session, [
    { type: "RESUME", commandSequence: 3 },
    { type: "SWITCH_NS", targetTick: 1, commandSequence: 4 },
  ]);
  assert.equal(result.session.status, "RUNNING");
  assert.equal(result.session.snapshot.elapsedTick, 0);
  assert.equal(result.commandOutcomes[1].reason, "DISCARDED_BY_RESUME");
});

test("E1-M04: PAUSE remains dominant when PAUSED batch also contains RESUME", () => {
  let session = start(makeReady()).session;
  session = processBoundary(session, [{ type: "PAUSE", commandSequence: 2 }]).session;
  const beforeSnapshot = structuredClone(session.snapshot);
  const beforeBoundaryId = session.boundaryId;
  const result = processBoundary(session, [
    { type: "PAUSE", commandSequence: 3 },
    { type: "RESUME", commandSequence: 4 },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.session.status, "PAUSED");
  assert.deepEqual(result.session.snapshot, beforeSnapshot);
  assert.equal(result.session.boundaryId, beforeBoundaryId + 1);
  assert.deepEqual(result.commandOutcomes.map(({ accepted, reason }) => [accepted, reason]), [
    [true, null],
    [false, "DISCARDED_BY_PAUSE"],
  ]);
});

test("E1-M04: PAUSED PAUSE-plus-RESUME replay is deterministic", () => {
  const versions = {
    ruleVersion: BASE_CONFIG.ruleVersion,
    generatorVersion: BASE_CONFIG.generatorVersion,
    engineVersion: BASE_CONFIG.engineVersion,
    eventSchemaVersion: BASE_CONFIG.eventSchemaVersion,
  };
  const batches = [
    [{ type: "START", commandSequence: 1 }],
    [{ type: "PAUSE", commandSequence: 2 }],
    [
      { type: "PAUSE", commandSequence: 3 },
      { type: "RESUME", commandSequence: 4 },
    ],
  ];
  const first = replayBatches({ config: BASE_CONFIG, seedId: "0001", batches, versions });
  const second = replayBatches({ config: BASE_CONFIG, seedId: "0001", batches, versions });
  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
  assert.equal(first.session.status, "PAUSED");
  assert.deepEqual(first.trace.at(-1).outcomes.map(({ accepted, reason }) => [accepted, reason]), [
    [true, null],
    [false, "DISCARDED_BY_PAUSE"],
  ]);
});

test("OR-017: BASE seed0001 no-operation golden final state", () => {
  let session = start(makeReady("0001")).session;
  while (session.status === "RUNNING") {
    const result = processBoundary(session, []);
    assert.equal(result.ok, true);
    session = result.session;
  }
  assert.equal(session.status, "FINISHED");
  assert.equal(session.result, "GRIDLOCK");
  assert.equal(session.failureDirection, "NORTH");
  assert.deepEqual({
    elapsedTick: session.snapshot.elapsedTick,
    arrivalAttempts: session.snapshot.arrivalAttempts,
    spawnCursor: session.snapshot.spawnCursor,
    passedVehicles: session.snapshot.passedVehicles,
    overflowVehicles: session.snapshot.overflowVehicles,
    queues: session.snapshot.queues,
    switchCount: session.snapshot.switchCount,
    maxQueueLength: session.snapshot.maxQueueLength,
    score: session.snapshot.passedVehicles * BASE_CONFIG.scorePerVehicle,
  }, {
    elapsedTick: 350,
    arrivalAttempts: 30,
    spawnCursor: 30,
    passedVehicles: 13,
    overflowVehicles: 1,
    queues: { north: 8, south: 8, east: 0, west: 0 },
    switchCount: 0,
    maxQueueLength: 8,
    score: 130,
  });
});

test("all confirmed ticks satisfy snapshot invariants", () => {
  let session = start(makeReady("0001")).session;
  while (session.status === "RUNNING") {
    const result = processBoundary(session, []);
    assert.equal(result.ok, true);
    session = result.session;
    assert.equal(validateSnapshot(session.snapshot, session.schedule, session.config, result.terminal).valid, true);
  }
});

test("OR-018/INV-12: same versions, seed and batches replay identically", () => {
  const versions = {
    ruleVersion: BASE_CONFIG.ruleVersion,
    generatorVersion: BASE_CONFIG.generatorVersion,
    engineVersion: BASE_CONFIG.engineVersion,
    eventSchemaVersion: BASE_CONFIG.eventSchemaVersion,
  };
  const batches = [[{ type: "START", commandSequence: 1 }]];
  for (let tick = 1; tick <= 140; tick += 1) {
    batches.push(tick === 50 ? [{ type: "SWITCH_NS", targetTick: tick, commandSequence: tick + 1 }] : []);
  }
  const first = replayBatches({ config: BASE_CONFIG, seedId: "0023", batches, versions });
  const second = replayBatches({ config: BASE_CONFIG, seedId: "0023", batches, versions });
  assert.deepEqual(first, second);
});

test("ERR-T09: replay version mismatch is rejected", () => {
  const result = replayBatches({ config: BASE_CONFIG, seedId: "0001", batches: [], versions: { ruleVersion: "wrong" } });
  assert.deepEqual(result, { ok: false, code: "VERSION_MISMATCH" });
});

test("E1-M01: reversed or duplicate commandSequence rejects the whole engine batch", async () => {
  const { advanceTick } = await import("../src/game-engine.mjs");
  for (const commands of [
    [
      { type: "SWITCH_NS", targetTick: 1, commandSequence: 2 },
      { type: "SWITCH_EW", targetTick: 1, commandSequence: 1 },
    ],
    [
      { type: "SWITCH_NS", targetTick: 1, commandSequence: 1 },
      { type: "SWITCH_EW", targetTick: 1, commandSequence: 1 },
    ],
  ]) {
    const snapshot = makeReady().snapshot;
    const result = advanceTick({ snapshot, targetTick: 1, commands, config: BASE_CONFIG, schedule: [] });
    assert.equal(result.ok, false);
    assert.equal(result.code, "INVALID_COMMAND_BATCH");
    assert.equal("snapshot" in result, false);
    assert.equal(snapshot.elapsedTick, 0);
  }
});

test("E1-M01/M03: missing commandSequence and non-array commands are rejected atomically", async () => {
  const { advanceTick } = await import("../src/game-engine.mjs");
  const snapshot = makeReady().snapshot;
  for (const commands of [
    [{ type: "SWITCH_NS", targetTick: 1 }],
    { type: "SWITCH_NS", targetTick: 1, commandSequence: 1 },
  ]) {
    const result = advanceTick({ snapshot, targetTick: 1, commands, config: BASE_CONFIG, schedule: [] });
    assert.equal(result.ok, false);
    assert.equal(result.code, "INVALID_COMMAND_BATCH");
    assert.equal("snapshot" in result, false);
    assert.equal(snapshot.elapsedTick, 0);
  }
});

test("E1-M01/M03: Session logs invalid batch without advancing and enforces cross-boundary sequence", () => {
  let session = start(makeReady()).session;
  const before = structuredClone(session.snapshot);
  const invalid = processBoundary(session, [
    { type: "SWITCH_NS", targetTick: 1, commandSequence: 3 },
    { type: "SWITCH_EW", targetTick: 1, commandSequence: 2 },
  ]);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "INVALID_COMMAND_BATCH");
  assert.deepEqual(invalid.session.snapshot, before);
  assert.equal(invalid.session.boundaryId, session.boundaryId + 1);
  assert.deepEqual(invalid.session.replayLog.at(-1).commandOutcomes.map(({ reason }) => reason), ["INVALID_COMMAND_BATCH", "INVALID_COMMAND_BATCH"]);

  session = invalid.session;
  const valid = processBoundary(session, [{ type: "SWITCH_NS", targetTick: 1, commandSequence: 2 }]);
  assert.equal(valid.ok, true);
  const reused = processBoundary(valid.session, [{ type: "SWITCH_EW", targetTick: 2, commandSequence: 2 }]);
  assert.equal(reused.ok, false);
  assert.equal(reused.code, "INVALID_COMMAND_BATCH");
  assert.ok(reused.violations.includes("DUPLICATE_COMMAND_SEQUENCE"));
});

test("E1-M03: replay rejects invalid batch order and retains the failure trace", () => {
  const versions = {
    ruleVersion: BASE_CONFIG.ruleVersion,
    generatorVersion: BASE_CONFIG.generatorVersion,
    engineVersion: BASE_CONFIG.engineVersion,
    eventSchemaVersion: BASE_CONFIG.eventSchemaVersion,
  };
  const result = replayBatches({
    config: BASE_CONFIG,
    seedId: "0001",
    versions,
    batches: [
      [{ type: "START", commandSequence: 1 }],
      [
        { type: "SWITCH_NS", targetTick: 1, commandSequence: 3 },
        { type: "SWITCH_EW", targetTick: 1, commandSequence: 2 },
      ],
    ],
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "INVALID_COMMAND_BATCH");
  assert.equal(result.trace.length, 2);
  assert.equal(result.trace.at(-1).ok, false);
  assert.equal(result.session.snapshot.elapsedTick, 0);
});

test("OR-020/ST-014: FINISHED rejects normal operation without changing state", () => {
  let session = start(makeReady()).session;
  while (session.status === "RUNNING") session = processBoundary(session, []).session;
  const original = structuredClone(session);
  const commands = [{ type: "SWITCH_NS", targetTick: 351, commandSequence: 999 }];
  assertRejectedBoundary(original, processBoundary(session, commands), "NOT_ALLOWED", commands);
  assert.deepEqual(session, original);
});

test("RETRY creates a fresh READY session and distinct sessionId", () => {
  let session = start(makeReady()).session;
  while (session.status === "RUNNING") session = processBoundary(session, []).session;
  const result = processBoundary(session, [{ type: "RETRY", commandSequence: 999 }]);
  assert.equal(result.session.status, "READY");
  assert.equal(result.session.snapshot.elapsedTick, 0);
  assert.notEqual(result.session.sessionId, session.sessionId);
});

test("getObservation exposes public state/config but not seed or schedule", () => {
  const result = getObservation(makeReady("0123"));
  assert.equal(result.ok, true);
  assert.equal("seedId" in result.observation, false);
  assert.equal("schedule" in result.observation, false);
  assert.equal(result.observation.publicConfig.ruleVersion, BASE_CONFIG.ruleVersion);
});

test("createSession keeps Config and Schedule immutable", () => {
  const session = makeReady();
  assert.equal(Object.isFrozen(session.config), true);
  assert.equal(Object.isFrozen(session.config.phases), true);
  assert.equal(Object.isFrozen(session.schedule), true);
  assert.equal(Object.isFrozen(session.schedule[0]), true);
});
