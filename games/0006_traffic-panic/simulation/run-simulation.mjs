import { BOTS } from "../src/bots/index.mjs";
import { BASE_CONFIG, scoreOf } from "../src/config.mjs";
import { advanceTick } from "../src/game-engine.mjs";
import { createSession, getObservation, processBoundary } from "../src/session.mjs";
import { validateSeedId } from "../src/spawn-schedule.mjs";

export const RUNNER_VERSION = "TP6-RUNNER-v1";

function decideSafely(decide, observation, tick, diagnostics) {
  try {
    const type = decide(observation, tick);
    if (type === null || type === "SWITCH_NS" || type === "SWITCH_EW") return type;
    diagnostics.push({ tick, code: "INVALID_BOT_DECISION" });
  } catch {
    diagnostics.push({ tick, code: "BOT_EXCEPTION" });
  }
  return null;
}

// Opt-in trace is for contract tests and targeted diagnosis.
export function runSimulation({
  seedId, config = BASE_CONFIG, bot = BOTS["BOT-01"], schedule = null, captureTrace = false,
} = {}) {
  if (!validateSeedId(seedId)) return { seedId, result: "ERROR", code: "INVALID_SEED" };
  if (seedId >= "0801" && seedId <= "1000") return { seedId, result: "BLOCKED", code: "HOLDOUT_NOT_AUTHORIZED" };
  if (seedId < "0001" || seedId > "0800") return { seedId, result: "BLOCKED", code: "SEED_OUTSIDE_E2_A_RANGE" };
  if (!bot || typeof bot.id !== "string" || typeof bot.version !== "string" || typeof bot.decide !== "function") {
    return { seedId, result: "ERROR", code: "INVALID_BOT" };
  }

  const created = createSession({ seedId, config, schedule });
  if (!created.ok) return { seedId, result: "ERROR", code: created.code, violations: created.violations ?? [] };
  let sequence = 1;
  const started = processBoundary(created.session, [{ type: "START", commandSequence: sequence }]);
  if (!started.ok) return { seedId, result: "ERROR", code: started.code };
  const session = started.session;
  const versions = {
    ruleVersion: session.config.ruleVersion,
    balanceConfigId: session.config.balanceConfigId,
    generatorVersion: session.config.generatorVersion,
    engineVersion: session.config.engineVersion,
    eventSchemaVersion: session.config.eventSchemaVersion,
    botId: bot.id,
    botVersion: bot.version,
    runnerVersion: RUNNER_VERSION,
  };
  const diagnostics = [];
  const trace = captureTrace ? [] : null;
  function finish(result, failureDirection = null, fault = null) {
    const { snapshot } = session;
    return {
      seedId, versions, result, failureDirection, fault, snapshot, diagnostics,
      endTick: snapshot.elapsedTick,
      survivalMs: snapshot.elapsedTick * session.config.tickDurationMs,
      score: fault === null ? scoreOf(snapshot, session.config) : null,
      ...(trace === null ? {} : { trace }),
    };
  }

  for (let targetTick = 1; targetTick <= session.config.endTick; targetTick += 1) {
    const { observation } = getObservation(session);
    const type = decideSafely(bot.decide, observation, targetTick, diagnostics);
    const commands = type === null ? [] : [{ type, targetTick, commandSequence: ++sequence }];
    const step = advanceTick({ snapshot: session.snapshot, targetTick, commands, config: session.config, schedule: session.schedule });
    if (!step.ok) {
      return finish("ERROR", null, {
        tick: targetTick, code: step.code, stage: step.stage ?? null, violations: step.violations ?? [],
      });
    }
    session.snapshot = step.snapshot;
    if (trace !== null) trace.push({
      snapshot: step.snapshot, commands, events: step.events, commandOutcomes: step.commandOutcomes,
    });
    if (step.terminal) return finish(step.terminal.result, step.terminal.failureDirection);
  }
  return finish("ERROR", null, { code: "MISSING_TERMINAL", tick: session.snapshot.elapsedTick });
}
