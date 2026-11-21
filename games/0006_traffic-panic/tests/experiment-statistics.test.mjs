import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { comparePaired, summarizeExperiment, summarizeExperimentCell } from "../simulation/aggregate.mjs";
import { createPlan, rowFromResult } from "../simulation/run-experiment.mjs";
import { bootstrapRandom, wilson95 } from "../simulation/statistics.mjs";

const seeds = (count) => Array.from({ length: count }, (_, i) => String(i + 1).padStart(4, "0"));
function row(seedId, result = "CLEAR", extra = {}) {
  const isClear = result === "CLEAR";
  const isGridlock = result === "GRIDLOCK";
  return {
    seedId, result, score: isClear || isGridlock ? 10 : null, diagnostics: [],
    endTick: isClear ? 600 : isGridlock ? 200 : null, failureDirection: isGridlock ? "NORTH" : null,
    switchCount: 0, maxQueueLength: isGridlock ? 8 : 0, ...extra,
  };
}

test("AG-01/02 count, primary rate, even mean and median", () => {
  const ids = seeds(4);
  const summary = summarizeExperimentCell(ids, ids.map((id, i) =>
    row(id, i < 2 ? "CLEAR" : "GRIDLOCK", { score: (i + 1) * 10 })));
  assert.deepEqual(summary.counts, { CLEAR: 2, GRIDLOCK: 2, ERROR: 0, BLOCKED: 0, NOT_RUN: 0 });
  assert.equal(summary.eligible, true);
  assert.equal(summary.clearRate, 0.5);
  assert.equal(summary.scoreMean, 25);
  assert.equal(summary.scoreMedian, 25);
  assert.equal(summary.survivalMedianMs, 40000);
  assert.equal(summary.maxQueue, 8);
  assert.equal(summary.failureDirections.NORTH, 2);
});

test("AG-03/17 odd median and fractional mean retain original precision", () => {
  const ids = seeds(3);
  const summary = summarizeExperimentCell(ids, ids.map((id, i) => row(id, "CLEAR", { score: [10, 20, 40][i] })));
  assert.equal(summary.scoreMean, 70 / 3);
  assert.equal(summary.scoreMedian, 20);
});

test("AG-04 199 is early, 200 is not", () => {
  const ids = seeds(2);
  const summary = summarizeExperimentCell(ids, [row(ids[0], "GRIDLOCK", { endTick: 199 }), row(ids[1], "GRIDLOCK")]);
  assert.equal(summary.earlyCount, 1);
  assert.equal(summary.earlyRate, 0.5);
});

test("AG-05/07/08 missing, ERROR and BLOCKED keep planned denominator and exclude missing scores", () => {
  const summary = summarizeExperimentCell(seeds(4), [
    row("0001"), row("0002", "ERROR"), row("0003", "BLOCKED"),
  ]);
  assert.deepEqual(summary.counts, { CLEAR: 1, GRIDLOCK: 0, ERROR: 1, BLOCKED: 1, NOT_RUN: 1 });
  assert.deepEqual(summary.missingSeeds, ["0004"]);
  assert.equal(summary.eligible, false);
  assert.equal(summary.clearRate, 0.25);
  assert.equal(summary.completedClearRate, 1);
  assert.equal(summary.clearWilson95, null);
  assert.equal(summary.scoreMean, 10);
  assert.equal(summarizeExperimentCell([], []).scoreMean, null);
});

test("AG-06 duplicate or unknown seeds are rejected", () => {
  assert.throws(() => summarizeExperimentCell(seeds(1), [row("0001"), row("0001")]), /UNKNOWN_OR_DUPLICATE/);
  assert.throws(() => summarizeExperimentCell(seeds(1), [row("0002")]), /UNKNOWN_OR_DUPLICATE/);
  assert.throws(() => summarizeExperimentCell(["0001", "0001"], []), /DUPLICATE_EXPECTED/);
});

test("AG-09/18 diagnostic events, sessions, codes and qualified completions have distinct counts", () => {
  const diagnostic = { code: "BOT_EXCEPTION", tick: 1 };
  const summary = summarizeExperimentCell(seeds(4), [
    row("0001", "CLEAR", { diagnostics: [diagnostic, { ...diagnostic, tick: 2 }] }),
    row("0002", "GRIDLOCK", { diagnostics: [{ code: "INVALID_BOT_DECISION", tick: 1 }] }),
    row("0003"),
    row("0004", "ERROR", { diagnostics: [diagnostic] }),
  ]);
  assert.deepEqual(summary.diagnostics, {
    submitted: 4, eventCount: 4, sessionCount: 3, codes: { BOT_EXCEPTION: 3, INVALID_BOT_DECISION: 1 },
    cleanCompletions: { CLEAR: 1, GRIDLOCK: 0 }, diagnosedCompletions: { CLEAR: 1, GRIDLOCK: 1 },
  });
  assert.equal(summary.counts.CLEAR, 2);
});

test("AG-10/11 signed same-seed comparison and missing pair", () => {
  const ids = seeds(3);
  const a = [row("0001", "CLEAR", { score: 20 }), row("0002", "GRIDLOCK")];
  const b = [row("0001", "GRIDLOCK"), row("0002", "CLEAR", { score: 40 }), row("0003")];
  assert.deepEqual(comparePaired(ids, a, b), {
    paired: 2, missingSeeds: ["0003"], eligible: false, clearDifference: 0, scoreDifference: -10, clearDifference95: [-1, 1],
  });
  assert.equal(comparePaired(ids, a.slice(0, 1), b).clearDifference, 1);
});

test("AG-12 Wilson expected limits for 0%, 50% and 100%", () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10);
  const none = wilson95(0, 4), mid = wilson95(2, 4), all = wilson95(4, 4);
  assert.equal(none[0], 0);
  near(none[1], 0.4898908364545973);
  near(mid[0], 0.15003898915214947);
  near(mid[1], 0.8499610108478506);
  near(all[0], 0.5101091635454027);
  assert.equal(all[1], 1);
  assert.equal(wilson95(0, 0), null);
  assert.throws(() => wilson95(5, 4), /INVALID_BINOMIAL/);
});

test("AG-13 fixed statistics RNG oracle and bootstrap repeatability", () => {
  const next = bootstrapRandom();
  assert.deepEqual([next(), next(), next()], [1015568748, 1586005467, 2165703038]);
  const ids = seeds(4);
  const a = ids.map((seed, i) => row(seed, i < 2 ? "CLEAR" : "GRIDLOCK"));
  const b = ids.map((seed) => row(seed, "GRIDLOCK"));
  const pair = comparePaired(ids, a, b);
  assert.equal(pair.clearDifference, 0.5);
  assert.deepEqual(pair.clearDifference95, [0, 1]);
  assert.deepEqual(comparePaired(ids, a, b), pair);
});

test("AG-14/15 separate Configs, preserve tied comparators and normalize row/seed order", () => {
  const botIds = ["BOT-02", "BOT-03", "BOT-04", "BOT-05"];
  const plan = { experimentId: "TEST", configIds: ["A", "B"], botIds, seeds: seeds(2) };
  const rows = plan.configIds.flatMap((balanceConfigId) => botIds.flatMap((botId) => plan.seeds.map((seed) => ({
    ...row(seed, (botId === "BOT-05") === (balanceConfigId === "A") ? "CLEAR" : "GRIDLOCK"),
    experimentId: "TEST", balanceConfigId, botId,
  }))));
  const summary = summarizeExperiment(plan, rows);
  assert.deepEqual(summarizeExperiment({ ...plan, seeds: [...plan.seeds].reverse() }, [...rows].reverse()), summary);
  assert.equal(summary.eligible, true);
  assert.equal(summary.cells.length, 8);
  assert.deepEqual(summary.comparisons.map(({ clearDifference }) => clearDifference), [1, 1, 1, -1, -1, -1]);
  assert.equal(summary.comparisons.filter(({ bestFixed }) => bestFixed).length, 4);
  assert.throws(() => summarizeExperiment(plan, [...rows, rows[0]]), /UNKNOWN_OR_DUPLICATE/);
  assert.throws(() => summarizeExperiment(plan, [{ ...rows[0], experimentId: "OTHER" }]), /WRONG_EXPERIMENT_ID/);
  assert.throws(() => summarizeExperiment(plan, [{ ...rows[0], balanceConfigId: "OTHER" }]), /UNKNOWN_CONFIG_OR_BOT/);
});

test("AG-16 malformed outcome, metric, tick and diagnostics cannot silently enter statistics", () => {
  for (const patch of [
    { result: "UNKNOWN" }, { score: NaN }, { endTick: -1 }, { endTick: 599 }, { maxQueueLength: 9 },
    { diagnostics: [{ code: "", tick: 1 }] }, { switchCount: -1 }, { result: "ERROR", score: 0 },
  ]) assert.throws(() => summarizeExperimentCell(seeds(1), [row("0001", "CLEAR", patch)]), /UNKNOWN_RESULT|INVALID_/);
});

test("E2-B fixed plans cover all Config/BOT cells and exclude holdout", () => {
  for (const [stage, first, last, count] of [
    ["smoke", "0001", "0002", 40], ["training", "0001", "0500", 10_000], ["validation", "0501", "0800", 6000],
  ]) {
    const plan = createPlan(stage);
    assert.deepEqual([plan.seeds[0], plan.seeds.at(-1), plan.seeds.length * plan.configIds.length * plan.botIds.length], [first, last, count]);
  }
  assert.throws(() => createPlan("holdout"), /INVALID_E2B_STAGE/);
});

test("E2-B CLI rejects Validation if prior quality evidence is absent, before creating output", () => {
  const directory = join(tmpdir(), `tp6-test-${randomUUID()}`);
  const script = fileURLToPath(new URL("../simulation/run-experiment.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, "validation", directory], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ENOENT.*smoke/);
  assert.equal(existsSync(directory), false);
});

test("E2-B failed simulation row preserves diagnostics and receives no score", () => {
  const plan = createPlan("smoke");
  const diagnostic = { code: "BOT_EXCEPTION", tick: 1 };
  const record = rowFromResult(plan, "BASE", "BOT-01", "0001", {
    seedId: "0001", result: "ERROR", diagnostics: [diagnostic], fault: { code: "ENGINE_FAULT" },
  });
  assert.equal(record.score, null);
  assert.deepEqual(record.diagnostics, [diagnostic]);
  assert.deepEqual(record.error, { code: "ENGINE_FAULT" });
});
