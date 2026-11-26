import {canonicalDesign} from '../../src/domain/design-editor.js';
import {buildStageDesign} from '../../src/data/stage-definitions.js';
import {getPartDefinition} from '../../src/data/part-definitions.js';

export const fromSeed = seed => seed.map(([type, u, v, angleDeg = 0]) => ({type, gridX: u, gridY: 30 - v, angleDeg}));
export const placementKey = design => canonicalDesign(design)
  .map(p => `${p.type}:${p.gridX}:${p.gridY}:${p.angleDeg}`).join(';');

export function createSearchMeter(binding, appendEvent) {
  const limits = {
    generated: binding.generated,
    searchSimulations: binding.searchSimulations,
    searchTicks: binding.searchTicks,
  };
  const usage = {generated: 0, searchSimulations: 0, searchTicks: 0};
  const capacities = [binding.stageRemaining, binding.totalRemaining, binding.automatedSeconds, binding.searchSeconds];
  if (typeof appendEvent !== 'function' || ![...Object.values(limits), ...capacities]
    .every(value => Number.isSafeInteger(value) && value > 0)
    || limits.generated > Math.min(binding.stageRemaining, binding.totalRemaining)
    || binding.searchSeconds > binding.automatedSeconds || limits.generated > 1000) {
    throw new RangeError('Missing or insufficient search reservation');
  }

  function debit(metric) {
    if (usage[metric] === limits[metric]) throw new RangeError(`Search reservation exhausted: ${metric}`);
    usage[metric]++;
    if (metric !== 'searchTicks') appendEvent({metric, ordinal: usage[metric]});
  }

  return {
    makeCandidate(produce) {
      debit('generated');
      return produce();
    },
    runWorld(produce) {
      debit('searchSimulations');
      return produce();
    },
    beforeTick() {
      debit('searchTicks');
    },
    totals() {
      return {...usage};
    },
  };
}

export function uniqueStageCandidates(layouts) {
  const unique = new Map();
  for (const layout of layouts) {
    const key = placementKey(layout);
    if (!unique.has(key)) unique.set(key, canonicalDesign(layout));
  }
  return {generated: layouts.length, candidates: [...unique.values()]};
}

function compareLayouts(a, b) {
  const aa = canonicalDesign(a);
  const bb = canonicalDesign(b);
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
    const x = aa[i], y = bb[i];
    const diff = (x.type < y.type ? -1 : Number(x.type !== y.type))
      || x.gridX - y.gridX || x.gridY - y.gridY || x.angleDeg - y.angleDeg;
    if (diff) return diff;
  }
  return aa.length - bb.length;
}

export function compareResults(a, b) {
  return Number(a.end === 'ERROR') - Number(b.end === 'ERROR')
    || Number(b.end === 'CLEARED') - Number(a.end === 'CLEARED') || Number(b.required) - Number(a.required)
    || (a.minimumGoalDistanceUm ?? Infinity) - (b.minimumGoalDistanceUm ?? Infinity)
    || a.placed.length - b.placed.length || compareLayouts(a.placed, b.placed);
}

export function generateNeighbors(stage, design, makeCandidate = produce => produce()) {
  const sorted = canonicalDesign(design);
  const seen = new Set([placementKey(sorted)]);
  const legal = [];
  const rejected = [];
  let generated = 0;
  for (let index = 0; index < sorted.length; index++) {
    const p = sorted[index];
    for (const [field, delta] of [['gridX', -1], ['gridX', 1], ['gridY', -1], ['gridY', 1],
      ['angleDeg', -15], ['angleDeg', 15]]) {
      const next = p[field] + delta;
      if (field === 'angleDeg' && !getPartDefinition(p.type).angles.includes(next)) continue;
      const candidate = makeCandidate(() => sorted.map((old, i) => i === index ? {...p, [field]: next} : old));
      generated++;
      const key = placementKey(candidate);
      if (seen.has(key)) {
        rejected.push({key, reason: 'DUPLICATE'});
        continue;
      }
      seen.add(key);
      const checked = buildStageDesign(stage, candidate);
      if (!checked.ok) rejected.push({key, reason: checked.reason});
      else legal.push(candidate);
    }
  }
  return {legal, rejected, generated};
}

export function evaluateRobustness(stage, results) {
  const minimumLegal = Number(stage.id) <= 3 ? 4 : 10;
  const percent = Number(stage.id) <= 3 ? 50 : 20;
  const legal = results.length;
  const successes = results.filter(r => r.end === 'CLEARED').length;
  return {pass: legal >= minimumLegal && successes >= 2 && 100 * successes >= percent * legal, legal, successes, percent};
}
