import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createPlan } from "../simulation/run-experiment.mjs";
import { runSimulation } from "../simulation/run-simulation.mjs";
import {
  EXECUTION_SCOPE, FROZEN_HASH, HOLDOUT_PLAN, assertNoRecordedHoldout, claimOutput,
  evaluateRows, validateApproval, verifyFreeze, verifyNonHoldoutParity,
} from "../holdout/run-holdout.mjs";

const script = fileURLToPath(new URL("../holdout/run-holdout.mjs", import.meta.url));
const game = fileURLToPath(new URL("../", import.meta.url));
const sha = createHash("sha256").update(readFileSync(script)).digest("hex");
const validationPlan = "simulation/results/e2b-20261121-v1/validation/plan.json";

function stageHistoricalFreeze(t) {
  const temp = realpathSync(tmpdir());
  const dir = mkdtempSync(join(temp, "tp6-isolated-preflight-"));
  t.after(() => {
    const exact = realpathSync(dir);
    assert.equal(dirname(exact), temp);
    assert.match(basename(exact), /^tp6-isolated-preflight-/);
    rmSync(exact, { recursive: true });
  });
  const { sourceHashes } = JSON.parse(readFileSync(join(game, validationPlan), "utf8"));
  for (const path of [...Object.keys(sourceHashes), "holdout/run-holdout.mjs", validationPlan]) {
    const source = path === "src/session.mjs" ? "tests/fixtures/e2c/session.mjs" : path;
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(game, source), target);
  }
  return dir;
}

test("E2-C plan fixes HARD-A, the 200 holdout IDs, five BOTs and 1,000 expected rows", () => {
  assert.deepEqual(HOLDOUT_PLAN.configIds, ["HARD-A"]);
  assert.deepEqual(HOLDOUT_PLAN.botIds, ["BOT-01", "BOT-02", "BOT-03", "BOT-04", "BOT-05"]);
  assert.equal(HOLDOUT_PLAN.primaryComparator, "BOT-03");
  assert.equal(HOLDOUT_PLAN.descriptiveComparator, "BOT-04");
  assert.deepEqual(HOLDOUT_PLAN.seeds.map(Number), Array.from({ length: 200 }, (_, n) => n + 801));
  assert.equal(HOLDOUT_PLAN.seeds.length * HOLDOUT_PLAN.botIds.length, HOLDOUT_PLAN.expectedRows);
  assert.equal(HOLDOUT_PLAN.expectedRows, 1000);
  assert.throws(() => HOLDOUT_PLAN.configIds.push("BASE"), TypeError);
});

test("E2-C rechecks all 15 frozen files, versions, and HARD-A schedule", (t) => {
  const freeze = verifyFreeze(stageHistoricalFreeze(t));
  assert.equal(freeze.frozenHash, FROZEN_HASH);
  assert.equal(Object.keys(freeze.sourceHashes).length, 15);
  const config = freeze.versions.configs["HARD-A"];
  assert.equal(config.balanceConfigId, "HARD-A");
  assert.deepEqual(config.phases.map(({ count }) => count), [15, 19, 28]);
  assert.deepEqual(config.phases.at(-1), {
    id: "LATE", firstTick: 407, interval: 7, count: 28, weights: { N: 3500, S: 3500, E: 1500, W: 1500 },
  });
  assert.deepEqual([config.endTick, config.yellowTicks, config.allRedTicks, config.passInterval, config.maxQueuePerDirection],
    [600, 10, 5, 12, 8]);
});

test("E2-C the legacy CLI and Runner keep their holdout rejection", () => {
  assert.throws(() => createPlan("holdout"), /INVALID_E2B_STAGE/);
  for (const seedId of ["0801", "0900", "1000"]) {
    assert.deepEqual(runSimulation({ seedId }), { seedId, result: "BLOCKED", code: "HOLDOUT_NOT_AUTHORIZED" });
  }
});

test("E2-C CLI rejects an unapproved invocation and refuses plan overrides", () => {
  for (const args of [[], ["--execute"], ["--execute", "approval.json", "BASE"], ["--check", "0801"]]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /HOLDOUT_NOT_AUTHORIZED/);
  }
  const missing = join(tmpdir(), "e2c-absent-" + randomUUID() + ".json");
  const result = spawnSync(process.execPath, [script, "--execute", missing], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ENOENT/);
});

test("E2-C CLI rejects a real file with unauthorized approval data before touching results", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "tp6-approval-test-"));
  const record = join(dir, "record.json");
  t.after(() => { unlinkSync(record); rmdirSync(dir); });
  writeFileSync(record, JSON.stringify({ scope: "preparation only" }), { flag: "wx" });
  const result = spawnSync(process.execPath, [script, "--execute", record], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /HOLDOUT_NOT_AUTHORIZED/);
});

test("E2-C approval attestation requires the exact scope, target digests and a reference", () => {
  const record = {
    experimentId: HOLDOUT_PLAN.experimentId, frozenHash: FROZEN_HASH,
    adapterSha256: sha, scope: EXECUTION_SCOPE, approvalReference: "synthetic unit-test reference",
  };
  assert.doesNotThrow(() => validateApproval(record, sha));
  for (const patch of [
    { experimentId: "different" }, { frozenHash: "different" }, { adapterSha256: "different" },
    { scope: "prepare only" }, { approvalReference: " " },
  ]) assert.throws(() => validateApproval({ ...record, ...patch }, sha), /HOLDOUT_NOT_AUTHORIZED/);
});

test("E2-C an output reservation blocks a second attempt before any rows exist", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "tp6-claim-test-"));
  const expected = join(dir, "e2c-holdout-v1");
  t.after(() => { rmdirSync(expected); rmdirSync(dir); });
  assert.doesNotThrow(() => assertNoRecordedHoldout(dir));
  assert.equal(claimOutput(dir), expected);
  assert.throws(() => assertNoRecordedHoldout(dir), /HOLDOUT_OUTPUT_ALREADY_EXISTS/);
  assert.throws(() => claimOutput(dir), { code: "EEXIST" });
});

test("E2-C renamed results directory still exposes recorded holdout rows", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "tp6-history-test-"));
  const renamed = join(dir, "old");
  const records = join(renamed, "sessions.jsonl");
  mkdirSync(renamed);
  t.after(() => { unlinkSync(records); rmdirSync(renamed); rmdirSync(dir); });
  writeFileSync(records, '{"seedId":"0801","result":"CLEAR"}\n', { flag: "wx" });
  assert.throws(() => assertNoRecordedHoldout(dir), /HOLDOUT_RECORD_ALREADY_EXISTS/);
});

test("E2-C isolated CLI preflight identifies frozen baseline and blocks recorded history", (t) => {
  // No test directory is copied. Even a broken history gate cannot get past the suite gate.
  const dir = stageHistoricalFreeze(t);
  const results = join(dir, "simulation/results");
  const isolatedScript = join(dir, "holdout/run-holdout.mjs");
  const check = spawnSync(process.execPath, [isolatedScript, "--check"], { encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr);
  assert.equal(JSON.parse(check.stdout).frozenHash, FROZEN_HASH);
  assert.equal(existsSync(join(results, "e2c-holdout-v1")), false);

  const approval = join(dir, "lab-fixture.json");
  writeFileSync(approval, JSON.stringify({
    experimentId: HOLDOUT_PLAN.experimentId, frozenHash: FROZEN_HASH, adapterSha256: sha,
    scope: EXECUTION_SCOPE, approvalReference: "synthetic isolated fixture",
  }), { flag: "wx" });
  mkdirSync(join(results, "renamed"));
  writeFileSync(join(results, "renamed/sessions.jsonl"), '{"seedId":"0801","result":"CLEAR"}\n', { flag: "wx" });
  const refused = spawnSync(process.execPath, [isolatedScript, "--execute", approval], { encoding: "utf8" });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /HOLDOUT_RECORD_ALREADY_EXISTS/);
  assert.equal(existsSync(join(results, "e2c-holdout-v1")), false);
});

test("E2-C adapter sessions and traces match E2-B for all BOTs on two non-holdout seeds", () => {
  assert.deepEqual(verifyNonHoldoutParity(), { seedIds: ["0001", "0501"], matched: 10, verified: 10 });
});

function syntheticRows({ win5 = 120, start3 = 0, win3 = 110, early = 10 } = {}) {
  // Seed IDs label manufactured data only; no game session is created for these rows.
  return HOLDOUT_PLAN.botIds.flatMap((botId) => HOLDOUT_PLAN.seeds.map((seedId, i) => {
    const clear = botId === "BOT-05" ? i < win5
      : botId === "BOT-03" ? i >= start3 && i < start3 + win3 : botId !== "BOT-01";
    return {
      experimentId: HOLDOUT_PLAN.experimentId, balanceConfigId: "HARD-A", botId, seedId, diagnostics: [],
      result: clear ? "CLEAR" : "GRIDLOCK", endTick: clear ? 600 : botId === "BOT-05" && i < win5 + early ? 199 : 200,
      score: clear ? 160 : 130, switchCount: 0, maxQueueLength: 8, failureDirection: clear ? null : "NORTH",
    };
  }));
}

test("E2-C exact KPI boundaries pass with a positive interval against fixed BOT-03", () => {
  const decision = evaluateRows(syntheticRows());
  assert.equal(decision.status, "PASS");
  assert.equal(decision.clearsFivePointConfidenceThreshold, false);
  const five = decision.cells.find(({ botId }) => botId === "BOT-05");
  assert.deepEqual([five.clearRate, five.earlyCount, five.earlyRate], [0.60, 10, 0.05]);
  assert.deepEqual(decision.comparisons.map(({ comparator, paired }) => [comparator, paired]), [["BOT-03", 200], ["BOT-04", 200]]);
  assert.equal(decision.comparisons[0].clearDifference, 0.05);
  assert.ok(decision.comparisons[1].clearDifference < 0);
});

test("E2-C point targets with a zero-crossing interval are inconclusive", () => {
  const result = evaluateRows(syntheticRows({ start3: 90 }));
  assert.equal(result.status, "INCONCLUSIVE");
  assert.ok(result.comparisons[0].clearDifference95[0] < 0);
  assert.ok(result.comparisons[0].clearDifference95[1] > 0);
});

test("E2-C each missed point target fails and tick 200 is not early", () => {
  for (const options of [{ win5: 119, win3: 100 }, { win3: 111 }, { early: 11 }]) {
    assert.equal(evaluateRows(syntheticRows(options)).reason, "POINT_TARGET_NOT_MET");
  }
});

test("E2-C missing, duplicate, wrong Config, technical rows and interruptions block adoption", () => {
  const rows = syntheticRows();
  assert.equal(evaluateRows(rows.slice(1)).status, "BLOCKED");
  assert.equal(evaluateRows([rows[0], ...rows]).reason, "INVALID_DATA");
  assert.equal(evaluateRows([{ ...rows[0], balanceConfigId: "BASE" }, ...rows.slice(1)]).reason, "INVALID_DATA");
  assert.equal(evaluateRows([{ ...rows[0], result: "ERROR", score: null }, ...rows.slice(1)]).status, "BLOCKED");
  assert.equal(evaluateRows(rows, { code: "INTERRUPTED" }).status, "BLOCKED");
  assert.equal(evaluateRows(rows.slice(1), { invariant: true }).reason, "ENGINE_INVARIANT");
});
