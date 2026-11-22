import {
  DAY_COUNT, DEMAND_CAP, DEMAND_DELTA_MAX, DEMAND_DELTA_MIN,
  PRICE_PENALTIES, thresholdsFor,
} from "./config.js";

const verifiedMaxima = { W01: 60, W02: 69, W03: 79, W04: 66, W05: 67, W06: 60 };

export function isValidDay(day) {
  return Number.isInteger(day?.dayNo) && day.dayNo >= 1 && day.dayNo <= DAY_COUNT
    && typeof day.weather === "string" && Object.hasOwn(PRICE_PENALTIES, day.weather)
    && Number.isInteger(day.baseDemand) && day.baseDemand >= 0 && day.baseDemand <= DEMAND_CAP
    && Number.isInteger(day.demandDelta)
    && day.demandDelta >= DEMAND_DELTA_MIN && day.demandDelta <= DEMAND_DELTA_MAX;
}

export function validateCatalog(scenarios) {
  if (!Array.isArray(scenarios) || scenarios.length !== Object.keys(verifiedMaxima).length) {
    throw new TypeError("The catalog must contain W01 through W06");
  }

  const ids = new Set();
  for (const week of scenarios) {
    if (typeof week?.id !== "string" || !Object.hasOwn(verifiedMaxima, week.id) || ids.has(week.id)
        || typeof week.name !== "string" || !week.name.trim()
        || week.verifiedMaxProfit !== verifiedMaxima[week.id]) {
      throw new TypeError("Invalid scenario identity, name or verified maximum profit");
    }
    ids.add(week.id);
    if (!Array.isArray(week.days) || week.days.length !== DAY_COUNT) {
      throw new TypeError(`Invalid day count for ${week.id}`);
    }
    for (const [index, day] of week.days.entries()) {
      if (!isValidDay(day) || day.dayNo !== index + 1) {
        throw new TypeError(`Invalid day ${index + 1} for ${week.id}`);
      }
    }
    const thresholds = thresholdsFor(week.verifiedMaxProfit);
    for (const [key, value] of Object.entries(thresholds)) {
      if (week.starThresholds?.[key] !== value) {
        throw new TypeError(`Invalid star thresholds for ${week.id}`);
      }
    }
  }
}

// Values from 06_scenario_matrix_v0.4.json. The tests compare every field.
const scenarios = [
  { id: "W01", name: "はじめての一週間", verifiedMaxProfit: 60,
    starThresholds: { star1: 35, star2: 45, star3: 54 },
    days: [
      { dayNo: 1, weather: "くもり", baseDemand: 7, demandDelta: 1 },
      { dayNo: 2, weather: "あめ", baseDemand: 4, demandDelta: -1 },
      { dayNo: 3, weather: "はれ", baseDemand: 8, demandDelta: 0 },
      { dayNo: 4, weather: "くもり", baseDemand: 7, demandDelta: -2 },
      { dayNo: 5, weather: "はれ", baseDemand: 9, demandDelta: 2 },
    ],
  },
  { id: "W02", name: "あめの月曜日", verifiedMaxProfit: 69,
    starThresholds: { star1: 41, star2: 52, star3: 63 },
    days: [
      { dayNo: 1, weather: "あめ", baseDemand: 6, demandDelta: 2 },
      { dayNo: 2, weather: "くもり", baseDemand: 8, demandDelta: 1 },
      { dayNo: 3, weather: "あめ", baseDemand: 5, demandDelta: -2 },
      { dayNo: 4, weather: "はれ", baseDemand: 8, demandDelta: 1 },
      { dayNo: 5, weather: "くもり", baseDemand: 9, demandDelta: 2 },
    ],
  },
  { id: "W03", name: "晴れのお祭り", verifiedMaxProfit: 79,
    starThresholds: { star1: 46, star2: 60, star3: 72 },
    days: [
      { dayNo: 1, weather: "はれ", baseDemand: 8, demandDelta: -1 },
      { dayNo: 2, weather: "はれ", baseDemand: 10, demandDelta: 1 },
      { dayNo: 3, weather: "くもり", baseDemand: 9, demandDelta: 0 },
      { dayNo: 4, weather: "はれ", baseDemand: 9, demandDelta: 2 },
      { dayNo: 5, weather: "あめ", baseDemand: 6, demandDelta: -2 },
    ],
  },
  { id: "W04", name: "きまぐれ空", verifiedMaxProfit: 66,
    starThresholds: { star1: 39, star2: 50, star3: 60 },
    days: [
      { dayNo: 1, weather: "くもり", baseDemand: 10, demandDelta: -2 },
      { dayNo: 2, weather: "はれ", baseDemand: 7, demandDelta: 2 },
      { dayNo: 3, weather: "あめ", baseDemand: 5, demandDelta: -2 },
      { dayNo: 4, weather: "くもり", baseDemand: 6, demandDelta: 2 },
      { dayNo: 5, weather: "はれ", baseDemand: 8, demandDelta: 2 },
    ],
  },
  { id: "W05", name: "雨のち快晴", verifiedMaxProfit: 67,
    starThresholds: { star1: 39, star2: 51, star3: 61 },
    days: [
      { dayNo: 1, weather: "あめ", baseDemand: 5, demandDelta: -2 },
      { dayNo: 2, weather: "あめ", baseDemand: 6, demandDelta: 1 },
      { dayNo: 3, weather: "くもり", baseDemand: 8, demandDelta: 2 },
      { dayNo: 4, weather: "はれ", baseDemand: 10, demandDelta: -1 },
      { dayNo: 5, weather: "はれ", baseDemand: 9, demandDelta: 0 },
    ],
  },
  { id: "W06", name: "曇り空の商店街", verifiedMaxProfit: 60,
    starThresholds: { star1: 35, star2: 45, star3: 54 },
    days: [
      { dayNo: 1, weather: "くもり", baseDemand: 9, demandDelta: 1 },
      { dayNo: 2, weather: "くもり", baseDemand: 7, demandDelta: -2 },
      { dayNo: 3, weather: "あめ", baseDemand: 5, demandDelta: -2 },
      { dayNo: 4, weather: "くもり", baseDemand: 10, demandDelta: -1 },
      { dayNo: 5, weather: "はれ", baseDemand: 7, demandDelta: 2 },
    ],
  },
];

validateCatalog(scenarios);
for (const week of scenarios) {
  week.days.forEach(Object.freeze);
  Object.freeze(week.days);
  Object.freeze(week.starThresholds);
  Object.freeze(week);
}
export const SCENARIOS = Object.freeze(scenarios);

export function getScenario(id) {
  return SCENARIOS.find((week) => week.id === id);
}
