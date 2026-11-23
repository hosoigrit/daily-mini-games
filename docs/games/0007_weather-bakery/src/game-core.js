import {
  DAY_COUNT, DEFAULT_PRICE, DEMAND_CAP, DEMAND_DELTA_MAX, DEMAND_DELTA_MIN,
  INITIAL_CASH, MAX_BAKE, PRICE_PENALTIES, PRICES, UNIT_COST, thresholdsFor,
} from "./config.js";
import { getScenario, isValidDay } from "./scenario-catalog.js";

function clampDemand(value) {
  return Math.max(0, Math.min(DEMAND_CAP, value));
}

export function forecastDemand(day, price) {
  if (!isValidDay({ ...day, demandDelta: 0 }) || !PRICES.includes(price)) {
    throw new RangeError("Invalid forecast inputs");
  }
  const { weather, baseDemand } = day;
  const adjusted = baseDemand - PRICE_PENALTIES[weather][price];
  return {
    low: clampDemand(adjusted + DEMAND_DELTA_MIN),
    high: clampDemand(adjusted + DEMAND_DELTA_MAX),
  };
}

function canBake(cash, count) {
  return Number.isSafeInteger(cash) && cash >= 0
    && Number.isInteger(count) && count >= 0 && count <= MAX_BAKE && count * UNIT_COST <= cash;
}

export function calculateTrade(scenarioId, day, price, baked, cash) {
  if (!getScenario(scenarioId) || !isValidDay(day) || !PRICES.includes(price) || !canBake(cash, baked)) {
    throw new RangeError("Invalid trade inputs");
  }
  const { dayNo, weather, baseDemand, demandDelta } = day;
  const demand = clampDemand(baseDemand + demandDelta - PRICE_PENALTIES[weather][price]);
  const sold = Math.min(baked, demand);
  const leftovers = baked - sold;
  const revenue = sold * price;
  const cost = baked * UNIT_COST;
  const profit = revenue - cost;
  const cashAfter = cash + profit;
  if (!Number.isSafeInteger(cashAfter)) {
    throw new RangeError("Trade cash exceeds the safe integer range");
  }
  return Object.freeze({
    scenarioId, dayNo, weather, price, baked, demand, sold, leftovers, revenue, cost, profit, cashAfter,
  });
}

export function totalProfit(state) {
  return state.cash - INITIAL_CASH;
}

export function rankForProfit(scenarioId, profit) {
  const week = getScenario(scenarioId);
  if (!week || !Number.isSafeInteger(profit)) {
    throw new RangeError("Invalid scenario or profit");
  }
  const { star1, star2, star3 } = thresholdsFor(week.verifiedMaxProfit);
  if (profit >= star3) return 3;
  if (profit >= star2) return 2;
  if (profit >= star1) return 1;
  return 0;
}

export function createGameState() {
  return Object.freeze({
    phase: "TITLE",
    selectedScenarioId: "W01",
    activeScenarioId: null,
    dayIndex: 0,
    cash: INITIAL_CASH,
    selectedPrice: DEFAULT_PRICE,
    bakeCount: 0,
    dailyResult: null,
    history: Object.freeze([]),
    abortPending: false,
  });
}

function startWeek(id) {
  return Object.freeze({
    ...createGameState(), phase: "PLAN", selectedScenarioId: id, activeScenarioId: id,
  });
}

function openShop(state) {
  const week = getScenario(state.activeScenarioId);
  const day = week?.days[state.dayIndex];
  if (!day || !Number.isInteger(state.dayIndex) || state.activeScenarioId !== state.selectedScenarioId
      || state.dailyResult !== null || !Array.isArray(state.history) || state.history.length !== state.dayIndex
      || !canBake(state.cash, state.bakeCount) || !PRICES.includes(state.selectedPrice)) {
    return state;
  }

  let expectedCash = INITIAL_CASH;
  for (const [index, result] of state.history.entries()) {
    if (result?.scenarioId !== week.id || result.dayNo !== index + 1 || !Number.isSafeInteger(result.profit)) {
      return state;
    }
    expectedCash += result.profit;
    if (!Number.isSafeInteger(expectedCash) || expectedCash < 0 || result.cashAfter !== expectedCash) return state;
  }
  if (state.cash !== expectedCash) return state;

  const result = calculateTrade(week.id, day, state.selectedPrice, state.bakeCount, state.cash);
  return Object.freeze({
    ...state, phase: "DAY_RESULT", cash: result.cashAfter, dailyResult: result,
    history: Object.freeze([...state.history, result]),
  });
}

// Submit each action against the latest returned state. Rejected actions return
// the original state so callers can skip rendering when nothing changed.
export function dispatch(state, action) {
  const type = action?.type;
  const { phase, abortPending } = state;
  const canAbort = phase === "PLAN" || phase === "DAY_RESULT";
  if (abortPending) {
    if (canAbort && type === "CANCEL_ABORT") return Object.freeze({ ...state, abortPending: false });
    if (canAbort && type === "CONFIRM_ABORT") return createGameState();
    return state;
  }
  if (canAbort && type === "REQUEST_ABORT") return Object.freeze({ ...state, abortPending: true });

  switch (type) {
    case "SELECT_WEEK":
      if (phase === "TITLE" && getScenario(action.scenarioId)) {
        return Object.freeze({ ...state, selectedScenarioId: action.scenarioId });
      }
      break;
    case "START":
      if (phase === "TITLE" && getScenario(state.selectedScenarioId)) return startWeek(state.selectedScenarioId);
      break;
    case "SET_PRICE":
      if (phase === "PLAN" && PRICES.includes(action.price)) {
        return Object.freeze({ ...state, selectedPrice: action.price });
      }
      break;
    case "SET_BAKE_COUNT":
      if (phase === "PLAN" && canBake(state.cash, action.bakeCount)) {
        return Object.freeze({ ...state, bakeCount: action.bakeCount });
      }
      break;
    case "OPEN_SHOP":
      if (phase === "PLAN") return openShop(state);
      break;
    case "NEXT_DAY":
      if (phase === "DAY_RESULT" && state.dayIndex >= 0 && state.dayIndex < DAY_COUNT - 1) {
        return Object.freeze({
          ...state, phase: "PLAN", dayIndex: state.dayIndex + 1,
          selectedPrice: DEFAULT_PRICE, bakeCount: 0, dailyResult: null,
        });
      }
      break;
    case "SHOW_FINAL":
      if (phase === "DAY_RESULT" && state.dayIndex === DAY_COUNT - 1) {
        return Object.freeze({ ...state, phase: "FINAL" });
      }
      break;
    case "RETRY_SAME_WEEK":
      if (phase === "FINAL" && getScenario(state.activeScenarioId)) return startWeek(state.activeScenarioId);
      break;
    case "CHOOSE_WEEK":
      if (phase === "FINAL") return createGameState();
      break;
  }
  return state;
}
