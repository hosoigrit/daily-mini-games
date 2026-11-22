import { INITIAL_CASH, RULES_VERSION } from "./config.js";
import { getScenario } from "./scenario-catalog.js";

const PREFIX = `daily-mini-games:0007:best-profit:${RULES_VERSION}:`;

function isValidProfit(value, week) {
  return Number.isSafeInteger(value) && value >= -INITIAL_CASH && value <= week.verifiedMaxProfit;
}

function requireWeek(id) {
  const week = getScenario(id);
  if (!week) throw new RangeError("Unknown scenario");
  return week;
}

export function createBestStorage(getStorage = () => globalThis.localStorage) {
  // An earlier read failure makes an overwrite unsafe for this page session.
  const unreadable = new Set();

  function readBest(id) {
    const week = requireWeek(id);
    if (unreadable.has(id)) return { status: "read-error" };
    try {
      const raw = getStorage().getItem(PREFIX + id);
      if (raw === null) return { status: "unregistered" };
      if (typeof raw === "string") {
        const value = Number(raw);
        if (String(value) === raw && isValidProfit(value, week)) {
          return { status: "found", value };
        }
      }
      return { status: "corrupt" };
    } catch {
      unreadable.add(id);
      return { status: "read-error" };
    }
  }

  function saveBest(id, profit) {
    const week = requireWeek(id);
    if (!isValidProfit(profit, week)) throw new RangeError("Invalid weekly profit");
    const best = readBest(id);
    if (best.status === "read-error") return { status: "read-error", best };
    if (best.status === "found" && profit <= best.value) return { status: "unchanged", best };
    try {
      getStorage().setItem(PREFIX + id, String(profit));
      return { status: "saved", best: { status: "found", value: profit } };
    } catch {
      return { status: "write-error", best };
    }
  }

  return { readBest, saveBest };
}
