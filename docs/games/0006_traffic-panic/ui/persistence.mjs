import { PLAY_CONFIG } from "./browser-controller.mjs";

export const STORAGE_KEY = `daily-mini-games.0006.records.v1.${PLAY_CONFIG.balanceConfigId}`;
const VERSION = 1;

function validScore(value) {
  return value === null || (Number.isSafeInteger(value) && value >= 0);
}

export function createRecords(storage = () => globalThis.localStorage) {
  let scores = { bestClear: null, bestAttempt: null };
  let warning = null;
  try {
    const raw = storage().getItem(STORAGE_KEY);
    if (raw !== null) {
      const data = JSON.parse(raw);
      if (data?.version !== VERSION || !validScore(data.bestClear) || !validScore(data.bestAttempt)
        || (data.bestClear !== null && (data.bestAttempt === null || data.bestClear > data.bestAttempt))) {
        throw new Error("INVALID_RECORDS");
      }
      scores = { bestClear: data.bestClear, bestAttempt: data.bestAttempt };
    }
  } catch {
    warning = "最高記録を読み込めませんでした。";
  }

  function read() { return { ...scores, warning }; }

  function record(result, score) {
    if (!["GRIDLOCK", "CLEAR"].includes(result) || score === null || !validScore(score)) return read();
    scores = {
      bestClear: result === "CLEAR" ? Math.max(scores.bestClear ?? 0, score) : scores.bestClear,
      bestAttempt: Math.max(scores.bestAttempt ?? 0, score),
    };
    try {
      storage().setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, ...scores }));
      warning = null;
    } catch {
      warning = "最高記録を保存できませんでした。";
    }
    return read();
  }

  return { read, record };
}
