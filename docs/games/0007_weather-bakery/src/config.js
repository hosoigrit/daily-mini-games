export const RULES_VERSION = "rules-v3";
export const INITIAL_CASH = 30;
export const UNIT_COST = 2;
export const MAX_BAKE = 12;
export const PRICES = Object.freeze([3, 4, 5]);
export const DEFAULT_PRICE = 4;
export const DAY_COUNT = 5;
export const DEMAND_DELTA_MIN = -2;
export const DEMAND_DELTA_MAX = 2;
export const DEMAND_CAP = 12;
export const PRICE_PENALTIES = Object.freeze({
  はれ: Object.freeze({ 3: 0, 4: 1, 5: 3 }),
  くもり: Object.freeze({ 3: 0, 4: 2, 5: 4 }),
  あめ: Object.freeze({ 3: 0, 4: 2, 5: 5 }),
});
export const STAR_RATE = Object.freeze({ star1: 58, star2: 75, star3: 90 });

export function thresholdsFor(maxProfit) {
  return {
    star1: Math.ceil(maxProfit * STAR_RATE.star1 / 100),
    star2: Math.ceil(maxProfit * STAR_RATE.star2 / 100),
    star3: Math.ceil(maxProfit * STAR_RATE.star3 / 100),
  };
}
