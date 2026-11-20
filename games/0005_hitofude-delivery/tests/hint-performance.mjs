import { performance } from "node:perf_hooks";
import { createGameState, moveTo } from "../src/game-core.js";
import { HINT_LIMITS, solveHint } from "../src/hint-solver.js";
import { STAGES } from "../src/stages.js";

const measurements = [];
for (const stage of STAGES) {
  for (const sample of ["initial", "midpoint"]) {
    const runs = [];
    for (let iteration = 0; iteration < 25; iteration += 1) {
      let state = createGameState(stage);
      if (sample === "midpoint") {
        const steps = stage.exampleRoute.slice(1, Math.max(2, Math.ceil(stage.exampleRoute.length / 2)));
        for (const cell of steps) state = moveTo(state, stage, cell).state;
      }
      const started = performance.now();
      const result = solveHint(stage, state);
      const wallMs = performance.now() - started;
      runs.push({ status: result.status, nodes: result.nodes, wallMs });
    }
    measurements.push({
      stage: stage.id,
      sample,
      statuses: [...new Set(runs.map((run) => run.status))],
      unavailable: runs.filter((run) => run.status === "UNAVAILABLE").length,
      maxNodes: Math.max(...runs.map((run) => run.nodes)),
      medianWallMs: median(runs.map((run) => run.wallMs)),
      maxWallMs: Math.max(...runs.map((run) => run.wallMs)),
    });
  }
}

console.log(JSON.stringify({ limits: HINT_LIMITS, runsPerSample: 25, measurements }, null, 2));
if (measurements.some((measurement) => measurement.statuses.includes("NO_SOLUTION") || measurement.unavailable > 0)) {
  process.exitCode = 1;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

