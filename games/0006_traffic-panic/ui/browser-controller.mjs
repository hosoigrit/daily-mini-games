import { createSession, processBoundary } from "../src/session.mjs";
import { PLAY_CONFIG } from "./play-config.mjs";

export { PLAY_CONFIG };
const SWITCHES = new Set(["SWITCH_NS", "SWITCH_EW"]);
const SEED_MIN = 2001;
const SEED_COUNT = 7999;
const MAX_SEED_ATTEMPTS = 8;
const SEED_LIMIT = Math.floor(2 ** 32 / SEED_COUNT) * SEED_COUNT;

export function randomPlaySeed(crypto = globalThis.crypto) {
  const sample = new Uint32Array(1);
  for (let attempt = 0; attempt < MAX_SEED_ATTEMPTS; attempt += 1) {
    crypto.getRandomValues(sample);
    if (sample[0] < SEED_LIMIT) return String(SEED_MIN + sample[0] % SEED_COUNT);
  }
  return null;
}

export function shortcutFor(event, status) {
  const target = event.target;
  if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey
    || target?.isContentEditable || target?.closest?.("input,textarea,select,[role=textbox]")) return null;
  if (status === "RUNNING") {
    if (event.key === "1") return "SWITCH_EW";
    if (event.key === "2") return "SWITCH_NS";
    if (event.key.toLowerCase() === "p") return "PAUSE";
  }
  if (status === "PAUSED" && event.key.toLowerCase() === "p") return "RESUME";
  if (event.key !== "Enter" || target?.closest?.("button,a,[role=button],summary")) return null;
  return { READY: "START", PAUSED: "RESUME", FINISHED: "RETRY", ERROR: "RETRY" }[status] ?? null;
}

export function createBrowserController({
  requestFrame, cancelFrame, isHidden, onChange, seedForPlay = randomPlaySeed,
  create = createSession, boundary = processBoundary,
}) {
  let session;
  let fault = null;
  let lastSeed;
  let sequence = 0;
  let pending = [];
  let frame = null;
  let lastTime = null;
  let accumulated = 0;
  const status = () => fault ? "ERROR" : session.status;
  const notify = (events = [], pauseReason = null) => onChange({ session, status: status(), fault, events, pauseReason });

  function resetTiming() {
    if (frame !== null) cancelFrame(frame);
    frame = lastTime = null;
    accumulated = 0;
    pending = [];
  }

  function chooseNewSeed() {
    for (let attempt = 0; attempt < MAX_SEED_ATTEMPTS; attempt += 1) {
      const seed = seedForPlay();
      if (seed === null) return null;
      if (typeof seed !== "string" || !/^[2-9]\d{3}$/.test(seed) || Number(seed) < SEED_MIN) {
        throw new RangeError("INVALID_PLAY_SEED");
      }
      if (seed !== lastSeed) return seed;
    }
    return null;
  }

  function prepare() {
    resetTiming();
    sequence = 0;
    session = null;
    fault = null;
    try {
      const seed = chooseNewSeed();
      if (seed === null) {
        fault = { code: "PLAY_SEED_UNAVAILABLE" };
      } else {
        const result = create({ config: PLAY_CONFIG, seedId: seed });
        if (result.ok) {
          session = result.session;
          lastSeed = seed;
        } else {
          fault = { code: result.code, violations: result.violations ?? [] };
        }
      }
    } catch (error) {
      fault = { code: "SESSION_INITIALIZATION_FAILED", detail: error.name };
    }
    notify();
  }

  function evaluate(types) {
    const commands = types.map((type) => ({
      type, commandSequence: ++sequence,
      ...(SWITCHES.has(type) && { targetTick: session.snapshot.elapsedTick + 1 }),
    }));
    let result;
    try {
      result = boundary(session, commands);
    } catch (error) {
      fault = { code: "SESSION_UPDATE_FAILED", detail: error.name };
      return [];
    }
    if (result.session) session = result.session;
    if (session.status === "ERROR") fault = session.fault;
    if (!result.ok && !result.session) fault = { code: result.code };
    return result.events ?? [];
  }

  function scheduleFrame() {
    if (frame === null && status() === "RUNNING") frame = requestFrame(onFrame);
  }

  function onFrame(now) {
    frame = null;
    if (status() !== "RUNNING") return;
    if (isHidden()) return pause("hidden");
    const delta = lastTime === null ? 0 : now - lastTime;
    if (delta > 500) return pause("gap");
    lastTime = now;
    accumulated += delta;
    const events = [];
    let ticks = 0;
    while (accumulated + 1e-7 >= PLAY_CONFIG.tickDurationMs && ticks < 5 && status() === "RUNNING") {
      accumulated = Math.max(0, accumulated - PLAY_CONFIG.tickDurationMs);
      const inputs = pending;
      pending = [];
      events.push(...evaluate(inputs));
      ticks += 1;
    }
    if (status() !== "RUNNING") resetTiming();
    if (ticks > 0) notify(events);
    scheduleFrame();
  }

  function pause(reason, types = ["PAUSE"]) {
    const events = evaluate([...pending, ...types]);
    resetTiming();
    notify(events, reason);
  }

  function dispatch(...types) {
    const current = status();
    if (types.includes("RETRY") && ["PAUSED", "FINISHED", "ERROR"].includes(current)) {
      prepare();
      return;
    }
    if (types.includes("PAUSE") && (current === "RUNNING" || current === "PAUSED")) {
      pause("manual", types);
      return;
    }
    if ((current === "READY" && types.includes("START")) || (current === "PAUSED" && types.includes("RESUME"))) {
      if (isHidden()) return;
      resetTiming();
      notify(evaluate(types));
      scheduleFrame();
      return;
    }
    if (current !== "RUNNING") return;
    const { phase } = session.snapshot.signal;
    const next = phase === "EW_GREEN" ? "SWITCH_NS" : phase === "NS_GREEN" ? "SWITCH_EW" : null;
    if (pending.length === 0 && types.includes(next)) pending.push(next);
  }

  function visibilityChanged() {
    if (isHidden() && status() === "RUNNING") pause("hidden");
  }

  prepare();
  return { dispatch, visibilityChanged, getStatus: status, dispose: resetTiming };
}
