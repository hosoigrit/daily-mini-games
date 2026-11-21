import { mean, median, pairedClearBootstrap95, wilson95 } from "./statistics.mjs";

// One row per attempted seed in a single Config/BOT comparison cell.
export function summarizeCell(expectedSeeds, results) {
  const pending = new Set(expectedSeeds);
  if (pending.size !== expectedSeeds.length) throw new RangeError("DUPLICATE_EXPECTED_SEED");
  const counts = { CLEAR: 0, GRIDLOCK: 0, ERROR: 0, BLOCKED: 0, NOT_RUN: 0 };
  for (const { seedId, result } of results) {
    if (!pending.delete(seedId)) throw new RangeError("UNKNOWN_OR_DUPLICATE_RESULT_SEED");
    if (!["CLEAR", "GRIDLOCK", "ERROR", "BLOCKED"].includes(result)) throw new RangeError("UNKNOWN_RESULT");
    counts[result] += 1;
  }
  counts.NOT_RUN = pending.size;
  return { expected: expectedSeeds.length, counts, missingSeeds: [...pending] };
}

const complete = ({ result }) => result === "CLEAR" || result === "GRIDLOCK";
const whole = (value, low, high) => Number.isSafeInteger(value) && value >= low && value <= high;
const rate = (count, n) => n === 0 ? null : count / n;
const directions = ["NORTH", "SOUTH", "EAST", "WEST"];

function validateRecord(row) {
  if (!Array.isArray(row.diagnostics) || row.diagnostics.some((event) =>
    !event || typeof event.code !== "string" || !event.code || !whole(event.tick, 1, 600))) {
    throw new RangeError("INVALID_DIAGNOSTICS");
  }
  if (complete(row)) {
    if (!whole(row.score, 0, Number.MAX_SAFE_INTEGER) || row.score % 10 !== 0
      || !whole(row.switchCount, 0, 599) || !whole(row.maxQueueLength, 0, 8)
      || !whole(row.endTick, 1, 600)) throw new RangeError("INVALID_METRIC");
    if (row.result === "CLEAR" ? row.endTick !== 600 || row.failureDirection !== null
      : row.endTick >= 600 || !directions.includes(row.failureDirection)) {
      throw new RangeError("INVALID_TERMINAL");
    }
  } else if (row.score !== null || (row.endTick !== null && !whole(row.endTick, 0, 600))) {
    throw new RangeError("INVALID_TECHNICAL_METRIC");
  }
}

export function summarizeDiagnostics(rows) {
  const codes = new Map();
  let eventCount = 0;
  let sessionCount = 0;
  const cleanCompletions = { CLEAR: 0, GRIDLOCK: 0 };
  const diagnosedCompletions = { CLEAR: 0, GRIDLOCK: 0 };
  for (const row of rows) {
    const events = row.diagnostics;
    if (events.length) sessionCount += 1;
    if (complete(row)) (events.length ? diagnosedCompletions : cleanCompletions)[row.result] += 1;
    for (const { code } of events) {
      codes.set(code, (codes.get(code) ?? 0) + 1);
      eventCount += 1;
    }
  }
  return {
    submitted: rows.length, eventCount, sessionCount, codes: Object.fromEntries([...codes].sort()),
    cleanCompletions, diagnosedCompletions,
  };
}

export function summarizeExperimentCell(expectedSeeds, rows) {
  const summary = summarizeCell([...expectedSeeds].sort(), rows);
  rows.forEach(validateRecord);
  const finished = rows.filter(complete).sort((a, b) => a.seedId.localeCompare(b.seedId));
  const eligible = summary.expected > 0 && summary.expected === finished.length;
  const scores = finished.map(({ score }) => score);
  const survival = finished.map(({ endTick }) => endTick * 100);
  const failureDirections = Object.fromEntries(directions.map((direction) => [direction, 0]));
  let earlyCount = 0;
  for (const { result, endTick, failureDirection } of finished) {
    if (result !== "GRIDLOCK") continue;
    failureDirections[failureDirection] += 1;
    if (endTick < 200) earlyCount += 1;
  }
  return {
    ...summary, submitted: rows.length, completed: finished.length, eligible,
    clearRate: rate(summary.counts.CLEAR, summary.expected),
    completedClearRate: rate(summary.counts.CLEAR, finished.length),
    clearWilson95: eligible ? wilson95(summary.counts.CLEAR, summary.expected) : null,
    scoreMean: mean(scores), scoreMedian: median(scores),
    survivalMeanMs: mean(survival), survivalMedianMs: median(survival),
    earlyCount, earlyRate: rate(earlyCount, summary.expected),
    switchMean: mean(finished.map(({ switchCount }) => switchCount)),
    maxQueue: finished.length ? Math.max(...finished.map(({ maxQueueLength }) => maxQueueLength)) : null,
    failureDirections,
    diagnostics: summarizeDiagnostics(rows),
  };
}

export function comparePaired(expectedSeeds, left, right) {
  const clearDiffs = [];
  const scoreDiffs = [];
  const missingSeeds = [];
  const a = new Map(left.filter(complete).map((row) => [row.seedId, row]));
  const b = new Map(right.filter(complete).map((row) => [row.seedId, row]));
  for (const seed of [...expectedSeeds].sort()) {
    if (!a.has(seed) || !b.has(seed)) {
      missingSeeds.push(seed);
      continue;
    }
    const first = a.get(seed);
    const second = b.get(seed);
    clearDiffs.push(Number(first.result === "CLEAR") - Number(second.result === "CLEAR"));
    scoreDiffs.push(first.score - second.score);
  }
  return {
    paired: clearDiffs.length, missingSeeds, eligible: clearDiffs.length > 0 && !missingSeeds.length,
    clearDifference: mean(clearDiffs), scoreDifference: mean(scoreDiffs),
    clearDifference95: pairedClearBootstrap95(clearDiffs),
  };
}

export function summarizeExperiment({ experimentId, configIds, botIds, seeds }, rows) {
  function makeMap(ids, valueFor) {
    const entries = new Map(ids.map((id) => [id, valueFor()]));
    if (entries.size !== ids.length) throw new RangeError("DUPLICATE_PLAN_ID");
    return entries;
  }
  const groups = makeMap(configIds, () => makeMap(botIds, () => []));
  for (const row of rows) {
    if (row.experimentId !== experimentId) throw new RangeError("WRONG_EXPERIMENT_ID");
    const group = groups.get(row.balanceConfigId)?.get(row.botId);
    if (!group) throw new RangeError("UNKNOWN_CONFIG_OR_BOT");
    group.push(row);
  }
  const cells = [];
  const comparisons = [];
  const byBot = makeMap(botIds, () => []);
  for (const [balanceConfigId, bots] of groups) {
    const metrics = new Map();
    for (const [botId, group] of bots) {
      const cell = { balanceConfigId, botId, ...summarizeExperimentCell(seeds, group) };
      cells.push(cell);
      metrics.set(botId, cell);
      for (const row of group) byBot.get(botId).push(row);
    }
    const fixed = ["BOT-02", "BOT-03"].filter((bot) => metrics.get(bot)?.eligible);
    // Equal CLEAR rates retain both fixed-period comparators.
    const bestFixed = fixed.filter((id) => fixed.length === 2
      && metrics.get(id).clearRate >= Math.max(...fixed.map((bot) => metrics.get(bot).clearRate)));
    for (const comparator of ["BOT-02", "BOT-03", "BOT-04"]) {
      if (!bots.has("BOT-05") || !bots.has(comparator)) continue;
      comparisons.push({
        balanceConfigId, comparator, bestFixed: bestFixed.includes(comparator),
        ...comparePaired(seeds, bots.get("BOT-05"), bots.get(comparator)),
      });
    }
  }
  const diagnostics = Object.fromEntries([...byBot].map(([bot, group]) => [bot, summarizeDiagnostics(group)]));
  return { eligible: cells.length > 0 && cells.every((cell) => cell.eligible), cells, comparisons, diagnostics };
}
