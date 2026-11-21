import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { join, resolve } from "node:path";
import { setImmediate } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { BOTS } from "../src/bots/index.mjs";
import { advanceTick } from "../src/game-engine.mjs";
import { createSession, getObservation, processBoundary } from "../src/session.mjs";
import { comparePaired, summarizeExperimentCell } from "../simulation/aggregate.mjs";
import { EXPERIMENT_CONFIGS } from "../simulation/experiment-configs.mjs";
import { rowFromResult } from "../simulation/run-experiment.mjs";
import { runSimulation, RUNNER_VERSION } from "../simulation/run-simulation.mjs";
import { BOOTSTRAP, STATISTICS_VERSION } from "../simulation/statistics.mjs";

const gameDirectory = fileURLToPath(new URL("../", import.meta.url));
const adapterPath = fileURLToPath(import.meta.url);
const resultsRoot = join(gameDirectory, "simulation/results");
const validationPlan = "simulation/results/e2b-20261121-v1/validation/plan.json";
const outputName = "e2c-holdout-v1";
const adapterVersion = "TP6-HOLDOUT-ADAPTER-v1";

export const FROZEN_HASH = "5c132310cdd45308bbc4f78d153b7a741c1bcfd64a34292829100f98f159bfa8";
export const EXECUTION_SCOPE = "Phase E2-Cの最終評価200seed（HARD-A、BOT-01〜05、1000セッション）を一度だけ実行してよい";
export const HOLDOUT_PLAN = Object.freeze({
  experimentId: "TP6-E2C-holdout-v1",
  stage: "holdout",
  configIds: Object.freeze(["HARD-A"]),
  botIds: Object.freeze(["BOT-01", "BOT-02", "BOT-03", "BOT-04", "BOT-05"]),
  seeds: Object.freeze(Array.from({ length: 200 }, (_, n) => String(801 + n).padStart(4, "0"))),
  expectedRows: 1000,
  primaryComparator: "BOT-03",
  descriptiveComparator: "BOT-04",
});

const json = (value) => JSON.stringify(value, null, 2) + "\n";
const sha256 = (content) => createHash("sha256").update(content).digest("hex");
const inHoldout = (seed) => /^\d{4}$/.test(seed) && seed >= "0801" && seed <= "1000";
const completed = (row) => row.result === "CLEAR" || row.result === "GRIDLOCK";
const files = Object.freeze([
  "simulation/aggregate.mjs",
  "simulation/experiment-configs.mjs",
  "simulation/run-experiment.mjs",
  "simulation/run-simulation.mjs",
  "simulation/statistics.mjs",
  "src/bots/forecast.mjs",
  "src/bots/index.mjs",
  "src/config.mjs",
  "src/game-engine.mjs",
  "src/prng.mjs",
  "src/session.mjs",
  "src/signal-fsm.mjs",
  "src/spawn-schedule.mjs",
  "src/state-validator.mjs",
  "src/traffic-model.mjs",
]);

export function verifyFreeze(directory = gameDirectory) {
  const plan = JSON.parse(readFileSync(join(directory, validationPlan), "utf8"));
  const hashes = Object.fromEntries(files.map((path) => [path, sha256(readFileSync(join(directory, path)))]));
  const versions = {
    runner: RUNNER_VERSION, statistics: STATISTICS_VERSION, bootstrap: BOOTSTRAP,
    bots: Object.fromEntries(Object.values(BOTS).map(({ id, version }) => [id, version])),
    configs: EXPERIMENT_CONFIGS,
  };
  if (plan.plan?.experimentId !== "TP6-E2B-validation-v1" || !isDeepStrictEqual(plan.versions, versions)
    || !isDeepStrictEqual(plan.sourceHashes, hashes) || plan.frozenHash !== FROZEN_HASH
    || sha256(json({ hashes, versions })) !== FROZEN_HASH) throw new Error("FROZEN_BASELINE_MISMATCH");
  return { frozenHash: FROZEN_HASH, sourceHashes: hashes, versions };
}

// The caller records the separate human approval. A local JSON record is not authentication.
export function validateApproval(record, adapterSha256) {
  if (record?.experimentId !== HOLDOUT_PLAN.experimentId || record.frozenHash !== FROZEN_HASH
    || record.adapterSha256 !== adapterSha256 || record.scope !== EXECUTION_SCOPE
    || typeof record.approvalReference !== "string" || !record.approvalReference.trim()) {
    throw new Error("HOLDOUT_NOT_AUTHORIZED");
  }
}

export function assertNoRecordedHoldout(directory) {
  const entries = readdirSync(directory, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (/holdout|e2[-_]?c/i.test(entry.name)) throw new Error("HOLDOUT_OUTPUT_ALREADY_EXISTS");
    if (!entry.isFile() || !["plan.json", "summary.json", "sessions.jsonl"].includes(entry.name)) continue;
    const raw = readFileSync(join(entry.parentPath, entry.name), "utf8");
    if (entry.name === "sessions.jsonl") {
      for (const line of raw.trim().split(/\r?\n/).filter(Boolean)) {
        if (inHoldout(JSON.parse(line).seedId)) throw new Error("HOLDOUT_RECORD_ALREADY_EXISTS");
      }
    } else {
      const report = JSON.parse(raw);
      const plan = report.plan ?? report;
      if (plan.stage === "holdout" || inHoldout(plan.seedFirst) || inHoldout(plan.seedLast)
        || plan.seeds?.some(inHoldout) || report.holdoutCalls > 0) {
        throw new Error("HOLDOUT_RECORD_ALREADY_EXISTS");
      }
    }
  }
}

export function claimOutput(directory) {
  // No recursive option. An existing directory, file, or concurrent claimant causes EEXIST.
  const output = join(directory, outputName);
  mkdirSync(output);
  return output;
}

function decideSafely(bot, observation, tick, diagnostics) {
  try {
    const choice = bot.decide(observation, tick);
    if (choice === null || choice === "SWITCH_NS" || choice === "SWITCH_EW") return choice;
    diagnostics.push({ tick, code: "INVALID_BOT_DECISION" });
  } catch {
    diagnostics.push({ tick, code: "BOT_EXCEPTION" });
  }
  return null;
}

// Private mechanics shared by the release path and the fixed non-holdout parity checks.
function runSession(seedId, bot, captureTrace = false) {
  const config = EXPERIMENT_CONFIGS["HARD-A"];
  const created = createSession({ seedId, config });
  if (!created.ok) return { seedId, result: "ERROR", code: created.code };
  let sequence = 1;
  const started = processBoundary(created.session, [{ type: "START", commandSequence: sequence }]);
  if (!started.ok) return { seedId, result: "ERROR", code: started.code };
  const session = started.session;
  const versions = {
    ruleVersion: config.ruleVersion, balanceConfigId: config.balanceConfigId,
    generatorVersion: config.generatorVersion, engineVersion: config.engineVersion,
    eventSchemaVersion: config.eventSchemaVersion, botId: bot.id, botVersion: bot.version,
    runnerVersion: RUNNER_VERSION,
  };
  const diagnostics = [];
  const trace = captureTrace ? [] : null;
  function finish(result, failureDirection, score, fault = null) {
    return {
      seedId, versions, result, failureDirection, fault, snapshot: session.snapshot, diagnostics,
      endTick: session.snapshot.elapsedTick, survivalMs: session.snapshot.elapsedTick * config.tickDurationMs,
      score, ...(trace === null ? {} : { trace }),
    };
  }
  for (let targetTick = 1; targetTick <= config.endTick; targetTick += 1) {
    const { observation } = getObservation(session);
    const type = decideSafely(bot, observation, targetTick, diagnostics);
    const commands = type === null ? [] : [{ type, targetTick, commandSequence: ++sequence }];
    const step = advanceTick({ snapshot: session.snapshot, targetTick, commands, config, schedule: session.schedule });
    if (!step.ok) return finish("ERROR", null, null, {
      tick: targetTick, code: step.code, stage: step.stage ?? null, violations: step.violations ?? [],
    });
    session.snapshot = step.snapshot;
    if (trace !== null) trace.push({
      snapshot: step.snapshot, commands, events: step.events, commandOutcomes: step.commandOutcomes,
    });
    if (step.terminal) return finish(step.terminal.result, step.terminal.failureDirection, step.score);
  }
  return finish("ERROR", null, null, { code: "MISSING_TERMINAL", tick: config.endTick });
}

export function verifyNonHoldoutParity() {
  let matched = 0;
  const seedIds = ["0001", "0501"];
  for (const seedId of seedIds) {
    for (const botId of HOLDOUT_PLAN.botIds) {
      const bot = BOTS[botId];
      const expected = runSimulation({ seedId, bot, config: EXPERIMENT_CONFIGS["HARD-A"], captureTrace: true });
      if (!completed(expected) || !isDeepStrictEqual(runSession(seedId, bot, true), expected)) {
        throw new Error("E2B_SESSION_PARITY_MISMATCH");
      }
      matched += 1;
    }
  }
  return { seedIds, matched, verified: seedIds.length * HOLDOUT_PLAN.botIds.length };
}

export function evaluateRows(rows, issue = null) {
  const { experimentId, configIds, botIds, seeds, primaryComparator, descriptiveComparator } = HOLDOUT_PLAN;
  let cells;
  let comparisons;
  try {
    const byBot = new Map(botIds.map((id) => [id, []]));
    for (const row of rows) {
      if (row.experimentId !== experimentId || row.balanceConfigId !== configIds[0] || !byBot.has(row.botId)) {
        throw new Error("UNPLANNED_HOLDOUT_ROW");
      }
      byBot.get(row.botId).push(row);
    }
    cells = [...byBot].map(([botId, botRows]) => ({ botId, ...summarizeExperimentCell(seeds, botRows) }));
    comparisons = [primaryComparator, descriptiveComparator].map((comparator) => ({
      comparator,
      ...comparePaired(seeds, byBot.get("BOT-05"), byBot.get(comparator)),
    }));
  } catch (error) {
    return { status: "BLOCKED", reason: "INVALID_DATA", details: error.message };
  }

  const facts = { cells, comparisons };
  if (issue?.invariant) return { ...facts, status: "FAIL", reason: "ENGINE_INVARIANT" };
  if (issue || rows.length !== HOLDOUT_PLAN.expectedRows || cells.some((cell) => !cell.eligible)) {
    return { ...facts, status: "BLOCKED", reason: "INCOMPLETE_OR_TECHNICAL_ERROR" };
  }
  const bot5 = cells.find(({ botId }) => botId === "BOT-05");
  const bot3 = cells.find(({ botId }) => botId === primaryComparator);
  const main = comparisons[0];
  const clearDelta = bot5.counts.CLEAR - bot3.counts.CLEAR;
  if (bot5.counts.CLEAR < 120 || clearDelta < 10 || bot5.earlyCount > 10) {
    return { ...facts, status: "FAIL", reason: "POINT_TARGET_NOT_MET" };
  }
  if (main.clearDifference95[0] <= 0) return { ...facts, status: "INCONCLUSIVE", reason: "SUPERIORITY_NOT_ESTABLISHED" };
  return { ...facts, status: "PASS", clearsFivePointConfidenceThreshold: main.clearDifference95[0] >= 0.05 };
}

function runPreflightTests() {
  const tests = readdirSync(join(gameDirectory, "tests")).filter((name) => name.endsWith(".test.mjs")).sort();
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...tests.map((name) => join("tests", name))], {
    cwd: gameDirectory, encoding: "utf8", timeout: 120_000,
  });
  const log = result.stdout ?? "";
  const pass = Number(log.match(/^# pass (\d+)$/m)?.[1]);
  const total = Number(log.match(/^# tests (\d+)$/m)?.[1]);
  if (result.error || result.status !== 0 || pass < 100 || pass !== total || !/^# fail 0$/m.test(log)) {
    throw new Error("HOLDOUT_PREFLIGHT_TESTS_FAILED");
  }
  return { passed: pass, total, log };
}

async function execute(approvalPath) {
  const adapterSha256 = sha256(readFileSync(adapterPath));
  const approvalRaw = readFileSync(approvalPath);
  const approval = JSON.parse(approvalRaw.toString("utf8").replace(/^\uFEFF/, ""));
  validateApproval(approval, adapterSha256);
  const freeze = verifyFreeze();
  assertNoRecordedHoldout(resultsRoot);
  const preflight = runPreflightTests();
  verifyFreeze();
  if (sha256(readFileSync(adapterPath)) !== adapterSha256) throw new Error("ADAPTER_CHANGED_DURING_PREFLIGHT");
  assertNoRecordedHoldout(resultsRoot);
  const output = claimOutput(resultsRoot);
  const rawPath = join(output, "sessions.jsonl");
  const meta = {
    ...freeze, plan: HOLDOUT_PLAN, adapterVersion, adapterSha256,
    approval: { scope: approval.scope, reference: approval.approvalReference, sha256: sha256(approvalRaw) },
    execution: { startedAt: new Date().toISOString(), node: process.version, os: { platform: platform(), arch: arch(), release: release() },
      command: "node holdout/run-holdout.mjs --execute <approval-record>", testsPassed: preflight.passed },
  };
  writeFileSync(join(output, "plan.json"), json(meta), { flag: "wx" });
  writeFileSync(join(output, "preflight-tests.tap"), preflight.log, { flag: "wx" });
  writeFileSync(rawPath, "", { flag: "wx" });

  const rows = [];
  let issue = null;
  let interrupted = false;
  const interrupt = () => { interrupted = true; };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    evaluation:
    for (const botId of HOLDOUT_PLAN.botIds) {
      for (const seedId of HOLDOUT_PLAN.seeds) {
        if (interrupted) { issue = { code: "INTERRUPTED" }; break evaluation; }
        let row;
        try {
          row = rowFromResult(HOLDOUT_PLAN, "HARD-A", botId, seedId, runSession(seedId, BOTS[botId]));
          if (!completed(row)) issue = {
            code: "NON_TERMINAL_RESULT", botId, seedId, invariant:
              row.error?.code === "ENGINE_FAULT" && Boolean(row.error?.violations?.length),
          };
        } catch (error) {
          issue = { code: error.message, botId, seedId, invariant: error.message === "SIMULATION_RESULT_INVARIANT" };
          row = { experimentId: HOLDOUT_PLAN.experimentId, balanceConfigId: "HARD-A", botId, seedId,
            result: "ERROR", score: null, endTick: null, diagnostics: [], error: issue.code };
        }
        appendFileSync(rawPath, JSON.stringify(row) + "\n", { flush: true });
        rows.push(row);
        if (issue) break evaluation;
        await setImmediate();
      }
      console.log(`${botId} ${rows.length}/${HOLDOUT_PLAN.expectedRows}`);
    }
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
  if (interrupted && !issue) issue = { code: "INTERRUPTED" };
  const summary = {
    ...evaluateRows(rows, issue), issue, submitted: rows.length, expected: HOLDOUT_PLAN.expectedRows,
    finishedAt: new Date().toISOString(), frozenHash: FROZEN_HASH, adapterSha256,
    experimentId: HOLDOUT_PLAN.experimentId,
    rowsSha256: sha256(readFileSync(rawPath)),
  };
  const summaryText = json(summary);
  writeFileSync(join(output, "summary.json"), summaryText, { flag: "wx" });
  writeFileSync(join(output, "SHA256SUMS"), ["plan.json", "preflight-tests.tap", "sessions.jsonl", "summary.json"]
    .map((name) => sha256(readFileSync(join(output, name))) + "  " + name + "\n").join(""), { flag: "wx" });
  console.log(JSON.stringify({ status: summary.status, reason: summary.reason, submitted: summary.submitted, output }));
  if (issue || summary.status === "BLOCKED") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  async function main() {
    if (args.length === 1 && args[0] === "--check") {
      const freeze = verifyFreeze();
      assertNoRecordedHoldout(resultsRoot);
      console.log(json({ status: "CHECKED", plan: HOLDOUT_PLAN, ...freeze, adapterSha256: sha256(readFileSync(adapterPath)) }));
    } else if (args.length === 2 && args[0] === "--execute") {
      await execute(resolve(args[1]));
    } else {
      throw new Error("HOLDOUT_NOT_AUTHORIZED: use --check for read-only verification");
    }
  }
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
