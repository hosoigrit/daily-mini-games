export const STATISTICS_VERSION = "TP6-STATS-v1";
export const BOOTSTRAP = Object.freeze({
  algorithm: "LCG32 (1664525 * state + 1013904223 mod 2^32)",
  seed: 1,
  iterations: 10_000,
  percentile: "linear interpolation at (n - 1) * p",
});

export const mean = (values) => values.length
  ? values.reduce((total, value) => total + value, 0) / values.length
  : null;

function percentile(sorted, p) {
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low);
}

export const median = (values) => values.length
  ? percentile([...values].sort((a, b) => a - b), 0.5)
  : null;

export function wilson95(successes, n) {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(successes) || successes < 0 || n < successes) {
    throw new RangeError("INVALID_BINOMIAL_COUNTS");
  }
  if (n === 0) return null;
  const z = 1.959963984540054;
  const p = successes / n;
  const denominator = 1 + z ** 2 / n;
  const center = (p + z ** 2 / (2 * n)) / denominator;
  const radius = z * Math.sqrt((p * (1 - p) + z ** 2 / (4 * n)) / n) / denominator;
  return [successes === 0 ? 0 : center - radius, successes === n ? 1 : center + radius];
}

// Statistics-only generator. It does not share state or code with traffic generation.
export function bootstrapRandom(seed = BOOTSTRAP.seed) {
  let state = seed >>> 0;
  return () => (state = (Math.imul(1664525, state) + 1013904223) >>> 0);
}

export function pairedClearBootstrap95(differences) {
  if (!differences.length) return null;
  const next = bootstrapRandom();
  const n = differences.length;
  const replicates = new Array(BOOTSTRAP.iterations);
  for (let repeat = 0; repeat < replicates.length; repeat += 1) {
    let sum = 0;
    for (let draw = 0; draw < n; draw += 1) {
      sum += differences[Math.floor(next() * n / 2 ** 32)];
    }
    replicates[repeat] = sum / n;
  }
  replicates.sort((a, b) => a - b);
  return [percentile(replicates, 0.025), percentile(replicates, 0.975)];
}
