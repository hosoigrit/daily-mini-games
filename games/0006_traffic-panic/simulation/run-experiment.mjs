import { createHash } from "node:crypto";
import {
  closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync,
  writeFileSync, writeSync,
} from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { arch, platform, release } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setImmediate } from "node:timers/promises";
import { BOTS } from "../src/bots/index.mjs";
import { summarizeExperiment } from "./aggregate.mjs";
import { EXPERIMENT_CONFIGS } from "./experiment-configs.mjs";
import { runSimulation, RUNNER_VERSION } from "./run-simulation.mjs";
import { BOOTSTRAP, STATISTICS_VERSION } from "./statistics.mjs";

const gameDirectory = fileURLToPath(new URL("../", import.meta.url));
const stages = Object.freeze({ smoke: [1, 2], training: [1, 500], validation: [501, 800] });
const digest = (content) => createHash("sha256").update(content).digest("hex");
const json = (value) => JSON.stringify(value, null, 2) + "\n";
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

export function createPlan(stage) {
  if (!Object.hasOwn(stages, stage)) throw new RangeError("INVALID_E2B_STAGE");
  const [first, last] = stages[stage];
  return {
    stage, experimentId: `TP6-E2B-${stage}-v1`,
    configIds: Object.keys(EXPERIMENT_CONFIGS),
    botIds: Object.keys(BOTS),
    seeds: Array.from({ length: last - first + 1 }, (_, index) => String(first + index).padStart(4, "0")),
  };
}

function sourceHashes() {
  const paths = ["src", "simulation"].flatMap((dir) => readdirSync(resolve(gameDirectory, dir), { recursive: true })
    .filter((path) => path.endsWith(".mjs")).map((path) => dir + "/" + path.replaceAll("\\", "/"))).sort();
  return Object.fromEntries(paths.map((path) => [path, digest(readFileSync(resolve(gameDirectory, path)))]));
}

function assertPrevious(output, stage, frozenHash) {
  const summary = readJson(resolve(output, stage, "summary.json"));
  const raw = readFileSync(resolve(output, stage, "sessions.jsonl"), "utf8");
  const plan = createPlan(stage);
  if (summary.status !== "PASS" || !isDeepStrictEqual(summary.plan, plan)
    || summary.frozenHash !== frozenHash || summary.rowsSha256 !== digest(raw)
    || (stage === "smoke" && summary.replaysVerified !== 40)) throw new Error(`QUALITY_GATE_${stage.toUpperCase()}`);
  const rows = raw.trimEnd().split("\n").map((line) => JSON.parse(line));
  if (!summarizeExperiment(plan, rows).eligible) throw new Error(`INCOMPLETE_${stage.toUpperCase()}`);
}

export function rowFromResult(plan, balanceConfigId, botId, seedId, simulation) {
  const completed = simulation.result === "CLEAR" || simulation.result === "GRIDLOCK";
  const { versions, snapshot } = simulation;
  if (simulation.seedId !== seedId || (versions &&
    (versions.balanceConfigId !== balanceConfigId || versions.botId !== botId))
    || (completed && (!versions || snapshot?.elapsedTick !== simulation.endTick
      || simulation.survivalMs !== simulation.endTick * 100
      || simulation.score !== snapshot.passedVehicles * 10
      || snapshot.arrivalAttempts !== snapshot.passedVehicles + snapshot.overflowVehicles
        + Object.values(snapshot.queues).reduce((sum, value) => sum + value, 0)
      || snapshot.spawnCursor !== snapshot.arrivalAttempts
      || snapshot.overflowVehicles !== Number(simulation.result === "GRIDLOCK")
      || Object.values(snapshot.queues).some((value) => !Number.isInteger(value) || value < 0 || value > 8)))) {
    throw new Error("SIMULATION_RESULT_INVARIANT");
  }
  return {
    experimentId: plan.experimentId, balanceConfigId, botId, seedId,
    result: simulation.result, score: simulation.score ?? null, endTick: simulation.endTick ?? null,
    failureDirection: simulation.failureDirection ?? null,
    switchCount: snapshot?.switchCount ?? null, maxQueueLength: snapshot?.maxQueueLength ?? null,
    diagnostics: simulation.diagnostics ?? [], error: simulation.fault ?? simulation.code ?? null,
  };
}

async function main(stage, outputArg) {
  const plan = createPlan(stage);
  const output = resolve(outputArg);
  const target = resolve(output, stage);
  if (existsSync(target)) throw new Error(`Stage already exists: ${stage}`);
  const hashes = sourceHashes();
  const versions = {
    runner: RUNNER_VERSION, statistics: STATISTICS_VERSION, bootstrap: BOOTSTRAP,
    bots: Object.fromEntries(Object.values(BOTS).map(({ id, version }) => [id, version])),
    configs: EXPERIMENT_CONFIGS,
  };
  const frozenHash = digest(json({ hashes, versions }));
  if (stage !== "smoke") assertPrevious(output, "smoke", frozenHash);
  if (stage === "validation") assertPrevious(output, "training", frozenHash);

  mkdirSync(output, { recursive: true });
  mkdirSync(target);
  const startedAt = new Date().toISOString();
  const planned = plan.configIds.length * plan.botIds.length * plan.seeds.length;
  const metadata = {
    plan, planned, startedAt, node: process.version, os: { platform: platform(), arch: arch(), release: release() },
    command: `node simulation/run-experiment.mjs ${stage} ${outputArg}`,
    scheduleSource: "Normal seed + Config generation",
    frozenHash, sourceHashes: hashes, versions,
    clearRateDenominator: "planned seeds",
    earlyRateDenominator: "planned seeds",
    bestFixedRule: "max observed clear rate of BOT-02 and BOT-03 within Config; both retained on ties",
  };
  writeFileSync(resolve(target, "plan.json"), json(metadata), { flag: "wx" });
  const rowsPath = resolve(target, "sessions.jsonl");
  const file = openSync(rowsPath, "wx");
  const rows = [];
  const replays = [];
  let interrupted = false;
  let issue = null;
  let attempts = 0;
  let rssPeak = process.memoryUsage.rss();
  const start = performance.now();
  const interrupt = () => { interrupted = true; };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    sessions:
    for (const balanceConfigId of plan.configIds) {
      for (const botId of plan.botIds) {
        for (const seedId of plan.seeds) {
          if (interrupted) { issue = "INTERRUPTED"; break sessions; }
          const options = { seedId, config: EXPERIMENT_CONFIGS[balanceConfigId], bot: BOTS[botId], captureTrace: stage === "smoke" };
          let row;
          try {
            attempts += 1;
            const simulation = runSimulation(options);
            row = rowFromResult(plan, balanceConfigId, botId, seedId, simulation);
            if (stage === "smoke" && (row.result === "CLEAR" || row.result === "GRIDLOCK")) {
              attempts += 1;
              const repeat = runSimulation(options);
              if (!isDeepStrictEqual(simulation, repeat)) throw new Error("REPLAY_MISMATCH");
              replays.push({ balanceConfigId, botId, seedId, endTick: row.endTick, traceSha256: digest(JSON.stringify(simulation.trace)) });
            }
          } catch (error) {
            row = { experimentId: plan.experimentId, balanceConfigId, botId, seedId, result: "ERROR",
              endTick: null, score: null, diagnostics: row?.diagnostics ?? [], error: String(error.message ?? error) };
          }
          writeSync(file, JSON.stringify(row) + "\n");
          rows.push(row);
          rssPeak = Math.max(rssPeak, process.memoryUsage.rss());
          if (row.result === "ERROR" || row.result === "BLOCKED") {
            issue = { seedId, balanceConfigId, botId, result: row.result, error: row.error };
            break sessions;
          }
          if (rows.length % 20 === 0) await setImmediate();
        }
        console.log(`${stage} ${balanceConfigId} ${botId} ${rows.length}/${planned}`);
      }
    }
  } finally {
    fsyncSync(file);
    closeSync(file);
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
  const simulationMs = performance.now() - start;
  const aggregate = summarizeExperiment(plan, rows);
  rssPeak = Math.max(rssPeak, process.memoryUsage.rss());
  const raw = readFileSync(rowsPath);
  const status = !issue && !interrupted && aggregate.eligible ? "PASS" : "BLOCKED";
  const summary = {
    ...metadata, status, issue, submitted: rows.length, simulationCalls: attempts, holdoutCalls: 0,
    replaysVerified: replays.length, replays, simulationMs, totalMs: performance.now() - start,
    peakSampledRssBytes: rssPeak, rowsBytes: raw.length, rowsSha256: digest(raw), ...aggregate,
  };
  writeFileSync(resolve(target, "summary.json"), json(summary), { flag: "wx" });
  console.log(JSON.stringify({
    stage, status, issue, submitted: rows.length, planned, replay: replays.length, simulationMs,
    totalMs: summary.totalMs, rssPeak, rowsBytes: raw.length, frozenHash,
  }));
  if (status !== "PASS") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [stage, output, ...extra] = process.argv.slice(2);
  if (!stage || !output || extra.length) {
    console.error("Usage: node simulation/run-experiment.mjs <smoke|training|validation> <output-directory>");
    process.exitCode = 1;
  } else {
    main(stage, output).catch((error) => { console.error(error.message); process.exitCode = 1; });
  }
}
